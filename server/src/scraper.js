import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PROPERTIES } from './properties.js';
import { buildReview, existingHashes, saveReviews } from './ingest.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const FAIL_DIR = path.join(dir, '../data/failures');
const MAX_PAGES_FULL = 60;
const MAX_PAGES_INCR = 6;
const CARD = '[data-testid="review-card"]';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const jitter = (a, b) => a + Math.random() * (b - a);

export class BlockedError extends Error {}

// Runs in the browser. Selectors confirmed against the live page.
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

const firstCardText = page => page.locator(CARD).first().innerText().catch(() => '');

async function waitChange(page, before, ms = 9000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await sleep(500);
    if ((await firstCardText(page)) !== before) return true;
  }
  return false;
}

async function openReviews(page, p) {
  const res = await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (res && [403, 429, 503].includes(res.status())) throw new BlockedError(`HTTP ${res.status()} (blocked or rate limited)`);
  await page.locator('#onetrust-accept-btn-handler').click({ timeout: 4000 }).catch(() => {});
  await page.locator('[data-testid="fr-read-all-reviews"]').first().click({ timeout: 10000 }).catch(() => {});
  try {
    await page.waitForSelector(CARD, { timeout: 20000 });
  } catch {
    const html = await page.content();
    if (/captcha|are you a robot|access denied|verify you are human/i.test(html)) throw new BlockedError('Bot challenge detected');
    throw new Error('Review cards did not appear: page layout may have changed');
  }
}

/** Try to sort newest-first. Returns true only if we are confident the order is newest first. */
async function sortNewest(page, log) {
  try {
    const sel = page.locator('[data-testid="review-sorter"] select, [data-testid="reviews-sorter-component"] select').first();
    const opts = await sel.locator('option').evaluateAll(os => os.map(o => ({ v: o.value, t: o.textContent })));
    const hit = opts.find(o => /newest|most recent|recent/i.test(o.t));
    if (!hit) { log('  sorter options:', opts.map(o => o.t).join(' | ')); return false; }
    await sel.selectOption(hit.v);
    await sleep(2500);
    return true;
  } catch {
    log('  could not set sort order; running without the early-stop shortcut');
    return false;
  }
}

async function nextPage(page) {
  const next = page.locator(
    '[data-testid="review-list-container"] [aria-label*="next" i], nav[aria-label*="pagination" i] [aria-label*="next" i], [data-testid="review-list-container"] button:has-text("Next")'
  ).first();
  if (!(await next.count())) return false;
  if (!(await next.isEnabled().catch(() => false))) return false;
  const before = await firstCardText(page);
  await next.scrollIntoViewIfNeeded().catch(() => {});
  try { await next.click({ timeout: 5000 }); } catch { return false; }
  return waitChange(page, before);
}

async function scrapeProperty(page, p, { full }, log) {
  let found = 0, inserted = 0, skipped = 0, pages = 0;
  await openReviews(page, p);
  const sorted = await sortNewest(page, log);
  const maxPages = full ? MAX_PAGES_FULL : MAX_PAGES_INCR;
  for (let n = 0; n < maxPages; n++) {
    const raw = await page.evaluate(extractor);
    if (!raw.length) break;
    pages++;
    const rows = raw.map(r => buildReview(p.slug, r)).filter(Boolean);
    skipped += raw.length - rows.length;
    found += rows.length;
    const seen = await existingHashes(rows.map(r => r.hash));
    const fresh = rows.filter(r => !seen.has(r.hash));
    inserted += await saveReviews(fresh);
    if (!full && sorted && fresh.length === 0) break; // caught up with what we already have
    if (!(await nextPage(page))) break;
    await sleep(jitter(2000, 4000));
  }
  return { pages, found, inserted, skipped };
}

/** Scrape all properties. One property failing never aborts the others. */
export async function scrapeAll({ full = false } = {}, log = console.log) {
  const browser = await chromium.launch({ headless: process.env.SCRAPE_HEADFUL !== '1' });
  const ctx = await browser.newContext({ locale: 'en-AU', viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const results = {};
  try {
    for (const p of PROPERTIES) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          results[p.slug] = await scrapeProperty(page, p, { full }, log);
          log(`${p.label}:`, results[p.slug]);
          break;
        } catch (e) {
          if (attempt === 3) {
            await saveFailure(p.slug, page);
            results[p.slug] = { error: e.message, blocked: e instanceof BlockedError };
            log(`${p.label} failed:`, e.message);
          } else {
            log(`${p.label} attempt ${attempt} failed (${e.message}), retrying`);
            await sleep(2000 * 2 ** attempt + jitter(0, 1000));
          }
        }
      }
      await sleep(jitter(3000, 6000));
    }
  } finally {
    await browser.close();
  }
  return results;
}