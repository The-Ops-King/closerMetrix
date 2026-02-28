# Codebase Structure

**Analysis Date:** 2026-02-28

## Directory Layout

```
CloserMetrix/
├── Frontend/                          # React + Express dashboard, UI layer
│   ├── server/                        # Express API server (port 3001)
│   │   ├── index.js                   # Entry point — starts Express
│   │   ├── routes/                    # Route handlers
│   │   │   ├── auth.js                # GET /api/auth/validate — token validation
│   │   │   ├── dashboard.js           # GET /api/dashboard/:section — client dashboard data
│   │   │   ├── admin.js               # Admin endpoints: clients, closers, health
│   │   │   ├── backendProxy.js        # Proxy to Backend service (/api/backend/*)
│   │   │   ├── partner.js             # GET /api/partner/* — partner-only routes
│   │   │   └── jobs.js                # Job triggers and monitoring
│   │   ├── middleware/                # Express middleware chain
│   │   │   ├── clientIsolation.js     # Resolves token → client_id
│   │   │   ├── tierGate.js            # Checks plan_tier, returns 403 if insufficient
│   │   │   ├── adminAuth.js           # Validates X-Admin-Key header
│   │   │   └── partnerAuth.js         # Validates partner token
│   │   ├── services/                  # Business logic
│   │   │   ├── tokenManager.js        # Generate/validate/revoke access tokens
│   │   │   └── insightEngine.js       # AI-powered insight generation (chat)
│   │   ├── db/                        # Database queries
│   │   │   ├── BigQueryClient.js      # Connection + query execution
│   │   │   └── queries/               # Aggregated queries per dashboard page
│   │   │       ├── overview.js        # Overview page queries (all tiers)
│   │   │       ├── financial.js       # Financial page (Insight+)
│   │   │       ├── attendance.js      # Attendance page (Insight+)
│   │   │       ├── callOutcomes.js    # Call outcomes page (Insight+)
│   │   │       ├── salesCycle.js      # Sales cycle page (Insight+)
│   │   │       ├── objections.js      # Objections page (Insight+)
│   │   │       └── admin.js           # Admin queries (all clients)
│   │   ├── config/                    # Configuration
│   │   │   ├── index.js               # Loads environment + defaults
│   │   │   ├── insightEngine.js       # AI insight prompts & config
│   │   │   └── marketPulse.js         # Market intelligence prompts
│   │   ├── utils/                     # Utilities
│   │   │   ├── logger.js              # Structured logging
│   │   │   └── tokenManager.js        # Token generation/validation/revocation
│   │   └── scripts/                   # Setup scripts
│   │       └── createInsightLog.js    # Initialize InsightLog table
│   │
│   ├── client/                        # React SPA (Vite, port 5173)
│   │   ├── src/
│   │   │   ├── main.jsx               # React entry point
│   │   │   ├── App.jsx                # Router setup, route definitions
│   │   │   ├── theme/                 # Design system
│   │   │   │   ├── constants.js       # Color tokens, spacing, breakpoints (COLORS, LAYOUT)
│   │   │   │   ├── tronTheme.js       # MUI theme configuration
│   │   │   │   └── chartTheme.js      # Chart-specific defaults
│   │   │   ├── hooks/                 # Custom React hooks
│   │   │   │   ├── useMetrics.js      # TanStack Query wrapper for dashboard data
│   │   │   │   ├── useFilters.js      # Global filter state (date, closer, etc.)
│   │   │   │   ├── useTier.js         # Returns current client tier
│   │   │   │   ├── useAuth.js         # Token validation, AuthContext
│   │   │   │   └── useDataAnalysisInsight.js — AI-powered data insights
│   │   │   ├── context/               # React context providers
│   │   │   │   ├── AuthContext.jsx    # client_id, tier, token, closers
│   │   │   │   └── FilterContext.jsx  # date range, closer, granularity, etc.
│   │   │   ├── components/            # Reusable UI components
│   │   │   │   ├── layout/            # Page structure components
│   │   │   │   │   ├── DashboardShell.jsx  # Sidebar + topbar + content area
│   │   │   │   │   ├── Sidebar.jsx    # Navigation (tier-aware page visibility)
│   │   │   │   │   ├── TopBar.jsx     # Company name, filters, tier badge
│   │   │   │   │   └── TierBadge.jsx  # Visual tier indicator
│   │   │   │   ├── scorecards/        # Metric display cards
│   │   │   │   │   ├── Scorecard.jsx  # Single metric: label + value + delta
│   │   │   │   │   ├── ScorecardRow.jsx    # Horizontal row of scorecards
│   │   │   │   │   └── ScorecardGrid.jsx   # Grid layout
│   │   │   │   ├── charts/            # Chart visualizations
│   │   │   │   │   ├── ChartWrapper.jsx    # Loading/error/empty state wrapper
│   │   │   │   │   ├── TronLineChart.jsx   # Line chart with gradient fill
│   │   │   │   │   ├── TronBarChart.jsx    # Horizontal/vertical bar
│   │   │   │   │   ├── TronPieChart.jsx    # Pie/donut
│   │   │   │   │   ├── TronFunnelChart.jsx — Custom funnel (Booked→Held→Closed)
│   │   │   │   │   └── TronRadarChart.jsx  # Radar (script adherence)
│   │   │   │   ├── tables/            # Data tables with drill-down
│   │   │   │   │   ├── ObjectionsTable.jsx     # Objection drill-down
│   │   │   │   │   ├── RiskReviewTable.jsx     # Executive violations detail
│   │   │   │   │   ├── CloserLeaderboard.jsx   # Ranked closer comparison
│   │   │   │   │   └── FollowUpTable.jsx       # Open follow-ups
│   │   │   │   ├── filters/           # Filter UI components
│   │   │   │   │   ├── DateRangeFilter.jsx      # Date range picker
│   │   │   │   │   ├── CloserFilter.jsx         # Multi-select closers (Insight+)
│   │   │   │   │   ├── ObjectionTypeFilter.jsx  # Objection type filter
│   │   │   │   │   └── GranularityToggle.jsx    # Daily/Weekly/Monthly
│   │   │   │   └── projections/       # Projection engine components
│   │   │   │       ├── ProjectionEngine.jsx     # Main projection calculator
│   │   │   │       ├── ScenarioSlider.jsx       # +/- adjustment slider
│   │   │   │       └── ProjectionCard.jsx       # EOM/EOY display
│   │   │   ├── pages/                 # Page-level components (one per route)
│   │   │   │   ├── client/            # CLIENT DASHBOARD PAGES
│   │   │   │   │   ├── ClientDashboardLayout.jsx  # Shell + sidebar + route outlet
│   │   │   │   │   ├── OverviewPage.jsx           # At a glance + key charts (all tiers)
│   │   │   │   │   ├── FinancialPage.jsx          # Revenue, cash, deal size (Insight+)
│   │   │   │   │   ├── AttendancePage.jsx         # Show rates, no-shows (Insight+)
│   │   │   │   │   ├── CallOutcomesPage.jsx       # Funnels, close rates (Insight+)
│   │   │   │   │   ├── SalesCyclePage.jsx         # Calls/days to close (Insight+)
│   │   │   │   │   ├── ObjectionsPage.jsx         # Objection intelligence (Insight+)
│   │   │   │   │   ├── ProjectionsPage.jsx        # Projections + scenarios (Insight+)
│   │   │   │   │   ├── ViolationsPage.jsx         # SEC/FTC risks (Executive)
│   │   │   │   │   ├── AdherencePage.jsx          # Script adherence (Executive)
│   │   │   │   │   ├── DataAnalysisPage.jsx       # AI-powered call insights
│   │   │   │   │   ├── CloserScoreboardPage.jsx   # Closer-specific metrics
│   │   │   │   │   ├── MarketInsightPage.jsx      # Market intelligence
│   │   │   │   │   └── SettingsPage.jsx           # Client settings
│   │   │   │   ├── admin/             # ADMIN PAGES
│   │   │   │   │   ├── AdminLogin.jsx         # Password entry
│   │   │   │   │   ├── AdminDashboard.jsx     # All clients + tier switching
│   │   │   │   │   ├── ClientDetail.jsx       # View any client's dashboard
│   │   │   │   │   ├── TokenManager.jsx       # Generate/revoke links
│   │   │   │   │   └── AdminApiConsole.jsx    # Direct API testing
│   │   │   │   └── partner/           # PARTNER PAGES
│   │   │   │       └── PartnerDashboard.jsx   # Assigned clients (read-only)
│   │   │   └── utils/                 # Utility functions
│   │   │       ├── api.js             # Axios wrapper with token injection
│   │   │       ├── formatters.js      # Number formatting (%, $, commas)
│   │   │       ├── metricDefinitions.js  # Canonical metric names, labels, formats
│   │   │       ├── colors.js          # COLOR_MAP (color name → hex)
│   │   │       └── tierConfig.js      # Pages/sections visible per tier
│   │   ├── public/                    # Static assets
│   │   │   └── favicon.ico
│   │   ├── dist/                      # Built SPA (generated by `npm run build`)
│   │   ├── index.html                 # Vite entry HTML
│   │   ├── vite.config.js             # Vite config + proxy to Express
│   │   └── package.json               # React dependencies
│   │
│   ├── shared/                        # Shared code between server and client
│   │   ├── tierDefinitions.js         # Tier names, pages, features
│   │   └── metricKeys.js              # Canonical metric key constants
│   │
│   └── package.json                   # Express dependencies

├── Backend/                           # Node.js/Express API server (port 8080)
│   ├── src/
│   │   ├── index.js                   # Entry point — starts server, TimeoutService
│   │   ├── app.js                     # Express setup, middleware, routes
│   │   ├── config/                    # Configurable values (NOT hardcoded)
│   │   │   ├── index.js               # Loads .env + defaults
│   │   │   ├── objection-types.js     # Standardized objection categories
│   │   │   ├── call-outcomes.js       # Valid call outcome values
│   │   │   ├── attendance-types.js    # Valid attendance status values
│   │   │   ├── call-types.js          # First Call, Follow Up, Rescheduled, etc.
│   │   │   ├── risk-categories.js     # FTC/SEC risk categories
│   │   │   ├── scoring-rubric.js      # AI scoring guidelines (1-10 scale)
│   │   │   ├── transcript-providers.js — Fathom, Otter, Read.ai, tl;dv, Generic
│   │   │   └── calendar-providers.js  # Google Calendar, Calendly, GHL, HubSpot
│   │   ├── routes/                    # Route handlers
│   │   │   ├── index.js               # Route aggregator
│   │   │   ├── webhooks/              # Webhook handlers
│   │   │   │   ├── calendar.js        # POST /webhooks/calendar/:clientId
│   │   │   │   ├── transcript.js      # POST /webhooks/transcript/:provider
│   │   │   │   └── payment.js         # POST /webhooks/payment
│   │   │   └── admin/                 # Admin endpoints (require API key)
│   │   │       ├── clients.js         # CRUD for clients
│   │   │       ├── closers.js         # CRUD for closers
│   │   │       └── health.js          # System health checks
│   │   ├── services/                  # Business logic (no Express req/res)
│   │   │   ├── CallStateManager.js    # Call lifecycle state machine
│   │   │   ├── PaymentService.js      # Payment processing logic
│   │   │   ├── ProspectService.js     # Prospect record management
│   │   │   ├── TimeoutService.js      # Background job: ghost detection, channel renewal
│   │   │   ├── calendar/              # Calendar integration
│   │   │   │   ├── CalendarService.js — Orchestrates calendar event handling
│   │   │   │   ├── GoogleCalendarPush.js  # Watch setup & renewal
│   │   │   │   └── adapters/          # Provider-specific normalization
│   │   │   │       ├── BaseCalendarAdapter.js    # Interface definition
│   │   │   │       ├── GoogleCalendarAdapter.js  # Google Calendar implementation
│   │   │   │       ├── CalendlyAdapter.js        # Stub for future
│   │   │   │       └── GHLAdapter.js             # Stub for future
│   │   │   ├── transcript/            # Transcript integration
│   │   │   │   ├── TranscriptService.js  # Orchestrates transcript handling
│   │   │   │   ├── FathomAPI.js          # Fathom polling with exponential backoff
│   │   │   │   └── adapters/            # Provider-specific normalization
│   │   │   │       ├── BaseTranscriptAdapter.js  # Interface definition
│   │   │   │       ├── FathomAdapter.js          # Fathom implementation
│   │   │   │       ├── TLDVAdapter.js            # tl;dv implementation
│   │   │   │       ├── OtterAdapter.js           # Otter.ai stub
│   │   │   │       ├── GenericAdapter.js         # Generic catch-all
│   │   │   │       └── ReadAIAdapter.js          # Read.ai stub
│   │   │   └── ai/                    # AI processing pipeline
│   │   │       ├── AIProcessor.js     # Sends transcript to Claude, streams response
│   │   │       ├── PromptBuilder.js   # Builds system + user prompts from config
│   │   │       └── ResponseParser.js  # Validates & normalizes AI response
│   │   ├── db/                        # Database layer
│   │   │   ├── BigQueryClient.js      # Connection + parameterized query execution
│   │   │   ├── queries/               # Role-based query modules
│   │   │   │   ├── calls.js           # Call CRUD
│   │   │   │   ├── closers.js         # Closer CRUD
│   │   │   │   ├── clients.js         # Client CRUD
│   │   │   │   ├── objections.js      # Objection insert
│   │   │   │   ├── prospects.js       # Prospect CRUD
│   │   │   │   └── audit.js           # AuditLog insert
│   │   │   └── migrations/            # Schema changes
│   │   │       ├── 001_create_prospects.js
│   │   │       ├── 002_create_audit_log.js
│   │   │       └── 003_create_cost_tracking.js
│   │   ├── middleware/                # Express middleware
│   │   │   ├── clientIsolation.js     # Validates client_id on webhook
│   │   │   ├── errorHandler.js        # Global error catching + formatting
│   │   │   ├── requestLogger.js       # Logs all requests
│   │   │   └── webhookAuth.js         # Validates webhook signatures
│   │   └── utils/                     # Utilities
│   │       ├── AuditLogger.js         # Logs state changes to BigQuery
│   │       ├── CostTracker.js         # Tracks AI processing costs
│   │       ├── AlertService.js        # Sends error alerts (console/Slack/email)
│   │       ├── logger.js              # Structured logging
│   │       ├── idGenerator.js         # UUID generation
│   │       └── dateUtils.js           # Timezone conversion, UTC normalization
│   ├── tests/                         # Jest test suite
│   │   ├── scenarios/                 # 48 end-to-end scenarios (webhook → DB state)
│   │   │   ├── 01-scheduled-then-canceled.test.js
│   │   │   ├── 02-ghosted-no-show.test.js
│   │   │   └── ... (one per scenario)
│   │   ├── services/                  # Unit tests per service
│   │   ├── integration/               # Integration tests
│   │   └── helpers/                   # Test utilities
│   │       ├── mockBigQuery.js
│   │       ├── mockCalendar.js
│   │       └── fixtures/              # Sample webhook payloads
│   │           ├── fathom-webhook.json
│   │           ├── otter-webhook.json
│   │           └── ...
│   ├── docs/                          # Documentation
│   │   ├── ARCHITECTURE.md            # System design
│   │   ├── STATE-MACHINE.md           # Call lifecycle
│   │   ├── ADDING-CALENDAR-PROVIDER.md
│   │   ├── ADDING-TRANSCRIPT-PROVIDER.md
│   │   ├── DEPLOYMENT.md
│   │   └── TROUBLESHOOTING.md
│   ├── .env.example                   # Environment variable template
│   ├── Dockerfile                     # Multi-stage build: React build → Express serve
│   ├── cloudbuild.yaml                # GCP Cloud Build config
│   └── package.json                   # Backend dependencies
│
└── .planning/                         # GSD documentation (this file, etc.)
```

