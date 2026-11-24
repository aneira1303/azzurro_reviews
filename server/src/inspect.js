import { chromium } from 'playwright';
import fs from 'fs';
import { PROPERTIES } from './properties.js';

const p = PROPERTIES[0];
const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext({ locale: 'en-AU', viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
await page.goto(p.url, { waitUntil: 'domcontentloaded' });
await page.locator('#onetrust-accept-btn-handler').click({ timeout: 4000 }).catch(() => {});
await page.waitForTimeout(3000);

const btn = page.locator('[data-testid="fr-read-all-reviews"], button:has-text("Read all reviews"), a:has-text("Read all reviews"), button:has-text("See all reviews")').first();
await btn.click({ timeout: 8000 }).catch(e => console.log('Could not click a reviews button:', e.message.split('\n')[0]));
await page.waitForTimeout(4000);

fs.mkdirSync('data/inspect', { recursive: true });
await page.screenshot({ path: 'data/inspect/page.png' });

const info = await page.evaluate(() => {
  const ids = [...new Set([...document.querySelectorAll('[data-testid]')]
    .map(e => e.getAttribute('data-testid')).filter(t => /review/i.test(t)))];
  const card = document.querySelector('[data-testid*="review-card" i], [data-testid*="reviewCard" i]');
  const dialog = document.querySelector('[role="dialog"]');
  return {
    url: location.href,
    reviewTestIds: ids,
    cardHtml: card ? card.outerHTML.slice(0, 5000) : null,
    dialogHtml: !card && dialog ? dialog.outerHTML.slice(0, 6000) : null,
  };
});
fs.writeFileSync('data/inspect/report.json', JSON.stringify(info, null, 2));
console.log(JSON.stringify(info, null, 2));
await browser.close();