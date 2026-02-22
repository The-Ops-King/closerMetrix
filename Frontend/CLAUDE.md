# CLOSERMETRIX — REACT DASHBOARD FRONTEND

## READ THIS FIRST

You are building the **client-facing React dashboard** for CloserMetrix, a sales call intelligence platform. This replaces the current Looker Studio dashboards with a custom, multi-tenant, tier-aware React application.

**The human building this (Tyler) is a solo founder.** He codes in JavaScript. He needs this documented so thoroughly that anyone could pick it up and understand the entire system in 10 minutes. Comment everything. Document every decision. Make every function self-explanatory.

**This document is your single source of truth.** If something contradicts this document, this document wins.

---

## DEV SERVER STARTUP — ALWAYS DO THIS AFTER CHANGES

After making any frontend changes, always start both dev servers so Tyler can see the result:

```bash
# Kill any existing processes on the ports first
lsof -ti:3001 -ti:5173 | xargs kill -9 2>/dev/null

# 1. Start the Express API server (port 3001) from Frontend/
cd Frontend && nohup npm run dev > /tmp/closermetrix-express.log 2>&1 &

# 2. Start the Vite dev server (port 5173) from Frontend/client/
cd Frontend/client && nohup npm run dev > /tmp/closermetrix-vite.log 2>&1 &
```

- **Express API**: http://localhost:3001 (proxies /api/* to Backend:8080)
- **Vite React**: http://localhost:5173 (hot-reloads, proxies to Express)
- Open http://localhost:5173 in the browser to view the app

---

## TABLE OF CONTENTS

