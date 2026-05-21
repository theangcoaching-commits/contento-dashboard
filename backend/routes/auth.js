import { Router } from 'express';
import * as youtube  from '../services/youtube.js';
import * as tiktok   from '../services/tiktok.js';
import * as instagram from '../services/instagram.js';
import * as gdrive   from '../services/gdrive.js';
import { stmts } from '../db.js';
import { syncPlatform } from '../services/sync.js';

const r = Router();
const services = { youtube, tiktok, instagram, gdrive };
// Platforms that have a periodic content sync (Drive does not — it's on-demand)
const SYNCABLE = new Set(['youtube', 'tiktok', 'instagram']);

r.get('/:platform/start', (req, res) => {
  const svc = services[req.params.platform];
  if (!svc) return res.status(404).send('Unknown platform');
  res.redirect(svc.authUrl());
});

r.get('/:platform/callback', async (req, res) => {
  const platform = req.params.platform;
  const svc = services[platform];
  if (!svc) return res.status(404).send('Unknown platform');
  if (req.query.error) return res.redirect('/?connected=' + platform + '&error=' + req.query.error);

  try {
    await svc.exchangeCode(req.query.code);
    // kick off first sync in background (only for syncable platforms)
    if (SYNCABLE.has(platform)) {
      syncPlatform(platform).catch(err => console.error('initial sync', err));
    }
    res.redirect('/?connected=' + platform);
  } catch (err) {
    console.error('[auth callback]', err);
    res.status(500).send('Auth failed: ' + err.message);
  }
});

r.delete('/:platform', (req, res) => {
  stmts.deleteConnection.run(req.params.platform);
  res.json({ ok: true });
});

export default r;
