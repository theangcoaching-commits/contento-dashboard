/* Cross-platform sync coordinator */

import * as youtube  from './youtube.js';
import * as tiktok   from './tiktok.js';
import * as instagram from './instagram.js';
import { stmts, setSetting } from '../db.js';

const SERVICES = { youtube, tiktok, instagram };

export async function syncPlatform(platform) {
  const svc = SERVICES[platform];
  if (!svc) {
    // Not a content platform (e.g. gdrive) — skip silently instead of crashing
    return { platform, ok: false, skipped: true };
  }
  const start = Date.now();
  try {
    const r = await svc.syncAll();
    const elapsed = Date.now() - start;
    console.log(`[sync] ${platform} ok — ${r.count ?? 0} videos in ${elapsed}ms`);
    return { platform, ...r, elapsed };
  } catch (err) {
    console.error(`[sync] ${platform} failed:`, err.message);
    return { platform, ok: false, error: err.message };
  }
}

export async function syncAll() {
  // Only sync platforms that have a content service registered
  const connected = stmts.allConnections.all()
    .map(c => c.platform)
    .filter(p => SERVICES[p]);
  const results = await Promise.all(connected.map(syncPlatform));
  setSetting('last_sync', new Date().toISOString());
  return results;
}
