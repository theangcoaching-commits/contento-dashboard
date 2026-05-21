/* SOPs (Standard Operating Procedures) tiered by offer package.
   Each tier is a Drive sub-folder under Contento → SOPs root.
   Tiers map to the Offer Ladder in ANG Consulting Launch Blueprint:
     - STARTER  (8M)  — basic SOPs only
     - GROWTH   (15M) — full A-Z system
     - PREMIUM  (25M) — everything + 1-1 custom
   Plus a client-facing read-only password gate. */

import { Router } from 'express';
import * as gdrive from '../services/gdrive.js';
import { stmts, setSetting, getSetting } from '../db.js';
import { SOP_DEMOS } from '../services/sop-templates.js';
import crypto from 'node:crypto';

const r = Router();
const SOPS_KEY = 'sops_workspace';
const PASSWORDS_KEY = 'sops_passwords';
const TIERS = ['starter', 'growth', 'premium'];
const TIER_LABELS = { starter: 'STARTER', growth: 'GROWTH', premium: 'PREMIUM' };

function ensureDrive(req, res, next) {
  if (!stmts.getConnection.get('gdrive')) {
    return res.status(401).json({ error: 'Google Drive not connected' });
  }
  next();
}

function readSops()   { try { return JSON.parse(getSetting(SOPS_KEY) || 'null'); } catch { return null; } }
function readPasswords() { try { return JSON.parse(getSetting(PASSWORDS_KEY) || '{}'); } catch { return {}; } }
function hash(pw) { return crypto.createHash('sha256').update(String(pw || '')).digest('hex'); }

// Current setup state (folders + which tiers have passwords)
r.get('/sops/workspace', (req, res) => {
  const ws = readSops();
  const pw = readPasswords();
  if (!ws) return res.json(null);
  res.json({
    ...ws,
    passwords: Object.fromEntries(TIERS.map(t => [t, !!pw[t]]))   // only return whether set, never hashes
  });
});

// Idempotent setup: create SOPs root + 3 tier subfolders inside the Contento workspace
r.post('/sops/setup', ensureDrive, async (req, res) => {
  const contento = (() => { try { return JSON.parse(getSetting('contento_drive_workspace') || 'null'); } catch { return null; } })();
  if (!contento?.root?.id) {
    return res.status(400).json({ error: 'Contento workspace not set up. POST /api/contento-drive/setup first.' });
  }
  try {
    // Create SOPs as a child of Contento root
    const sopsRoot = await gdrive.findOrCreateFolderPublic('SOPs', contento.root.id);
    const tiers = {};
    for (const t of TIERS) {
      const f = await gdrive.findOrCreateFolderPublic(TIER_LABELS[t], sopsRoot.id);
      tiers[t] = { id: f.id, name: f.name, url: f.webViewLink };
    }
    const ws = {
      root:  { id: sopsRoot.id, name: sopsRoot.name, url: sopsRoot.webViewLink },
      tiers
    };
    setSetting(SOPS_KEY, JSON.stringify(ws));
    res.json(ws);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List/search files in a tier
r.get('/sops/:tier/files', ensureDrive, async (req, res) => {
  const tier = req.params.tier.toLowerCase();
  if (!TIERS.includes(tier)) return res.status(400).json({ error: 'invalid tier' });
  const ws = readSops();
  if (!ws?.tiers?.[tier]) return res.status(400).json({ error: 'workspace not setup' });
  try {
    const files = req.query.q
      ? await gdrive.searchInFolder(ws.tiers[tier].id, req.query.q, { limit: 50 })
      : await gdrive.listInFolder(ws.tiers[tier].id, { limit: 50 });
    res.json({ tier: ws.tiers[tier], files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create file in tier
r.post('/sops/:tier/create', ensureDrive, async (req, res) => {
  const tier = req.params.tier.toLowerCase();
  if (!TIERS.includes(tier)) return res.status(400).json({ error: 'invalid tier' });
  const { kind, name } = req.body || {};
  if (!['doc', 'sheet', 'slide'].includes(kind)) return res.status(400).json({ error: 'kind must be doc|sheet|slide' });
  const ws = readSops();
  if (!ws?.tiers?.[tier]) return res.status(400).json({ error: 'workspace not setup' });
  try {
    const file = await gdrive.createInFolder(ws.tiers[tier].id, kind, name || ('Untitled ' + kind));
    res.json(file);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Client-facing access (password-gated) ----
// Set / update tier password (admin only — should be locked in production with auth middleware)
r.put('/sops/:tier/password', (req, res) => {
  const tier = req.params.tier.toLowerCase();
  if (!TIERS.includes(tier)) return res.status(400).json({ error: 'invalid tier' });
  const { password } = req.body || {};
  if (password === undefined) return res.status(400).json({ error: 'password required' });
  const pw = readPasswords();
  if (!password) delete pw[tier];
  else pw[tier] = hash(password);
  setSetting(PASSWORDS_KEY, JSON.stringify(pw));
  res.json({ ok: true, hasPassword: !!password });
});

// Client read-only access (verifies password, returns file list. Cumulative: premium client sees all tiers, growth sees starter+growth, starter sees only starter)
r.post('/sops/client-access', ensureDrive, async (req, res) => {
  const { tier, password } = req.body || {};
  if (!TIERS.includes(tier)) return res.status(400).json({ error: 'invalid tier' });
  const ws = readSops();
  if (!ws?.tiers?.[tier]) return res.status(400).json({ error: 'workspace not setup' });
  const pw = readPasswords();
  if (pw[tier] && pw[tier] !== hash(password)) return res.status(401).json({ error: 'wrong password' });
  // Cumulative access — higher tier unlocks lower tier
  const order = TIERS;
  const unlocked = order.slice(0, order.indexOf(tier) + 1);
  const data = {};
  for (const t of unlocked) {
    try { data[t] = { folder: ws.tiers[t], files: await gdrive.listInFolder(ws.tiers[t].id, { limit: 50 }) }; }
    catch (e) { data[t] = { folder: ws.tiers[t], files: [], error: e.message }; }
  }
  res.json({ tier, unlocked, data });
});

// Seed demo SOP content into each tier folder (idempotent — skips if filename exists)
r.post('/sops/seed-demos', ensureDrive, async (req, res) => {
  const ws = readSops();
  if (!ws?.tiers) return res.status(400).json({ error: 'SOPs workspace not set up — POST /api/sops/setup first' });
  const created = [];
  const skipped = [];
  try {
    for (const tier of TIERS) {
      const folder = ws.tiers[tier];
      const existing = await gdrive.listInFolder(folder.id, { limit: 50 });
      const existingNames = new Set(existing.map(f => f.name));
      for (const sop of (SOP_DEMOS[tier] || [])) {
        if (existingNames.has(sop.filename)) { skipped.push({ tier, name: sop.filename }); continue; }
        const file = await gdrive.createDocWithHtml(folder.id, sop.filename, sop.html);
        created.push({ tier, name: file.name, url: file.url });
      }
    }
    res.json({ ok: true, created, skipped, total_created: created.length, total_skipped: skipped.length });
  } catch (err) {
    res.status(500).json({ error: err.message, created, skipped });
  }
});

export default r;
