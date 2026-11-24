import { Router } from 'express';
import { pool } from './db.js';
import { TOPICS } from './topics.js';
import { scrapeAll } from './scraper.js';

const r = Router();
const h = fn => (req, res) => fn(req, res).catch(e => { console.error(e); res.status(500).json({ error: e.message }); });

const iso = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
const weekStart = (d = new Date()) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return addDays(x, -((x.getUTCDay() + 6) % 7)); // weeks run Monday to Sunday (UTC)
};
const avg = a => (a.length ? +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(2) : null);
const MIN_SAMPLE = 5;

let running = false;

r.get('/summary', h(async (req, res) => {
  const prop = req.query.property || null;
  const cur = weekStart(), prev = addDays(cur, -7), first = addDays(cur, -49);
  const [raw] = await pool.query(
    'SELECT property_slug p, review_date d, score, sentiment s, neg_topics nt, pos_topics pt FROM reviews WHERE review_date >= ?', [iso(first)]);
  const rows = raw.map(x => ({ ...x, score: +x.score }));
  const inWeek = (list, start) => list.filter(x => x.d >= iso(start) && x.d < iso(addDays(start, 7)));
  const stat = list => ({
    avg: avg(list.map(x => x.score)), count: list.length,
    positive: list.filter(x => x.s === 'positive').length, negative: list.filter(x => x.s === 'negative').length,
    neutral: list.filter(x => x.s === 'neutral').length,
  });
  const diff = (a, b) => (a.avg != null && b.avg != null ? +(a.avg - b.avg).toFixed(2) : null);
  const scope = prop ? rows.filter(x => x.p === prop) : rows;
  const c = stat(inWeek(scope, cur)), p = stat(inWeek(scope, prev));

  const [allTime] = await pool.query('SELECT property_slug p, ROUND(AVG(score),2) avg, COUNT(*) count FROM reviews GROUP BY property_slug');
  const [props] = await pool.query('SELECT slug, label, url FROM properties ORDER BY label');
  const byProperty = props.map(pr => {
    const l = rows.filter(x => x.p === pr.slug);
    const cs = stat(inWeek(l, cur)), ps = stat(inWeek(l, prev)), at = allTime.find(a => a.p === pr.slug);
    return { ...pr, current: cs, previous: ps, delta: diff(cs, ps), allTimeAvg: at ? +at.avg : null, total: at ? at.count : 0 };
  });

  const trend = Array.from({ length: 8 }, (_, i) => {
    const s = addDays(first, i * 7);
    return { weekStart: iso(s), ...stat(inWeek(scope, s)) };
  });

  const topicStats = (list, sent, field) => {
    const sub = list.filter(x => x.s === sent), cnt = {};
    sub.forEach(x => (x[field] || []).forEach(t => { cnt[t] = (cnt[t] || 0) + 1; }));
    return { total: sub.length, topics: Object.entries(cnt).map(([key, count]) => ({
      key, label: TOPICS[key].label, count, pct: Math.round((100 * count) / sub.length) })).sort((a, b) => b.count - a.count) };
  };
  const curL = inWeek(scope, cur), prevL = inWeek(scope, prev);
  const neg = topicStats(curL, 'negative', 'nt'), negPrev = topicStats(prevL, 'negative', 'nt'), pos = topicStats(curL, 'positive', 'pt');

  const insights = [];
  neg.topics.slice(0, 3).forEach(t => insights.push({ type: 'negative', topic: t.key,
    text: `${t.pct}% of negative reviews this week mentioned ${t.label.toLowerCase()}-related issues (${t.count} of ${neg.total}).` }));
  neg.topics.forEach(t => {
    const before = negPrev.topics.find(x => x.key === t.key);
    const rise = t.pct - (before?.pct || 0);
    if (negPrev.total >= 3 && neg.total >= 3 && rise >= 20)
      insights.push({ type: 'rising', topic: t.key, text: `${t.label} complaints are up ${rise} points on last week.` });
  });
  pos.topics.slice(0, 2).forEach(t => insights.push({ type: 'positive', topic: t.key,
    text: `${t.pct}% of positive reviews this week praised ${t.label.toLowerCase()}.` }));
  if (!neg.total) insights.unshift({ type: 'info', text: 'No negative reviews recorded this week.' });

  const [[ds]] = await pool.query("SELECT COUNT(*) total, COALESCE(SUM(source='demo'),0) demo, MAX(review_date) latest FROM reviews");
  const [lr] = await pool.query('SELECT id, started_at, finished_at, status, details FROM scrape_runs ORDER BY id DESC LIMIT 1');

  res.json({
    week: { start: iso(cur), prevStart: iso(prev) },
    kpis: { current: c, previous: p, delta: diff(c, p), lowSample: c.count < MIN_SAMPLE || p.count < MIN_SAMPLE, minSample: MIN_SAMPLE,
      negativeShare: c.count ? Math.round((100 * c.negative) / c.count) : null },
    byProperty, trend, topics: { negative: neg, positive: pos }, insights,
    meta: { properties: props, topics: Object.entries(TOPICS).map(([key, v]) => ({ key, label: v.label })) },
    status: { running, total: ds.total, demo: +ds.demo, latestReview: ds.latest, lastRun: lr[0] || null },
  });
}));

