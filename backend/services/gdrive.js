/* Google Drive API integration
   Reuses the same OAuth client (YT_CLIENT_ID / YT_CLIENT_SECRET) under a separate
   redirect URI so the Drive connection lives independently from YouTube.
   Docs: https://developers.google.com/drive/api/reference/rest/v3 */

import { google } from 'googleapis';
import { stmts } from '../db.js';

const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',     // list + read files
  'https://www.googleapis.com/auth/drive.file',          // create/open files via picker
  'https://www.googleapis.com/auth/userinfo.email',      // identify which Google account is connected
  'https://www.googleapis.com/auth/userinfo.profile'
];

const REDIRECT = process.env.GDRIVE_REDIRECT_URI
              || (process.env.BASE_URL ? process.env.BASE_URL + '/api/auth/gdrive/callback'
                                        : 'http://localhost:4000/api/auth/gdrive/callback');

function client() {
  return new google.auth.OAuth2(
    process.env.GDRIVE_CLIENT_ID || process.env.YT_CLIENT_ID,
    process.env.GDRIVE_CLIENT_SECRET || process.env.YT_CLIENT_SECRET,
    REDIRECT
  );
}

export function authUrl() {
  return client().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    include_granted_scopes: true
  });
}

export async function exchangeCode(code) {
  const oauth = client();
  const { tokens } = await oauth.getToken(code);
  oauth.setCredentials(tokens);

  // identify the Google account via userinfo
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth });
  const me = await oauth2.userinfo.get();
  const user = me.data || {};

  stmts.upsertConnection.run({
    platform: 'gdrive',
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || null,
    expires_at: tokens.expiry_date || (Date.now() + 3600_000),
    account_id:   user.id    || null,
    account_name: user.email || user.name || 'Google account',
    scope: SCOPES.join(' '),
    extra: JSON.stringify({ name: user.name, picture: user.picture, email: user.email }),
    connected_at: new Date().toISOString()
  });
  return user;
}

function authedClient() {
  const conn = stmts.getConnection.get('gdrive');
  if (!conn) throw new Error('Google Drive not connected');
  const oauth = client();
  oauth.setCredentials({
    access_token:  conn.access_token,
    refresh_token: conn.refresh_token,
    expiry_date:   conn.expires_at
  });
  // persist refreshed tokens
  oauth.on('tokens', t => {
    stmts.upsertConnection.run({
      platform: 'gdrive',
      access_token:  t.access_token  || conn.access_token,
      refresh_token: t.refresh_token || conn.refresh_token,
      expires_at:    t.expiry_date   || conn.expires_at,
      account_id:    conn.account_id,
      account_name:  conn.account_name,
      scope:         conn.scope,
      extra:         conn.extra,
      connected_at:  conn.connected_at
    });
  });
  return oauth;
}

function drive() {
  return google.drive({ version: 'v3', auth: authedClient() });
}

// MIME → simple kind label for our UI
const MIME_KIND = {
  'application/vnd.google-apps.document':      'doc',
  'application/vnd.google-apps.spreadsheet':   'sheet',
  'application/vnd.google-apps.presentation':  'slide',
  'application/vnd.google-apps.folder':        'folder',
  'application/pdf':                            'pdf'
};
function kindFromMime(m) { return MIME_KIND[m] || (m?.startsWith('image/') ? 'image' : 'file'); }

export async function listRecent(limit = 20) {
  const d = drive();
  const res = await d.files.list({
    pageSize: Math.min(limit, 50),
    orderBy: 'modifiedTime desc',
    fields: 'files(id,name,mimeType,modifiedTime,webViewLink,iconLink,owners(displayName,emailAddress))',
    q: "trashed = false and mimeType != 'application/vnd.google-apps.folder'"
  });
  return (res.data.files || []).map(f => ({
    id: f.id,
    name: f.name,
    kind: kindFromMime(f.mimeType),
    mime: f.mimeType,
    modified: f.modifiedTime,
    url: f.webViewLink,
    icon: f.iconLink,
    owner: f.owners?.[0]?.displayName || ''
  }));
}

export async function searchFiles(query, limit = 20) {
  if (!query || !query.trim()) return listRecent(limit);
  const d = drive();
  const esc = query.replace(/'/g, "\\'");
  const res = await d.files.list({
    pageSize: Math.min(limit, 50),
    orderBy: 'modifiedTime desc',
    fields: 'files(id,name,mimeType,modifiedTime,webViewLink,iconLink,owners(displayName))',
    q: `name contains '${esc}' and trashed = false`
  });
  return (res.data.files || []).map(f => ({
    id: f.id,
    name: f.name,
    kind: kindFromMime(f.mimeType),
    mime: f.mimeType,
    modified: f.modifiedTime,
    url: f.webViewLink,
    icon: f.iconLink,
    owner: f.owners?.[0]?.displayName || ''
  }));
}

// Brainstorm: create a new blank Google Doc named after an idea, return URL
export async function createDoc(name) {
  const d = drive();
  const res = await d.files.create({
    requestBody: {
      name: name || 'Untitled brainstorm',
      mimeType: 'application/vnd.google-apps.document'
    },
    fields: 'id,name,webViewLink'
  });
  return { id: res.data.id, name: res.data.name, url: res.data.webViewLink };
}

// ---------- FOLDER WORKSPACE (Contento root + per-tab subfolders) ----------

const MIME = {
  folder: 'application/vnd.google-apps.folder',
  doc:    'application/vnd.google-apps.document',
  sheet:  'application/vnd.google-apps.spreadsheet',
  slide:  'application/vnd.google-apps.presentation'
};

export async function findOrCreateFolderPublic(name, parentId = null) {
  return findOrCreateFolder(name, parentId);
}
async function findOrCreateFolder(name, parentId = null) {
  const d = drive();
  const qParts = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    `mimeType = '${MIME.folder}'`,
    `trashed = false`
  ];
  if (parentId) qParts.push(`'${parentId}' in parents`);
  const list = await d.files.list({
    q: qParts.join(' and '),
    fields: 'files(id,name,webViewLink)',
    pageSize: 1
  });
  if (list.data.files?.length) return list.data.files[0];
  const created = await d.files.create({
    requestBody: {
      name,
      mimeType: MIME.folder,
      parents: parentId ? [parentId] : undefined
    },
    fields: 'id,name,webViewLink'
  });
  return created.data;
}

