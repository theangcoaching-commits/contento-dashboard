/* Contento ↔ Google Drive workspace
   Manages a "Contento" root folder + 4 tab sub-folders (Strategy / Tracking / Ideas / Schedule).
   Provides search, list, and create-new (Doc / Sheet / Slide) operations scoped to each tab folder. */

import { Router } from 'express';
import * as gdrive from '../services/gdrive.js';
import { stmts, setSetting, getSetting } from '../db.js';

const r = Router();
const WS_KEY = 'contento_drive_workspace';
const VALID_TABS = ['strategy', 'tracking', 'ideas', 'schedule'];
const VALID_KINDS = ['doc', 'sheet', 'slide'];

function ensureDrive(req, res, next) {
  if (!stmts.getConnection.get('gdrive')) {
    return res.status(401).json({ error: 'Google Drive not connected' });
  }
  next();
}

function readWorkspace() {
  const raw = getSetting(WS_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// Get current workspace (folder IDs + URLs)
r.get('/contento-drive/workspace', (req, res) => {
  res.json(readWorkspace());
});

// Set up (or repair) the Contento folder tree. Idempotent.
r.post('/contento-drive/setup', ensureDrive, async (req, res) => {
  try {
    const ws = await gdrive.setupContentoFolders();
    setSetting(WS_KEY, JSON.stringify(ws));
    res.json(ws);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List or search files within a specific tab's folder
r.get('/contento-drive/:tab/files', ensureDrive, async (req, res) => {
  const tab = req.params.tab.toLowerCase();
  if (!VALID_TABS.includes(tab)) return res.status(400).json({ error: 'invalid tab' });
  const ws = readWorkspace();
  if (!ws?.tabs?.[tab]) return res.status(400).json({ error: 'workspace not setup — POST /contento-drive/setup first' });
  try {
    const files = req.query.q
      ? await gdrive.searchInFolder(ws.tabs[tab].id, req.query.q, { limit: 25 })
      : await gdrive.listInFolder(ws.tabs[tab].id, { limit: 25 });
    res.json({ folder: ws.tabs[tab], files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new Doc/Sheet/Slide inside a tab folder
r.post('/contento-drive/:tab/create', ensureDrive, async (req, res) => {
  const tab = req.params.tab.toLowerCase();
  if (!VALID_TABS.includes(tab)) return res.status(400).json({ error: 'invalid tab' });
  const { kind, name } = req.body || {};
  if (!VALID_KINDS.includes(kind)) return res.status(400).json({ error: 'kind must be doc|sheet|slide' });
  const ws = readWorkspace();
  if (!ws?.tabs?.[tab]) return res.status(400).json({ error: 'workspace not setup' });
  try {
    const file = await gdrive.createInFolder(ws.tabs[tab].id, kind, name || ('Untitled ' + kind));
    res.json(file);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default r;
