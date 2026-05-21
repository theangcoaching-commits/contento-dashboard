# Contento — Content Performance Dashboard

A production-ready content intelligence dashboard that auto-tracks every video you publish on **YouTube, TikTok, and Instagram**, monitors creators you care about by URL, generates weekly AI-powered content ideas, and schedules your posts in the highest-converting time slots.

UI inspired by the Financeo concept: deep navy background, violet gradients, glassmorphism, pill navigation.

```
content-dashboard/
├── frontend/             ← Static SPA (HTML · CSS · vanilla JS · Chart.js)
│   ├── index.html
│   ├── styles.css
│   ├── api.js            ← API client (falls back to mocks if backend offline)
│   └── app.js            ← View routing · charts · interactions
├── backend/              ← Node.js + Express + SQLite
│   ├── server.js
│   ├── db.js             ← SQLite schema + prepared statements
│   ├── routes/
│   │   ├── auth.js       ← OAuth flows
│   │   └── api.js        ← Profile, metrics, videos, tracking, ideas, schedule
│   ├── services/
│   │   ├── youtube.js    ← YouTube Data API v3 + Analytics
│   │   ├── tiktok.js     ← TikTok Display API
│   │   ├── instagram.js  ← Meta Graph API
│   │   ├── ai.js         ← Claude content idea generation
│   │   └── sync.js       ← Cron + manual sync coordinator
│   └── scripts/sync-once.js
├── package.json
├── .env.example
└── README.md
```

---

## 1. Quick start

```bash
# 1. install deps (Node 18+ required)
npm install

# 2. set up env
cp .env.example .env
# fill in OAuth credentials — see Section 3

# 3. run
npm run dev          # nodemon-like reload
# or
npm start            # production
```

Then open <http://localhost:4000>.

The frontend serves immediately with **mock data** so you can see the UI before connecting any platform.

---

## 2. Features

| Feature                                  | Where                                      |
|------------------------------------------|--------------------------------------------|
| Auto-track all your videos               | `GET /api/videos` — populated by sync      |
| KPI per platform (views, CTR, retention) | `GET /api/metrics?range=30`                |
| Conversion funnel                        | `GET /api/funnel?range=30`                 |
| Track other creators by URL              | `POST /api/tracked` `{ url, tag }`         |
| AI weekly content ideas                  | `GET /api/ideas` · `POST /api/ideas/generate` |
| Schedule for optimal lead/convert times  | `GET /api/schedule` · `POST /api/schedule` |
| Auto sync every 30 min                   | Cron, configurable via `SYNC_CRON`         |
| Light/dark theme toggle                  | Top-right button                           |

---

## 3. Setting up the API credentials

Each platform needs its own OAuth app. The redirect URIs below assume `http://localhost:4000` — change them for production.

### 3.1 YouTube Data API v3

