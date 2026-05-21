/* Instagram Graph API integration (via Meta)
   Docs: https://developers.facebook.com/docs/instagram-api
   Requires: an IG Business or Creator account linked to a Facebook page,
             and the connected Meta app to have the right permissions. */

import { stmts } from '../db.js';

const SCOPES = [
  'instagram_basic',
  'instagram_manage_insights',
  'pages_show_list',
  'pages_read_engagement',
  'business_management'
].join(',');

const META = 'https://graph.facebook.com/v20.0';

export function authUrl() {
  const u = new URL('https://www.facebook.com/v20.0/dialog/oauth');
  u.searchParams.set('client_id', process.env.IG_CLIENT_ID || '');
  u.searchParams.set('redirect_uri', process.env.IG_REDIRECT_URI || '');
  u.searchParams.set('scope', SCOPES);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('state', 'contento');
  return u.toString();
}

export async function exchangeCode(code) {
  // 1. short-lived user token
  const shortRes = await fetch(
    `${META}/oauth/access_token?client_id=${process.env.IG_CLIENT_ID}` +
    `&client_secret=${process.env.IG_CLIENT_SECRET}` +
    `&redirect_uri=${encodeURIComponent(process.env.IG_REDIRECT_URI || '')}` +
    `&code=${code}`
  );
  const shortData = await shortRes.json();
  if (!shortData.access_token) throw new Error('IG token exchange failed: ' + JSON.stringify(shortData));

  // 2. exchange for long-lived token (~60 days)
  const longRes = await fetch(
    `${META}/oauth/access_token?grant_type=fb_exchange_token` +
    `&client_id=${process.env.IG_CLIENT_ID}&client_secret=${process.env.IG_CLIENT_SECRET}` +
    `&fb_exchange_token=${shortData.access_token}`
  );
  const longData = await longRes.json();
  const token = longData.access_token;

  // 3. find IG business account via user's pages
  const pages = await metaGet('/me/accounts', { fields: 'id,name,instagram_business_account' }, token);
  const page = (pages.data || []).find(p => p.instagram_business_account);
  const igUserId = page?.instagram_business_account?.id;
  let user = null;
  if (igUserId) {
    user = await metaGet(`/${igUserId}`, { fields: 'id,username,followers_count,follows_count,media_count' }, token);
  }

  stmts.upsertConnection.run({
    platform: 'instagram',
    access_token: token,
    refresh_token: null,
    expires_at: Date.now() + (Number(longData.expires_in || 60 * 86400) * 1000),
    account_id: igUserId || null,
    account_name: user?.username || page?.name || null,
    scope: SCOPES,
    extra: JSON.stringify({ pageId: page?.id }),
    connected_at: new Date().toISOString()
  });
  return user;
}

async function metaGet(path, params, token) {
  const u = new URL(META + path);
  u.searchParams.set('access_token', token);
  Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, v));
  const res = await fetch(u);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json;
}

export async function syncAll() {
  const conn = stmts.getConnection.get('instagram');
  if (!conn) throw new Error('Instagram not connected');
  const token = conn.access_token;
  const igUserId = conn.account_id;

  // 1. account stats
  const acc = await metaGet(`/${igUserId}`, { fields: 'followers_count,follows_count,media_count' }, token);
  const now = new Date().toISOString();
  stmts.recordSnapshot.run('instagram', now, 'followers',  Number(acc.followers_count || 0));
  stmts.recordSnapshot.run('instagram', now, 'follows',    Number(acc.follows_count || 0));
  stmts.recordSnapshot.run('instagram', now, 'mediaCount', Number(acc.media_count || 0));

  // 2. recent media
  const media = await metaGet(`/${igUserId}/media`, {
    fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
    limit: 50
  }, token);

  let count = 0;
  for (const m of (media.data || [])) {
    // optional: get insights per media (reach, saved, video_views)
    let reach = 0, saves = 0, views = m.like_count ? Number(m.like_count) * 8 : 0;
    try {
      const ins = await metaGet(`/${m.id}/insights`, { metric: 'reach,saved,plays' }, token);
      for (const d of (ins.data || [])) {
        if (d.name === 'reach')  reach = d.values?.[0]?.value || 0;
        if (d.name === 'saved')  saves = d.values?.[0]?.value || 0;
        if (d.name === 'plays')  views = d.values?.[0]?.value || views;
      }
    } catch { /* permission scope might block this */ }

    const likes    = Number(m.like_count || 0);
    const comments = Number(m.comments_count || 0);
    const score = scoreVideo({ views: reach || views || likes * 6, likes, comments, saves });

    stmts.upsertVideo.run({
      id: 'ig_' + m.id,
      platform: 'instagram',
      title: (m.caption || '').slice(0, 120) || '(no caption)',
      published_at: m.timestamp,
      thumbnail: m.thumbnail_url || m.media_url || '',
      url: m.permalink || '',
      views: reach || views,
      likes, comments,
      shares: saves,
      ctr: 0, retention: null,
      duration: 0,
      score,
      raw: JSON.stringify(m),
      updated_at: now
    });
    count++;
  }
  return { ok: true, count };
}

function scoreVideo({ views, likes, comments, saves }) {
  const engagement = views ? ((likes + comments * 5 + saves * 10) / views) : 0;
  const raw = Math.log10(views + 1) * 12 + engagement * 1200;
  return Math.min(99, Math.max(0, Math.round(raw)));
}
