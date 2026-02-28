# Architecture

**Analysis Date:** 2026-02-28

## Pattern Overview

**Overall:** Distributed monorepo with two independently deployable services (Frontend and Backend) communicating via REST APIs. Both services enforce strict client data isolation through request-level middleware and database-level query filters.

**Key Characteristics:**
- Layered architecture (HTTP → middleware → route → service → database)
- Adapter pattern for pluggable integrations (transcript providers, calendar sources)
- State machine design for call lifecycle management
- Event-driven processing with webhook handlers
- Configuration-driven system (all categorical values in config files, not hardcoded)

## Layers

**Presentation Layer:**
- Purpose: Browser-facing React SPA with responsive UI for three user types (Admin, Partner, Client)
- Location: `Frontend/client/src/`
- Contains: Page components, theme configuration, hooks, context providers
- Depends on: Express API (`/api/*` endpoints)
- Used by: End users (clients), Tyler (admin), partners

**API/Routing Layer:**
- Purpose: Handles HTTP requests, parameter validation, middleware chain, route delegation
- Location: `Frontend/server/routes/` (Dashboard API) and `Backend/src/routes/` (Event processing)
- Contains: Route definitions, request/response serialization
- Depends on: Services, middleware, database
- Used by: Frontend SPA, external systems (webhooks)

**Middleware Layer:**
- Purpose: Cross-cutting concerns applied to all or specific routes
- Location: `Frontend/server/middleware/` and `Backend/src/middleware/`
- Key middleware:
  - `clientIsolation.js`: Resolves token/auth → `client_id`, injects into request
  - `tierGate.js`: Checks `plan_tier`, returns 403 for tier-restricted endpoints
  - `adminAuth.js`: Validates `X-Admin-Key` header
  - `errorHandler.js`: Global error catching and formatting
  - `webhookAuth.js`: Validates webhook signatures
- Used by: All route handlers

**Service/Business Logic Layer:**
- Purpose: Orchestrates complex workflows independent of HTTP
- Location: `Frontend/server/services/` and `Backend/src/services/`
- Frontend services:
  - `tokenManager.js`: Generate/validate/revoke client access tokens
  - `insightEngine.js`: AI-powered insight generation (chat bubble insights)
- Backend services:
  - `CallStateManager.js`: State machine for call lifecycle
  - `CalendarService.js`: Normalizes calendar events from multiple sources
  - `TranscriptService.js`: Normalizes transcripts, matches to calls
  - `AIProcessor.js`: Sends transcripts to Claude, parses responses
  - `PaymentService.js`: Matches payments to prospects/calls
  - `ProspectService.js`: Manages prospect records
  - `TimeoutService.js`: Background job for ghost detection, channel renewal
  - `FathomAPI.js`: Polls Fathom transcript API with exponential backoff
- Depends on: Database, external APIs (Anthropic, Google Calendar, Fathom)
- Used by: Routes, other services

**Data Layer:**
- Purpose: All database operations with parameterized queries and client isolation enforcement
- Location: `Backend/src/db/BigQueryClient.js` (main interface)
- Query files: `Backend/src/db/queries/*.js` (role-based queries)
- Contains: Connection pooling, parameterized query execution, transaction handling
- Depends on: Google BigQuery SDK
- Used by: Services, routes (indirectly via services)

**Infrastructure/Utilities:**
- Purpose: Cross-cutting utilities and system integrations
- Location: `Backend/src/utils/` and `Frontend/server/utils/`
- Key utilities:
  - `AuditLogger.js`: Logs every state change to BigQuery audit trail
  - `CostTracker.js`: Tracks AI API costs per call/client
  - `AlertService.js`: Sends error alerts (console, Slack, email)
  - `logger.js`: Structured logging
  - `idGenerator.js`: UUID generation
  - `dateUtils.js`: Timezone conversions, UTC normalization

## Data Flow

### Client Dashboard Request Flow (Frontend)