r.get('/reviews', h(async (req, res) => {
  const { property, from, to, sentiment, topic, q } = req.query;
  const page = Math.max(1, +req.query.page || 1), limit = 20, w = [], p = [];
  if (property) { w.push('r.property_slug=?'); p.push(property); }
  if (from) { w.push('r.review_date>=?'); p.push(from); }
  if (to) { w.push('r.review_date<=?'); p.push(to); }
  if (sentiment) { w.push('r.sentiment=?'); p.push(sentiment); }
  if (topic) { w.push('(JSON_CONTAINS(r.neg_topics,?) OR JSON_CONTAINS(r.pos_topics,?))'); p.push(JSON.stringify(topic), JSON.stringify(topic)); }
  if (q) { w.push('(r.positive_text LIKE ? OR r.negative_text LIKE ? OR r.title LIKE ?)'); p.push(...Array(3).fill(`%${q}%`)); }
  const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) total FROM reviews r ${where}`, p);
  const [items] = await pool.query(
    `SELECT r.id, r.reviewer, r.country, r.score, r.title, r.positive_text, r.negative_text, r.review_date, r.stay_info, r.room_type,
            r.source, r.sentiment, r.pos_topics, r.neg_topics, pr.label property, r.property_slug
     FROM reviews r JOIN properties pr ON pr.slug=r.property_slug ${where}
     ORDER BY r.review_date DESC, r.id DESC LIMIT ? OFFSET ?`, [...p, limit, (page - 1) * limit]);
  res.json({ total, items, page, hasMore: page * limit < total });
}));

r.post('/scrape', h(async (req, res) => {
  if (running) return res.status(409).json({ error: 'A sync is already running.' });
  running = true;
  const [ins] = await pool.query("INSERT INTO scrape_runs (status) VALUES ('running')");
  res.status(202).json({ started: true });
  try {
    const out = await scrapeAll({ full: !!req.body?.full });
    const failed = Object.values(out).filter(x => x.error).length;
    const status = failed === 0 ? 'ok' : failed === Object.keys(out).length ? 'failed' : 'partial';
    await pool.query('UPDATE scrape_runs SET status=?, finished_at=NOW(), details=? WHERE id=?', [status, JSON.stringify(out), ins.insertId]);
  } catch (e) {
    await pool.query("UPDATE scrape_runs SET status='failed', finished_at=NOW(), details=? WHERE id=?", [JSON.stringify({ error: e.message }), ins.insertId]);
  } finally { running = false; }
}));

r.delete('/demo', h(async (req, res) => {
  const [x] = await pool.query("DELETE FROM reviews WHERE source='demo'");
  res.json({ deleted: x.affectedRows });
}));

export default r;