// Set up Contento root + 4 sub-folders (idempotent — returns existing if already created)
export async function setupContentoFolders() {
  const root = await findOrCreateFolder('Contento');
  const tabs = ['Strategy', 'Tracking', 'Ideas', 'Schedule'];
  const subs = {};
  for (const t of tabs) {
    const f = await findOrCreateFolder(t, root.id);
    subs[t.toLowerCase()] = { id: f.id, name: f.name, url: f.webViewLink };
  }
  return {
    root: { id: root.id, name: root.name, url: root.webViewLink },
    tabs: subs
  };
}

// List files in a specific folder (most-recently-modified first)
export async function listInFolder(folderId, opts = {}) {
  const d = drive();
  const limit = Math.min(opts.limit || 25, 50);
  const q = [
    `'${folderId}' in parents`,
    `trashed = false`,
    opts.kind ? `mimeType = '${MIME[opts.kind]}'` : null
  ].filter(Boolean).join(' and ');
  const res = await d.files.list({
    q,
    pageSize: limit,
    orderBy: 'modifiedTime desc',
    fields: 'files(id,name,mimeType,modifiedTime,webViewLink,iconLink)'
  });
  return (res.data.files || []).map(formatFile);
}

// Search within a folder by filename
export async function searchInFolder(folderId, query, opts = {}) {
  if (!query || !query.trim()) return listInFolder(folderId, opts);
  const d = drive();
  const esc = query.replace(/'/g, "\\'");
  const limit = Math.min(opts.limit || 25, 50);
  const res = await d.files.list({
    q: `'${folderId}' in parents and trashed = false and name contains '${esc}'`,
    pageSize: limit,
    orderBy: 'modifiedTime desc',
    fields: 'files(id,name,mimeType,modifiedTime,webViewLink,iconLink)'
  });
  return (res.data.files || []).map(formatFile);
}

// Create a new Doc/Sheet/Slide inside a specific folder
export async function createInFolder(folderId, kind, name) {
  const mime = MIME[kind];
  if (!mime || kind === 'folder') throw new Error('kind must be doc/sheet/slide');
  const d = drive();
  const res = await d.files.create({
    requestBody: {
      name: name || ('Untitled ' + kind),
      mimeType: mime,
      parents: [folderId]
    },
    fields: 'id,name,mimeType,webViewLink'
  });
  return formatFile(res.data);
}

// Create a Google Doc with content (uploads plain text/HTML as a Doc)
// We use a workaround: create file with mimeType=application/vnd.google-apps.document
// and source mimeType=text/html — Drive converts HTML to Doc automatically.
export async function createDocWithHtml(folderId, name, html) {
  const auth = authedClient();
  const access = (await auth.getAccessToken()).token;
  const metadata = {
    name: name || 'Untitled doc',
    mimeType: MIME.doc,
    parents: [folderId]
  };
  const boundary = '-------content-' + Math.random().toString(36).slice(2);
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) + '\r\n' +
    `--${boundary}\r\n` +
    `Content-Type: text/html; charset=UTF-8\r\n\r\n` +
    html + '\r\n' +
    `--${boundary}--`;
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + access,
      'Content-Type': 'multipart/related; boundary=' + boundary
    },
    body
  });
  const json = await res.json();
  if (!json.id) throw new Error('Drive upload failed: ' + JSON.stringify(json));
  return { id: json.id, name: json.name, url: json.webViewLink, kind: 'doc' };
}

function formatFile(f) {
  const k = MIME_KIND[f.mimeType] || (f.mimeType === MIME.folder ? 'folder' : 'file');
  return {
    id: f.id,
    name: f.name,
    kind: k,
    mime: f.mimeType,
    modified: f.modifiedTime,
    url: f.webViewLink,
    icon: f.iconLink
  };
}

// File metadata + Sheet CSV export (works with drive.readonly scope, no separate Sheets API needed)
export async function getFileMeta(fileId) {
  const d = drive();
  const res = await d.files.get({
    fileId,
    fields: 'id,name,mimeType,webViewLink,modifiedTime,owners(displayName,emailAddress)'
  });
  return res.data;
}

export async function exportSheetAsCsv(fileId) {
  const d = drive();
  // googleapis returns the raw body as a string when mimeType is text/csv
  const res = await d.files.export(
    { fileId, mimeType: 'text/csv' },
    { responseType: 'text' }
  );
  // Some versions return Buffer-like; coerce to string
  return typeof res.data === 'string' ? res.data : String(res.data || '');
}

// Robust-enough CSV parser for Google Form responses (handles quoted commas + escaped quotes)
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], nx = text[i + 1];
    if (inQuotes) {
      if (c === '"' && nx === '"') { cell += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { cell += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c === '\r') { /* skip */ }
      else { cell += c; }
    }
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r[0] && r[0].trim() !== ''));
}
