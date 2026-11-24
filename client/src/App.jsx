import { useEffect, useState } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { RefreshCw, Sun, Moon, ArrowUp, ArrowDown, Minus, ThumbsUp, ThumbsDown, AlertTriangle, Search, TrendingUp, Info, Building2 } from 'lucide-react';
import { api } from './api.js';

const fmtWeek = w => new Date(w + 'T00:00:00Z').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtDate = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const scoreTone = s => (s >= 8 ? 'good' : s < 6 ? 'bad' : 'mid');
const ago = t => (t ? new Date(t.replace(' ', 'T') + 'Z').toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : '');

function Delta({ v, suffix = '' }) {
  if (v == null) return <span className="delta flat"><Minus size={13} />no comparison</span>;
  const Icon = v > 0 ? ArrowUp : v < 0 ? ArrowDown : Minus;
  return <span className={`delta ${v > 0 ? 'up' : v < 0 ? 'down' : 'flat'}`}><Icon size={13} />{v > 0 ? '+' : ''}{v}{suffix} vs last week</span>;
}

function Kpi({ label, value, sub, children, loading }) {
  return (
    <div className="card kpi">
      <div className="muted">{label}</div>
      {loading ? <div className="skel" style={{ height: 40, width: '60%' }} /> : <div className="kpi-value">{value ?? '–'}</div>}
      {sub && <div className="muted small">{sub}</div>}
      {children}
    </div>
  );
}

