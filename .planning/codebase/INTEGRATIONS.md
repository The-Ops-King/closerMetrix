# External Integrations

**Analysis Date:** 2026-02-28

## APIs & External Services

**AI Analysis:**
- Anthropic Claude - Analyzes transcripts, extracts objectives, scores calls, detects objections
  - SDK: `@anthropic-ai/sdk` 0.39.0
  - Model: `claude-sonnet-4-5-20250929` (configurable via `AI_MODEL` env var)
  - Auth: `ANTHROPIC_API_KEY` environment variable
  - Endpoints used:
    - `POST /messages` - Send transcript for analysis
  - Response handling: `AIProcessor.js` parses response, `ResponseParser.js` validates
  - Cost tracking: Every call logged to `CostTracking` BigQuery table via `CostTracker.js`
  - Location: `Backend/src/services/ai/AIProcessor.js`

**Calendar Integration:**
- Google Calendar API - Push notifications for call scheduling
  - SDK: `googleapis` 144.0.0
  - Auth: OAuth2 credentials in `GOOGLE_CALENDAR_CREDENTIALS` env var (JSON string)
  - Webhook endpoint: `POST /webhooks/calendar/:clientId`
  - Push notification headers validated: `X-Goog-Channel-Token`, `X-Goog-Channel-ID`
  - Usage: Calendar watch setup, event fetching for closed/canceled/moved events
  - Location: `Backend/src/services/calendar/GoogleCalendarAdapter.js`, `Backend/src/services/calendar/GoogleCalendarPush.js`

**Transcript Providers (Webhooks):**

**Fathom:**
- Provides call recordings and transcripts via webhook
- Webhook endpoint: `POST /webhooks/transcript/fathom`
- Auth: Per-closer API key stored in `Closers.transcript_api_key`
- Payload format: Includes `recorded_by.email`, `calendar_invitees[]`, `transcript` (array), `recording_url`, `share_url`
- Fallback polling: If transcript is null in webhook, `FathomAPI.js` polls `GET /recordings/{id}/transcript` with exponential backoff
- Location: `Backend/src/services/transcript/adapters/FathomAdapter.js`, `Backend/src/services/transcript/FathomAPI.js`
- Normalization: Converts Fathom transcript format (speaker/text/timestamp objects) to StandardTranscript via adapter

**tl;dv:**
- Provides meeting transcripts via webhook
- Webhook endpoint: `POST /webhooks/transcript/tdlv`
- Auth: API key in request header
- Payload format: Meeting object with `happenedAt`, `organizer`, `invitees`, transcript data
- Location: `Backend/src/services/transcript/adapters/TLDVAdapter.js`

**Otter.ai:**
- Transcript provider webhook
- Webhook endpoint: `POST /webhooks/transcript/otter`
- Location: Adapter ready (not fully implemented)

**Read.ai:**
- Transcript provider webhook
- Webhook endpoint: `POST /webhooks/transcript/readai`
- Location: Adapter ready (not fully implemented)

**Generic Provider:**
- Standardized JSON webhook format for any provider
- Webhook endpoint: `POST /webhooks/transcript/generic`
- Expected fields: `client_id`, `closer_email`, `prospect_email`, `scheduled_start_time`, `transcript`, `recording_url`
- Location: `Backend/src/services/transcript/adapters/GenericAdapter.js`

**Payment Processing:**
- Webhook endpoint: `POST /webhooks/payment` - Client's automation (Zapier, Make) sends payment notifications
- Auth: Per-client webhook secret stored in `Clients.webhook_secret`
- Payload format: `client_id`, `prospect_email`, `prospect_name`, `payment_amount`, `payment_date`, `payment_type`
- Valid payment types: `full`, `deposit`, `payment_plan`, `refund`, `chargeback`
- Usage: Triggers prospect record creation/update and call outcome transitions
- Location: `Backend/src/routes/webhooks/payment.js`, `Backend/src/services/PaymentService.js`

## Data Storage

**Databases:**
- Google BigQuery (Production data warehouse)
  - Connection: `@google-cloud/bigquery` SDK
  - Project: `closer-automation`
  - Dataset: `CloserAutomation`
  - Service account auth: `GOOGLE_APPLICATION_CREDENTIALS` pointing to service account JSON
  - All queries use parameterized statements with `@paramName` syntax for safety
  - Client: `BigQueryClient.js` - Singleton that enforces client isolation
  - Location: `Backend/src/db/BigQueryClient.js`

**Tables:**
- Base tables (existing, preserve): `Calls`, `Closers`, `Clients`, `Objections`
- New tables created: `Prospects`, `AuditLog`, `CostTracking`, `AccessTokens` (planned)
- Read-only views: `v_calls_joined_flat_prefixed`, `v_objections_joined`, `v_calls_with_objection_counts`, `v_funnel_calls_all_types`, `v_close_cycle_stats_dated`

**File Storage:**
- Local filesystem only - recordings/transcripts stored as URLs pointing to Fathom/tl;dv/provider's servers
- No file upload endpoint - system receives URLs and metadata via webhooks

**Caching:**
- In-memory config loading (environment variables, objection types, call outcomes, etc.)
- No Redis or external cache - all data lives in BigQuery
- Frontend uses TanStack Query (React Query) for client-side caching

## Authentication & Identity

**Admin Access:**
- Method: Bearer token in `Authorization` header
- Source: `ADMIN_API_KEY` environment variable (single static key for Tyler)
- Middleware: `Backend/src/middleware/webhookAuth.js` validates on `/admin/*` routes

