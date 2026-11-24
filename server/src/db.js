import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import { PROPERTIES } from './properties.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const cfg = {
  host: process.env.DB_HOST || 'localhost',
  port: +(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
};
const DB = process.env.DB_NAME || 'azzurro_reviews';
export let pool;

export async function initDb() {
  const boot = await mysql.createConnection(cfg);
  await boot.query(`CREATE DATABASE IF NOT EXISTS \`${DB}\` CHARACTER SET utf8mb4`);
  await boot.end();
  pool = mysql.createPool({ ...cfg, database: DB, dateStrings: true, connectionLimit: 10, charset: 'utf8mb4' });
  const schema = fs.readFileSync(path.join(dir, '../schema.sql'), 'utf8');
  for (const stmt of schema.split(';').map(s => s.trim()).filter(Boolean)) await pool.query(stmt);
  for (const p of PROPERTIES) {
    await pool.query(
      'INSERT INTO properties (slug,label,url) VALUES (?,?,?) ON DUPLICATE KEY UPDATE label=VALUES(label), url=VALUES(url)',
      [p.slug, p.label, p.url]);
  }
}
