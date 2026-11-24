import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { initDb } from './db.js';
import routes from './routes.js';

const app = express();
app.use(cors());
app.use(express.json());
await initDb();
app.use('/api', routes);
const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