## Directory Purposes

### Frontend/server
Stateless Express API that serves dashboard data. Does NOT handle webhooks or event processing. Queries BigQuery (via proxy to Backend) to aggregate dashboard metrics. Runs on port 3001 in dev, handles routing in production.

- **Routes:** Dashboard endpoints (`/api/dashboard/:section`), auth validation, admin CRUD, proxy to Backend
- **Services:** Token generation/validation, insight engine (AI-powered chat insights)
- **DB:** BigQuery client + per-page query modules (overview, financial, attendance, etc.)
- **Key responsibility:** Aggregate BigQuery data into dashboard response shape with tier-aware filtering

### Frontend/client
React SPA (Vite) with responsive dashboard UI. Tier-aware sidebar navigation, filter controls, charting, tables. In dev, connects to Express on :3001. In prod, bundled into Express as static files.

- **Pages:** One per dashboard view (OverviewPage, FinancialPage, etc.) + admin pages + partner pages
- **Components:** Reusable scorecards, charts, tables, filters organized by purpose
- **Hooks:** Custom hooks for data fetching (useMetrics), state management (useFilters, useAuth, useTier)
- **Theme:** MUI theme + color tokens (constants.js) + chart defaults
- **Key responsibility:** Render responsive, tier-aware dashboard with real-time filters