**Client Access:**
- Method: Shared secret token-based (future: OAuth2)
- Source: Token stored in `AccessTokens` table (planned)
- Currently: Uses `X-Client-Token` header (plan for MVP)
- Frontend sends token with every API request via custom headers
- No login required - token is the authentication

**Partner Access:**
- Method: Bearer token for partner role (planned)
- Scope: Limited to assigned client IDs

**Webhook Authentication:**
- Google Calendar: `X-Goog-Channel-Token` header matches channel ID
- Fathom: Optional webhook signature validation (not enforced in MVP)
- Generic payment: `Authorization: Bearer {webhook_secret}` per client
- Location: `Backend/src/middleware/webhookAuth.js`

**Service Account Auth:**
- GCP service account credentials for BigQuery and Calendar API access
- Stored as `GOOGLE_APPLICATION_CREDENTIALS` env var (path to JSON or base64-encoded)
- Scopes: BigQuery, Google Calendar

## Monitoring & Observability

**Error Tracking:**
- Winston structured logging to console/stdout (Cloud Run captures this)
- AlertService with pluggable channels
  - Console logging (always enabled)
  - Slack webhook (optional: `ALERT_SLACK_WEBHOOK` env var)
  - Email via SendGrid (optional: `SENDGRID_API_KEY` env var)
- Location: `Backend/src/utils/logger.js`, `Backend/src/utils/AlertService.js`

**Logs:**
- Structured JSON logging via Winston
- Request logging: All HTTP requests via Morgan middleware
- Query logging: BigQuery operations
- Audit trail: All state changes logged to `AuditLog` table
- Location: `Backend/src/utils/logger.js`, `Backend/src/middleware/requestLogger.js`, `Backend/src/utils/AuditLogger.js`

**Cost Tracking:**
- Every Anthropic API call records: input tokens, output tokens, calculated cost
- Stored in `CostTracking` BigQuery table
- Aggregatable by date, client, call
- Location: `Backend/src/utils/CostTracker.js`

## CI/CD & Deployment

**Hosting:**
- Google Cloud Run (serverless containers)
- Projects: `closer-automation` GCP project
- Region: `us-central1` (configurable via `GCP_LOCATION` env var)

**CI Pipeline:**
- Google Cloud Build (automated)
- Trigger: Git push to main branch
- Builds:
  - Backend: Reads `Backend/cloudbuild.yaml`, builds `node:22-alpine` Docker image, pushes to GCR, deploys service
  - Frontend: Reads `Frontend/cloudbuild.yaml`, builds React SPA + Express server in multi-stage Dockerfile

**Deployment:**
- Backend: `gcloud builds submit --config Backend/cloudbuild.yaml`
- Frontend: `gcloud builds submit --config Frontend/cloudbuild.yaml`
- Environment variables configured in Cloud Run service UI or via `gcloud run deploy --set-env-vars`

**Docker:**
- Backend: Multi-stage build, final image `node:22-alpine`, ~100MB
- Frontend: Multi-stage build, final image `node:20-alpine` with built React assets, ~150MB

## Environment Configuration

**Required Environment Variables:**
- `GCP_PROJECT_ID` - Google Cloud project ID
- `BQ_DATASET` - BigQuery dataset name
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to service account JSON
- `ANTHROPIC_API_KEY` - Anthropic API key
- `ADMIN_API_KEY` - Admin bearer token

**Optional but Recommended:**
- `NODE_ENV` - `production` or `development`
- `PORT` - Server port (default: 8080)
- `BASE_URL` - Full API URL for webhook registration
- `AI_MODEL` - Claude model ID
- `TRANSCRIPT_TIMEOUT_MINUTES` - Timeout before ghosted
- `GOOGLE_CALENDAR_WEBHOOK_URL` - Webhook URL for Calendar push

**Secrets Location:**
- Development: `.env` file in repo root (NOT committed)
- Production: Google Cloud Secret Manager, passed to Cloud Run via environment variables
- Credentials: Stored as Secret Manager secrets, fetched at container startup

## Webhooks & Callbacks

**Incoming Webhooks (CloserMetrix receives):**

| Webhook | Source | Endpoint | Trigger |
|---------|--------|----------|---------|
| Calendar Event | Google Calendar | `POST /webhooks/calendar/:clientId` | Event created/updated/deleted/declined |
| Fathom Transcript | Fathom | `POST /webhooks/transcript/fathom` | Recording processing complete |
| tl;dv Transcript | tl;dv | `POST /webhooks/transcript/tdlv` | Meeting processing complete |
| Generic Transcript | Any Provider | `POST /webhooks/transcript/generic` | Client's automation sends transcript |
| Payment | Client's Automation | `POST /webhooks/payment` | Payment received via Stripe/PayPal/etc |

**Outgoing Webhooks (CloserMetrix sends) - Planned:**
- Email wrapups: SendGrid API
- Slack notifications: Slack incoming webhooks
- CRM note writing: Zapier/Make/native API
- Payment processor callbacks: Stripe/PayPal (TBD)

**Webhook Security:**
- HTTPS only in production (Cloud Run enforces)
- Per-client webhook secrets stored in database
- Request signature validation (Fathom, Google Calendar, custom)
- Rate limiting: Not implemented (can add via middleware)

---

*Integration audit: 2026-02-28*