1. Open [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. Enable **YouTube Data API v3** and **YouTube Analytics API** for your project.
3. Create an **OAuth 2.0 Client ID** (Web application).
4. Add the redirect URI: `http://localhost:4000/api/auth/youtube/callback`.
5. Copy the Client ID/Secret into `.env`:

```
YT_CLIENT_ID=...apps.googleusercontent.com
YT_CLIENT_SECRET=...
```

### 3.2 TikTok Display API

1. Register at <https://developers.tiktok.com> and create an app.
2. Enable the **Login Kit** and request `user.info.basic`, `video.list`, `user.info.stats` scopes.
3. Add the redirect URL `http://localhost:4000/api/auth/tiktok/callback`.
4. Copy Client Key/Secret into `.env`:

```
TT_CLIENT_KEY=...
TT_CLIENT_SECRET=...
```

> NOTE: For competitor tracking with non-owned channels you'll need TikTok's **Research API** (separate application). The current build supports owned-account metrics.

### 3.3 Instagram Graph API

1. Create an app at <https://developers.facebook.com/apps>.
2. Add the **Instagram Graph API** product.
3. Add OAuth redirect `http://localhost:4000/api/auth/instagram/callback`.
4. You need a **Business or Creator** Instagram account linked to a Facebook page.
5. Copy into `.env`:

```
IG_CLIENT_ID=...
IG_CLIENT_SECRET=...
```

### 3.4 Claude (AI ideas)

1. Get an API key at <https://console.anthropic.com>.
2. Set:

```
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-4-7
```

If this key is missing, the `/api/ideas` endpoint returns a static seed list so the UI still works.

---

## 4. Connecting your accounts

1. Run the server and open <http://localhost:4000>.
2. Click the gear icon (top right) to open **Settings**.
3. Click **Connect** on each platform card — you'll be redirected to the provider's consent screen.
4. After approval, you'll land back on the dashboard and the initial sync runs in the background.
5. The cron job (`SYNC_CRON`, default every 30 min) keeps everything fresh from then on.

You can force a sync at any time via:

```bash
npm run sync
```

or hit `POST /api/sync` from any HTTP client.

---

## 5. Backend API reference

| Method | Endpoint                       | Purpose                                   |
|--------|--------------------------------|-------------------------------------------|
| GET    | `/api/health`                  | Liveness probe                            |
| GET    | `/api/profile`                 | Creator profile                           |
| PUT    | `/api/profile`                 | Update profile                            |
| GET    | `/api/connections`             | Which platforms are linked                |
| GET    | `/api/auth/:platform/start`    | Start OAuth (redirect)                    |
| GET    | `/api/auth/:platform/callback` | OAuth callback (provider redirect target) |
| DELETE | `/api/auth/:platform`          | Disconnect platform                       |
| GET    | `/api/metrics?range=30`        | Aggregated KPIs per platform              |
| GET    | `/api/funnel?range=30`         | Funnel rollup                             |
| GET    | `/api/videos?platform=youtube` | Video list, filterable                    |
| POST   | `/api/sync`                    | Force sync all connected platforms        |
| GET    | `/api/tracked`                 | List tracked creators                     |
| POST   | `/api/tracked`                 | Add `{ url, tag }`                        |
| DELETE | `/api/tracked/:id`             | Remove tracked creator                    |
| GET    | `/api/viral`                   | Top-scoring video feed                    |
| GET    | `/api/ideas`                   | Recent ideas (auto-generate on first hit) |
| POST   | `/api/ideas/generate`          | Force a fresh AI generation               |
| GET    | `/api/schedule?from=&to=`      | Schedule map                              |
| POST   | `/api/schedule`                | Add scheduled post                        |
| DELETE | `/api/schedule/:id`            | Remove scheduled post                     |

---

## 6. Optimizations baked in

**Frontend**
- Single static bundle — no build step, no framework runtime.
- Glassmorphism with `backdrop-filter`; ambient blobs are pure CSS animations (no JS).
- Charts via Chart.js CDN; gradients computed once per chart, reused per frame.
- API client gracefully falls back to mocks → the UI is never blank.
- All views are lazy-rendered the first time you switch to them (after initial preload).

**Backend**
- `better-sqlite3` (synchronous, zero-config) with WAL mode for concurrent reads.
- All hot queries are pre-prepared statements (no plan re-compilation).
- Express middleware: `helmet`, `compression`, `cors`, `morgan`, etag-aware static serving.
- OAuth tokens refresh automatically (Google client built-in; manual refresh for TikTok).
- AI calls use Anthropic's **prompt caching** on the system prompt — 90% cheaper after the first call.
- Cron-driven sync keeps the DB warm; manual `/api/sync` for on-demand.

**Production checklist**
- Put behind HTTPS (Nginx / Cloudflare).
- Set `SESSION_SECRET`, a strong DB path, `NODE_ENV=production`.
- Update redirect URIs in each developer console to your live domain.
- Move SQLite to a mounted volume (or migrate to Postgres — the schema is portable).

---

## 7. Development tips

- The first time you hit `/api/ideas`, it generates 6 ideas via Claude. They're persisted; subsequent reads are instant.
- The DB file lives at `backend/data/contento.db` (auto-created). Delete it for a clean slate.
- Live-reload during dev: `npm run dev` uses Node's `--watch` flag.
- To run only the frontend (without backend), just open `frontend/index.html` directly — mock data kicks in.

---

## 8. License

MIT — go build something great.