### Backend/src
Stateful event processing API that handles all webhooks and background jobs. Manages call lifecycle, AI processing, payment matching, calendar watches. Runs on port 8080. Processes events asynchronously, logs to audit trail.

- **Routes:** Webhook endpoints for calendar, transcript, payment + admin CRUD
- **Services:** State machine (CallStateManager), event handlers (Calendar/Transcript/Payment), AI pipeline (PromptBuilder/AIProcessor), background job (TimeoutService)
- **DB:** BigQuery writes (calls, objections, prospects, audit log, cost tracking)
- **Key responsibility:** Accept webhooks, apply business logic (state machine, AI, payments), durably write to BigQuery

## Key File Locations

**Entry Points:**
- `Frontend/server/index.js`: Starts Express dashboard API (port 3001)
- `Frontend/client/src/main.jsx`: React app entry
- `Frontend/client/index.html`: Vite entry HTML
- `Backend/src/index.js`: Starts Backend API (port 8080), TimeoutService job
- `Frontend/client/src/App.jsx`: Router definitions

**Configuration:**
- `Frontend/server/config/index.js`: Dashboard API config (load env vars)
- `Frontend/.env.example`: Dashboard env template
- `Backend/src/config/index.js`: Backend API config
- `Backend/.env.example`: Backend env template
- `Backend/src/config/*.js`: Categorical values (objection types, outcomes, etc.)

