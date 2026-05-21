import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import cron from 'node-cron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import './db.js';
import authRouter from './routes/auth.js';
import apiRouter from './routes/api.js';
import strategyRouter from './routes/strategy.js';
import ideasFormatsRouter from './routes/ideas-formats.js';
import leadsRouter from './routes/leads.js';
import campaignsRouter from './routes/campaigns.js';
import prospectsRouter from './routes/prospects.js';
import driveRouter from './routes/drive.js';
import applicationsRouter from './routes/applications.js';
import contentoDriveRouter from './routes/contento-drive.js';
import sopsRouter from './routes/sops.js';
import { syncAll } from './services/sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4000;
const app = express();

// ---------- middleware ----------
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(morgan('dev'));

// ---------- routes ----------
app.use('/api/auth', authRouter);
app.use('/api',      strategyRouter);   // mount specific routes BEFORE generic /api
app.use('/api',      ideasFormatsRouter);
app.use('/api',      leadsRouter);
app.use('/api',      campaignsRouter);
app.use('/api',      prospectsRouter);
app.use('/api',      driveRouter);
app.use('/api',      applicationsRouter);
app.use('/api',      contentoDriveRouter);
app.use('/api',      sopsRouter);
app.use('/api',      apiRouter);

app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ---------- frontend static ----------
const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir, {
  etag: true,
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0
}));
app.get('*', (req, res) => res.sendFile(path.join(frontendDir, 'index.html')));

// ---------- error handler ----------
app.use((err, req, res, next) => {
  console.error('[err]', err);
  res.status(err.status || 500).json({ error: err.message });
});

// ---------- cron sync ----------
const SYNC_CRON = process.env.SYNC_CRON || '*/30 * * * *';
if (cron.validate(SYNC_CRON)) {
  cron.schedule(SYNC_CRON, async () => {
    console.log('[cron] running scheduled sync…');
    await syncAll();
  });
  console.log('[cron] scheduled metric sync:', SYNC_CRON);
}

// ---------- boot ----------
app.listen(PORT, () => {
  const url = process.env.BASE_URL || `http://localhost:${PORT}`;
  console.log(`\n  Contento dashboard running at ${url}\n  API base: ${url}/api\n`);
});
