/* YouTube Data API v3 integration
   Docs: https://developers.google.com/youtube/v3 */

import { google } from 'googleapis';
import { stmts } from '../db.js';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly'
];

function client() {
  return new google.auth.OAuth2(
    process.env.YT_CLIENT_ID,
    process.env.YT_CLIENT_SECRET,
    process.env.YT_REDIRECT_URI
  );
}

export function authUrl() {
  return client().generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });
}

export async function exchangeCode(code) {
  const oauth = client();
  const { tokens } = await oauth.getToken(code);
  oauth.setCredentials(tokens);

  // identify the channel
  const yt = google.youtube({ version: 'v3', auth: oauth });
  const me = await yt.channels.list({ part: ['snippet','statistics'], mine: true });
  const channel = me.data.items?.[0];

  stmts.upsertConnection.run({
    platform: 'youtube',
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || null,
    expires_at: tokens.expiry_date || (Date.now() + 3600_000),
    account_id: channel?.id || null,
    account_name: channel?.snippet?.title || null,
    scope: SCOPES.join(' '),
    extra: JSON.stringify(channel?.snippet || {}),
    connected_at: new Date().toISOString()
  });
  return channel;
}

function authedClient() {
  const conn = stmts.getConnection.get('youtube');
  if (!conn) throw new Error('YouTube not connected');
  const oauth = client();
  oauth.setCredentials({
    access_token:  conn.access_token,
    refresh_token: conn.refresh_token,
    expiry_date:   conn.expires_at
  });
  // persist refreshed tokens
  oauth.on('tokens', t => {
    stmts.upsertConnection.run({
      platform: 'youtube',
      access_token: t.access_token || conn.access_token,
      refresh_token: t.refresh_token || conn.refresh_token,
      expires_at: t.expiry_date || conn.expires_at,
      account_id: conn.account_id,
      account_name: conn.account_name,
      scope: conn.scope,
      extra: conn.extra,
      connected_at: conn.connected_at
    });
  });
  return oauth;
}

export async function syncAll() {
  const auth = authedClient();
  const yt = google.youtube({ version: 'v3', auth });
  const ytAnalytics = google.youtubeAnalytics({ version: 'v2', auth });
  const conn = stmts.getConnection.get('youtube');
  const channelId = conn.account_id;

  // 1. channel-level statistics
  const ch = await yt.channels.list({ part: ['statistics'], id: [channelId] });
  const stats = ch.data.items?.[0]?.statistics || {};
  const now = new Date().toISOString();
  stmts.recordSnapshot.run('youtube', now, 'subs',      Number(stats.subscriberCount || 0));
  stmts.recordSnapshot.run('youtube', now, 'totalViews',Number(stats.viewCount || 0));
  stmts.recordSnapshot.run('youtube', now, 'videoCount',Number(stats.videoCount || 0));

  // 2. last 50 uploads from channel's "uploads" playlist
  const uploadsId = (await yt.channels.list({ part: ['contentDetails'], id: [channelId] }))
    .data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsId) return { ok: false, reason: 'no uploads playlist' };

  const playlist = await yt.playlistItems.list({ part: ['snippet','contentDetails'], playlistId: uploadsId, maxResults: 50 });
  const videoIds = playlist.data.items.map(i => i.contentDetails.videoId);

  // 3. fetch detailed stats for these videos in chunks of 50
  const vids = await yt.videos.list({ part: ['snippet','statistics','contentDetails'], id: videoIds });

  for (const v of vids.data.items) {
    const ctr = await fetchVideoCTR(ytAnalytics, channelId, v.id).catch(() => null);
    const views    = Number(v.statistics.viewCount || 0);
    const likes    = Number(v.statistics.likeCount || 0);
    const comments = Number(v.statistics.commentCount || 0);
    const score = scoreVideo({ views, likes, comments, ctr });
    stmts.upsertVideo.run({
      id: 'yt_' + v.id,
      platform: 'youtube',
      title: v.snippet.title,
      published_at: v.snippet.publishedAt,
      thumbnail: v.snippet.thumbnails?.medium?.url || '',
      url: 'https://youtube.com/watch?v=' + v.id,
      views, likes, comments, shares: 0,
      ctr: ctr ?? 0,
      retention: null,
      duration: parseISODuration(v.contentDetails.duration),
      score,
      raw: JSON.stringify(v),
      updated_at: now
    });
  }
  return { ok: true, count: vids.data.items.length };
}

async function fetchVideoCTR(ytAnalytics, channelId, videoId) {
  // YouTube Analytics requires owner scope; this is best-effort
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  try {
    const r = await ytAnalytics.reports.query({
      ids: 'channel==' + channelId,
      startDate: start, endDate: end,
      metrics: 'cardClickRate,impressionClickThroughRate',
      filters: 'video==' + videoId
    });
    const row = r.data.rows?.[0];
    if (!row) return null;
    return row[1] || row[0] || null;
  } catch {
    return null;
  }
}

function parseISODuration(iso) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '');
  if (!m) return 0;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}

function scoreVideo({ views, likes, comments, ctr }) {
  const engagement = views ? ((likes + comments * 5) / views) : 0;
  const raw = Math.log10(views + 1) * 12 + engagement * 1500 + (ctr ?? 4) * 4;
  return Math.min(99, Math.max(0, Math.round(raw)));
}