**Core Logic:**
- `Backend/src/services/CallStateManager.js`: Call lifecycle state machine
- `Backend/src/services/calendar/CalendarService.js`: Calendar event processing
- `Backend/src/services/transcript/TranscriptService.js`: Transcript handling + matching
- `Backend/src/services/ai/AIProcessor.js`: Claude API calls
- `Backend/src/services/TimeoutService.js`: Background ghost detection + channel renewal
- `Frontend/server/services/tokenManager.js`: Token generation/validation
- `Frontend/server/services/insightEngine.js`: AI-powered insights

**Testing:**
- `Backend/tests/scenarios/`: 48 end-to-end scenario tests (webhook → DB state verification)
- `Backend/tests/services/`: Unit tests per service
- `Backend/tests/helpers/fixtures/`: Sample webhook payloads

**Data Access:**
- `Backend/src/db/BigQueryClient.js`: Single entry point for all BigQuery operations
- `Backend/src/db/queries/*.js`: Role-based query modules (INSERT calls, UPDATE prospects, etc.)
- `Frontend/server/db/BigQueryClient.js`: Dashboard queries (aggregations)
- `Frontend/server/db/queries/*.js`: Per-page aggregation queries

## Naming Conventions

**Files:**
- React components: PascalCase (OverviewPage.jsx, Scorecard.jsx)
- JS modules: camelCase (callStateManager.js, tokenManager.js)
- Utilities: camelCase (dateUtils.js, idGenerator.js)
- Hooks: camelCase, `use` prefix (useMetrics.js, useFilters.js)
- Routes: kebab-case path segments but camelCase handlers
- Database migrations: NNNN_description.js (001_create_prospects.js)