function ReviewCard({ r, onTopic }) {
  return (
    <article className="card review">
      <div className={`score ${scoreTone(r.score)}`}>{(+r.score).toFixed(1)}</div>
      <div className="review-body">
        <div className="review-head">
          <strong>{r.title || 'Guest review'}</strong>
          <span className="tag">{r.property}</span>
          {r.source === 'demo' && <span className="tag demo">demo</span>}
        </div>
        <div className="muted small">{r.reviewer}{r.country ? `, ${r.country}` : ''} · {fmtDate(r.review_date)}{r.room_type ? ` · ${r.room_type}` : ''}</div>
        {r.positive_text && <p className="line pos"><ThumbsUp size={15} />{r.positive_text}</p>}
        {r.negative_text && <p className="line neg"><ThumbsDown size={15} />{r.negative_text}</p>}
        <div className="chips">
          {[...new Set([...(r.neg_topics || []), ...(r.pos_topics || [])])].map(t => (
            <button key={t} className={`chip ${(r.neg_topics || []).includes(t) ? 'neg' : 'pos'}`} onClick={() => onTopic(t)}>{t}</button>
          ))}
        </div>
      </div>
    </article>
  );
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [f, setF] = useState({ property: '', from: '', to: '', sentiment: '', topic: '', q: '' });
  const [sum, setSum] = useState(null);
  const [reviews, setReviews] = useState({ items: [], total: 0, hasMore: false });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState('');
  const set = (k, v) => setF(p => ({ ...p, [k]: p[k] === v ? '' : v }));

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('theme', theme); }, [theme]);
  useEffect(() => { api('/summary', { property: f.property }).then(setSum).catch(e => setError(e.message)); }, [f.property, tick]);

  useEffect(() => {
    let off = false; setLoading(true);
    const t = setTimeout(() => api('/reviews', { ...f, page: 1 }).then(d => { if (!off) { setReviews(d); setPage(1); setLoading(false); } })
      .catch(e => { setError(e.message); setLoading(false); }), f.q ? 300 : 0);
    return () => { off = true; clearTimeout(t); };
  }, [JSON.stringify(f), tick]);

  const more = () => api('/reviews', { ...f, page: page + 1 }).then(d => { setReviews(r => ({ ...d, items: [...r.items, ...d.items] })); setPage(page + 1); });

  const running = sum?.status.running;
  useEffect(() => {
    if (!running) return;
    const i = setInterval(() => api('/summary', { property: f.property }).then(s => { setSum(s); if (!s.status.running) setTick(t => t + 1); }), 3000);
    return () => clearInterval(i);
  }, [running, f.property]);

  const sync = full => api('/scrape', {}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ full }) })
    .then(() => setTick(t => t + 1)).catch(e => setError(e.message));
  const clearDemo = () => api('/demo', {}, { method: 'DELETE' }).then(() => setTick(t => t + 1));

  const k = sum?.kpis, st = sum?.status;
  const trend = (sum?.trend || []).map(t => ({ ...t, label: fmtWeek(t.weekStart) }));
  const negTopics = sum?.topics.negative.topics || [];
  const run = st?.lastRun;
  const runErrors = run?.details ? Object.entries(run.details).filter(([, v]) => v?.error) : [];
  const tip = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--ink)' };

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><div className="logo">A</div><div><h1>Review Insights</h1><div className="muted small">Azzurro Hotels · Booking.com guest reviews</div></div></div>
        <div className="actions">
          <div className="muted small right">{running ? 'Syncing reviews…' : run ? `Last sync ${ago(run.finished_at || run.started_at)} (${run.status})` : 'Not synced yet'}</div>
          <button className="btn primary" disabled={running} onClick={() => sync(false)}><RefreshCw size={16} className={running ? 'spin' : ''} />Sync new reviews</button>
          <button className="icon" aria-label="Toggle theme" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}</button>
        </div>
      </header>

      {error && <div className="banner bad"><AlertTriangle size={16} />{error}</div>}
      {st?.demo > 0 && <div className="banner warn"><Info size={16} />Showing {st.demo} demo reviews, not real guest data.<button className="link" onClick={clearDemo}>Remove demo data</button></div>}
      {runErrors.length > 0 && <div className="banner bad"><AlertTriangle size={16} />Last sync couldn’t read: {runErrors.map(([s, v]) => `${s} (${v.error})`).join('; ')}</div>}
      {st && st.total === 0 && <div className="banner warn"><Info size={16} />No reviews yet. Select “Sync new reviews”, or run <code>npm run seed</code> for demo data.</div>}

      <section className="filters card">
        <select value={f.property} onChange={e => setF(p => ({ ...p, property: e.target.value }))} aria-label="Property">
          <option value="">All properties</option>
          {sum?.meta.properties.map(p => <option key={p.slug} value={p.slug}>{p.label}</option>)}
        </select>
        <label className="date">From<input type="date" value={f.from} onChange={e => setF(p => ({ ...p, from: e.target.value }))} /></label>
        <label className="date">To<input type="date" value={f.to} onChange={e => setF(p => ({ ...p, to: e.target.value }))} /></label>
        <div className="seg">{['positive', 'neutral', 'negative'].map(s => <button key={s} className={f.sentiment === s ? 'on ' + s : ''} onClick={() => set('sentiment', s)}>{s}</button>)}</div>
        <div className="search"><Search size={16} /><input placeholder="Search review text" value={f.q} onChange={e => setF(p => ({ ...p, q: e.target.value }))} /></div>
      </section>

      <section className="kpis">
        <Kpi loading={!sum} label="Average rating this week" value={k?.current.avg} sub={k && `${k.current.count} reviews · week of ${fmtWeek(sum.week.start)}`}><Delta v={k?.delta} /></Kpi>
        <Kpi loading={!sum} label="Last week" value={k?.previous.avg} sub={k && `${k.previous.count} reviews`} />
        <Kpi loading={!sum} label="Negative reviews this week" value={k?.negativeShare != null ? `${k.negativeShare}%` : '–'} sub={k && `${k.current.negative} of ${k.current.count} scored under 6`} />
        <Kpi loading={!sum} label="Total reviews stored" value={st?.total} sub={st?.latestReview && `Latest review ${fmtDate(st.latestReview)}`} />
      </section>
      {k?.lowSample && <div className="banner info"><Info size={16} />Fewer than {k.minSample} reviews in one of the two weeks, so the comparison can swing a lot. Treat it as a signal, not a verdict.</div>}

      <section className="grid2">
        <div className="card">
          <h2>What guests are saying this week</h2>
          {!sum ? <div className="skel" style={{ height: 120 }} /> : sum.insights.length === 0 ? <p className="muted">Not enough reviews this week to find patterns.</p> :
            <ul className="insights">{sum.insights.map((i, n) => (
              <li key={n} className={i.type} onClick={() => i.topic && setF(p => ({ ...p, topic: i.topic, sentiment: i.type === 'positive' ? 'positive' : 'negative' }))}>
                {i.type === 'positive' ? <ThumbsUp size={16} /> : i.type === 'rising' ? <TrendingUp size={16} /> : i.type === 'info' ? <Info size={16} /> : <AlertTriangle size={16} />}
                <span>{i.text}</span></li>))}</ul>}
        </div>
        <div className="card">
          <h2>Complaint topics this week</h2>
          {negTopics.length === 0 ? <p className="muted">No negative reviews this week.</p> :
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={negTopics} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" hide domain={[0, 100]} />
                <YAxis type="category" dataKey="label" width={130} tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tip} formatter={(v, n, p) => [`${v}% (${p.payload.count} reviews)`, 'Share of negatives']} />
                <Bar dataKey="pct" radius={6} onClick={d => setF(p => ({ ...p, topic: d.key, sentiment: 'negative' }))} cursor="pointer">
                  {negTopics.map(t => <Cell key={t.key} fill={f.topic === t.key ? 'var(--harbour)' : 'var(--coral)'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>}
        </div>
      </section>

      <h2 className="sec">Properties</h2>
      <section className="props">
        {(sum?.byProperty || Array.from({ length: 4 })).map((p, i) => !p ? <div key={i} className="card skel" style={{ height: 150 }} /> : (
          <button key={p.slug} className={`card prop ${f.property === p.slug ? 'sel' : ''}`} onClick={() => setF(x => ({ ...x, property: x.property === p.slug ? '' : p.slug }))}>
            <div className="prop-name"><Building2 size={16} />{p.label}</div>
            <div className="prop-score"><span className={`big ${scoreTone(p.current.avg ?? p.allTimeAvg)}`}>{p.current.avg ?? '–'}</span><span className="muted small">this week · {p.current.count} reviews</span></div>
            <Delta v={p.delta} />
            <div className="bar"><div style={{ width: `${((p.current.avg ?? p.allTimeAvg ?? 0) / 10) * 100}%` }} className={scoreTone(p.current.avg ?? p.allTimeAvg)} /></div>
            <div className="muted small">All time {p.allTimeAvg ?? '–'} across {p.total} reviews</div>
          </button>))}
      </section>

      <section className="grid2">
        <div className="card"><h2>Average rating by week</h2>
          <ResponsiveContainer width="100%" height={230}><AreaChart data={trend}>
            <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--harbour)" stopOpacity=".35" /><stop offset="100%" stopColor="var(--harbour)" stopOpacity="0" /></linearGradient></defs>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 10]} tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={28} />
            <Tooltip contentStyle={tip} formatter={(v, n, p) => [`${v ?? 'no reviews'} (${p.payload.count} reviews)`, 'Average']} />
            <Area type="monotone" dataKey="avg" stroke="var(--harbour)" strokeWidth={2.5} fill="url(#g)" connectNulls />
          </AreaChart></ResponsiveContainer></div>
        <div className="card"><h2>Positive and negative reviews by week</h2>
          <ResponsiveContainer width="100%" height={230}><BarChart data={trend}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={28} />
            <Tooltip contentStyle={tip} cursor={{ fill: 'var(--line)' }} />
            <Bar dataKey="positive" stackId="a" fill="var(--lagoon)" name="Positive (8+)" />
            <Bar dataKey="neutral" stackId="a" fill="var(--amber)" name="Neutral" />
            <Bar dataKey="negative" stackId="a" fill="var(--coral)" name="Negative (<6)" radius={[6, 6, 0, 0]} />
          </BarChart></ResponsiveContainer></div>
      </section>

      <h2 className="sec">Review feed <span className="muted small">{reviews.total} matching</span></h2>
      <div className="chips topics">
        {sum?.meta.topics.map(t => <button key={t.key} className={`chip ${f.topic === t.key ? 'sel' : ''}`} onClick={() => set('topic', t.key)}>{t.label}</button>)}
        {(f.topic || f.sentiment || f.from || f.to || f.q || f.property) && <button className="link" onClick={() => setF({ property: '', from: '', to: '', sentiment: '', topic: '', q: '' })}>Clear filters</button>}
      </div>
      <section className="feed">
        {loading && reviews.items.length === 0 ? Array.from({ length: 3 }, (_, i) => <div key={i} className="card skel" style={{ height: 120 }} />) :
          reviews.items.length === 0 ? <div className="card empty">No reviews match these filters. Try widening the dates or clearing the topic.</div> :
            reviews.items.map(r => <ReviewCard key={r.id} r={r} onTopic={t => setF(p => ({ ...p, topic: t }))} />)}
        {reviews.hasMore && <button className="btn" onClick={more}>Load more reviews</button>}
      </section>
      <footer className="muted small">Topics come from keyword rules, so they are a guide, not a verdict. Weeks run Monday to Sunday.</footer>
    </div>
  );
}
