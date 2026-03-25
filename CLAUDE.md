# CloserMetrix

Sales call intelligence platform. Turns call recordings → structured BI for high-ticket sales teams.
Stack: Node.js/Express · Vite/React · MUI X Charts · Google BigQuery · Cloud Run
GCP project: `closer-automation` | BQ dataset: `CloserAutomation`

---

## This File Improves Itself

**Every time Tyler corrects Claude, the correction becomes a permanent rule.**

The mechanic:
1. Tyler makes a correction mid-session ("that's wrong, it should be X")
2. Claude immediately asks: "Should I add that as a rule to CLAUDE.md?"
3. If yes — Claude edits CLAUDE.md, appends to the Learned Rules Log with today's date and what triggered it, and promotes it to "Rules Claude Gets Wrong" if it's universal
4. At end of session, run `/wrap-up` — it auto-reviews the conversation for additional improvements and applies them

Run `/reflect` at any time to do a deep review of recent sessions and propose batch improvements.

The goal: every conversation makes Claude slightly more accurate on this codebase. Rules compound.

---

## Reference Docs

Read the relevant doc **before** starting any task. Don't guess at metrics, field names, or formulas.

| Task | Read This |
|------|-----------|
| Any dashboard page, metric, scorecard, or chart | `docs/review.md` — every page, every formula |
| BigQuery schema, views, column names | `docs/database.md` |
| Colors, typography, component props | `docs/design-system.md` |
| Backend pipeline, webhooks, AI config | `docs/backend-pipeline.md` |

---

## Dev Servers

**Always restart all 3 servers after any change.**

```bash
lsof -ti:8080 -ti:3001 -ti:5173 | xargs kill -9 2>/dev/null
cd Backend && nohup npm start > /tmp/closermetrix-backend.log 2>&1 &
cd Frontend && nohup npm run dev > /tmp/closermetrix-express.log 2>&1 &
cd Frontend/client && nohup npm run dev > /tmp/closermetrix-vite.log 2>&1 &
# Backend: http://localhost:8080
# Express: http://localhost:3001
# Vite:    http://localhost:5173
```

### Test Tokens — Never Demo Tokens

Tokens are stored in `.env` (gitignored). Never commit raw tokens to tracked files.

| Env Var | Tier | Notes |
|---------|------|-------|
| `TEST_TOKEN_EXECUTIVE` | executive | All pages including Violations + Adherence |
| `TEST_TOKEN_INSIGHT` | insight | All insight-tier pages |

`TEST_CLIENT_ID` = the client_id for direct BQ/backend testing (no token needed).

### Deploy

```bash
export PATH="/Users/user/google-cloud-sdk/bin:$PATH"
# Backend deploy (run from Backend/)
cd Backend && gcloud builds submit --config cloudbuild.yaml \
  --substitutions=SHORT_SHA=$(git rev-parse --short HEAD) \
  --project=closer-automation
```

---

## Rules Claude Gets Wrong

These are recurring mistakes. Read this section every session.

### Colors

**Never hardcode hex.** Always use token names from `Frontend/client/src/theme/constants.js`.

**`teal` and `cyan` are the same color.** Both map to `#4DD4E8`. Tyler calls it "teal" in conversation but the canonical token is `cyan`. Use either — they render identically. There is no separate darker teal anymore.

```js
// Frontend code — use COLORS object
COLORS.neon.cyan / green / amber / red / blue / purple / teal / magenta
COLORS.bg.primary / secondary / tertiary / elevated
COLORS.text.primary / secondary / muted
COLORS.border.glow
```

In backend/config/data files use string names: `'cyan'`, `'green'`, `'amber'`, `'red'`, `'blue'`, `'purple'`, `'teal'`, `'muted'`.

**`orange` is NOT a token.** Attendance page uses orange for Rescheduled — it maps to `COLORS.neon.amber`. There is no separate orange token.

**Magenta is emergency-only** — only use for 8+ segment charts when all other colors are exhausted.

### BigQuery

**Every query must include `client_id`.** This is non-negotiable client isolation. No exceptions.

```js
// Always parameterized — never string interpolation
WHERE client_id = @clientId

// Full table names always
`closer-automation.CloserAutomation.Calls`
`closer-automation.CloserAutomation.Closers`
```

**`appointment_date` is a TIMESTAMP** in BigQuery. BQ SDK returns as `{ value: '...' }` — normalize with `toISO()` from `Backend/src/utils/dateUtils.js`. **`appointment_end_date` is a STRING** — requires `SAFE_CAST(appointment_end_date AS TIMESTAMP)` in queries.

**`call_id` (UUID) is the true PK**, not `appointment_id`.

**Views are read-only.** Never modify `v_*` views. Query them; don't touch their definitions.

### Score Field Names — Exact, No Guessing

BQ columns for script adherence (all on the `Calls` table):

```
intro_score            pain_score             goal_score
transition_score       pitch_adherence_score  close_adherence_score
objection_adherence_score  script_adherence_score  overall_call_score
prospect_fit_score
```

⚠️ There is **NO `discovery_score`** column. Discovery was split into `pain_score` + `goal_score`. If you write `discovery_score` you will get a BQ error.

### Metrics & Computation

**`computePageData.js` owns client-side logic.** BQ queries return raw/aggregated data. `Frontend/client/src/utils/computePageData.js` handles: filtering, time bucketing, delta calculations, chart data shaping. Don't move this logic server-side without a deliberate architectural decision.

**Negative metrics use `desiredDirection: 'down'`.** Lower is better for: Lost %, DQ Rate, Not Pitched Rate, Risk Flags, % Calls w/ Flags, Avg Days to Close, Avg Calls to Close, Calls Required per Deal. Delta arrows invert for these.