```
User opens https://app.closermetrix.com/d/{token}
        ↓
React Router matches /d/:token route
        ↓
OverviewPage component mounts
        ↓
useAuth hook validates token via GET /api/auth/validate?token={token}
        ↓
tokenManager.validateToken(token) → resolves to {client_id, tier, closers[]}
        ↓
AuthContext stores auth state (client_id, tier, token) in React context
        ↓
useMetrics hook fetches dashboard data via GET /api/dashboard/overview?dateStart=...&dateEnd=...&closerId=...
        ↓
clientIsolation middleware injects client_id into request context
        ↓
tierGate middleware checks tier ≥ required_tier (returns 403 if not)
        ↓
dashboard.js route calls overview queries from Frontend/server/db/queries/
        ↓
Queries execute with client_id filter in WHERE clause (Backend integration)
        ↓
Response: { sections: {...scorecards...}, charts: {...chart data...}, meta: {...} }
        ↓
Frontend renders Scorecard components, ChartWrapper + chart data
```

### Webhook-to-BigQuery Flow (Backend)

**Calendar Event Webhook:**
```
Google Calendar (or Fathom) sends POST /webhooks/calendar/:clientId
        ↓
CalendarService.handleEvent(rawEvent) normalizes to StandardCalendarEvent
        ↓
Identifies closer by comparing calendar email to Closers.work_email
        ↓
CallStateManager.createOrUpdateCall() checks for duplicates, determines call_type
        ↓
Call record inserted into BigQuery with attendance: 'null' or state transition triggered
        ↓
AuditLogger records: { entity_type: 'call', action: 'created', trigger_source: 'calendar_webhook' }
```

**Transcript Webhook:**
```
Fathom (or other provider) sends POST /webhooks/transcript/fathom
        ↓
FathomAdapter.normalize(payload) converts to StandardTranscript
        ↓
TranscriptService.matchTranscriptToCall() finds matching Call record by time window + emails
        ↓
TranscriptEvaluator.evaluate() determines if 2+ speakers (Show) or empty/1 speaker (Ghosted)
        ↓
If Show: AIProcessor.analyze(transcript, clientId) sends to Claude with client-specific prompts
        ↓
ResponseParser validates objection_types, call_outcomes, scores against config
        ↓
Call updated: { attendance: 'Show', call_outcome: '...', scores: {...}, objections: [...] }
        ↓
Objections written to Objections table (one row per objection from AI response)
        ↓
CostTracker records: { input_tokens, output_tokens, cost_usd, call_id }
        ↓
AuditLogger records full call state transition
```

**Payment Webhook:**
```
Client's automation sends POST /webhooks/payment with { client_id, prospect_email, payment_amount, ... }
        ↓
PaymentService.processPayment() creates or updates Prospect record
        ↓
Finds most recent Call with attendance='Show' for this prospect
        ↓
If Call.call_outcome = 'Follow Up' or 'Lost' → updates to 'Closed - Won'
        ↓
Call updated: { call_outcome: 'Closed - Won', revenue_generated: X, cash_collected: Y, date_closed: ... }
        ↓
AuditLogger records payment received and outcome change
```

### Background Job Flow (TimeoutService)

Runs every 5 minutes (configurable):

```
Phase 1: Identify calls past appointment end time
         ↓
         Query: SELECT * FROM Calls WHERE appointment_end_date < NOW() AND attendance IN ('null', 'Scheduled', 'Waiting for Outcome')
         ↓
         Update attendance: null/Scheduled → 'Waiting for Outcome'
         ↓
Phase 1.5: Poll Fathom API for missing recordings (closers with transcript_api_key)
         ↓
         For each Fathom-using closer, query Fathom /recordings endpoint with time filter
         ↓
         If recording found matching waiting call: enqueue transcript processing
         ↓
Phase 2: Check timeout threshold on 'Waiting for Outcome' calls
         ↓
         Query: SELECT * FROM Calls WHERE attendance='Waiting for Outcome' AND TIMESTAMP_DIFF(NOW(), appointment_end_date, MINUTE) > TRANSCRIPT_TIMEOUT_MINUTES
         ↓
         Update attendance → 'Ghosted - No Show'
         ↓
Renewal: Check Calendar push notification channels for expiry
         ↓
         Query: SELECT * FROM calendar_watch_channels WHERE expires_at < NOW() + 1 DAY
         ↓
         Call GoogleCalendarPush.renewWatch() to refresh channels
```

