import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PROPERTIES } from './properties.js';
import { buildReview, existingHashes, saveReviews } from './ingest.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const FAIL_DIR = path.join(dir, '../data/failures');
const PAGE_SIZE = 25;
const MAX_PAGES_FULL = 40;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const jitter = (a, b) => a + Math.random() * (b - a);

export class BlockedError extends Error {}

const reviewListUrl = (p, offset) =>
  `https://www.booking.com/reviewlist.html?pagename=${p.slug}&cc1=${p.cc}&type=total&rows=${PAGE_SIZE}&offset=${offset}&sort=f_recent_desc&lang=en-gb`;

// Runs in the browser. Uses data-testid attributes (more stable than hashed CSS classes).
const extractor = () => [...document.querySelectorAll('[data-testid="review-card"]')].map(c => {
  const t = s => c.querySelector(s)?.innerText?.trim() || '';
  return {
    avatar: t('[data-testid="review-avatar"]'), score: t('[data-testid="review-score"]'),
    date: t('[data-testid="review-date"]'), title: t('[data-testid="review-title"]'),
    pos: t('[data-testid="review-positive-text"]'), neg: t('[data-testid="review-negative-text"]'),
    stay: t('[data-testid="review-stay-date"]'), room: t('[data-testid="review-room-name"]'),
  };
});

async function saveFailure(slug, page) {
  try {
    fs.mkdirSync(FAIL_DIR, { recursive: true });
    fs.writeFileSync(path.join(FAIL_DIR, `${slug}-${Date.now()}.html`), await page.content());
  } catch { /* best effort */ }
}

async function fetchCards(page, p, offset, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await page.goto(reviewListUrl(p, offset), { waitUntil: 'domcontentloaded', timeout: 45000 });
      if (res && [403, 429, 503].includes(res.status())) throw new BlockedError(`HTTP ${res.status()} (blocked or rate limited)`);
      await page.locator('#onetrust-accept-btn-handler').click({ timeout: 1500 }).catch(() => {});
      await page.waitForSelector('[data-testid="review-card"]', { timeout: 15000 }).catch(() => {});
      const raw = await page.evaluate(extractor);
      if (raw.length) return raw;
      const html = await page.content();
      if (/captcha|are you a robot|access denied|verify you are human/i.test(html)) throw new BlockedError('Bot challenge detected');
      if (offset > 0) return []; // ran past the last page
      throw new Error('No review cards found on first page: selectors may have changed');
    } catch (e) {
      if (i === attempts) { await saveFailure(p.slug, page); throw e; }
      await sleep(2000 * 2 ** i + jitter(0, 1000)); // exponential backoff
    }
  }
}

async function scrapeProperty(page, p, { full }) {
  let found = 0, inserted = 0, skipped = 0;
  const maxPages = full ? MAX_PAGES_FULL : 6;
  for (let n = 0; n < maxPages; n++) {
    const raw = await fetchCards(page, p, n * PAGE_SIZE);
    if (!raw.length) break;
    const rows = raw.map(r => buildReview(p.slug, r)).filter(Boolean);
    skipped += raw.length - rows.length;
    found += rows.length;
    const seen = await existingHashes(rows.map(r => r.hash));
    const fresh = rows.filter(r => !seen.has(r.hash));
    inserted += await saveReviews(fresh);
    // Newest-first ordering: a page with nothing new means we've caught up.
    if (!full && fresh.length === 0) break;
    await sleep(jitter(2500, 5000)); // polite pacing
  }
  return { found, inserted, skipped };
}

/** Scrape all properties. One property failing never aborts the others. */
export async function scrapeAll({ full = false } = {}, log = console.log) {
  const browser = await chromium.launch({ headless: process.env.SCRAPE_HEADFUL !== '1' });
  const ctx = await browser.newContext({ locale: 'en-AU', viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const results = {};
  try {
    for (const p of PROPERTIES) {
      try {
        results[p.slug] = await scrapeProperty(page, p, { full });
        log(`${p.label}:`, results[p.slug]);
      } catch (e) {
        results[p.slug] = { error: e.message, blocked: e instanceof BlockedError };
        log(`${p.label} failed:`, e.message);
      }
      await sleep(jitter(3000, 6000));
    }
  } finally {
    await browser.close();
  }
  return results;
}
