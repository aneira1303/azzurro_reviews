# Azzurro Review Insights

Collects public Booking.com guest reviews for four Azzurro Hotels properties, stores them in MySQL, and shows an operations dashboard with weekly ratings and topic insights.

**Stack:** React (Vite) + Node/Express + MySQL + Playwright. (MERN with MySQL in place of MongoDB.)

## Setup
Requirements: Node 18+, MySQL 8+.

```bash
npm install            # root helper (concurrently)
npm run setup          # installs server + client deps and the Playwright Chromium browser
cp server/.env.example server/.env   # then set DB_USER / DB_PASSWORD
npm run seed           # OPTIONAL: demo data (flagged source='demo') so the UI works immediately
npm run dev            # API on :4000, dashboard on http://localhost:5173
```
The database and tables are created automatically on first start.

## Running
- **Dashboard:** `npm run dev`, then use *Sync new reviews* in the header.
- **Scraper only:** `npm run scrape` (incremental) or `npm run scrape -- --full` (walks all pages, up to 40 per property).
- Real data removes the need for demo data: use *Remove demo data* in the dashboard banner.

## Architecture
```
server/src
  properties.js  the four property slugs
  scraper.js     Playwright collection, retries, pacing, failure snapshots
  ingest.js      normalisation, validation, hashing, INSERT IGNORE
  topics.js      keyword topic classifier
  routes.js      /api/summary, /api/reviews, /api/scrape, /api/demo
  schema.sql     properties, reviews (UNIQUE hash), scrape_runs
client/src       React dashboard (filters, KPIs, insights, charts, review feed)
```

## Review collection method
Booking.com has no API for us, so the scraper loads the public review list pages (`reviewlist.html?pagename=<slug>&sort=f_recent_desc&offset=N`) in headless Chromium and reads `data-testid` attributes (review score, date, title, positive text, negative text, reviewer, room, stay). `data-testid` is more stable than Booking's generated CSS class names.

- **Dedupe:** SHA-1 of property + reviewer + date + review text, enforced by a UNIQUE key; inserts use `INSERT IGNORE`.
- **Incremental updates:** pages are newest-first; a page with no new reviews stops the run.
- **Errors:** 3 attempts with exponential backoff and jitter; 403/429/503 and bot challenges raise a clear "blocked" error; one failing property never stops the others; failing pages are saved to `server/data/failures/` for debugging; each run is logged in `scrape_runs` and surfaced in the dashboard.
- **Data quality:** reviews without a valid 1–10 score, a parsable date or any text are dropped and counted as `skipped`.

## Insights methodology
- **Sentiment** comes from Booking's own score: 8+ positive, below 6 negative, otherwise neutral.
- **Topics** (cleanliness, check-in, staff, noise, facilities, location, room condition, value) come from keyword rules. Complaint topics are matched against the *negative* text field, praise topics against the *positive* field, so "not clean" and "very clean" are not confused.
- Example output: "40% of negative reviews this week mentioned cleanliness-related issues (4 of 10)."
- **Weeks** run Monday to Sunday (UTC). The comparison warns when either week has fewer than 5 reviews.

## Limitations and assumptions
- Booking.com's terms restrict automated access and it uses bot protection. Scraping may be blocked or rate limited, and the selectors may need updating when the page changes. Use it at low volume and check that you are permitted to collect this data. The scraper does not attempt to bypass CAPTCHAs.
- Only reviews visible on the public list pages are collected. The date is the review date, not the stay date.
- Keyword topics miss synonyms, sarcasm and mixed reviews; "reception" and "room" words can mis-tag. An LLM classifier would be the next step.
- The scraper and selectors were written without live access to Booking.com, so verify them on first run using `SCRAPE_HEADFUL=1`.
- No authentication on the API; deploy behind your own access control.
