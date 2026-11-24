import crypto from 'crypto';
import { pool } from './db.js';
import { tag } from './topics.js';

const clean = s => (s || '').replace(/\s+/g, ' ').trim();
const placeholder = s => (/no comments available/i.test(s) ? '' : s);
export const sentimentOf = s => (s >= 8 ? 'positive' : s < 6 ? 'negative' : 'neutral');

export function hashOf(r) {
  return crypto.createHash('sha1')
    .update([r.property_slug, r.reviewer, r.review_date, r.positive_text, r.negative_text].map(x => clean(x).toLowerCase()).join('|'))
    .digest('hex');
}

/** Normalise + validate one raw scraped card. Returns null when the data is unusable. */
export function buildReview(slug, raw, source = 'booking') {
  const lines = (raw.avatar || '').split('\n').map(clean).filter(Boolean);
  const nums = (raw.score || '').match(/\d+(?:[.,]\d)?/g);
  const score = nums ? Number(nums[nums.length - 1].replace(',', '.')) : null;
  const d = new Date(clean(raw.date).replace(/^reviewed:?\s*/i, '') + ' UTC');
  const pos = placeholder(clean(raw.pos));
  const neg = placeholder(clean(raw.neg));
  if (!score || score < 1 || score > 10 || isNaN(d) || !(pos || neg)) return null;
  const r = {
    property_slug: slug,
    reviewer: lines[0] || 'Anonymous',
    country: lines.length > 1 ? lines[lines.length - 1] : null,
    score,
    title: clean(raw.title) || null,
    positive_text: pos || null,
    negative_text: neg || null,
    review_date: d.toISOString().slice(0, 10),
    stay_info: clean(raw.stay) || null,
    room_type: clean(raw.room) || null,
    source,
  };
  r.hash = hashOf(r);
  r.sentiment = sentimentOf(score);
  r.pos_topics = tag(pos);
  r.neg_topics = tag(neg);
  return r;
}

const COLS = ['hash', 'property_slug', 'reviewer', 'country', 'score', 'title', 'positive_text', 'negative_text',
  'review_date', 'stay_info', 'room_type', 'source', 'sentiment', 'pos_topics', 'neg_topics'];

export async function saveReviews(rows) {
  if (!rows.length) return 0;
  const vals = rows.map(r => COLS.map(c => (Array.isArray(r[c]) ? JSON.stringify(r[c]) : r[c])));
  const [res] = await pool.query(`INSERT IGNORE INTO reviews (${COLS.join(',')}) VALUES ?`, [vals]);
  return res.affectedRows;
}

export async function existingHashes(hashes) {
  if (!hashes.length) return new Set();
  const [rows] = await pool.query('SELECT hash FROM reviews WHERE hash IN (?)', [hashes]);
  return new Set(rows.map(r => r.hash));
}
