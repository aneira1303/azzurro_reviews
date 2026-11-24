import { initDb, pool } from './db.js';
import { scrapeAll } from './scraper.js';
await initDb();
const res = await scrapeAll({ full: process.argv.includes('--full') });
console.log(JSON.stringify(res, null, 2));
await pool.end();