**Directories:**
- PascalCase for feature domains (services/calendar/, services/transcript/)
- camelCase for generic utils (middleware/, config/, utils/)
- snake_case for database tables (Calls, Closers, Clients, Objections, Prospects, AuditLog)
- camelCase for database fields (client_id, appointment_date, call_outcome)

**Code:**
- React component props: camelCase
- Database column names: snake_case (matches BigQuery schema)
- Constants: UPPER_SNAKE_CASE (TRANSCRIPT_THRESHOLDS, STATE_TRANSITIONS)
- Config keys: snake_case (objection_types, call_outcomes)
- BigQuery identifiers: FullPath (`closer-automation.CloserAutomation.Calls`)

## Where to Add New Code

**New Client Dashboard Page:**
1. Create component: `Frontend/client/src/pages/client/MyNewPage.jsx`
2. Create API endpoint: `Frontend/server/routes/dashboard.js` + add new GET `/api/dashboard/mynew`
3. Add queries: `Frontend/server/db/queries/mynew.js` (if Dashboard) or add to Backend
4. Update routing: `Frontend/client/src/App.jsx` add route to ClientDashboardLayout
5. Update sidebar: `Frontend/client/src/components/layout/Sidebar.jsx` add nav item
6. Update tier config: `Frontend/shared/tierDefinitions.js` add page to appropriate tiers

