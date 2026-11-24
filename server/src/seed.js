// Generates clearly-labelled DEMO data (source='demo') so the dashboard works if scraping is blocked.
import { initDb, pool } from './db.js';
import { PROPERTIES } from './properties.js';
import { buildReview, saveReviews } from './ingest.js';

const POS = ['Great location, walking distance to the train station.', 'Staff at reception were friendly and helpful.',
  'The room was clean and the bed was comfortable.', 'Good value for money for Sydney.',
  'Fast wifi and the lift worked well.', 'Quiet at night and I slept really well.', 'Easy check-in, no waiting at all.'];
const NEG = ['The room was dirty and had a musty smell.', 'Check-in took 40 minutes and the front desk was rude.',
  'Very noisy from the street all night.', 'Air conditioning broke and the room felt old and tired.',
  'Overpriced for what you get.', 'No lift and the wifi kept dropping.', 'Location was a bit far from the station.',
  'Bathroom was small and the shower barely worked.'];
const NAMES = ['Sam', 'Priya', 'Liam', 'Chen', 'Olivia', 'Jack', 'Mia', 'Noah', 'Aisha', 'Tom', 'Emma', 'Lucas'];
const COUNTRIES = ['Australia', 'United Kingdom', 'New Zealand', 'United States', 'India', 'Germany', 'Singapore'];
const pick = a => a[Math.floor(Math.random() * a.length)];
const bases = [8.3, 7.5, 6.6, 7.9];

await initDb();
await pool.query("DELETE FROM reviews WHERE source='demo'");
const rows = [];
PROPERTIES.forEach((p, i) => {
  for (let n = 0; n < 45; n++) {
    const score = Math.min(10, Math.max(2.5, Math.round((bases[i] + (Math.random() - 0.5) * 5) * 2) / 2));
    const ago = Math.floor(Math.random() ** 1.4 * 56);
    const d = new Date(Date.now() - ago * 864e5);
    const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    const pos = score >= 6 ? pick(POS) + (Math.random() < 0.4 ? ' ' + pick(POS) : '') : (Math.random() < 0.3 ? pick(POS) : '');
    const neg = score < 8 ? pick(NEG) + (score < 6 && Math.random() < 0.5 ? ' ' + pick(NEG) : '') : '';
    const r = buildReview(p.slug, {
      avatar: `${pick(NAMES)}\n${pick(COUNTRIES)}`, score: String(score), date: `Reviewed: ${date}`,
      title: score >= 8 ? 'Would stay again' : score < 6 ? 'Disappointing stay' : 'Decent, with caveats',
      pos, neg, stay: '2 nights', room: 'Double Room',
    }, 'demo');
    if (r) rows.push(r);
  }
});
console.log('Inserted demo reviews:', await saveReviews(rows));
await pool.end();
