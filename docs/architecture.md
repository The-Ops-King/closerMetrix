# Architecture Reference

## Pages

| Route | Component | Min Tier | Description |
|-------|-----------|----------|-------------|
| `/d/:token` (index) | `OverviewPage` | basic | KPI summary scorecards |
| `/d/:token/financial` | `FinancialPage` | basic (blurred) | Revenue, cash, deal size |
| `/d/:token/attendance` | `AttendancePage` | basic (blurred) | Show/no-show rates |
| `/d/:token/call-outcomes` | `CallOutcomesPage` | basic (blurred) | Close rates, outcomes, funnel |
| `/d/:token/sales-cycle` | `SalesCyclePage` | basic (blurred) | Speed-to-close metrics |
| `/d/:token/objections` | `ObjectionsPage` | insight | Objection tracking & analysis |
| `/d/:token/projections` | `ProjectionsPage` | insight | Revenue projections |
| `/d/:token/closer-scoreboard` | `CloserScoreboardPage` | insight | Per-closer ranked scorecard |
| `/d/:token/market-insight` | `MarketInsightPage` | insight | AI market pains/goals |
| `/d/:token/data-analysis` | `DataAnalysisPage` | basic | AI data analysis scorecards |
| `/d/:token/violations` | `ViolationsPage` | executive | Script/compliance violations |
| `/d/:token/adherence` | `AdherencePage` | executive | Script adherence scoring |
| `/d/:token/settings` | `SettingsPage` | basic | Notifications, AI, sources, KPI targets |
| `/admin/login` | `AdminLogin` | — | API key entry → sessionStorage |
| `/admin/dashboard` | `AdminDashboard` | — | Client list, tier badges, soft-delete |
| `/admin/clients/:id` | `ClientDetail` | — | Admin view of client dashboard |
| `/admin/tokens` | `TokenManager` | — | Create/revoke access tokens |
| `/admin/api-console` | `AdminApiConsole` | — | Raw CRUD API console |
| `/partner/:token` | `PartnerDashboard` | — | Partner portal, assigned clients |

## API Endpoints (Frontend Express :3001)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/auth/validate?token=` | — | Token → client_id, tier, closers |
| GET | `/api/dashboard/:section` | X-Client-Token | Dashboard data (overview, financial, etc.) |
| PATCH | `/api/dashboard/settings` | X-Client-Token | Update client settings_json |
| GET | `/api/admin/clients` | X-Admin-Key | List all clients |
| PATCH | `/api/admin/clients/:id` | X-Admin-Key | Update client |
| POST/DELETE | `/api/admin/tokens` | X-Admin-Key | Create/revoke tokens |
| * | `/api/backend/*` | X-Admin-Key | Proxy → Backend:8080 (translates to Bearer) |
| POST | `/api/activity/session-start` | X-Client-Token | Track session |
| POST | `/api/activity/page-view` | X-Client-Token | Track page view |

## Auth Flow

1. User visits `/d/:token` → `AuthProvider` reads `:token` from URL
2. Calls `GET /api/auth/validate?token=xxx` → server looks up AccessTokens table
3. `AuthContext` stores `{ token, clientId, tier, companyName, closers }`
4. All fetches use `fetchWithAuth()` which sets `X-Client-Token` header
5. `clientIsolation` middleware resolves token → injects `req.clientId`, `req.tier`
6. Admin path: `X-Admin-Key` + `X-View-Client-Id` → constant-time key compare

## Tier Enforcement (3 Layers)

1. **Sidebar** — All nav items visible; locked items show lock icon + blurred preview on click
2. **TierGate component** — Wraps sections; renders children blurred with upgrade overlay if tier insufficient. Uses `TIER_RANK = { basic:1, insight:2, executive:3 }`
3. **API** — `req.tier` available on all dashboard routes; currently returns all data (enables blurred previews)

## Hooks

| Hook | Returns |
|------|---------|
| `useMetrics(section)` | `{ data, isLoading, error }` — fetches `/api/dashboard/:section` |
| `useInsight(section, pageData)` | `{ text, generatedAt, isLoading, generateWithFilters, remainingAnalyses }` |
| `useKpiTargets()` | `{ kpiTargets, isLoading }` — from settings_json |
| `useAnimatedValue(target)` | `animatedValue` — count-up animation |
| `usePageTracking()` | void — fires session/pageview events via sendBeacon |

## Key Components

| Component | Props | Description |
|-----------|-------|-------------|
| `Scorecard` | `label, value, format, delta, glowColor, locked` | Metric card with neon glow |
| `ScorecardGrid` | `title, metrics, columns, glowColor, lockedKeys` | Grid of Scorecard cards |
| `ChartWrapper` | `loading, error, isEmpty, title, accentColor, locked` | Loading/error/empty/lock states |
| `TronLineChart` | `data, series, showArea, yAxisFormat` | MUI X line chart with gradients |
| `TronBarChart` | `data, series, layout, stacked, yAxisFormat` | Bar chart (vertical/horizontal) |
| `TronPieChart` | `data, height, innerRadius` | Sorted desc pie/donut |
| `TronFunnelChart` | `data, title` | Custom HTML funnel |
| `TronRadarChart` | `axes, datasets, maxValue` | Pure SVG radar chart |
| `TierGate` | `requiredTier, label, children` | Blur overlay for gated content |
| `InsightCard` | `text, generatedAt, onGenerate` | AI insight display |
| `SectionHeader` | `title, subtitle, accentColor` | Section heading with accent bar |