1. [Architecture Overview](#1-architecture-overview)
2. [Tech Stack](#2-tech-stack)
3. [Directory Structure](#3-directory-structure)
4. [Authentication & Access Control](#4-authentication--access-control)
5. [Tier System](#5-tier-system)
6. [Data Layer — BigQuery Integration](#6-data-layer--bigquery-integration)
7. [API Design](#7-api-design)
8. [Dashboard Pages & Metrics Reference](#8-dashboard-pages--metrics-reference)
9. [Component Architecture](#9-component-architecture)
10. [Design System — Tron Theme](#10-design-system--tron-theme)
11. [Charts & Visualizations](#11-charts--visualizations)
12. [Filters & Interactivity](#12-filters--interactivity)
13. [Admin Master View](#13-admin-master-view)
14. [Partner View](#14-partner-view)
15. [Client View](#15-client-view)
16. [Projections Engine](#16-projections-engine)
17. [Deployment — Cloud Run](#17-deployment--cloud-run)
18. [Environment Variables](#18-environment-variables)
19. [Build Order](#19-build-order)
20. [Coding Standards](#20-coding-standards)
21. [Reference: BigQuery Tables & Views](#21-reference-bigquery-tables--views)
22. [Reference: Existing Repos (Goals & Projections)](#22-reference-existing-repos)

---

## 1. ARCHITECTURE OVERVIEW

### System Design

```
┌─────────────────────────────────────────────────────────────┐
│                       CLOUD RUN                              │
│                                                              │
│  ┌──────────────────┐    ┌──────────────────────────────┐   │
│  │   Express API     │    │     React SPA (Vite)          │   │
│  │   /api/*          │    │     /app/*                     │   │
│  │                    │    │                                │   │
│  │  • BigQuery SA     │◄──│  • Admin view (/admin/*)       │   │
│  │  • Client isolation│    │  • Partner view (/partner/:t)  │   │
│  │  • Tier gating     │    │  • Client view (/d/:token)     │   │
│  │  • Token auth      │    │                                │   │
│  └────────┬───────────┘    └────────────────────────────────┘   │
│           │                                                      │
│           ▼                                                      │
│  ┌──────────────────┐                                           │
│  │   Google BigQuery  │                                          │
│  │   (Service Acct)   │                                          │
│  │                    │                                          │
│  │  Calls             │                                          │
│  │  Closers           │                                          │
│  │  Clients           │                                          │
│  │  Objections        │                                          │
│  │  Views (6+)        │                                          │
│  └────────────────────┘                                          │
└──────────────────────────────────────────────────────────────────┘
```

### Monorepo Structure — Two Deployable Units

This is a **single Cloud Run service** that serves both the API and the React SPA. The Express server serves the API routes and also serves the built React app as static files.

```
Request Flow:
  /api/*     → Express API handlers → BigQuery → JSON response
  /admin/*   → React SPA (static files)
  /partner/* → React SPA (static files)
  /d/*       → React SPA (static files)
  /*         → React SPA (catch-all for client-side routing)
```

### Core Principles

1. **Client isolation is NON-NEGOTIABLE.** Every API query includes `client_id`. A client can NEVER see another client's data. This is enforced at three layers: token→client_id mapping, API middleware, and parameterized BigQuery queries.
2. **Tier logic lives in the API.** The API checks `plan_tier` from the Clients table and only returns data the client is entitled to see. The frontend hides/shows UI based on tier, but the API is the enforcement layer.
3. **No BigQuery credentials touch the browser.** The Express API uses a GCP service account. The React app only talks to the Express API.
4. **Shared secret links for client access.** Clients get a URL like `https://app.closermetrix.com/d/abc123xyz`. The token maps to a `client_id` and `plan_tier` on the server. No login required.

---

## 2. TECH STACK

### Frontend (React SPA)

Always use the /interface-design when doing anything front end.

| Tool | Purpose | Why |
|------|---------|-----|
| **Vite** | Build tool | Fast HMR, ESM-native, simple config |
| **React 18** | UI framework | Tyler knows JS/React |
| **React Router v6** | Routing | Client-side routing for admin/partner/client views |
| **MUI X Charts** | Charting | Line, bar, pie, funnel, area charts with gradient support. Install: `@mui/x-charts` |
| **MUI Material** | UI components | DataGrid, Tabs, Select, Slider, DatePicker for filters. Install: `@mui/material @mui/x-date-pickers @mui/x-data-grid` |
| **@emotion/react + @emotion/styled** | Styling | Required by MUI. Theme-level dark mode. |
| **dayjs** | Dates | Lightweight, used by MUI DatePickers |
| **react-query (TanStack Query)** | Data fetching | Caching, refetching, loading states |

### Backend (Express API)
| Tool | Purpose | Why |
|------|---------|-----|
| **Express** | HTTP server | Simple, Tyler knows it |
| **@google-cloud/bigquery** | BigQuery client | Official Google SDK |
| **uuid** | Token generation | For client access tokens |
| **helmet** | Security headers | Production hardening |
| **cors** | CORS config | Dev/prod flexibility |
| **compression** | Response compression | Performance |
| **morgan** | Request logging | Debugging |

### Infrastructure
| Tool | Purpose |
|------|---------|
| **Cloud Run** | Hosting (already in use) |
| **Docker** | Containerization |
| **GCP Service Account** | BigQuery auth (key stored as env var or mounted secret) |

---

## 3. DIRECTORY STRUCTURE

```
closermetrix-dashboard/
├── CLAUDE.md                          # THIS FILE — single source of truth
├── Dockerfile                          # Multi-stage: build React → serve with Express
├── cloudbuild.yaml                     # GCP Cloud Build config
├── package.json                        # Root — Express dependencies
├── .env.example                        # Environment variable template
│
├── server/                             # ─── EXPRESS API ───
│   ├── index.js                        # Entry point: Express setup + static file serving
│   ├── config/
│   │   └── index.js                    # Loads env vars with defaults
│   ├── db/
│   │   ├── BigQueryClient.js           # Singleton BQ client — ALL queries go through here
│   │   └── queries/
│   │       ├── overview.js             # Overview page metrics (all tiers)
│   │       ├── financial.js            # Financial page queries (Insight+)
│   │       ├── attendance.js           # Attendance page queries (Insight+)
│   │       ├── callOutcomes.js         # Call outcomes page queries (Insight+)
│   │       ├── salesCycle.js           # Sales cycle page queries (Insight+)
│   │       ├── objections.js           # Objection intelligence queries (Insight+)
│   │       ├── projections.js          # Projections engine queries (Insight+)
│   │       ├── violations.js           # SEC/FTC violation queries (Executive)
│   │       ├── adherence.js            # Script adherence queries (Executive)
│   │       └── admin.js                # Admin-only queries (all clients, tier changes)
│   ├── middleware/
│   │   ├── clientIsolation.js          # Token → client_id resolution + injection
│   │   ├── tierGate.js                 # Checks plan_tier before returning data
│   │   ├── adminAuth.js                # Admin API key check
│   │   └── partnerAuth.js              # Partner token → allowed client_ids
│   ├── routes/
│   │   ├── dashboard.js                # Client dashboard API: /api/dashboard/:section
│   │   ├── admin.js                    # Admin API: /api/admin/*
│   │   ├── partner.js                  # Partner API: /api/partner/*
│   │   └── auth.js                     # Token validation: /api/auth/validate
│   └── utils/
│       ├── tokenManager.js             # Generate, validate, revoke client tokens
│       ├── metricsCalculator.js        # Shared metric calculation functions
│       └── logger.js                   # Structured logging
│
├── client/                             # ─── REACT SPA ───
│   ├── index.html                      # Vite entry
│   ├── vite.config.js                  # Vite config (proxy /api to Express in dev)
│   ├── package.json                    # React dependencies
│   ├── src/
│   │   ├── main.jsx                    # React entry point
│   │   ├── App.jsx                     # Router setup
│   │   ├── theme/
│   │   │   ├── tronTheme.js            # MUI theme — Tron dark palette + typography
│   │   │   ├── chartTheme.js           # Chart-specific colors, gradients, defaults
│   │   │   └── constants.js            # Color tokens, spacing, breakpoints
│   │   ├── hooks/
│   │   │   ├── useMetrics.js           # TanStack Query wrapper for dashboard data
│   │   │   ├── useFilters.js           # Filter state management (date, closer, etc.)
│   │   │   ├── useTier.js              # Returns current client tier
│   │   │   └── useAuth.js              # Token validation + client context
│   │   ├── context/
│   │   │   ├── AuthContext.jsx          # Client auth state (token, client_id, tier)
│   │   │   └── FilterContext.jsx        # Global filter state (date range, closer, etc.)
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── DashboardShell.jsx   # Sidebar + topbar + content area
│   │   │   │   ├── Sidebar.jsx          # Navigation — pages shown based on tier
│   │   │   │   ├── TopBar.jsx           # Client name, tier badge, filters
│   │   │   │   └── TierBadge.jsx        # Visual tier indicator (Basic/Insight/Executive)
│   │   │   ├── scorecards/
│   │   │   │   ├── Scorecard.jsx        # Single metric card with label, value, delta
│   │   │   │   ├── ScorecardRow.jsx     # Horizontal row of scorecards
│   │   │   │   └── ScorecardGrid.jsx    # Grid layout for scorecard sections
│   │   │   ├── charts/
│   │   │   │   ├── TronLineChart.jsx    # Line chart with gradient fill, glow effect
│   │   │   │   ├── TronBarChart.jsx     # Horizontal/vertical bar chart
│   │   │   │   ├── TronPieChart.jsx     # Pie/donut chart
│   │   │   │   ├── TronFunnelChart.jsx  # Funnel visualization (Booked→Held→Closed)
│   │   │   │   ├── TronStackedBar.jsx   # Stacked bar (resolved vs unresolved)
│   │   │   │   ├── TronRadarChart.jsx   # Radar chart (script adherence by section)
│   │   │   │   └── ChartWrapper.jsx     # Loading/error/empty states for all charts
│   │   │   ├── tables/
│   │   │   │   ├── ObjectionsTable.jsx  # Interactive objection drill-down table
│   │   │   │   ├── RiskReviewTable.jsx  # Executive risk detail table
│   │   │   │   ├── CloserLeaderboard.jsx # Ranked closer comparison table
│   │   │   │   └── FollowUpTable.jsx    # Open follow-ups / aging deals
│   │   │   ├── filters/
│   │   │   │   ├── DateRangeFilter.jsx  # Date range picker
│   │   │   │   ├── CloserFilter.jsx     # Closer multi-select (Insight+ only)
│   │   │   │   ├── ObjectionTypeFilter.jsx # Objection type filter
│   │   │   │   └── GranularityToggle.jsx  # Daily/Weekly/Monthly for line charts
│   │   │   └── projections/
│   │   │       ├── ProjectionEngine.jsx  # Projection calculator + display
│   │   │       ├── ScenarioSlider.jsx    # +/- % slider for show/close rate
│   │   │       └── ProjectionCard.jsx    # EOM/EOY projection display
│   │   ├── pages/
│   │   │   ├── client/                  # ─── CLIENT DASHBOARD PAGES ───
│   │   │   │   ├── OverviewPage.jsx     # All tiers: At a Glance scorecards + key charts
│   │   │   │   ├── FinancialPage.jsx    # Insight+: Revenue, cash, deal size, per-closer financials
│   │   │   │   ├── AttendancePage.jsx   # Insight+: Show rates, no-shows, ghosted, rescheduled
│   │   │   │   ├── CallOutcomesPage.jsx # Insight+: Close rates, funnels, deposits, DQ, lost
│   │   │   │   ├── SalesCyclePage.jsx   # Insight+: Calls/days to close, 1-call vs multi-call
│   │   │   │   ├── ObjectionsPage.jsx   # Insight+: Objections Intelligence
│   │   │   │   ├── ProjectionsPage.jsx  # Insight+: Projections, scenarios, pacing & goals
│   │   │   │   ├── ViolationsPage.jsx   # Executive: SEC/FTC violations, risk review table
│   │   │   │   └── AdherencePage.jsx    # Executive: Script adherence scores by section
│   │   │   ├── admin/                   # ─── ADMIN PAGES ───
│   │   │   │   ├── AdminDashboard.jsx   # Master view — all clients overview
│   │   │   │   ├── ClientManager.jsx    # View/edit client settings, change tiers
│   │   │   │   ├── ClientDetail.jsx     # Deep-dive into a specific client (sees their dashboard)
│   │   │   │   └── TokenManager.jsx     # Generate/revoke client access tokens
│   │   │   └── partner/                 # ─── PARTNER PAGES ───
│   │   │       └── PartnerDashboard.jsx # Partner view — assigned clients only
│   │   └── utils/
│   │       ├── api.js                   # Axios/fetch wrapper with token injection
│   │       ├── formatters.js            # Number formatting (%, $, commas)
│   │       ├── metricDefinitions.js     # Canonical metric names, labels, formats
│   │       └── tierConfig.js            # Which pages/sections are visible per tier
│   └── public/
│       └── favicon.ico
│
└── shared/                              # ─── SHARED CODE ───
    ├── tierDefinitions.js               # Tier names, pages, sections — used by both API and client
    └── metricKeys.js                    # Canonical metric key constants
```

---

## 4. AUTHENTICATION & ACCESS CONTROL

### Three Access Levels

| Level | Who | How They Authenticate | What They See |
|-------|-----|----------------------|---------------|
| **Admin** | Tyler only | API key in header (`X-Admin-Key`) | All clients, all tiers, tier switching, token management |
| **Partner** | Tyler's sellers (2 people) | Partner token in URL (`/partner/:token`) | Only their assigned clients, read-only |
| **Client** | End customers | Shared secret link (`/d/:token`) | Only their own data, limited to their tier |

### Client Access — Shared Secret Links

**Recommendation: Token-only, no PIN.** Here's why:
- These are B2B SaaS dashboards for founders/managers, not consumer banking
- The token itself IS the authentication (like a Looker embed link)
- Adding a PIN creates friction that reduces dashboard usage — and dashboard usage = retention
- The token is a long random string (UUID v4 = 36 chars), effectively unguessable
- If a token is compromised, Tyler can revoke and reissue from the admin panel

**Flow:**
```
Client gets link: https://app.closermetrix.com/d/a7f3b2c1-e4d5-4f6a-8b9c-0d1e2f3a4b5c

React Router catches /d/:token
  → Calls GET /api/auth/validate?token=:token
  → API looks up token in Clients table (or a tokens table)
  → Returns: { client_id, company_name, plan_tier, closers: [...] }
  → AuthContext stores this, all subsequent API calls include the token
  → Every API call: server resolves token → client_id → injects into BQ queries
```

### Token Storage in BigQuery

Add a new table OR add columns to the Clients table:

**Option A (recommended): New `AccessTokens` table**
```sql
CREATE TABLE `closer-automation.CloserAutomation.AccessTokens` (
  token_id STRING NOT NULL,         -- UUID, the actual token in the URL
  client_id STRING NOT NULL,        -- FK to Clients
  token_type STRING NOT NULL,       -- 'client', 'partner', 'admin'
  label STRING,                     -- Human-readable label ("Acme main dashboard link")
  partner_id STRING,                -- NULL for client tokens, partner identifier for partner tokens
  assigned_client_ids JSON,         -- For partner tokens: ["client1", "client2"]
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  expires_at TIMESTAMP,             -- NULL = never expires
  revoked_at TIMESTAMP,             -- NULL = active, set to revoke
  last_accessed_at TIMESTAMP,       -- Updated on each access
  created_by STRING                 -- 'admin' or 'system'
);
```

### Admin Authentication

Admin uses a simple API key stored as an environment variable. This is Tyler-only access.

```
All /api/admin/* routes require:
  Header: X-Admin-Key: {ADMIN_API_KEY}

The admin React UI stores this key in sessionStorage after Tyler enters it once.
The admin login page is a simple password field at /admin/login.
```

### Partner Authentication

Partners get a token that maps to a set of client_ids they're allowed to see.

```
Partner link: https://app.closermetrix.com/partner/p_xyz789
  → Token looked up in AccessTokens table where token_type = 'partner'
  → assigned_client_ids determines which clients they see
  → All API calls from partner view are scoped to those client_ids only
```

---

## 5. TIER SYSTEM

### Tier Definitions

```javascript
// shared/tierDefinitions.js

const TIERS = {
  basic: {
    label: 'Basic',
    color: '#3B82F6',        // Blue
    pages: ['overview'],
    filters: ['dateRange'],   // NO closer filter
    features: {
      closerFilter: false,
      objections: false,
      projections: false,
      violations: false,
      adherence: false,
      secViolationDetails: false,  // Shows COUNT only, not details
    }
  },
  insight: {
    label: 'Insight',
    color: '#F59E0B',        // Amber
    pages: ['overview', 'financial', 'attendance', 'callOutcomes', 'salesCycle', 'objections', 'projections'],
    filters: ['dateRange', 'closer', 'objectionType', 'granularity'],
    features: {
      closerFilter: true,
      objections: true,
      projections: true,
      violations: false,
      adherence: false,
      secViolationDetails: false,  // Still shows COUNT only — teaser for Executive
    }
  },
  executive: {
    label: 'Executive',
    color: '#EF4444',        // Red
    pages: ['overview', 'financial', 'attendance', 'callOutcomes', 'salesCycle', 'objections', 'projections', 'violations', 'adherence'],
    filters: ['dateRange', 'closer', 'objectionType', 'granularity', 'riskCategory'],
    features: {
      closerFilter: true,
      objections: true,
      projections: true,
      violations: true,
      adherence: true,
      secViolationDetails: true,  // Full details — exact phrases, timestamps, explanations
    }
  }
};
```

### Tier Enforcement — THREE Layers

1. **Frontend (cosmetic):** Sidebar hides pages not in tier. Components check `useTier()` before rendering sections. This is for UX only — not security.

2. **API middleware (`tierGate.js`):** Every API endpoint that serves tier-restricted data checks `plan_tier` from the resolved client record. If a Basic client somehow requests `/api/dashboard/objections`, the API returns `403 { error: 'Upgrade to Insight tier for objection intelligence' }`.

3. **BigQuery queries:** The query files themselves are structured so that tier-specific queries are in separate files. A Basic client's data request only runs the overview queries — the objection/compliance queries are never even executed.

### Tier Switching (Admin Only)

Tyler can change a client's tier from the admin panel. This triggers:
1. `UPDATE Clients SET plan_tier = 'insight' WHERE client_id = @clientId`
2. The next time the client refreshes their dashboard, the new tier takes effect immediately
3. No redeployment, no code change — it's a BigQuery field

```
Admin UI button: [Basic] [Insight] [Executive]
  → POST /api/admin/clients/:clientId/tier { tier: 'insight' }
  → Updates BigQuery
  → Returns new client record
```

### Upsell Teasers

**SEC Violation Count (Basic + Insight):**
The Overview page shows a scorecard: "Potential SEC Violations: 7". But clicking it shows a locked modal: "Upgrade to Executive to see violation details, exact phrases, timestamps, and risk explanations."

This is by design — it creates upgrade tension.

---

## 6. DATA LAYER — BIGQUERY INTEGRATION

### BigQuery Client Singleton

```javascript
// server/db/BigQueryClient.js

/**
 * EVERY query in this application goes through this class.
 * EVERY query MUST include client_id as a parameter.
 * This is the single enforcement point for data isolation.
 *
 * RULES:
 * 1. All queries use parameterized queries (@clientId). NEVER string interpolation.
 * 2. The runQuery method REQUIRES client_id. It throws if missing.
 * 3. Admin queries that span multiple clients use a separate method (runAdminQuery)
 *    that requires admin authentication to have been verified upstream.
 */
```

### Existing BigQuery Tables

These tables are LIVE with production data. DO NOT modify their structure.

| Table | Purpose |
|-------|---------|
| `closer-automation.CloserAutomation.Calls` | One row per call. Primary key: `call_id` (UUID). |
| `closer-automation.CloserAutomation.Closers` | One row per closer per client. Key: `closer_id`. |
| `closer-automation.CloserAutomation.Clients` | One row per client. Key: `client_id`. Contains `plan_tier`. |
| `closer-automation.CloserAutomation.Objections` | One row per objection. FK: `call_id`, `client_id`. |

### Existing BigQuery Views (Read-Only — DO NOT modify)

| View | Purpose | Grain |
|------|---------|-------|
| `v_calls_joined_flat_prefixed` | Main view: Calls + Closers + Clients, all fields prefixed | Call level |
| `v_objections_joined` | Objections + Calls + Closers + Clients, all fields prefixed | Objection level |
| `v_calls_with_objection_counts` | Calls + objection summary stats (count, resolved, unresolved) | Call level |
| `v_calls_with_objections_filterable` | Calls LEFT JOIN Objections (includes calls without objections) | Call-objection level |
| `v_funnel_calls_all_types` | Funnel data: funnel_type, stage, count | Aggregate |
| `v_close_cycle_stats_dated` | Close cycle analysis: days_to_close, calls_to_close per prospect | Prospect level |

### New Table Required

```sql
-- Access tokens for dashboard links (client, partner, admin)
CREATE TABLE `closer-automation.CloserAutomation.AccessTokens` (
  token_id STRING NOT NULL,
  client_id STRING NOT NULL,
  token_type STRING NOT NULL,       -- 'client' | 'partner' | 'admin'
  label STRING,
  partner_id STRING,
  assigned_client_ids JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  expires_at TIMESTAMP,
  revoked_at TIMESTAMP,
  last_accessed_at TIMESTAMP,
  created_by STRING
);
```

### Key Schema Notes

- `appointment_date` is a **STRING** (legacy decision). Parse it as ISO timestamp.
- `call_id` (UUID) is the true primary key, NOT `appointment_id`.
- All fields in joined views use prefixes: `calls_*`, `closers_*`, `clients_*`, `obj_*`.
- `plan_tier` in Clients table is one of: `'basic'`, `'insight'`, `'executive'`.
- `client_id` is the isolation key. EVERY query filters on it.

---

## 7. API DESIGN

### Base URL

```
Production: https://app.closermetrix.com/api
Development: http://localhost:3001/api
```

### Authentication Headers

```
Client requests:  X-Client-Token: {token_id}
Admin requests:   X-Admin-Key: {ADMIN_API_KEY}
Partner requests: X-Partner-Token: {partner_token_id}
```

### Client Dashboard Endpoints

All require `X-Client-Token`. The middleware resolves token → client_id → plan_tier.

```
GET /api/auth/validate
  → Returns: { client_id, company_name, plan_tier, closers: [{closer_id, name}] }
  → Used on initial load to set up AuthContext

GET /api/dashboard/overview?dateStart=&dateEnd=&closerId=
  → All tiers. Returns: atAGlance scorecards (booked, held, show rate, closed, close rate, revenue, cash, violations count)
  → If Basic tier: closerId param is ignored (server-side enforcement)
  → Response shape: { sections: { atAGlance: {...} }, charts: {...} }

GET /api/dashboard/financial?dateStart=&dateEnd=&closerId=
  → Insight+ only. Returns: revenue, cash, deal size, per-closer financials, revenue/cash trends
  → Basic tier → 403

GET /api/dashboard/attendance?dateStart=&dateEnd=&closerId=
  → Insight+ only. Returns: volume, show rates, no-shows, ghosted, rescheduled, canceled
  → Basic tier → 403

GET /api/dashboard/call-outcomes?dateStart=&dateEnd=&closerId=
  → Insight+ only. Returns: close rates (total/first/followup), funnels, deposits, DQ, lost
  → Basic tier → 403

GET /api/dashboard/sales-cycle?dateStart=&dateEnd=&closerId=
  → Insight+ only. Returns: calls to close, days to close, 1-call vs multi-call breakdowns
  → Basic tier → 403

GET /api/dashboard/objections?dateStart=&dateEnd=&closerId=&objectionType=
  → Insight+ only. Returns: objection stats, resolution rates, drill-down data

GET /api/dashboard/projections?dateStart=&dateEnd=
  → Insight+ only. Returns: baseline metrics + EOM/EOY projections + pacing/goals

GET /api/dashboard/violations?dateStart=&dateEnd=&closerId=&riskCategory=
  → Executive only. Returns: SEC/FTC risk flags, violation trends, risk review table

GET /api/dashboard/adherence?dateStart=&dateEnd=&closerId=
  → Executive only. Returns: script adherence scores by section, radar chart data
```

### Admin Endpoints

All require `X-Admin-Key`.

```
GET    /api/admin/clients                    → List all clients (summary: name, tier, closer_count, status)
GET    /api/admin/clients/:clientId         → Full client record
PUT    /api/admin/clients/:clientId         → Update client fields
POST   /api/admin/clients/:clientId/tier    → Change tier { tier: 'insight' }
GET    /api/admin/clients/:clientId/dashboard/:section → View any client's dashboard as admin
POST   /api/admin/tokens                    → Generate client/partner access token
DELETE /api/admin/tokens/:tokenId           → Revoke a token
GET    /api/admin/tokens                    → List all active tokens
GET    /api/admin/overview                  → Cross-client summary (MRR, total clients, etc.)
```

### Partner Endpoints

All require `X-Partner-Token`.

```
GET /api/partner/clients              → List only assigned clients
GET /api/partner/clients/:clientId/dashboard/:section → View assigned client's dashboard
```

### API Response Shape

Every dashboard endpoint returns the same envelope:

```javascript
{
  success: true,
  data: {
    sections: {
      atAGlance: {
        prospectsBooked: { value: 142, label: 'Prospects Booked', format: 'number' },
        showRate: { value: 0.73, label: 'Show Rate', format: 'percent' },
        // ... more metrics
      },
      volume: { ... },
      attendance: { ... },
      // ... more sections
    },
    charts: {
      showRateOverTime: {
        type: 'line',
        data: [{ date: '2026-01-06', value: 0.71 }, ...],
        label: 'Show Rate Over Time'
      },
      // ... more chart data
    },
    tables: {
      followUps: {
        columns: [...],
        rows: [...]
      }
    }
  },
  meta: {
    client_id: 'xxx',
    tier: 'insight',
    dateRange: { start: '2026-01-01', end: '2026-02-17' },
    filters: { closerId: null }
  }
}
```

---

## 8. DASHBOARD PAGES & METRICS REFERENCE

### Page: Overview (ALL TIERS)

**Route:** `/d/:token` or `/d/:token/overview`
**API:** `GET /api/dashboard/overview`
**Filters:** Date range only (Basic), Date range + Closer (Insight+)

This is the summary/at-a-glance page. The detailed breakdowns live on their own pages (Financial, Attendance, etc.) for Insight+ tiers.

#### Section: At a Glance (Top Scorecard Row)
| Metric | Format | Query Source |
|--------|--------|-------------|
| Unique Prospects Scheduled | number | COUNT DISTINCT where call_type = 'First Call' |
| Unique Appointments Held | number | COUNT DISTINCT where call_type = 'First Call' AND attendance = 'Show' |
| Show Rate | percent | Held / Scheduled |
| Closed Deals | number | COUNT where call_outcome = 'Closed - Won' |
| Revenue Generated | currency | SUM(revenue_generated) |
| Cash Collected | currency | SUM(cash_collected) |
| % Collected | percent | Cash / Revenue |
| Revenue per Call Held | currency | Revenue / Calls Held |
| Cash per Call Held | currency | Cash / Calls Held |
| Scheduled>Close Rate | percent | Closed / Scheduled |
| Show>Close Rate | percent | Closed / Held |
| Potential Violations | number | COUNT compliance flags (count ALL tiers, details Executive only) |
| Calls Lost | number | COUNT where call_outcome = 'Lost' |
| Lost % | percent | Lost / Held |
| Active Follow Up | number | COUNT active follow-ups pending |
| 1 Call Close % | percent | 1-call closes / total closes |
| Calls Required per Deal | number (decimal) | Total calls / Closed deals |

#### Charts:
- Line: Total Cash & Revenue (over time) — dual line with gradient fills
- Line: Cash & Revenue Per Call (over time)
- Line: Show Rate & Close Rate (over time)
- Bar: Cash & Revenue Per Call by Closer (Insight+ only)
- Bar: Cash Collected & Revenue Generated by Closer (Insight+ only)
- Bar: Average Deal Size by Closer (Insight+ only)
- Pie: % of Revenue by Closer (Insight+ only)
- Funnel: All Calls (Booked → Held → Qualified → Closed)
- Pie: Call Outcomes breakdown

---

### Page: Financial (INSIGHT+ ONLY)

**Route:** `/d/:token/financial`
**API:** `GET /api/dashboard/financial`
**Filters:** Date range + Closer + Granularity

#### Scorecards:
| Metric | Format |
|--------|--------|
| Revenue Generated | currency |
| Cash Collected | currency |
| Cash per Call Held | currency |
| Average Deal Size | currency |
| Revenue per Call Held | currency |
| % Collected (Cash/Revenue) | percent |
| Deposit Rate | percent |

#### Charts:
- Line: Total Cash & Revenue (over time) — granularity toggle
- Line: Cash & Revenue Per Call Held (over time)
- Bar: Cash Collected & Revenue Generated by Closer — horizontal, ranked
- Bar: Cash & Revenue Per Call by Closer
- Bar: Average Deal Size by Closer
- Pie: % of Revenue by Closer

---

### Page: Attendance (INSIGHT+ ONLY)

**Route:** `/d/:token/attendance`
**API:** `GET /api/dashboard/attendance`
**Filters:** Date range + Closer + Granularity

#### Volume Scorecards:
| Metric | Format |
|--------|--------|
| Unique Prospects Scheduled | number |
| Unique Appointments Held | number |
| Total Calls Scheduled | number |
| Total Calls Held | number |
| First Calls Scheduled | number |
| First Calls Held | number |
| Follow-Ups Scheduled | number |
| Follow-Up Calls Held | number |
| Active Follow Up | number |
| Not Yet Taken | number |

#### Show Rate Scorecards:
| Metric | Format |
|--------|--------|
| Unique Show Rate | percent |
| Total Show Rate | percent |
| First Call Show Rate | percent |
| Follow-Up Show Rate | percent |

#### No-Show Breakdown:
| Metric | Format |
|--------|--------|
| # Ghosted | number |
| % Ghosted (of no-shows) | percent |
| # Rescheduled | number |
| % Rescheduled (of no-shows) | percent |
| # Canceled | number |
| % Canceled (of no-shows) | percent |
| Lost Potential Revenue | currency |

#### Charts:
- Line: Scheduled vs Show (over time) — dual line
- Pie/Donut: Attendance Breakdown (Show, Ghost, Reschedule, Cancel)
- Line: First Call / Follow-Up Show Rate (over time)
- Line: First Calls / Follow-Ups Held (over time)
- Pie: Not Taken Reason breakdown
- Line: Not Taken Breakdown (over time)
- Bar: Attendance per Closer
- Bar: Show Rate per Closer — horizontal, ranked

---

### Page: Call Outcomes (INSIGHT+ ONLY)

**Route:** `/d/:token/call-outcomes`
**API:** `GET /api/dashboard/call-outcomes`
**Filters:** Date range + Closer + Granularity

#### Volume Scorecards:
| Metric | Format |
|--------|--------|
| Total Calls Scheduled | number |
| Total Calls Held | number |
| First Calls Scheduled | number |
| First Calls Held | number |
| Follow-Ups Scheduled | number |
| Follow-Ups Held | number |

#### Conversion Rate Scorecards:
| Metric | Format |
|--------|--------|
| Total Scheduled>Closed | percent |
| Total Held>Closed | percent |
| Total Qualified>Closed | percent |
| First Call Scheduled>Closed | percent |
| First Call Held>Closed | percent |
| First Call Qualified>Closed | percent |
| Follow-Up Scheduled>Closed | percent |
| Follow-Up Held>Closed | percent |
| Follow-Up Qualified>Closed | percent |

#### Other Scorecards:
| Metric | Format |
|--------|--------|
| First Calls Closed | number |
| Follow-Up Calls Closed | number |
| Total Calls Closed | number |
| # Deposits Taken | number |
| Deposit>Closed % | percent |
| Lost % | percent |
| Calls Lost | number |
| % Disqualified | percent |
| # Disqualified | number |

#### Charts:
- Funnel: First Calls (Booked → Held → Qualified → Closed)
- Funnel: All Calls (Booked → Held → Qualified → Closed)
- Pie: Call Outcomes breakdown (Closed / Follow-up / Lost / DQ)
- Line: Number of Deals Closed (over time)
- Pie/Bar: Lost Reasons breakdown
- Line: Total and First Call Close Rate (over time)
- Stacked Bar: Deals per Closer (by product/outcome)
- Bar: Close Rate per Closer — horizontal, ranked

---

### Page: Sales Cycle (INSIGHT+ ONLY)

**Route:** `/d/:token/sales-cycle`
**API:** `GET /api/dashboard/sales-cycle`
**Filters:** Date range + Closer
**Primary data source:** `v_close_cycle_stats_dated`

#### Scorecards:
| Metric | Format | Query Source |
|--------|--------|-------------|
| Avg Calls to Close | number (decimal) | AVG(calls_to_close) |
| Median Calls to Close | number (decimal) | APPROX_QUANTILES |
| Avg Days to Close | number (decimal) | AVG(days_to_close) |
| Median Days to Close | number (decimal) | APPROX_QUANTILES |
| 1-Call Closes (#) | number | COUNT where calls_to_close = 1 |
| 1-Call Close % | percent | 1-call / total closed |
| 2-Call Closes (#) | number | COUNT where calls_to_close = 2 |
| 2-Call Close % | percent | |
| 3+ Call Closes (#) | number | COUNT where calls_to_close >= 3 |
| 3+ Call Close % | percent | |

#### Charts:
- Pie/Bar: % of 1, 2, 3+ Call Closes
- Bar: Number of Calls to Close distribution (1-Call, 2-Call, 3+)
- Bar: Number of Days to Close distribution (Same Day, 4-7, 8-14, 15-30, 30+)
- Bar: Number of Calls to Close per Closer
- Bar: Days to Close per Closer

---

### Page: Objections Intelligence (INSIGHT+ ONLY)

**Route:** `/d/:token/objections`
**API:** `GET /api/dashboard/objections`
**Filters:** Date range + Closer + Objection Type (multi-select) + Granularity (Daily/Weekly/Monthly)

**Primary data sources:**
- `v_objections_joined` — objection-level drill-downs
- `v_calls_with_objection_counts` — call-level objection stats
- `v_calls_with_objections_filterable` — for "% of calls with objections" metric

#### Scorecards (9 total):
| Metric | Format | Notes |
|--------|--------|-------|
| Calls Held | number | Total calls held in period |
| Objections Faced | number | COUNT(obj_objection_id) |
| % of Calls with Objections | percent | Requires blended data: COUNT(DISTINCT obj_call_id) / COUNT(DISTINCT calls_call_id) where attendance='Show' |
| Average Objections per Call | number (decimal) | Objections Faced / Calls with Objections |
| Resolved Objections | number | COUNT where obj_resolved = TRUE |
| Resolution Rate | percent | Resolved / Total Objections |
| Objectionless Closes | number | Closed deals with 0 objections |
| Closed Calls with Objections | number | COUNT(DISTINCT call_id) where has_objections AND call_outcome = 'Closed - Won' |
| Calls Lost to Objections | number | COUNT(DISTINCT call_id) where has_objections AND call_outcome = 'Lost' |

#### Tables:
- **Objection Type Summary:** Type, Total, Resolved, Resolution Rate
- **Closer Summary:** Closer Name, Total Objections, Resolved, Resolution Rate
- **Detail Drill-Down:** Objection Type, Resolved (Yes/No), Closer, Call Outcome, Date, Recording Link (with timestamp), Transcript Link

#### Charts:
- Horizontal Stacked Bar: Resolved vs Unresolved by Objection Type
- Line: Top 3 objections over time (Financial, Think About It, Spouse/Partner) — use granularity toggle
- Donut: Unresolved Objections by Type

#### Duration & Quality Sub-Section:
| Metric | Format |
|--------|--------|
| Avg Call Duration | minutes |
| Duration by Outcome | minutes grouped |
| Duration by Call Type | minutes grouped |
| Prospect Quality Score (avg) | score (1-10) |
| Rep Overall Score | score (1-10) |
| Discovery Score | score (1-10) |
| Pitch Score | score (1-10) |
| Close Attempt Score | score (1-10) |
| Objection Handling Score | score (1-10) |

---

### Page: Projections (INSIGHT+ ONLY)

**Route:** `/d/:token/projections`
**API:** `GET /api/dashboard/projections`
**See Section 16 for detailed projections engine spec.**

---

### Page: Adherence (EXECUTIVE ONLY)

**Route:** `/d/:token/adherence`
**API:** `GET /api/dashboard/adherence`
**Filters:** Date range + Closer

#### Scorecards:
| Metric | Format |
|--------|--------|
| Script Adherence Score (Overall) | score (1-10) |
| Adherence by Section: Intro & Rapport | score |
| Adherence by Section: Current Situation / Pain | score |
| Adherence by Section: Discovery | score |
| Adherence by Section: Desired Situation / Goal | score |
| Adherence by Section: Transition | score |
| Adherence by Section: Pitch | score |
| Adherence by Section: Close | score |
| Adherence by Section: Objections | score |
| Objection Handling Quality Score | score |

#### Charts:
- Radar: Script Adherence by Section (one of the coolest charts — looks incredible in Tron theme)
- Bar: Adherence Score per Closer — horizontal, ranked
- Bar: Objection Handling Score per Closer
- Line: Script Adherence Over Time

---

### Page: Violations (EXECUTIVE ONLY)

**Route:** `/d/:token/violations`
**API:** `GET /api/dashboard/violations`
**Filters:** Date range + Closer + Risk Category

#### Overview Scorecards:
| Metric | Format |
|--------|--------|
| Compliance Risk Flag Count (total) | number |
| # of Unique Calls Contributing to Risk | number |
| % of Held Calls with Risk Flags | percent |
| Risk Trend | label (Increasing / Stable / Decreasing) |
| FTC / SEC Warning Count | number |

#### Risk Categories Breakdown:
- Claims
- Guarantees
- Earnings / Income
- Pressure / Urgency

#### Risk by Call Type:
- Infractions on First Calls (%)
- Infractions on Follow-Up Calls (%)

#### Risk Review Table (CRITICAL — this is the money feature):
| Column | Description |
|--------|-------------|
| Call Date | appointment_date |
| Closer | closer name |
| Call Type | First / Follow-Up |
| Risk Category | Claims / Guarantees / Earnings / Pressure |
| Timestamp | minute:second in the call |
| Exact Phrase Used | The actual words flagged |
| Why This Is Flagged | Plain English explanation |
| Link to Recording | clickable, opens at timestamp |
| Link to Transcript | clickable |

#### Charts:
- Line: Compliance Issues Over Time
- Bar: Flags by Closer
- Line: Script / Claim Risk Trends

#### Risk Concentration Insights:
- Risk Count by Script Section (Intro, Pain, Goal, Pitch, Close, Objections)
- Repeated risk phrases (aggregated)
- Risk density per 100 calls

---

## 9. COMPONENT ARCHITECTURE

### Core Component Patterns

Every component follows these patterns:

```javascript
/**
 * COMPONENT PATTERN:
 *
 * 1. Data fetching via custom hooks (useMetrics, useFilters)
 * 2. Loading/Error/Empty states via ChartWrapper
 * 3. Tier checks via useTier() — hide sections client shouldn't see
 * 4. All styling via MUI theme (tronTheme.js) — no inline styles
 * 5. Responsive: scorecards reflow, charts resize
 */
```

### Scorecard Component

```jsx
// components/scorecards/Scorecard.jsx
/**
 * Single metric display card.
 *
 * Props:
 *   label: string      — "Show Rate"
 *   value: number       — 0.73
 *   format: string      — 'percent' | 'currency' | 'number' | 'score'
 *   delta: number|null  — Week-over-week change (optional)
 *   deltaLabel: string  — "vs last week" (optional)
 *   glowColor: string   — Neon accent color for the card border glow
 *   size: string        — 'sm' | 'md' | 'lg'
 *   locked: boolean     — If true, shows lock icon + "Upgrade" tooltip (for tier teasers)
 *
 * Visual:
 *   Dark card with subtle border glow (cyan/magenta/amber based on metric type).
 *   Large number in the center, label above, delta arrow below.
 *   Green up-arrow for positive deltas, red down-arrow for negative.
 *   Hover: border glow intensifies slightly.
 */
```

### Chart Wrapper

```jsx
// components/charts/ChartWrapper.jsx
/**
 * Wraps every chart with consistent loading/error/empty states.
 *
 * Props:
 *   loading: boolean
 *   error: Error|null
 *   isEmpty: boolean
 *   title: string
 *   subtitle: string (optional)
 *   children: React.ReactNode (the actual chart)
 *
 * States:
 *   Loading: Skeleton pulse animation (dark gray rectangles)
 *   Error: Red-tinted card with error message + retry button
 *   Empty: "No data for selected period" with icon
 *   Success: Renders children
 */
```

### Page Layout Pattern

```jsx
// Every page follows this structure:
const OverviewPage = () => {
  const { tier } = useTier();
  const { dateRange, closerId } = useFilters();
  const { data, isLoading, error } = useMetrics('overview', { dateRange, closerId });

  return (
    <PageContainer>
      {/* Section: At a Glance */}
      <SectionHeader title="At a Glance" />
      <ScorecardRow metrics={data?.sections?.atAGlance} />

      {/* Section: Volume / Activity */}
      <SectionHeader title="Volume / Activity" />
      <ScorecardGrid metrics={data?.sections?.volume} />
      <ChartWrapper loading={isLoading} error={error}>
        <TronLineChart data={data?.charts?.callsBookedVsHeld} />
      </ChartWrapper>

      {/* Section: Revenue — show "per closer" chart only for Insight+ */}
      <SectionHeader title="Revenue Reality" />
      <ScorecardGrid metrics={data?.sections?.revenue} />
      {tier !== 'basic' && (
        <TronBarChart data={data?.charts?.revenuePerCloser} />
      )}

      {/* SEC Violations teaser */}
      <Scorecard
        label="Potential SEC Violations"
        value={data?.sections?.atAGlance?.secViolations?.value}
        locked={tier !== 'executive'}
        onLockedClick={() => showUpgradeModal('executive')}
      />
    </PageContainer>
  );
};
```

---

## 10. DESIGN SYSTEM — TRON THEME

### Color Palette

Source of truth: `client/src/theme/constants.js`

```javascript
neon: {
  cyan:    '#4DD4E8',   // Primary accent — borders, active states, key metrics
  magenta: '#ff00e5',   // Secondary accent — alerts, negative deltas
  amber:   '#FFD93D',   // Tertiary — warnings, Insight tier badge, deposits
  green:   '#6BCF7F',   // Success — positive deltas, closed deals
  red:     '#FF4D6D',   // Danger — negative deltas, risk flags, lost calls
  blue:    '#4D7CFF',   // Info — Basic tier, not pitched
  purple:  '#B84DFF',   // Special — follow-ups, projections
  teal:    '#06b6d4',   // Cash-related metrics
}

text.muted: '#64748b'   // Gray — disqualified, timestamps, less important info
```

### Per-Page Color Assignments

**Call Outcomes page** — each outcome category has a consistent color everywhere it appears (scorecards, chart series, pie slices, per-closer bars):

| Category     | Color Name | Hex       | Used For |
|-------------|-----------|-----------|----------|
| Closed      | `green`   | `#6BCF7F` | Health column, Closed-Won section, first call series |
| Deposits    | `amber`   | `#FFD93D` | Health column, Deposits section |
| Follow-Up   | `purple`  | `#B84DFF` | Health column, Follow-Up section, follow-up close series |
| Lost        | `red`     | `#FF4D6D` | Health column, Lost section |
| Disqualified| `muted`   | `#64748b` | Health column, DQ section (gray, not cyan) |
| Not Pitched | `blue`    | `#4D7CFF` | Health column, Not Pitched section |

**Backend color usage:** Chart series use friendly names (`'green'`, `'purple'`, `'muted'`, etc.) resolved via `COLOR_MAP` in `client/src/utils/colors.js`. Pie chart data uses `NEON.*` constants defined at the top of `callOutcomes.js` (mirrors the frontend theme). Never use hardcoded hex in chart series — always use the color name or NEON constant.

### Other Theme Values

```javascript
bg: {
  primary:   '#0a0e17',   // Near-black with blue undertone — main background
  secondary: '#111827',   // Slightly lighter — card backgrounds
  tertiary:  '#1a2332',   // Panel/sidebar backgrounds
  elevated:  '#1e293b',   // Hover states, elevated cards
}

text: {
  primary:   '#f1f5f9',   // White-ish — headings, large numbers
  secondary: '#94a3b8',   // Gray — labels, descriptions
  muted:     '#64748b',   // Dim — timestamps, DQ color
  inverse:   '#0a0e17',   // Dark text on light backgrounds
}

border: {
  subtle:  '#1e293b',
  default: '#334155',
  glow:    'rgba(77, 212, 232, 0.3)',   // Cyan glow
}
```

### MUI Theme Configuration

```javascript
// client/src/theme/tronTheme.js

import { createTheme } from '@mui/material/styles';
import { COLORS } from './constants';

export const tronTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: COLORS.neon.cyan },
    secondary: { main: COLORS.neon.magenta },
    warning: { main: COLORS.neon.amber },
    success: { main: COLORS.neon.green },
    error: { main: COLORS.neon.red },
    background: {
      default: COLORS.bg.primary,
      paper: COLORS.bg.secondary,
    },
    text: {
      primary: COLORS.text.primary,
      secondary: COLORS.text.secondary,
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", sans-serif',
    // Scorecard large number
    h2: { fontSize: '2.5rem', fontWeight: 700, letterSpacing: '-0.02em' },
    // Section header
    h5: { fontSize: '1.25rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' },
    // Scorecard label
    caption: { fontSize: '0.75rem', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: COLORS.text.secondary },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: COLORS.bg.secondary,
          border: `1px solid ${COLORS.border.subtle}`,
          borderRadius: 12,
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
          '&:hover': {
            borderColor: COLORS.border.glow,
            boxShadow: `0 0 20px ${COLORS.border.glow}`,
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' }, // Remove MUI's default gradient overlay
      },
    },
  },
});
```

### Scorecard Glow Effect

```css
/* The signature Tron look — neon border glow on cards */
.scorecard {
  border: 1px solid rgba(0, 240, 255, 0.2);
  box-shadow: 0 0 15px rgba(0, 240, 255, 0.1), inset 0 0 15px rgba(0, 240, 255, 0.05);
  transition: all 0.3s ease;
}
.scorecard:hover {
  border-color: rgba(0, 240, 255, 0.5);
  box-shadow: 0 0 30px rgba(0, 240, 255, 0.2), inset 0 0 20px rgba(0, 240, 255, 0.08);
}
/* Different glow colors for different metric types */
.scorecard--positive { border-color: rgba(0, 255, 136, 0.3); }
.scorecard--negative { border-color: rgba(255, 51, 102, 0.3); }
.scorecard--warning  { border-color: rgba(255, 184, 0, 0.3); }
.scorecard--locked   { border-color: rgba(100, 116, 139, 0.3); filter: blur(0.5px); }
```

### Design Principles

1. **Dark first.** The entire UI is dark. No white backgrounds anywhere. Cards are slightly lighter than the background to create depth.
2. **Glow, don't shade.** Instead of drop shadows, use subtle neon glow effects on borders. This is what makes it feel "Tron."
3. **Gradients under lines.** Every line chart has a gradient fill from the line color to transparent. This is the signature look.
4. **Sparse neon.** Don't overdo the neon. Use it for accents: borders, active states, important numbers. The bulk of the UI should be muted dark tones.
5. **Grid precision.** Clean, mathematical grid layouts. Scorecards in even rows. Charts in consistent widths. Whitespace is intentional.
6. **Typography hierarchy.** Big bold numbers for metrics. Uppercase small-caps for labels. Muted gray for secondary info. Inter font for everything.

---

## 11. CHARTS & VISUALIZATIONS

### MUI X Charts — Configuration

Install: `npm install @mui/x-charts`

All charts use the MUI X Charts library with custom Tron theming.

### Line Chart with Gradient Fill

```jsx
// components/charts/TronLineChart.jsx
import { LineChart } from '@mui/x-charts/LineChart';
import { COLORS } from '../../theme/constants';

/**
 * Line chart with gradient area fill — the signature CloserMetrix look.
 *
 * MUI X Charts supports area fills via the `area` prop on series.
 * We customize the gradient using SVG defs.
 *
 * Props:
 *   data: Array<{ date: string, values: { [seriesKey]: number } }>
 *   series: Array<{ key: string, label: string, color: string }>
 *   xAxisLabel: string
 *   yAxisFormat: 'percent' | 'currency' | 'number'
 *   height: number (default 350)
 *   showArea: boolean (default true) — gradient fill under lines
 */
```

### Key Chart Types Needed

| Chart Type | MUI X Component | Used On |
|------------|----------------|---------|
| Line (with gradient fill) | `<LineChart>` with `area: true` | Trends, WoW, revenue over time |
| Bar (vertical) | `<BarChart>` | Calls by type, revenue per closer |
| Bar (horizontal, ranked) | `<BarChart>` with `layout="horizontal"` | Leaderboards, close rate by closer |
| Stacked Bar | `<BarChart>` with `stack="total"` | Resolved vs unresolved objections |
| Pie / Donut | `<PieChart>` | Attendance breakdown, outcome breakdown |
| Funnel | Custom component (MUI X doesn't have native funnel) | Booked → Held → Closed |
| Radar | Custom component (use SVG or recharts fallback) | Script adherence by section |

### Funnel Chart (Custom)

MUI X Charts does not include a funnel chart. Build a custom one:

```jsx
// components/charts/TronFunnelChart.jsx
/**
 * Custom funnel visualization for Booked → Held → Closed pipeline.
 * Uses SVG trapezoids with Tron-style gradient fills and glow borders.
 *
 * Data comes from v_funnel_calls_all_types view:
 *   { funnel_type: string, stage: string, count: number }
 *
 * Visual: Stacked horizontal bars that narrow from top to bottom.
 * Each stage shows: count, percentage of total, and drop-off from previous stage.
 * Glow effect on each bar matching the chart palette.
 */
```

### Radar Chart (Custom for Script Adherence)

```jsx
// components/charts/TronRadarChart.jsx
/**
 * Radar/spider chart for script adherence scores by section.
 * This is an Executive-only chart — one of the most visually striking.
 *
 * Uses SVG polygon paths with neon stroke and gradient fill.
 * Shows: Intro, Pain, Discovery, Goal, Transition, Pitch, Close, Objections
 * Each axis goes from 0-10 (the scoring scale).
 *
 * Can overlay multiple closers for comparison.
 *
 * Consider using recharts' RadarChart as a fallback if custom SVG is too complex:
 *   import { RadarChart, PolarGrid, PolarAngleAxis, Radar } from 'recharts';
 */
```

### Chart Theme Defaults

```javascript
// client/src/theme/chartTheme.js

export const CHART_DEFAULTS = {
  height: 350,
  margin: { top: 20, right: 20, bottom: 40, left: 60 },
  grid: {
    horizontal: true,
    vertical: false,
    stroke: 'rgba(255, 255, 255, 0.06)',  // Very subtle gridlines
  },
  axis: {
    tickLabelStyle: { fill: '#94a3b8', fontSize: 12 },
    lineStyle: { stroke: '#334155' },
  },
  tooltip: {
    backgroundColor: '#1e293b',
    borderColor: '#00f0ff',
    textColor: '#f1f5f9',
  },
  // Default series colors cycle through the chart palette
  colors: COLORS.chart,
};
```

---

## 12. FILTERS & INTERACTIVITY

### Filter Architecture

Filters live in `FilterContext` and are shared across all pages. When a filter changes, all visible charts and scorecards refetch.

```javascript
// client/src/context/FilterContext.jsx
/**
 * Global filter state. All dashboard pages consume this.
 *
 * State:
 *   dateRange: { start: Date, end: Date }  — defaults to last 30 days
 *   closerId: string | null                 — null = all closers (Basic tier always null)
 *   objectionType: string[] | null          — multi-select, null = all types
 *   granularity: 'daily' | 'weekly' | 'monthly'  — for time-series charts
 *   riskCategory: string | null             — Executive only
 *
 * Every filter change triggers a re-query via TanStack Query.
 * The API endpoint receives these as query params.
 */
```

### Date Range Filter

```jsx
// components/filters/DateRangeFilter.jsx
/**
 * MUI DateRangePicker with preset buttons:
 *   [Last 7 days] [Last 30 days] [This Month] [Last Month] [This Quarter] [Custom]
 *
 * Visual: Dark input fields with cyan focus ring.
 * Preset buttons are chips with glow effect on active.
 */
```

### Closer Filter (Insight+ Only)

```jsx
// components/filters/CloserFilter.jsx
/**
 * Multi-select dropdown of closers for this client.
 * Populated from the initial auth/validate response (closers list).
 *
 * CRITICAL: This filter is HIDDEN for Basic tier clients.
 * The Sidebar component and TopBar check useTier() and don't render it.
 * The API also ignores closerId param for Basic tier clients (server enforcement).
 *
 * Visual: MUI Select with chips for selected closers. Cyan accent.
 */
```

### Granularity Toggle

```jsx
// components/filters/GranularityToggle.jsx
/**
 * [Daily] [Weekly] [Monthly] toggle for time-series charts.
 * Controls how data points are bucketed on the X axis.
 *
 * Only affects line charts and some bar charts.
 * Visual: Three buttons in a ButtonGroup with neon cyan active state.
 */
```

---

## 13. ADMIN MASTER VIEW

### Route: `/admin/*`
**Auth:** Admin API key (entered once, stored in sessionStorage)

### Admin Dashboard (`/admin`)

The master view where Tyler sees all clients at a glance.

```
┌─────────────────────────────────────────────────────────────┐
│ CloserMetrix Admin                              [Tyler] [⚙] │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  MRR: $X,XXX    Active Clients: X    Total Closers: XX      │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ CLIENT LIST                          [+ New Client]   │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │ Company Name   │ Tier      │ Closers │ Status │ View │   │
│  │ Acme Coaching  │ [Insight] │ 5       │ Active │  →   │   │
│  │ Alpha Sales    │ [Basic]   │ 3       │ Active │  →   │   │
│  │ Beta Corp      │ [Exec]    │ 8       │ Active │  →   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  TIER QUICK SWITCH:                                          │
│  Click [Insight] badge next to any client → dropdown:        │
│  [Basic] [Insight] [Executive]                               │
│  → Instant tier change, no page reload                       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Client Detail (`/admin/clients/:clientId`)

When Tyler clicks "→" on a client, he sees THAT CLIENT'S FULL DASHBOARD — as if he were the client, but with an admin toolbar at the top.

```
┌─────────────────────────────────────────────────────────────┐
│ [← Back] Viewing: Acme Coaching  Tier: [Insight ▼]          │
│ Admin toolbar: [Generate Link] [Revoke Links] [Edit Client] │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  (The full client dashboard renders here, same as the        │
│   client would see, but Tyler can see ALL tiers by toggling  │
│   the Tier dropdown — it's not restricted for admin)         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Token Manager (`/admin/tokens`)

```
Generate new access link:
  Client: [Dropdown: Select client]
  Type: [Client] [Partner]
  Label: [Text input: "Acme main dashboard"]
  [Generate] → Shows link with copy button

Active tokens table:
  Token | Client | Type | Label | Created | Last Accessed | [Revoke]
```

---

## 14. PARTNER VIEW

### Route: `/partner/:token`
**Auth:** Partner token → resolves to assigned client_ids

Partners see a simplified version of the admin view — only their assigned clients.

```
┌─────────────────────────────────────────────────────────────┐
│ CloserMetrix Partner Portal                   [Partner Name] │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  YOUR CLIENTS                                                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Company Name   │ Tier      │ Closers │ Status │ View │   │
│  │ Acme Coaching  │ Insight   │ 5       │ Active │  →   │   │
│  │ Alpha Sales    │ Basic     │ 3       │ Active │  →   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  (Partners can VIEW client dashboards but CANNOT change      │
│   tiers, generate tokens, or edit client settings)           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Key constraints:**
- Partners can ONLY see clients in their `assigned_client_ids` list
- Partners CANNOT change tiers, revoke tokens, or edit client settings
- Partners see the client dashboard scoped to the client's actual tier (not all tiers)
- The API enforces this: partner token → allowed client_ids → query filter

---

## 15. CLIENT VIEW

### Route: `/d/:token`
**Auth:** Client token → resolves to single client_id + plan_tier

This is what the end customer sees. Clean, focused, no admin controls.

```
┌─────────────────────────────────────────────────────────────┐
│ CloserMetrix              Acme Coaching          [Insight]   │
├────────┬────────────────────────────────────────────────────┤
│        │                                                     │
│ NAV    │  CONTENT AREA                                       │
│        │                                                     │
│ Overview  │  (Dashboard page renders here)                   │
│ Financial │                                                  │
│ Attendance│  Scorecards, charts, tables...                   │
│ Outcomes  │                                                  │
│ Sales Cyc │                                                  │
│ Objections│                                                  │
│ Project'ns│                                                  │
│        │                                                     │
│        │  [Date: Last 30 days ▼] [Closer: All ▼]           │
│        │                                                     │
└────────┴────────────────────────────────────────────────────┘
```

**Sidebar navigation shows ONLY the pages for this client's tier:**
- Basic: Overview only (single page)
- Insight: Overview, Financial, Attendance, Call Outcomes, Sales Cycle, Objections, Projections
- Executive: All Insight pages + Violations, Adherence

**The client CANNOT:**
- See any other client's data (token isolates them)
- Access admin routes (middleware blocks)
- Change their tier (no UI for it)
- See pages above their tier (sidebar + API both enforce)

---

## 16. PROJECTIONS ENGINE

### Overview

The Projections page shows EOM and EOY estimates based on current performance, plus interactive "what if" scenarios with 4 adjustment sliders. **This is directly ported from the existing `projections/index.html` app** — see Section 22 for the full reference.

### Baseline Data (API Response Shape)

The API endpoint `GET /api/dashboard/projections` must return this shape (matches the existing projections API):

```javascript
{
  // Rates from the selected date range
  showRate: 0.73,                    // Shows / Booked
  closeRate: 0.22,                   // Closed / Shows
  avgDealSize: 5000,                 // AVG revenue per closed deal
  avgCashCollected: 3000,            // AVG cash per closed deal
  prospectsBookedPerMonth: 48,       // AVG new prospects per month
  avgCallsToClose: 2.3,             // From v_close_cycle_stats_dated

  // Period metrics (from selected date range)
  callsScheduled: 142,
  currentCallsHeld: 104,
  currentCloses: 23,
  currentRevenue: 115000,
  currentCash: 69000,
  daysInPeriod: 90,                  // How many days in the selected range

  // Calendar context
  daysInCurrentMonth: 28,
  dayOfMonth: 17,
  daysInYear: 365,
  dayOfYear: 48,

  // MTD actuals
  mtdCallsScheduled: 38,
  mtdCallsHeld: 28,
  mtdCloses: 6,
  mtdRevenue: 30000,
  mtdCash: 18000,

  // YTD actuals
  ytdCallsScheduled: 280,
  ytdCallsHeld: 204,
  ytdCloses: 45,
  ytdRevenue: 225000,
  ytdCash: 135000,

  // Metadata
  dateRange: "Nov 19, 2025 – Feb 17, 2026",
  closers: [{ id: "closer_abc", name: "Sarah" }, ...]
}
```

### Four Scenario Sliders

```jsx
// components/projections/ScenarioSlider.jsx
/**
 * Interactive slider that adjusts a metric by +/- from baseline.
 * Zero-centered design: positive fills right in accent color, negative fills left in red.
 * Thumb has neon glow shadow (Tron upgrade from existing projections app).
 *
 * Four sliders on the Projections page:
 *   1. Show Rate:     ±15%, step 0.5, color: neon green
 *   2. Close Rate:    ±15%, step 0.5, color: neon cyan
 *   3. Avg Deal Size: ±$5,000, step $100, color: neon amber
 *   4. Prospects/Mo:  ±500, step 10, color: neon purple
 *
 * Props:
 *   label: string
 *   value: number (the adjustment, not absolute)
 *   onChange: (newValue) => void
 *   range: number (symmetric range, e.g., 15 means -15 to +15)
 *   step: number
 *   unit: string ("%" or "" for formatted values)
 *   color: string (neon accent)
 *   formatVal: (value) => string (custom display formatter)
 */
```

### Projection Calculation (Port from existing code)

```javascript
/**
 * Core projection math — port directly from projections/index.html lines 217-292.
 *
 * Uses ratio-based adjustments:
 *   pR = adjustedProspects / baseline.prospectsBookedPerMonth
 *   sR = adjustedShowRate / baseline.showRate
 *   cR = adjustedCloseRate / baseline.closeRate
 *   dR = adjustedDealSize / baseline.avgDealSize
 *   caR = adjustedCashPer / baseline.avgCashCollected
 *
 * Applies ratios cumulatively:
 *   Scheduled = dailyRate * days * pR
 *   Held      = dailyRate * days * pR * sR
 *   Closes    = dailyRate * days * pR * sR * cR
 *   Revenue   = dailyRate * days * pR * sR * cR * dR
 *   Cash      = dailyRate * days * pR * sR * cR * caR
 *
 * Generates both baseline and adjusted projections, then calculates deltas.
 */
```

### Two Toggle Modes

```jsx
/**
 * EOM Toggle:
 *   ON  → "MTD actuals + projected remaining" (adds actual MTD + projected remaining days)
 *   OFF → "Full month projected" (projects the entire month from daily rates)
 *
 * EOY Toggle:
 *   ON  → "YTD actuals + projected remaining" (adds actual YTD + projected remaining days)
 *   OFF → "Remaining only" (projects only remaining days in year)
 *
 * Toggle component: custom switch with smooth transition, blue when ON.
 */
```

### Projection Display Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  YOUR CURRENT BASELINE                                              │
│  [Prospects/Mo] [Show Rate] [Close Rate] [Deal Size] [Cash] [Calls]│
│  [Monthly Revenue] [Monthly Cash] [Monthly Closes]                  │
│  "Rates based on: Nov 19 – Feb 17, 2026 (90 days)"                │
├─────────────────────────────────────────────────────────────────────┤
│  ADJUST YOUR NUMBERS                                                │
│  [Show Rate slider ±15%]      [Close Rate slider ±15%]             │
│  [Deal Size slider ±$5k]      [Prospects slider ±500]              │
│                          [Reset All Sliders]                        │
│  [Adjusted Show] [Adjusted Close] [Adjusted Deal] [Adjusted Prosp] │
├──────────────────────────┬──────────────────────────────────────────┤
│  END OF MONTH PROJECTION │  END OF YEAR PROJECTION                  │
│  [Toggle: MTD+projected] │  [Toggle: YTD+projected]                 │
│  [Sched] [Held] [Closes] │  [Sched] [Held] [Closes]               │
│  [Revenue]     [Cash]     │  [Revenue]     [Cash]                   │
│  [▲ +3 sched] [▲ +2 held]│  [▲ +36 sched] [▲ +24 held]           │
│  [▲ +$10k rev] [▲ +$6k]  │  [▲ +$120k rev] [▲ +$72k]             │
├──────────────────────────┴──────────────────────────────────────────┤
│  IMPACT SUMMARY                                                      │
│  Monthly: +2 Closes, +$10k Revenue, +$6k Cash                      │
│  Yearly:  +24 Closes, +$120k Revenue, +$72k Cash                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Goals / Pacing Sub-Page (Optional — from goals app)

If Tyler wants the revenue pacing & goals feature integrated into the dashboard (instead of the standalone goals app), it should be a sub-section on the Projections page or a separate page. The logic from `goals/index.html` includes:

- WTD/MTD/QTD/YTD revenue vs goals
- Pace calculations (actual progress / expected progress for time elapsed)
- Goal inputs with auto-calculation (set monthly → quarterly & yearly auto-fill)
- Save goals via webhook to BigQuery

---

## 17. DEPLOYMENT — CLOUD RUN

### Dockerfile (Multi-Stage)

```dockerfile
# Stage 1: Build React SPA
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ .
RUN npm run build

# Stage 2: Production Server
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY server/ ./server/
COPY shared/ ./shared/
COPY --from=client-build /app/client/dist ./client/dist
EXPOSE 8080
CMD ["node", "server/index.js"]
```

### Express Static File Serving

```javascript
// server/index.js
const express = require('express');
const path = require('path');

const app = express();

// API routes first
app.use('/api', require('./routes'));

// Serve React SPA for everything else
app.use(express.static(path.join(__dirname, '../client/dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`CloserMetrix Dashboard running on port ${PORT}`));
```

### Cloud Build Config

```yaml
# cloudbuild.yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/closermetrix-dashboard:$COMMIT_SHA', '.']
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/closermetrix-dashboard:$COMMIT_SHA']
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - 'run'
      - 'deploy'
      - 'closermetrix-dashboard'
      - '--image'
      - 'gcr.io/$PROJECT_ID/closermetrix-dashboard:$COMMIT_SHA'
      - '--region'
      - 'us-central1'
      - '--platform'
      - 'managed'
      - '--allow-unauthenticated'
      - '--memory'
      - '512Mi'
      - '--set-env-vars'
      - 'NODE_ENV=production'
```

### Deploy Command

```bash
export PATH="/Users/user/google-cloud-sdk/bin:$PATH"
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=COMMIT_SHA=$(git rev-parse --short HEAD) \
  --project=closer-automation
```

---

## 18. ENVIRONMENT VARIABLES

```bash
# .env.example

# Server
PORT=8080
NODE_ENV=development

# BigQuery
GCP_PROJECT_ID=closer-automation
BQ_DATASET=CloserAutomation
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
# OR in production: GCP_SERVICE_ACCOUNT_KEY=<base64-encoded-key>

# Authentication
ADMIN_API_KEY=<long-random-string>

# CORS (development only)
CORS_ORIGIN=http://localhost:5173

# Optional
LOG_LEVEL=info
```

---

## 19. BUILD ORDER

Build this application in this exact order. Each phase builds on the previous one. Do not skip ahead.

### Phase 1: Foundation (Get something rendering)
1. Initialize monorepo: `package.json` (root), `client/package.json`
2. Set up Vite + React in `/client`
3. Set up Express in `/server` with basic health check endpoint
4. Create Dockerfile and verify it builds
5. Set up MUI ThemeProvider with `tronTheme.js`
6. Create the `DashboardShell` layout (sidebar + topbar + content area)
7. Create React Router with placeholder pages for all routes
8. **Verify:** App renders a dark-themed shell with sidebar navigation

### Phase 2: Authentication + BigQuery Connection
9. Set up BigQueryClient singleton with service account auth
10. Create `AccessTokens` table in BigQuery
11. Build `tokenManager.js` (generate, validate, revoke)
12. Build `clientIsolation.js` middleware (token → client_id)
13. Build `tierGate.js` middleware
14. Build `adminAuth.js` middleware
15. Build `/api/auth/validate` endpoint
16. Build `AuthContext` and `useAuth` hook on the frontend
17. Build admin login page (password field → stores key in sessionStorage)
18. **Verify:** Admin can log in. Client token resolves to correct client_id and tier.

### Phase 3: Overview Page — All Tiers (The MVP)
19. Build `overview.js` query file — At a Glance scorecards + key overview charts
20. Build `GET /api/dashboard/overview` endpoint
21. Build `Scorecard` component
22. Build `ScorecardRow` and `ScorecardGrid` components
23. Build `TronLineChart` component with gradient fills
24. Build `TronBarChart` component
25. Build `TronPieChart` component
26. Build `TronFunnelChart` (custom)
27. Build `DateRangeFilter` component
28. Build `FilterContext` + `useFilters` hook
29. Build `OverviewPage` — At a Glance scorecards + overview charts
30. **Verify:** A client token loads the Overview page with real BigQuery data, all scorecards and charts render with Tron theme.

### Phase 4: Insight Tier Pages
31. Build `CloserFilter` component (hidden for Basic)
32. Build `GranularityToggle` component
33. Build `financial.js` queries + `GET /api/dashboard/financial` endpoint
34. Build `FinancialPage` — revenue, cash, deal size, per-closer charts
35. Build `attendance.js` queries + `GET /api/dashboard/attendance` endpoint
36. Build `AttendancePage` — volume, show rates, ghosted/rescheduled/canceled, charts
37. Build `callOutcomes.js` queries + `GET /api/dashboard/call-outcomes` endpoint
38. Build `CallOutcomesPage` — close rates, funnels, deposits, DQ, lost
39. Build `salesCycle.js` queries + `GET /api/dashboard/sales-cycle` endpoint
40. Build `SalesCyclePage` — calls/days to close, 1-call vs multi-call
41. Build `objections.js` queries (use all three objection views)
42. Build `ObjectionsTable` component
43. Build `ObjectionsPage` — all 9 scorecards, tables, charts
44. Build `projections.js` queries
45. Build `ProjectionEngine`, `ScenarioSlider`, `ProjectionCard`
46. Build `ProjectionsPage` — projections + pacing/goals sub-section
47. Update sidebar to show/hide pages based on tier
48. **Verify:** Insight tier client sees all 7 pages. Basic client sees only Overview.

### Phase 5: Executive Tier Pages
49. Build `violations.js` queries
50. Build `RiskReviewTable` component
51. Build `ViolationsPage` — SEC/FTC scorecards, risk categories, risk review table, charts
52. Build `adherence.js` queries
53. Build `TronRadarChart` (custom)
54. Build `AdherencePage` — script adherence scores by section, radar chart
55. **Verify:** Executive client sees all 9 pages.

### Phase 6: Admin Master View
56. Build `/api/admin/*` endpoints
57. Build `AdminDashboard` — client list with tier badges
58. Build tier quick-switch (dropdown on each client row → updates BigQuery)
59. Build `ClientDetail` — renders client dashboard with admin toolbar
60. Build `TokenManager` — generate/revoke access links
61. **Verify:** Tyler can log in as admin, see all clients, switch tiers, view any client's dashboard.

### Phase 7: Partner View
62. Build `partnerAuth.js` middleware
63. Build `/api/partner/*` endpoints
64. Build `PartnerDashboard` — assigned clients list, view-only
65. **Verify:** Partner token shows only assigned clients.

### Phase 8: Polish & Deploy
66. Add loading skeletons, error states, empty states to all components
67. Responsive design pass (mobile should be usable but not primary)
68. Add SEC violation teaser modal (Basic/Insight → shows count, click → "Upgrade to Executive")
69. Performance: TanStack Query caching, stale times, prefetching
70. Security headers (helmet)
71. Final Dockerfile build + Cloud Run deploy
72. **Verify:** Full end-to-end flow works in production.

---

## 20. CODING STANDARDS

### File Naming

```
Components:    PascalCase.jsx       (Scorecard.jsx, TronLineChart.jsx)
Hooks:         camelCase.js         (useMetrics.js, useFilters.js)
Utils:         camelCase.js         (formatters.js, tokenManager.js)
Queries:       camelCase.js         (overview.js, objections.js)
Config:        camelCase.js         (index.js, constants.js)
Routes:        camelCase.js         (dashboard.js, admin.js)
Constants:     UPPER_SNAKE_CASE     (ADMIN_API_KEY, BQ_DATASET)
DB fields:     snake_case           (client_id, appointment_date) — matches BigQuery
```

### JavaScript Style

```javascript
// Use async/await, not .then() chains
// Use const by default, let when needed, never var
// Destructure props and imports
// Comment EVERY function with JSDoc: what it does, params, returns
// Comment WHY, not what — "// Ignore closerId for Basic tier" not "// set closerId to null"

// Error handling: always try/catch async functions
// Logging: use structured logger, not console.log in production
// SQL: ALWAYS parameterized queries. NEVER string interpolation.
```

### Component Style

```javascript
// Functional components only (no class components)
// Custom hooks for ALL data fetching and state logic
// Props should be typed with JSDoc or PropTypes
// No inline styles — use MUI sx prop or theme
// Every component gets its own file
// Keep components under 200 lines — extract sub-components if larger
```

### BigQuery Query Style

```javascript
// Every query function signature: (clientId, options) => Promise<result>
// clientId is ALWAYS the first parameter — this is the isolation guarantee
// Use @-prefixed parameters: @clientId, @dateStart, @dateEnd, @closerId
// NEVER use string interpolation for values
// Table references use full qualified names: `closer-automation.CloserAutomation.Calls`
// Use existing views (v_calls_joined_flat_prefixed, etc.) when they have the right data
// Only query base tables directly when views don't cover the need
```

---

## 21. REFERENCE: BIGQUERY TABLES & VIEWS

### Base Tables

**Calls** — `closer-automation.CloserAutomation.Calls`
Key fields: `call_id` (PK), `client_id`, `closer_id`, `appointment_date` (STRING), `call_type`, `attendance`, `call_outcome`, `revenue_generated`, `cash_collected`, `duration_minutes`, `discovery_score`, `pitch_score`, `close_attempt_score`, `objection_handling_score`, `overall_call_score`, `script_adherence_score`, `ai_summary`, `call_url`, `recording_url`, `transcript_link`

**Closers** — `closer-automation.CloserAutomation.Closers`
Key fields: `closer_id` (PK), `client_id`, `name`, `work_email`, `status`, `lifetime_close_rate`, `lifetime_show_rate`

**Clients** — `closer-automation.CloserAutomation.Clients`
Key fields: `client_id` (PK), `company_name`, `plan_tier`, `offer_price`, `timezone`, `status`, `closer_count`

**Objections** — `closer-automation.CloserAutomation.Objections`
Key fields: `objection_id` (PK), `call_id`, `client_id`, `closer_id`, `objection_type`, `objection_text`, `timestamp_seconds`, `resolved`, `resolution_method`, `resolution_text`

### Views

**v_calls_joined_flat_prefixed** — Main view. All calls with closer + client data. Prefixed columns: `calls_*`, `closers_*`, `clients_*`.

**v_objections_joined** — Objection-level. One row per objection with all call/closer/client data. Prefixed: `obj_*`, `calls_*`, `closers_*`, `clients_*`.

**v_calls_with_objection_counts** — Call-level. Each call with `obj_count`, `obj_resolved_count`, `obj_not_resolved_count`, `has_objections`.

**v_calls_with_objections_filterable** — Call-objection level. LEFT JOIN so calls without objections get one row with NULL `obj_*` fields. Used for "% of calls with objections" metric.

**v_funnel_calls_all_types** — Aggregate funnel: `funnel_type`, `stage`, `count`.

**v_close_cycle_stats_dated** — Prospect-level close cycle: `prospect_email`, `client_id`, `closer_id`, `close_date`, `days_to_close`, `calls_to_close`.

---

## 22. REFERENCE: EXISTING REPOS (GOALS & PROJECTIONS)

### Important: Clone These Repos for Reference

Before building the Projections page and any pacing/goals features, clone these repos and study the code:

```bash
git clone https://github.com/The-Ops-King/goals.git ./reference/goals
git clone https://github.com/The-Ops-King/projections.git ./reference/projections
```

These are single-file HTML apps (each is just an `index.html`) that Tyler built for CloserMetrix. They contain working code that should be ported into proper React components.

### Goals App (`reference/goals/index.html`)

**What it does:** Revenue pacing & goals dashboard. Shows WTD/MTD/QTD/YTD revenue vs goals with pace calculations. Includes goal-setting inputs that save via webhook.

**Key patterns to preserve:**
- **Color system (`C` object):** `pageBg: "#212022"`, `cardBg: "#2c3139"`, `cardBorder: "#3a3a3b"`, etc. — These are Tyler's preferred dark palette. The new Tron theme should be an EVOLUTION of this (darker, more neon), not a departure.
- **Scorecard component:** Simple card with label (uppercase, small, colored) + large bold value. This exact pattern should carry over.
- **Pacing calculation logic:** `getWeekProgress()`, `getMonthProgress()`, `getQuarterProgress()`, `getYearProgress()` — reuse these date utility functions.
- **Pace color coding:** Green (>=95%), Orange (>=80%), Red (<80%) — keep this convention.
- **Goal input pattern:** Dollar input with `$` prefix, "Update" button that shows "✓ Saved" on success.
- **Layout:** Left side = pacing scorecards in rows, Right side = goal inputs. Clean two-column layout.
- **Font:** Inter with weight 400-700.

**What to port vs rebuild:**
- PORT: Scorecard component pattern, color coding logic, pacing math, formatters (fmtDollar, fmtPct)
- REBUILD: Layout (use MUI Grid), inputs (use MUI TextField), fetch logic (use TanStack Query)

### Projections App (`reference/projections/index.html`)

**What it does:** Full projection engine with 4 interactive sliders, EOM/EOY projections with MTD/YTD toggle modes, impact summaries, and delta indicators.

**CRITICAL: This is MORE advanced than the original CLAUDE.md spec. Use THIS as the source of truth for the Projections page.**

**Key patterns to preserve:**

1. **4 Scenario Sliders (not 2):**
   - Show Rate: ±15%, step 0.5%
   - Close Rate: ±15%, step 0.5%
   - Avg Deal Size: ±$5,000, step $100
   - Prospects Booked/Month: ±500, step 10

2. **Slider component:** Custom range slider with fill bar from center (0 point), neon thumb with glow shadow. The zero-center design is excellent — positive fills right in accent color, negative fills left in red.

3. **Projection calculation engine (lines 217-292):**
   ```javascript
   // Core formula — ratio-based adjustments:
   const pR = adjProspects / b.prospectsBookedPerMonth;   // prospects ratio
   const sR = adjShowRate / b.showRate;                     // show rate ratio
   const cR = adjCloseRate / b.closeRate;                   // close rate ratio
   const dR = adjDealSize / b.avgDealSize;                  // deal size ratio
   const caR = adjCashPer / b.avgCashCollected;             // cash ratio

   // Apply ratios cumulatively:
   // Scheduled = base * prospects ratio
   // Held = base * prospects * show rate
   // Closes = base * prospects * show rate * close rate
   // Revenue = base * prospects * show rate * close rate * deal size
   // Cash = base * prospects * show rate * close rate * cash ratio
   ```

4. **Two projection modes (Toggle component):**
   - EOM: "MTD actuals + projected remaining" vs "Full month projected"
   - EOY: "YTD actuals + projected remaining" vs "Remaining only"

5. **Delta indicators (`Delta` component):** Green ▲ for positive, Red ▼ for negative, Gray — for zero. With colored background pill. These should become a reusable component.

6. **Impact Summary section:** "Monthly Impact" and "Yearly Impact" side-by-side showing Additional Closes, Revenue, and Cash from slider adjustments.

7. **Baseline data comes from an API** (`API_URL`): The existing projections app fetches from a Cloud Run endpoint that returns:
   ```javascript
   {
     showRate, closeRate, avgDealSize, avgCashCollected,
     prospectsBookedPerMonth, avgCallsToClose,
     callsScheduled, currentCallsHeld, currentCloses,
     currentRevenue, currentCash, daysInPeriod,
     daysInCurrentMonth, dayOfMonth, daysInYear, dayOfYear,
     mtdCallsScheduled, mtdCallsHeld, mtdCloses, mtdRevenue, mtdCash,
     ytdCallsScheduled, ytdCallsHeld, ytdCloses, ytdRevenue, ytdCash,
     dateRange, closers: [{ id, name }]
   }
   ```
   **The new API should return the same shape** from `GET /api/dashboard/projections`.

8. **Closer filter + Date range filter** in the header — already implemented in projections, same pattern needed across all dashboard pages.

**What to port vs rebuild:**
- PORT: Entire projection calculation engine (the `useMemo` block), Slider component (with Tron glow upgrades), Delta component, Toggle component, ProjCol layout, Impact Summary section, baseline data shape
- REBUILD: Fetch logic (use TanStack Query), layout (use MUI Grid), Card component (merge with Scorecard), styling (upgrade to Tron theme with neon accents)

### Design Evolution: Goals/Projections → Tron Theme

Tyler's existing apps use a muted dark palette (`#212022` bg, `#2c3139` cards). The new dashboard should evolve this into the Tron aesthetic:

| Existing | New Tron |
|----------|----------|
| `#212022` (dark gray bg) | `#0a0e17` (near-black with blue undertone) |
| `#2c3139` (gray cards) | `#111827` (darker cards with subtle border glow) |
| `#3a3a3b` (borders) | `rgba(0, 240, 255, 0.15)` (subtle cyan glow borders) |
| `#2579c0` (blue accent) | `#00f0ff` (neon cyan) |
| `#4caf51` (green) | `#00ff88` (neon green) |
| `#ff8f00` (orange) | `#ffb800` (neon amber) |
| `#ef5350` (red) | `#ff3366` (neon red) |
| No glow effects | Border glow + box-shadow on cards |
| No gradients under charts | Gradient fills from line color to transparent |
| Plain slider track | Slider thumb with glow shadow (already started in projections!) |

---

## 23. DECISIONS LOG

These decisions were made during the planning session and are final:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| BigQuery auth | Service account on Express backend | Clients never touch BQ credentials |
| Client auth | Shared secret links (token in URL) | Zero friction = higher dashboard usage = better retention |
| Client auth PIN | No PIN required | Token is 36-char UUID, unguessable. PIN adds friction. |
| Hosting | Single Cloud Run service | Already using Cloud Run. One service = simpler ops. |
| Charts library | MUI X Charts | Native MUI integration, supports gradient fills, dark theme |
| Radar chart | Custom SVG or recharts fallback | MUI X doesn't have radar chart |
| Funnel chart | Custom SVG component | MUI X doesn't have funnel chart |
| Admin access | API key in header | Tyler-only, simple, no OAuth needed |
| Partner access | Partner token → assigned client_ids | Sellers see only their clients |
| Tier switching | BigQuery field update via admin API | Instant, no redeploy, no code change |
| Tier enforcement | Three layers: frontend hide + API middleware + query isolation | Defense in depth |
| Monorepo structure | Single repo, two package.json | Simpler CI/CD, shared code |
| CSS framework | MUI + Emotion (via theme) | Consistent dark theme, minimal custom CSS |
| Data fetching | TanStack Query (React Query) | Caching, refetching, loading states handled |
| Date handling | dayjs | Lightweight, MUI DatePicker compatible |

---

## 24. WHAT THIS DOES NOT INCLUDE (YET)

These features are planned but NOT part of this build:

- **Email/Slack wrapups** — #1 priority after dashboard, but separate system
- **Automated CRM notes** — future feature
- **Custom GPT** — separate product, requires 3-6 months of data
- **Retroactive Data Analysis** — separate service, not dashboard
- **Real-time data** — dashboard shows data as of last BigQuery refresh, not live
- **Mobile-native app** — responsive web is enough for now
- **User accounts / SSO** — shared secret links, no user management
- **Billing / Stripe integration** — Tyler handles billing manually for now