**State Management:**
- Call state machine enforces valid transitions only
- Every state change is logged in AuditLog with before/after values
- No state change happens without explicit trigger (calendar event, transcript, payment, timeout, AI outcome)
- If processing fails, call stays in current state with `processing_status: 'error'` and `processing_error: string`

## Key Abstractions

### Call Record (Entity)
- **Purpose:** Represents a scheduled/completed sales conversation
- **Examples:** `Backend/src/db/Calls.js` table, `Backend/src/services/CallStateManager.js` logic
- **Pattern:** State machine with transitions defined in `CallStateManager.STATE_TRANSITIONS`
- **Lifecycle:** Created by calendar event → evaluated by transcript → outcome set by AI or payment

### Standard Formats (Adapters)
- **Purpose:** Abstract away provider-specific webhook formats, normalize to canonical internal format
- **Examples:**
  - `StandardCalendarEvent` (implemented in `GoogleCalendarAdapter.js`, `CalendlyAdapter.js` stub)
  - `StandardTranscript` (implemented in `FathomAdapter.js`, `OtterAdapter.js` stub, `GenericAdapter.js`)
- **Pattern:** Each adapter extends `BaseCalendarAdapter` or `BaseTranscriptAdapter`, implements `normalize()` method
- **Usage:** `CalendarService` and `TranscriptService` route to the right adapter based on config

### Client Isolation
- **Purpose:** Guarantee no client sees another client's data
- **Examples:** Every query in `Backend/src/db/queries/*.js` includes `WHERE client_id = @clientId`
- **Pattern:**
  - Frontend: Middleware `clientIsolation.js` resolves token → `client_id`, injects into request
  - Backend: `BigQueryClient.runQuery()` requires `clientId` parameter, throws if missing
  - Database: Views use prefixed columns, base table queries parameterized
- **Enforcement:** Three layers (middleware, API, DB) with no layer skippable

### Tier System
- **Purpose:** Three-tier product (Basic, Insight, Executive) with feature gating
- **Examples:** `Frontend/client/src/theme/tierConfig.js`, `Frontend/server/middleware/tierGate.js`
- **Pattern:**
  - Frontend: Sidebar hides pages/components by tier (cosmetic)
  - API middleware: Returns 403 for tier-restricted endpoints
  - Database: Tier-specific query files execute only appropriate queries
- **Configuration:** `Frontend/shared/tierDefinitions.js` defines pages/filters per tier

## Entry Points

### Frontend

**Client Dashboard (`/d/:token`):**
- Location: `Frontend/client/src/App.jsx` (router setup)
- Route component: `Frontend/client/src/pages/client/ClientDashboardLayout.jsx`
- Triggers: User opens shared link or navigates to `/d/:token`
- Responsibilities:
  - Validate token via `/api/auth/validate`
  - Load AuthContext with client_id, tier, closers list
  - Render dashboard pages based on tier
  - Handle filter changes (date range, closer, etc.)

**Admin Dashboard (`/admin`):**
- Route component: `Frontend/client/src/pages/admin/AdminLogin.jsx` → `AdminDashboard.jsx`
- Triggers: Admin URL access after password entry
- Responsibilities:
  - Admin authentication (password → stored in sessionStorage)
  - List all clients with tier badges
  - View any client's dashboard
  - Generate/revoke access tokens
  - Change client tiers via API

**Partner Dashboard (`/partner/:token`):**
- Route component: `Frontend/client/src/pages/partner/PartnerDashboard.jsx`
- Triggers: Partner uses their unique token URL
- Responsibilities:
  - Show only assigned clients
  - View assigned client dashboards (read-only)
  - No admin controls (tier switching, token generation blocked)

### Backend

**Calendar Webhook (`POST /webhooks/calendar/:clientId`):**
- Location: `Backend/src/routes/webhooks/calendar.js`
- Triggers: Google Calendar push notification
- Responsibilities:
  - Verify channel token matches clientId
  - Parse calendar event (created/updated/cancelled/deleted)
  - Normalize via GoogleCalendarAdapter
  - Call CalendarService to determine if it's a sales call (filter word match)
  - Call CallStateManager to create/update call record
  - Return 200 immediately, process asynchronously

