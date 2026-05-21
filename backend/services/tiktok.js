/* TikTok Display API integration · PKCE (S256)
   Docs: https://developers.tiktok.com/doc/login-kit-web/
         https://developers.tiktok.com/doc/research-api-overview */

import { stmts, setSetting, getSetting } from '../db.js';
import crypto from 'node:crypto';

const SCOPES = 'user.info.basic,video.list,user.info.stats';

function b64url(buf) {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function authUrl() {
  if (!process.env.TT_CLIENT_KEY) {
    throw new Error('Set TT_CLIENT_KEY in .env first');
  }
  // PKCE: generate verifier + S256 challenge, persist verifier for callback
  const verifier = b64url(crypto.randomBytes(64));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  setSetting('tt_pkce_verifier', verifier);

  const u = new URL('https://www.tiktok.com/v2/auth/authorize/');
  u.searchParams.set('client_key', process.env.TT_CLIENT_KEY);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', SCOPES);
  u.searchParams.set('redirect_uri', process.env.TT_REDIRECT_URI || '');
  u.searchParams.set('state', 'contento');
  u.searchParams.set('code_challenge', challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  return u.toString();
}

export async function exchangeCode(code) {
  const verifier = getSetting('tt_pkce_verifier') || '';
  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key:    process.env.TT_CLIENT_KEY || '',
      client_secret: process.env.TT_CLIENT_SECRET || '',
      code,
      grant_type:    'authorization_code',
      redirect_uri:  process.env.TT_REDIRECT_URI || '',
      code_verifier: verifier
    })
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('TikTok token exchange failed: ' + JSON.stringify(data));

  const me = await tiktokGet('/user/info/', { fields: 'open_id,union_id,display_name,follower_count,following_count,likes_count,video_count' }, data.access_token);
  const user = me.data?.user || {};

  stmts.upsertConnection.run({
    platform: 'tiktok',
    access_token: data.access_token,
    refresh_token: data.refresh_token || null,
    expires_at: Date.now() + (Number(data.expires_in || 7200) * 1000),
    account_id: user.open_id || null,
    account_name: user.display_name || null,
    scope: data.scope || SCOPES,
    extra: JSON.stringify(user),
    connected_at: new Date().toISOString()
  });
  return user;
}

async function tiktokGet(path, params, token) {
  const u = new URL('https://open.tiktokapis.com/v2' + path);
  Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, v));
  const res = await fetch(u, { headers: { 'Authorization': 'Bearer ' + token } });
  return await res.json();
}

async function tiktokPost(path, body, token, query) {
  const u = new URL('https://open.tiktokapis.com/v2' + path);
  if (query) Object.entries(query).forEach(([k, v]) => u.searchParams.set(k, v));
  const res = await fetch(u, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return await res.json();
}

async function refreshIfNeeded(conn) {
  if (Date.now() < conn.expires_at - 60_000) return conn.access_token;
  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key:    process.env.TT_CLIENT_KEY || '',
      client_secret: process.env.TT_CLIENT_SECRET || '',
      grant_type:    'refresh_token',
      refresh_token: conn.refresh_token || ''
    })
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('TikTok refresh failed: ' + JSON.stringify(data));
  stmts.upsertConnection.run({
    ...conn,
    access_token: data.access_token,
    refresh_token: data.refresh_token || conn.refresh_token,
    expires_at: Date.now() + (Number(data.expires_in || 7200) * 1000)
  });
  return data.access_token;
}

export async function syncAll() {
  const conn = stmts.getConnection.get('tiktok');
  if (!conn) throw new Error('TikTok not connected');
  const token = await refreshIfNeeded(conn);

  // user-level metrics
  const u = await tiktokGet('/user/info/', {
    fields: 'follower_count,following_count,likes_count,video_count'
  }, token);
  const user = u.data?.user || {};
  const now = new Date().toISOString();
  stmts.recordSnapshot.run('tiktok', now, 'followers',  Number(user.follower_count || 0));
  stmts.recordSnapshot.run('tiktok', now, 'totalLikes', Number(user.likes_count || 0));
  stmts.recordSnapshot.run('tiktok', now, 'videoCount', Number(user.video_count || 0));

  // video list — paginated. NOTE: TikTok requires `fields` as a QUERY param, not in body.
  const VIDEO_FIELDS = 'id,title,video_description,cover_image_url,share_url,view_count,like_count,comment_count,share_count,create_time,duration';
  let cursor = 0;
  let count = 0;
  for (let page = 0; page < 4; page++) {
    const r = await tiktokPost('/video/list/', { max_count: 20, cursor }, token, { fields: VIDEO_FIELDS });
    if (r.error?.code && r.error.code !== 'ok') console.log('[tiktok] /video/list/ error:', r.error);
    const videos = r.data?.videos || [];
    for (const v of videos) {
      const views = Number(v.view_count || 0);
      const likes = Number(v.like_count || 0);
      const comments = Number(v.comment_count || 0);
      const shares = Number(v.share_count || 0);
      const score = scoreVideo({ views, likes, comments, shares });
      stmts.upsertVideo.run({
        id: 'tt_' + v.id,
        platform: 'tiktok',
        title: v.title || v.video_description || '(untitled TikTok)',
        published_at: new Date((v.create_time || Date.now()/1000) * 1000).toISOString(),
        thumbnail: v.cover_image_url || '',
        url: v.share_url || '',
        views, likes, comments, shares,
        ctr: 0, retention: null,
        duration: v.duration || 0,
        score,
        raw: JSON.stringify(v),
        updated_at: now
      });
      count++;
    }
    if (!r.data?.has_more) break;
    cursor = r.data.cursor || 0;
  }
  return { ok: true, count };
}

function scoreVideo({ views, likes, comments, shares }) {
  const engagement = views ? ((likes + comments * 4 + shares * 8) / views) : 0;
  const raw = Math.log10(views + 1) * 12 + engagement * 1200;
  return Math.min(99, Math.max(0, Math.round(raw)));
}