**Auto-granularity for time-series charts:**
- ≤14 days → Daily
- 15–90 days → Weekly  
- >90 days → Monthly

**Safe divide everywhere.** `sd(a, b)` = `a / b` or `0` if `b === 0`. Never let a divide-by-zero reach the UI.

### UI

**No white backgrounds anywhere.** Full dark Tron theme throughout.

**No inline styles.** Use MUI `sx` prop or theme overrides only.

**No dummy data in production.** Empty state: scorecards → `'-'`, charts → `[]`. Only exception: blurred tier-gate preview cards.

**Tier enforcement is three layers** — all three must be present:
1. Frontend sidebar hides inaccessible pages (UX only)
2. `tierGate.js` middleware returns 403 (real enforcement)
3. Tier-specific query files — lower tiers never execute restricted queries

---

## Repo Map

```
Frontend/
  server/              ← Express API (:3001) — proxies /api/* to Backend:8080
    db/queries/        ← BigQuery SQL, one file per page
    middleware/        ← clientIsolation.js, tierGate.js, adminAuth.js
    routes/            ← dashboard.js, admin.js, partner.js, auth.js
  client/src/
    theme/             ← constants.js (COLORS), tronTheme.js, chartTheme.js
    utils/             ← computePageData.js ← client-side metric computation lives here
    hooks/             ← useMetrics, useFilters, useTier, useAuth
    components/
      scorecards/      ← Scorecard.jsx, ScorecardGrid.jsx, ScorecardRow.jsx
      charts/          ← TronLineChart, TronBarChart, TronPieChart, TronRadarChart, TronFunnelChart
      tables/          ← ObjectionsTable, RiskReviewTable, CloserLeaderboard
      filters/         ← DateRangeFilter, CloserFilter, GranularityToggle
      layout/          ← DashboardShell, Sidebar, TopBar
    pages/
      client/          ← Overview, Financial, Attendance, CallOutcomes, SalesCycle,
                          Objections, Projections, Violations, Adherence
      admin/           ← AdminDashboard, ClientManager, TokenManager, ApiConsole
      partner/         ← PartnerDashboard

Backend/
  src/
    config/            ← objection-types.js, call-outcomes.js, attendance-types.js,
                          scoring-rubric.js, transcript-providers.js, calendar-providers.js
    services/          ← CalendarService, TranscriptService, AIProcessor, PaymentService
    db/                ← BigQueryClient.js (all queries route through here)
    routes/webhooks/   ← calendar.js, transcript.js, payment.js

```

---

  ### Security — Build Secure, Always Audit                                                                                                                            
   
  **Security is not optional.** Every feature, route, middleware, and query must be built with security in mind from the start.                                        
                                                        
  **Before completing any feature:**                       
  - Validate all user input server-side (never trust the client)
  - Use parameterized queries only — never string interpolation in SQL
  - Enforce auth on every route — no unauthenticated endpoints except public health checks
  - Enforce client isolation (`client_id` filtering) on every data query
  - Use `crypto.timingSafeEqual` for all secret/token comparisons — never `===` or `!==`
  - Use allowlists (not denylists) for mass assignment on update endpoints
  - Never leak stack traces, internal paths, or error details in API responses
  - Never hardcode secrets, API keys, or tokens in source code — use env vars or Secret Manager

  **After completing any feature or sprint:**
  - Run a security sweep across all touched files (routes, middleware, queries, config)
  - Check for OWASP Top 10: broken access control, injection, auth failures, SSRF, misconfig
  - Verify tier enforcement is applied server-side (not just frontend hiding)
  - Verify webhook endpoints have signature/auth verification
  - Check CORS is restricted to known origins
  - Ensure rate limiting exists on auth and admin endpoints


## Learned Rules Log

*Every correction gets logged here. This is how the file gets smarter.*

| # | Date | Triggered By | Rule |
|---|------|-------------|------|
| 1 | init | — | Always restart all 3 dev servers after ANY code change — don't wait for user to ask |
| 2 | init | — | Never use demo tokens — always use real BQ tokens |
| 4 | init | — | Never hardcode hex — always use COLORS token names |
| 5 | init | review.md audit | `discovery_score` BQ column does not exist — use `pain_score` + `goal_score` |
| 6 | init | review.md audit | `computePageData.js` owns client-side computation — don't move it server-side |
| 7 | init | review.md audit | Negative metrics need `desiredDirection: 'down'` or delta arrows will invert wrong |
| 8 | init | review.md audit | `orange` is not a color token — Rescheduled uses `amber` |
| 9 | init | review.md audit | Auto-granularity thresholds: ≤14d=daily, 15-90d=weekly, >90d=monthly |
| 10 | 2026-03-09 | security audit | Always build with security in mind and run security sweep after every feature |
| 11 | 2026-03-10 | Tyler correction | Run `cd Backend && npm test` after every significant code change — verify 0 new failures before moving on |
| 12 | 2026-03-10 | Tyler correction | `teal` and `cyan` are the same color (#4DD4E8). No separate darker teal. Tyler says "teal" but means cyan. |
| 13 | 2026-03-10 | Tyler correction | Client IDs can be alphanumeric slugs (e.g. "himym"), not just UUIDs. Validate with `/^[a-zA-Z0-9_-]{1,128}$/` |
| 14 | 2026-03-10 | Tyler correction | Call outcome colors: deposit=amber, follow_up=purple, disqualified=gray(muted), not_pitched=blue |
| 15 | 2026-03-10 | Tyler correction | E2E tests must hard-delete all test data from BQ after running. Use `afterAll` to DELETE from: Objections, CostTracking, AuditLog, Prospects, Calls, AccessTokens, Closers, Clients (in that order). Cleanup script: `cd Backend && node scripts/cleanup-e2e.js` |