**Transcript Webhook (`POST /webhooks/transcript/:provider`):**
- Location: `Backend/src/routes/webhooks/transcript.js`
- Triggers: Fathom, Otter, Read.ai, or custom provider sends webhook
- Responsibilities:
  - Route to correct adapter (FathomAdapter, OtterAdapter, etc.)
  - Normalize transcript
  - Match transcript to existing call record (or create new)
  - Evaluate if Show vs Ghosted
  - If Show: enqueue AI processing
  - Return 200 immediately, continue asynchronously
  - If transcript is null (Fathom), enqueue FathomAPI polling job

**Payment Webhook (`POST /webhooks/payment`):**
- Location: `Backend/src/routes/webhooks/payment.js`
- Triggers: Client's automation sends payment notification
- Responsibilities:
  - Validate client_id and webhook_secret
  - Parse payment data
  - Create/update Prospect record
  - Update matching Call record (outcome, revenue, cash)
  - Record payment in audit log
  - Return 200

**Admin Endpoints (`/api/admin/*`):**
- Location: `Backend/src/routes/admin/*.js`
- Auth: Requires `Authorization: Bearer {ADMIN_API_KEY}`
- Responsibilities:
  - Create/read/update clients
  - Create/read/deactivate closers
  - Register calendar watches
  - System health checks
  - Cost tracking queries

**Dashboard Endpoints (`/api/dashboard/:section`):**
- Location: `Frontend/server/routes/dashboard.js`
- Auth: Requires valid client token in header or URL
- Responsibilities:
  - Resolve token → client_id, tier
  - Validate tier ≥ required_tier for section
  - Execute appropriate queries via Backend API proxy or direct BigQuery
  - Return aggregated data (scorecards, charts, tables)

## Error Handling

**Strategy:** Fail gracefully, preserve data, alert operator

**Patterns:**
- Try/catch on all async operations (webhooks, AI processing, database calls)
- If processing fails, record error in call record: `{ processing_status: 'error', processing_error: 'message' }`
- Log to AuditLog with action='error' and error details
- Alert via AlertService (severity: critical/high/medium/low)
- Return HTTP 200 for webhooks even if processing failed (prevents retry loops)
- Return HTTP 5xx for API requests (client can retry)

**Example (Transcript Processing Failure):**
```javascript
try {
  const analysis = await aiProcessor.analyze(transcript);
} catch (error) {
  // 1. Update call record to show error
  await callStateManager.updateCall(callId, {
    processing_status: 'error',
    processing_error: error.message
  });

  // 2. Log the failure
  await auditLogger.log({
    entity_type: 'call',
    entity_id: callId,
    action: 'error',
    trigger_source: 'ai_processing',
    metadata: { error: error.message }
  });

  // 3. Alert Tyler
  await alertService.send({
    severity: 'high',
    title: 'AI Processing Failed',
    details: `Call ${callId} failed to process`
  });
}
```

## Cross-Cutting Concerns

**Logging:**
- Structured JSON logging via `logger.js`
- Every request logged with method, path, status, duration
- Every error logged with full stack trace, context
- Sensitive data (tokens, emails) partially masked in logs

**Validation:**
- Input validation at route level (required fields, types)
- Output validation via `ResponseParser.js` (AI response has required fields)
- Query parameter validation (date ranges, pagination limits)
- Webhook signature validation where applicable

**Authentication:**
- Frontend: Token-based (shared secret link), stored in `AuthContext`
- Admin: API key in `X-Admin-Key` header, stored in sessionStorage on frontend
- Partner: Partner token → resolved to allowed `client_ids`
- All tokens validated on every request to stateless services

**Authorization:**
- Token → client_id mapping enforced at middleware level
- Tier checks enforce feature access (middleware returns 403 if tier insufficient)
- Client isolation enforced at database query level (parameterized with `client_id`)

---

*Architecture analysis: 2026-02-28*