**New Backend Service (Event Processor):**
1. Create service: `Backend/src/services/MyNewService.js`
2. Create webhook route: `Backend/src/routes/webhooks/mynew.js`
3. Create adapter (if needed): `Backend/src/services/mynew/adapters/MyProviderAdapter.js`
4. Wire into routes: `Backend/src/routes/index.js` register the webhook
5. Add config: `Backend/src/config/my-new-types.js` if needed
6. Create tests: `Backend/tests/scenarios/XX-my-scenario.test.js`

**New Transcript Provider:**
1. Create adapter: `Backend/src/services/transcript/adapters/MyProviderAdapter.js` (extends BaseTranscriptAdapter)
2. Implement: `normalize(rawPayload)` → StandardTranscript
3. Register: Update `Backend/src/config/transcript-providers.js`
4. Add test fixtures: `Backend/tests/helpers/fixtures/myprovider-webhook.json`
5. Create scenario tests: `Backend/tests/scenarios/XX-myprovider-transcript.test.js`

**New Calendar Provider:**
Same pattern as transcript providers, but in `services/calendar/adapters/`.

**Utility/Helper:**
1. For Frontend: Add to `Frontend/client/src/utils/myutil.js` or `Frontend/server/utils/myutil.js`
2. For Backend: Add to `Backend/src/utils/myutil.js`

## Special Directories

**Frontend/shared:**
- Purpose: Code shared between Express server and React client
- Generated: No
- Committed: Yes
- Examples: `tierDefinitions.js` (both server and client read this for tier logic)

**Backend/tests:**
- Purpose: Jest test suite with scenario-based testing
- Generated: No (fixtures are checked in)
- Committed: Yes (except node_modules)
- Structure: 48 scenarios (webhook → state verification) + unit tests + integration tests

**Frontend/client/dist:**
- Purpose: Vite build output (compiled React SPA)
- Generated: Yes (`npm run build`)
- Committed: No (.gitignore)
- Used in production: Express serves index.html for SPA routing + static assets

**Backend/src/db/migrations:**
- Purpose: Schema version control
- Pattern: Run in order (001, 002, 003, etc.)
- Each migration is a function that creates tables/columns/views
- Never modify past migrations — only add new ones

**Backend/.env / Frontend/.env:**
- Purpose: Runtime configuration (never committed)
- Generated: Developer creates from .example
- Contains: API keys, endpoints, timeouts, feature flags
- Protected: .gitignore prevents accidental commit

---

*Structure analysis: 2026-02-28*
