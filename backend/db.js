import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'contento.db');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS profile (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    name          TEXT,
    niche         TEXT,
    audience      TEXT,
    goal          TEXT,
    updated_at    TEXT
  );

  CREATE TABLE IF NOT EXISTS connections (
    platform      TEXT PRIMARY KEY,
    access_token  TEXT,
    refresh_token TEXT,
    expires_at    INTEGER,
    account_id    TEXT,
    account_name  TEXT,
    scope         TEXT,
    extra         TEXT,
    connected_at  TEXT
  );

  CREATE TABLE IF NOT EXISTS videos (
    id            TEXT PRIMARY KEY,
    platform      TEXT NOT NULL,
    title         TEXT,
    published_at  TEXT,
    thumbnail     TEXT,
    url           TEXT,
    views         INTEGER DEFAULT 0,
    likes         INTEGER DEFAULT 0,
    comments      INTEGER DEFAULT 0,
    shares        INTEGER DEFAULT 0,
    ctr           REAL DEFAULT 0,
    retention     REAL,
    duration      INTEGER,
    score         INTEGER,
    raw           TEXT,
    updated_at    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_videos_platform_date ON videos(platform, published_at);

  CREATE TABLE IF NOT EXISTS metric_snapshots (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    platform      TEXT NOT NULL,
    captured_at   TEXT NOT NULL,
    metric        TEXT NOT NULL,
    value         REAL NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_snap_platform_metric ON metric_snapshots(platform, metric, captured_at);

  CREATE TABLE IF NOT EXISTS tracked_channels (
    id            TEXT PRIMARY KEY,
    url           TEXT NOT NULL,
    handle        TEXT,
    name          TEXT,
    platform      TEXT,
    tag           TEXT,
    followers     TEXT,
    growth        TEXT,
    avg_views     TEXT,
    extra         TEXT,
    last_synced   TEXT,
    created_at    TEXT
  );

  CREATE TABLE IF NOT EXISTS ideas (
    id            TEXT PRIMARY KEY,
    title         TEXT,
    description   TEXT,
    platform      TEXT,
    badge         TEXT,
    score         INTEGER,
    duration      TEXT,
    reach         TEXT,
    raw           TEXT,
    created_at    TEXT
  );

  CREATE TABLE IF NOT EXISTS schedule (
    id            TEXT PRIMARY KEY,
    date          TEXT NOT NULL,
    time          TEXT,
    platform      TEXT,
    title         TEXT,
    description   TEXT,
    status        TEXT DEFAULT 'planned',
    created_at    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_schedule_date ON schedule(date);

  CREATE TABLE IF NOT EXISTS settings (
    key           TEXT PRIMARY KEY,
    value         TEXT
  );

  -- Monthly / quarterly goals
  CREATE TABLE IF NOT EXISTS goals (
    id            TEXT PRIMARY KEY,
    period        TEXT NOT NULL,     -- e.g. '2026-05' (monthly) or '2026-Q2'
    yt_subs       INTEGER DEFAULT 0,
    tt_followers  INTEGER DEFAULT 0,
    ig_followers  INTEGER DEFAULT 0,
    leads         INTEGER DEFAULT 0,
    revenue       INTEGER DEFAULT 0,
    notes         TEXT,
    created_at    TEXT,
    updated_at    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_goals_period ON goals(period);

  -- Manual baselines for platforms that aren't connected via OAuth yet
  CREATE TABLE IF NOT EXISTS baselines (
    platform      TEXT PRIMARY KEY,
    followers     INTEGER DEFAULT 0,
    views_30d     INTEGER DEFAULT 0,
    avg_views     INTEGER DEFAULT 0,
    notes         TEXT,
    updated_at    TEXT
  );

  -- Conversion funnel rates (user-defined, per platform)
  CREATE TABLE IF NOT EXISTS funnel_rates (
    platform      TEXT PRIMARY KEY,
    views_to_dm   REAL DEFAULT 0.01,   -- 1% TT default
    dm_to_call    REAL DEFAULT 0.8,
    call_to_sale  REAL DEFAULT 0.625,
    updated_at    TEXT
  );

  -- AI-generated content strategies (monthly/weekly)
  CREATE TABLE IF NOT EXISTS strategies (
    id            TEXT PRIMARY KEY,
    period        TEXT NOT NULL,
    scope         TEXT NOT NULL,     -- 'month' | 'week' | 'day'
    week_idx      INTEGER,           -- 1..4 for week-scope
    title         TEXT,
    theme         TEXT,
    description   TEXT,
    bullets       TEXT,              -- JSON array
    raw           TEXT,
    created_at    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_strat_period ON strategies(period, scope);

  -- Content plan items (video idea + script + KPI target)
  CREATE TABLE IF NOT EXISTS content_plan (
    id              TEXT PRIMARY KEY,
    date            TEXT NOT NULL,
    time            TEXT,
    platform        TEXT NOT NULL,
    format          TEXT,
    title           TEXT,
    hook            TEXT,
    outline         TEXT,
    script          TEXT,
    cta             TEXT,
    target_views    INTEGER,
    target_leads    INTEGER,
    actual_views    INTEGER,
    actual_leads    INTEGER,
    status          TEXT DEFAULT 'idea',
    notion_id       TEXT,
    video_id        TEXT,
    week_idx        INTEGER,
    repeat_group_id TEXT,
    repeat_rule     TEXT,
    created_at      TEXT,
    updated_at      TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_plan_date ON content_plan(date);
  CREATE INDEX IF NOT EXISTS idx_plan_status ON content_plan(status);

  -- Ideas saved by user (manual or via bookmarklet from YT/IG)
  CREATE TABLE IF NOT EXISTS my_ideas (
    id            TEXT PRIMARY KEY,
    title         TEXT,
    description   TEXT,
    source_url    TEXT,        -- if saved from a YT/IG/TT video, store original URL
    source_thumb  TEXT,
    source_author TEXT,
    platform      TEXT,        -- intended posting platform
    format        TEXT,
    hook          TEXT,
    why_works     TEXT,        -- user's note on why the format works
    tags          TEXT,        -- JSON array of tags
    status        TEXT DEFAULT 'idea',  -- idea | drafting | ready | scheduled | dropped
    scheduled_id  TEXT,        -- FK to content_plan once scheduled
    created_at    TEXT,
    updated_at    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_my_ideas_status ON my_ideas(status);

  -- Format library: user's saved formats + AI-suggested formats
  CREATE TABLE IF NOT EXISTS format_library (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    platform      TEXT,
    category      TEXT,           -- 'mine' | 'ai' | 'mentor'
    description   TEXT,
    structure     TEXT,           -- JSON: { hook, beats[], cta_pattern }
    best_for      TEXT,           -- 'awareness' | 'trust' | 'convert'
    avg_views     INTEGER,
    win_rate      REAL,
    examples      TEXT,           -- JSON array of URLs/titles
    notes         TEXT,
    created_at    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_formats_platform ON format_library(platform, category);

  -- Leads ingested from forms (Google Form, manual, webhook)
  CREATE TABLE IF NOT EXISTS leads (
    id            TEXT PRIMARY KEY,
    source        TEXT,           -- 'youtube' | 'tiktok' | 'instagram' | 'form' | 'manual'
    source_url    TEXT,           -- specific video URL if attributable
    form_id       TEXT,           -- Google Form ID
    name          TEXT,
    email         TEXT,
    phone         TEXT,
    message       TEXT,
    status        TEXT DEFAULT 'new',    -- new | qualified | call_booked | call_done | sale | dropped
    revenue       INTEGER DEFAULT 0,     -- in USD cents
    notes         TEXT,
    raw           TEXT,
    created_at    TEXT,
    updated_at    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
  CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);

  -- Campaigns: long-running themed series (e.g. "Help 5 strangers earn 30M in 30 days")
  CREATE TABLE IF NOT EXISTS campaigns (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    description      TEXT,
    thesis           TEXT,
    start_date       TEXT NOT NULL,
    end_date         TEXT NOT NULL,
    daily_yt         INTEGER DEFAULT 1,
    daily_tt         INTEGER DEFAULT 2,
    daily_ig         INTEGER DEFAULT 0,
    target_views     INTEGER DEFAULT 0,
    target_leads     INTEGER DEFAULT 0,
    target_customers INTEGER DEFAULT 0,
    target_revenue   INTEGER DEFAULT 0,
    status           TEXT DEFAULT 'planned',
    color            TEXT DEFAULT '#a78bfa',
    raw              TEXT,
    created_at       TEXT,
    updated_at       TEXT
  );

  CREATE TABLE IF NOT EXISTS campaign_phases (
    id            TEXT PRIMARY KEY,
    campaign_id   TEXT NOT NULL,
    phase_idx     INTEGER NOT NULL,
    name          TEXT NOT NULL,
    description   TEXT,
    start_day     INTEGER NOT NULL,
    end_day       INTEGER NOT NULL,
    focus         TEXT,
    themes        TEXT,
    yt_templates  TEXT,
    tt_templates  TEXT,
    created_at    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_phases_campaign ON campaign_phases(campaign_id, phase_idx);

  -- Prospects — potential students/leads tracked individually (Mochi-style CRM)
  CREATE TABLE IF NOT EXISTS prospects (
    id                TEXT PRIMARY KEY,
    handle            TEXT,
    platform          TEXT,          -- tiktok | instagram | youtube
    url               TEXT,
    display_name      TEXT,
    avatar_url        TEXT,
    followers         INTEGER DEFAULT 0,
    content_style     TEXT,
    estimated_income  TEXT,
    niche             TEXT,
    status            TEXT DEFAULT 'new',  -- new | dm_sent | replied | qualified | call_booked | call_done | signed | dropped
    fit_score         INTEGER DEFAULT 0,   -- 0-100
    notes             TEXT,
    first_dm_at       TEXT,
    last_dm_at        TEXT,
    dm_template       TEXT,
    reply_received_at TEXT,
    next_followup_at  TEXT,
    application_data  TEXT,           -- JSON
    application_score INTEGER,
    raw               TEXT,
    created_at        TEXT,
    updated_at        TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_prospects_handle ON prospects(handle);
`);

// Migration: add campaign_id link to content_plan
try { db.exec("ALTER TABLE content_plan ADD COLUMN campaign_id TEXT"); } catch {}

// Idempotent migrations: add columns to content_plan if missing
try { db.exec("ALTER TABLE content_plan ADD COLUMN repeat_group_id TEXT"); } catch {}
try { db.exec("ALTER TABLE content_plan ADD COLUMN repeat_rule TEXT");     } catch {}

// Brainstorm: link to Google Docs / Sheets / Slides etc.
try { db.exec("ALTER TABLE my_ideas ADD COLUMN docs_url TEXT"); } catch {}
try { db.exec("ALTER TABLE my_ideas ADD COLUMN docs_kind TEXT"); } catch {}  // 'doc' | 'sheet' | 'slide' | 'figma' | 'notion' | 'other'

// seed default profile row if empty
const hasProfile = db.prepare('SELECT 1 FROM profile WHERE id = 1').get();
if (!hasProfile) {
  db.prepare(`INSERT INTO profile (id, name, niche, audience, goal, updated_at)
              VALUES (1, '', '', '', '', ?)`).run(new Date().toISOString());
}

// ---------- HELPERS ----------
export const stmts = {
  getProfile:       db.prepare('SELECT name, niche, audience, goal FROM profile WHERE id = 1'),
  setProfile:       db.prepare(`UPDATE profile SET name=@name, niche=@niche, audience=@audience, goal=@goal, updated_at=@updated_at WHERE id = 1`),

  getConnection:    db.prepare('SELECT * FROM connections WHERE platform = ?'),
  upsertConnection: db.prepare(`
    INSERT INTO connections (platform, access_token, refresh_token, expires_at, account_id, account_name, scope, extra, connected_at)
    VALUES (@platform, @access_token, @refresh_token, @expires_at, @account_id, @account_name, @scope, @extra, @connected_at)
    ON CONFLICT(platform) DO UPDATE SET
      access_token  = excluded.access_token,
      refresh_token = COALESCE(excluded.refresh_token, connections.refresh_token),
      expires_at    = excluded.expires_at,
      account_id    = excluded.account_id,
      account_name  = excluded.account_name,
      scope         = excluded.scope,
      extra         = excluded.extra
  `),
  deleteConnection: db.prepare('DELETE FROM connections WHERE platform = ?'),
  allConnections:   db.prepare('SELECT platform, account_name, expires_at FROM connections'),

  upsertVideo: db.prepare(`
    INSERT INTO videos (id, platform, title, published_at, thumbnail, url, views, likes, comments, shares, ctr, retention, duration, score, raw, updated_at)
    VALUES (@id, @platform, @title, @published_at, @thumbnail, @url, @views, @likes, @comments, @shares, @ctr, @retention, @duration, @score, @raw, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title, views=excluded.views, likes=excluded.likes,
      comments=excluded.comments, shares=excluded.shares, ctr=excluded.ctr,
      retention=excluded.retention, score=excluded.score, raw=excluded.raw, updated_at=excluded.updated_at
  `),
  videosBy: db.prepare(`SELECT * FROM videos WHERE (@platform = 'all' OR platform = @platform) ORDER BY published_at DESC LIMIT @limit`),
  topVideos: db.prepare(`SELECT * FROM videos ORDER BY score DESC LIMIT ?`),

  recordSnapshot: db.prepare(`INSERT INTO metric_snapshots (platform, captured_at, metric, value) VALUES (?, ?, ?, ?)`),
  latestMetrics:  db.prepare(`
    SELECT platform, metric, value FROM metric_snapshots
    WHERE id IN (
      SELECT MAX(id) FROM metric_snapshots GROUP BY platform, metric
    )
  `),

  upsertTracked: db.prepare(`
    INSERT INTO tracked_channels (id, url, handle, name, platform, tag, followers, growth, avg_views, extra, last_synced, created_at)
    VALUES (@id, @url, @handle, @name, @platform, @tag, @followers, @growth, @avg_views, @extra, @last_synced, @created_at)
    ON CONFLICT(id) DO UPDATE SET
      handle=excluded.handle, name=excluded.name, followers=excluded.followers,
      growth=excluded.growth, avg_views=excluded.avg_views, last_synced=excluded.last_synced
  `),
  allTracked:    db.prepare('SELECT * FROM tracked_channels ORDER BY created_at DESC'),
  deleteTracked: db.prepare('DELETE FROM tracked_channels WHERE id = ?'),

  insertIdea: db.prepare(`
    INSERT INTO ideas (id, title, description, platform, badge, score, duration, reach, raw, created_at)
    VALUES (@id, @title, @description, @platform, @badge, @score, @duration, @reach, @raw, @created_at)
  `),
  recentIdeas: db.prepare('SELECT * FROM ideas ORDER BY created_at DESC LIMIT ?'),
  clearIdeas:  db.prepare('DELETE FROM ideas WHERE id NOT IN (SELECT id FROM ideas ORDER BY created_at DESC LIMIT 24)'),

  insertSchedule: db.prepare(`
    INSERT INTO schedule (id, date, time, platform, title, description, status, created_at)
    VALUES (@id, @date, @time, @platform, @title, @description, @status, @created_at)
  `),
  scheduleByDate: db.prepare(`SELECT * FROM schedule WHERE date = ? ORDER BY time ASC`),
  scheduleRange:  db.prepare(`SELECT * FROM schedule WHERE date BETWEEN ? AND ? ORDER BY date, time`),
  deleteSchedule: db.prepare('DELETE FROM schedule WHERE id = ?'),

  getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
  setSetting: db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
                          ON CONFLICT(key) DO UPDATE SET value=excluded.value`),

  // Goals
  upsertGoal: db.prepare(`
    INSERT INTO goals (id, period, yt_subs, tt_followers, ig_followers, leads, revenue, notes, created_at, updated_at)
    VALUES (@id, @period, @yt_subs, @tt_followers, @ig_followers, @leads, @revenue, @notes, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      yt_subs=excluded.yt_subs, tt_followers=excluded.tt_followers,
      ig_followers=excluded.ig_followers, leads=excluded.leads,
      revenue=excluded.revenue, notes=excluded.notes, updated_at=excluded.updated_at
  `),
  getGoalByPeriod: db.prepare('SELECT * FROM goals WHERE period = ?'),
  allGoals:        db.prepare('SELECT * FROM goals ORDER BY period DESC'),

  // Baselines
  upsertBaseline: db.prepare(`
    INSERT INTO baselines (platform, followers, views_30d, avg_views, notes, updated_at)
    VALUES (@platform, @followers, @views_30d, @avg_views, @notes, @updated_at)
    ON CONFLICT(platform) DO UPDATE SET
      followers=excluded.followers, views_30d=excluded.views_30d,
      avg_views=excluded.avg_views, notes=excluded.notes, updated_at=excluded.updated_at
  `),
  allBaselines: db.prepare('SELECT * FROM baselines'),

  // Funnel rates
  upsertFunnel: db.prepare(`
    INSERT INTO funnel_rates (platform, views_to_dm, dm_to_call, call_to_sale, updated_at)
    VALUES (@platform, @views_to_dm, @dm_to_call, @call_to_sale, @updated_at)
    ON CONFLICT(platform) DO UPDATE SET
      views_to_dm=excluded.views_to_dm, dm_to_call=excluded.dm_to_call,
      call_to_sale=excluded.call_to_sale, updated_at=excluded.updated_at
  `),
  allFunnels: db.prepare('SELECT * FROM funnel_rates'),

  // Strategies
  insertStrategy: db.prepare(`
    INSERT INTO strategies (id, period, scope, week_idx, title, theme, description, bullets, raw, created_at)
    VALUES (@id, @period, @scope, @week_idx, @title, @theme, @description, @bullets, @raw, @created_at)
  `),
  strategiesByPeriod: db.prepare('SELECT * FROM strategies WHERE period = ? ORDER BY week_idx ASC'),
  deleteStrategiesByPeriod: db.prepare('DELETE FROM strategies WHERE period = ?'),

  // Content plan
  insertContentPlan: db.prepare(`
    INSERT INTO content_plan (id, date, time, platform, format, title, hook, outline, script, cta,
                              target_views, target_leads, status, week_idx, repeat_group_id, repeat_rule,
                              campaign_id, created_at, updated_at)
    VALUES (@id, @date, @time, @platform, @format, @title, @hook, @outline, @script, @cta,
            @target_views, @target_leads, @status, @week_idx, @repeat_group_id, @repeat_rule,
            @campaign_id, @created_at, @updated_at)
  `),
  updateContentPlan: db.prepare(`
    UPDATE content_plan SET
      title=@title, hook=@hook, outline=@outline, script=@script, cta=@cta,
      target_views=@target_views, target_leads=@target_leads,
      actual_views=@actual_views, actual_leads=@actual_leads,
      status=@status, notion_id=@notion_id, video_id=@video_id,
      updated_at=@updated_at
    WHERE id=@id
  `),
  contentPlanByDate:  db.prepare('SELECT * FROM content_plan WHERE date = ? ORDER BY time ASC'),
  contentPlanRange:   db.prepare('SELECT * FROM content_plan WHERE date BETWEEN ? AND ? ORDER BY date, time'),
  contentPlanByWeek:  db.prepare('SELECT * FROM content_plan WHERE week_idx = ? ORDER BY date, time'),
  deleteContentPlan:  db.prepare('DELETE FROM content_plan WHERE id = ?'),
  countPlansByPeriod: db.prepare(`SELECT COUNT(*) AS c FROM content_plan WHERE date LIKE ?`),

  // Get one content_plan item
  getContentPlanById: db.prepare('SELECT * FROM content_plan WHERE id = ?'),
  // All items in a repeat group
  contentPlanByGroup:  db.prepare('SELECT * FROM content_plan WHERE repeat_group_id = ? ORDER BY date, time'),
  // Items in group from a date onwards (for "this and future")
  contentPlanByGroupFrom: db.prepare('SELECT * FROM content_plan WHERE repeat_group_id = ? AND date >= ? ORDER BY date, time'),
  // Delete items in group from a date onwards
  deleteContentPlanGroupFrom: db.prepare('DELETE FROM content_plan WHERE repeat_group_id = ? AND date >= ?'),
  // Format performance — group by format, sum views/leads
  formatPerformance: db.prepare(`
    SELECT platform, format,
           COUNT(*) AS posts,
           SUM(COALESCE(actual_views, 0))  AS total_views,
           SUM(COALESCE(actual_leads, 0))  AS total_leads,
           AVG(COALESCE(actual_views, 0))  AS avg_views,
           AVG(COALESCE(actual_leads, 0))  AS avg_leads
    FROM content_plan
    WHERE format IS NOT NULL AND format <> ''
      AND status IN ('published', 'measured')
    GROUP BY platform, format
    ORDER BY total_leads DESC, total_views DESC
  `),

  // My ideas
  insertMyIdea: db.prepare(`
    INSERT INTO my_ideas (id, title, description, source_url, source_thumb, source_author,
                          platform, format, hook, why_works, tags, status, scheduled_id,
                          docs_url, docs_kind, created_at, updated_at)
    VALUES (@id, @title, @description, @source_url, @source_thumb, @source_author,
            @platform, @format, @hook, @why_works, @tags, @status, @scheduled_id,
            @docs_url, @docs_kind, @created_at, @updated_at)
  `),
  updateMyIdea: db.prepare(`
    UPDATE my_ideas SET
      title=@title, description=@description, platform=@platform, format=@format,
      hook=@hook, why_works=@why_works, tags=@tags, status=@status,
      docs_url=@docs_url, docs_kind=@docs_kind,
      scheduled_id=COALESCE(@scheduled_id, scheduled_id),
      updated_at=@updated_at
    WHERE id=@id
  `),
  allMyIdeas:    db.prepare('SELECT * FROM my_ideas ORDER BY created_at DESC'),
  myIdeasByStatus: db.prepare('SELECT * FROM my_ideas WHERE status = ? ORDER BY created_at DESC'),
  deleteMyIdea:  db.prepare('DELETE FROM my_ideas WHERE id = ?'),

  // Clear all content_plan
  clearAllContentPlan: db.prepare('DELETE FROM content_plan'),
  clearContentPlanByGroup: db.prepare('DELETE FROM content_plan WHERE repeat_group_id = ?'),
  clearContentPlanRange: db.prepare('DELETE FROM content_plan WHERE date BETWEEN ? AND ?'),

  // Leads
  insertLead: db.prepare(`
    INSERT INTO leads (id, source, source_url, form_id, name, email, phone, message, status, revenue, notes, raw, created_at, updated_at)
    VALUES (@id, @source, @source_url, @form_id, @name, @email, @phone, @message, @status, @revenue, @notes, @raw, @created_at, @updated_at)
  `),
  allLeads:         db.prepare('SELECT * FROM leads ORDER BY created_at DESC LIMIT ?'),
  leadsRange:       db.prepare('SELECT * FROM leads WHERE created_at BETWEEN ? AND ? ORDER BY created_at DESC'),
  leadsByStatus:    db.prepare('SELECT * FROM leads WHERE status = ? ORDER BY created_at DESC'),
  countLeadsSince:  db.prepare("SELECT COUNT(*) AS c FROM leads WHERE created_at >= ?"),
  updateLead:       db.prepare(`UPDATE leads SET status=@status, revenue=@revenue, notes=@notes, updated_at=@updated_at WHERE id=@id`),
  deleteLead:       db.prepare('DELETE FROM leads WHERE id = ?'),

  // Format library
  insertFormat: db.prepare(`
    INSERT INTO format_library (id, name, platform, category, description, structure, best_for,
                                avg_views, win_rate, examples, notes, created_at)
    VALUES (@id, @name, @platform, @category, @description, @structure, @best_for,
            @avg_views, @win_rate, @examples, @notes, @created_at)
  `),
  allFormats:    db.prepare('SELECT * FROM format_library ORDER BY win_rate DESC, avg_views DESC'),
  formatsByPlatform: db.prepare('SELECT * FROM format_library WHERE platform = ? ORDER BY win_rate DESC'),
  deleteFormat:  db.prepare('DELETE FROM format_library WHERE id = ?'),

  // Campaigns
  insertCampaign: db.prepare(`
    INSERT INTO campaigns (id, name, description, thesis, start_date, end_date,
                           daily_yt, daily_tt, daily_ig,
                           target_views, target_leads, target_customers, target_revenue,
                           status, color, raw, created_at, updated_at)
    VALUES (@id, @name, @description, @thesis, @start_date, @end_date,
            @daily_yt, @daily_tt, @daily_ig,
            @target_views, @target_leads, @target_customers, @target_revenue,
            @status, @color, @raw, @created_at, @updated_at)
  `),
  updateCampaign: db.prepare(`
    UPDATE campaigns SET name=@name, description=@description, thesis=@thesis,
      start_date=@start_date, end_date=@end_date,
      daily_yt=@daily_yt, daily_tt=@daily_tt, daily_ig=@daily_ig,
      target_views=@target_views, target_leads=@target_leads,
      target_customers=@target_customers, target_revenue=@target_revenue,
      status=@status, color=@color, updated_at=@updated_at
    WHERE id=@id
  `),
  getCampaign:      db.prepare('SELECT * FROM campaigns WHERE id = ?'),
  allCampaigns:     db.prepare('SELECT * FROM campaigns ORDER BY start_date DESC'),
  deleteCampaign:   db.prepare('DELETE FROM campaigns WHERE id = ?'),

  insertPhase: db.prepare(`
    INSERT INTO campaign_phases (id, campaign_id, phase_idx, name, description,
                                 start_day, end_day, focus, themes, yt_templates, tt_templates, created_at)
    VALUES (@id, @campaign_id, @phase_idx, @name, @description,
            @start_day, @end_day, @focus, @themes, @yt_templates, @tt_templates, @created_at)
  `),
  phasesByCampaign: db.prepare('SELECT * FROM campaign_phases WHERE campaign_id = ? ORDER BY phase_idx ASC'),
  deletePhasesByCampaign: db.prepare('DELETE FROM campaign_phases WHERE campaign_id = ?'),

  // Content plan ↔ campaign linking
  deleteContentPlanByCampaign: db.prepare('DELETE FROM content_plan WHERE campaign_id = ?'),
  contentPlanByCampaign: db.prepare('SELECT * FROM content_plan WHERE campaign_id = ? ORDER BY date, time'),

  // Prospects
  insertProspect: db.prepare(`
    INSERT INTO prospects (id, handle, platform, url, display_name, avatar_url,
                           followers, content_style, estimated_income, niche,
                           status, fit_score, notes,
                           first_dm_at, last_dm_at, dm_template, reply_received_at,
                           next_followup_at, application_data, application_score, raw,
                           created_at, updated_at)
    VALUES (@id, @handle, @platform, @url, @display_name, @avatar_url,
            @followers, @content_style, @estimated_income, @niche,
            @status, @fit_score, @notes,
            @first_dm_at, @last_dm_at, @dm_template, @reply_received_at,
            @next_followup_at, @application_data, @application_score, @raw,
            @created_at, @updated_at)
  `),
  updateProspect: db.prepare(`
    UPDATE prospects SET
      handle=@handle, platform=@platform, url=@url, display_name=@display_name, avatar_url=@avatar_url,
      followers=@followers, content_style=@content_style, estimated_income=@estimated_income, niche=@niche,
      status=@status, fit_score=@fit_score, notes=@notes,
      first_dm_at=@first_dm_at, last_dm_at=@last_dm_at, dm_template=@dm_template,
      reply_received_at=@reply_received_at, next_followup_at=@next_followup_at,
      application_data=@application_data, application_score=@application_score,
      updated_at=@updated_at
    WHERE id=@id
  `),
  getProspect:       db.prepare('SELECT * FROM prospects WHERE id = ?'),
  prospectByHandle:  db.prepare('SELECT * FROM prospects WHERE handle = ? AND platform = ?'),
  allProspects:      db.prepare('SELECT * FROM prospects ORDER BY created_at DESC'),
  prospectsByStatus: db.prepare('SELECT * FROM prospects WHERE status = ? ORDER BY created_at DESC'),
  deleteProspect:    db.prepare('DELETE FROM prospects WHERE id = ?'),
  prospectsDueFollowup: db.prepare(`SELECT * FROM prospects WHERE next_followup_at IS NOT NULL AND next_followup_at <= ? AND status NOT IN ('signed','dropped') ORDER BY next_followup_at ASC`),

  // Aggregate campaign performance
  campaignStats: db.prepare(`
    SELECT
      COUNT(*) AS posts_total,
      SUM(CASE WHEN status = 'published' OR status = 'measured' THEN 1 ELSE 0 END) AS posts_done,
      SUM(COALESCE(actual_views, 0)) AS total_views,
      SUM(COALESCE(actual_leads, 0)) AS total_leads
    FROM content_plan WHERE campaign_id = ?
  `)
};

export function getSetting(key, fallback = null) {
  const row = stmts.getSetting.get(key);
  return row ? row.value : fallback;
}
export function setSetting(key, value) {
  stmts.setSetting.run(key, value);
}
