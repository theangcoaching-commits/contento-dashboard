/* Leads tracking — ingests form submissions, manual entries, webhooks */

import { Router } from 'express';
import { stmts } from '../db.js';

const r = Router();
const nowIso = () => new Date().toISOString();
const newId = () => 'ld_' + Math.random().toString(36).slice(2, 12);

// ---------- INGEST ----------
// Generic ingest — accepts any payload, used by Google Apps Script / Zapier / curl
// Optional ?token=... verification (set LEADS_INGEST_TOKEN in .env to enable)
r.post('/leads/ingest', (req, res) => {
  const requiredToken = process.env.LEADS_INGEST_TOKEN;
  if (requiredToken && req.query.token !== requiredToken) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const b = req.body || {};
  const id = newId();
  const now = nowIso();
  stmts.insertLead.run({
    id,
    source:     b.source || 'form',
    source_url: b.source_url || '',
    form_id:    b.form_id || '',
    name:       b.name || (b.responses?.name) || '',
    email:      b.email || (b.responses?.email) || '',
    phone:      b.phone || (b.responses?.phone) || '',
    message:    b.message || (b.responses?.message) || JSON.stringify(b.responses || {}),
    status:     'new',
    revenue:    0,
    notes:      b.notes || '',
    raw:        JSON.stringify(b),
    created_at: b.created_at || now,
    updated_at: now
  });
  res.json({ ok: true, id });
});

// ---------- LIST ----------
r.get('/leads', (req, res) => {
  const limit = parseInt(req.query.limit || '200');
  const rows = req.query.status ? stmts.leadsByStatus.all(req.query.status) : stmts.allLeads.all(limit);
  res.json(rows);
});

r.get('/leads/stats', (req, res) => {
  const range = parseInt(req.query.range || '30');
  const since = new Date(Date.now() - range * 86400000).toISOString();
  const total = stmts.countLeadsSince.get(since)?.c || 0;
  // Group by status
  const all = stmts.leadsRange.all(since, new Date().toISOString());
  const byStatus = {};
  let revenue = 0;
  for (const l of all) {
    byStatus[l.status] = (byStatus[l.status] || 0) + 1;
    revenue += (l.revenue || 0);
  }
  res.json({
    total,
    new: byStatus.new || 0,
    qualified: byStatus.qualified || 0,
    call_booked: byStatus.call_booked || 0,
    call_done: byStatus.call_done || 0,
    sale: byStatus.sale || 0,
    dropped: byStatus.dropped || 0,
    revenue
  });
});

// ---------- UPDATE / DELETE ----------
r.put('/leads/:id', (req, res) => {
  const b = req.body || {};
  stmts.updateLead.run({
    id: req.params.id,
    status: b.status || 'new',
    revenue: Number(b.revenue || 0),
    notes: b.notes || '',
    updated_at: nowIso()
  });
  res.json({ ok: true });
});
r.delete('/leads/:id', (req, res) => {
  stmts.deleteLead.run(req.params.id);
  res.json({ ok: true });
});

// ---------- GOOGLE APPS SCRIPT SNIPPET ----------
r.get('/leads/setup/gas', (req, res) => {
  const base = process.env.BASE_URL || 'http://localhost:4000';
  const token = process.env.LEADS_INGEST_TOKEN || '';
  const url = `${base}/api/leads/ingest${token ? '?token=' + token : ''}`;
  const code = `// Paste this in your Google Form > Extensions > Apps Script
// Then set a trigger: Edit > Triggers > Add Trigger > onFormSubmit > from spreadsheet (or from form) > On form submit
function onFormSubmit(e) {
  var responses = {};
  if (e.namedValues) {
    Object.keys(e.namedValues).forEach(function(k){
      responses[k.toLowerCase().replace(/\\s+/g,'_')] = (e.namedValues[k] || []).join(', ');
    });
  }
  var payload = {
    source: 'form',
    form_id: '${(req.query.form_id || 'YOUR_FORM_ID')}',
    name:    responses.name || responses.full_name || responses['họ_và_tên'] || '',
    email:   responses.email || responses['địa_chỉ_email'] || '',
    phone:   responses.phone || responses['số_điện_thoại'] || '',
    message: JSON.stringify(responses),
    responses: responses
  };
  UrlFetchApp.fetch('${url}', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  });
}`;
  res.type('text/plain').send(code);
});

export default r;
