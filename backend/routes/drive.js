/* Google Drive read/search/create endpoints. Requires `gdrive` connection. */

import { Router } from 'express';
import * as gdrive from '../services/gdrive.js';
import { stmts } from '../db.js';

const r = Router();

function ensureConnected(req, res, next) {
  if (!stmts.getConnection.get('gdrive')) {
    return res.status(401).json({ error: 'Google Drive not connected' });
  }
  next();
}

// Recent files (default landing in the picker)
r.get('/drive/files', ensureConnected, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '20');
    const items = req.query.q
      ? await gdrive.searchFiles(req.query.q, limit)
      : await gdrive.listRecent(limit);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a blank Google Doc from a brainstorm idea (name supplied)
r.post('/drive/create-doc', ensureConnected, async (req, res) => {
  try {
    const out = await gdrive.createDoc(req.body?.name || 'Untitled brainstorm');
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default r;
