# Technology Stack

**Analysis Date:** 2026-02-28

## Languages

**Primary:**
- JavaScript/Node.js 22+ - Runtime for Express backend
- JavaScript/React 18 - Frontend UI framework

**Secondary:**
- SQL - BigQuery queries (parameterized, executed via Node.js client)

## Runtime

**Environment:**
- Node.js 22+ (Backend): `src/index.js` and `server/index.js` entry points
- Node.js 20+ (Frontend): `client/vite.config.js` for build tooling only

**Package Manager:**
- npm - Lock files: `package-lock.json` in both `Backend/` and `Frontend/`

## Frameworks

**Backend:**
- Express.js 4.21+ - HTTP server for webhooks, API endpoints, static file serving
- Google Cloud BigQuery Node.js SDK (`@google-cloud/bigquery` ^7.9.0) - Database operations
- Anthropic SDK (`@anthropic-ai/sdk` ^0.39.0) - AI transcript analysis

**Frontend:**
- React 18.2.0 - UI framework
- Vite 5.1.0 - Build tool with HMR
- React Router v6.22.0 - Client-side routing
- Material-UI (MUI) 5.15.10 - Component library
- MUI X Charts 7.5.1 - Charting library (line, bar, pie, funnel)
- MUI X Date Pickers 7.5.0 - Date input components
- MUI X Data Grid 7.5.0 - Table component

**Testing:**
- Jest 29.7.0 - Test runner (Backend only)
- Supertest 7.0.0 - HTTP assertion library

**Build/Dev:**
- Nodemon 3.1.9 - Auto-restart during development
- ESLint 9.19.0 - Code linting (Backend)

## Key Dependencies

**Critical:**

**Backend:**
- `@anthropic-ai/sdk` ^0.39.0 - Core AI functionality for transcript analysis
- `@google-cloud/bigquery` ^7.9.0 - BigQuery client for all database operations
- `express` ^4.21.2 - HTTP server framework
- `helmet` ^8.0.0 - Security headers
- `cors` ^2.8.5 - CORS middleware
- `dotenv` ^16.4.7 - Environment variable loading
- `uuid` ^11.1.0 - UUID generation for IDs
- `winston` ^3.17.0 - Structured logging
- `morgan` ^1.10.0 - HTTP request logging
- `googleapis` ^144.0.0 - Google Calendar API client

**Frontend:**
- `react` ^18.2.0 - UI framework
- `@emotion/react` ^11.11.3 and `@emotion/styled` ^11.11.0 - CSS-in-JS for MUI theming
- `@mui/material` ^5.15.10 - Core UI components
- `@mui/x-charts` 7.5.1 - Chart visualizations
- `@mui/x-data-grid` 7.5.0 - Table component
- `@tanstack/react-query` ^5.24.0 - Server state management and data fetching
- `react-router-dom` ^6.22.0 - Routing
- `dayjs` ^1.11.10 - Date/time utilities

**Infrastructure:**
- `morgan` ^1.10.0 - Request logging and monitoring
- `compression` ^1.7.4 - Response compression middleware (Frontend server)

## Configuration

**Environment Variables (.env):**
Located at repository root. Template at `.env.example`

**Key required vars:**
- `GCP_PROJECT_ID` - Google Cloud project (default: `closer-automation`)
- `BQ_DATASET` - BigQuery dataset (default: `CloserAutomation`)
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to GCP service account JSON (or base64 in env var)
- `ANTHROPIC_API_KEY` - API key for Claude transcript analysis
- `ADMIN_API_KEY` - Bearer token for admin API access
- `PORT` - Server port (default: 8080)
- `NODE_ENV` - `production` or `development`
- `BASE_URL` - Full API URL for webhooks

**Optional config vars:**
- `AI_MODEL` - Claude model ID (default: `claude-sonnet-4-5-20250929`)
- `AI_MAX_TOKENS` - Max output tokens (default: 8000)
- `TRANSCRIPT_TIMEOUT_MINUTES` - Timeout for missing transcripts (default: 120)
- `GHOST_CHECK_INTERVAL_MINUTES` - TimeoutService polling interval (default: 30)
- `GOOGLE_CALENDAR_WEBHOOK_URL` - Webhook URL for Calendar push notifications
- `GOOGLE_CALENDAR_CREDENTIALS` - Google OAuth2 credentials (JSON string)
- `ALERT_SLACK_WEBHOOK` - Slack webhook for error alerts (optional)
- `ALERT_EMAIL` - Email for alerts (optional)

**Build Config:**
- `Frontend/client/vite.config.js` - Vite configuration with React plugin, dev proxy to `http://localhost:3001/api`
- `Backend/Dockerfile` - Multi-stage Node 22 Alpine build
- `Frontend/Dockerfile` - Multi-stage: builds React with Node 20, serves with Node 20 Express
- `Backend/cloudbuild.yaml` - GCP Cloud Build configuration
- `Frontend/cloudbuild.yaml` - GCP Cloud Build configuration

## Platform Requirements

**Development:**
- Node.js 20+ (Frontend client dev server)
- Node.js 22+ (Backend server)
- npm for package management
- Git for version control
- GCP project with BigQuery dataset and service account credentials
- Anthropic API key for Claude access

**Production:**
- Google Cloud Run (hosting platform)
- Docker (containerization - built automatically by Cloud Build)
- BigQuery in `closer-automation` GCP project
- Anthropic Claude API (SaaS)
- Google Calendar API (for push notifications)

## External SDKs & APIs Used

**Cloud Infrastructure:**
- Google Cloud BigQuery - Data warehouse and SQL execution
- Google Cloud Run - Serverless container hosting
- Google Cloud Secret Manager - Credential storage
- Google Cloud Tasks - Async job queue (configured but not active in MVP)

**AI Services:**
- Anthropic Claude Sonnet - Transcript analysis and scoring
  - Model: `claude-sonnet-4-5-20250929` (configurable)
  - Max tokens: 8000 (configurable)
  - Pricing tracked in `CostTracking` table

**Calendar Integration:**
- Google Calendar API - Push notifications, event fetching (via `googleapis` SDK)
- Google OAuth2 - Authentication for calendar access

**Third-party Transcript Providers (webhook consumers):**
- Fathom - Webhook consumer, transcript polling via FathomAPI
- tl;dv - Webhook consumer
- Otter.ai - Webhook consumer
- Read.ai - Webhook consumer
- Generic/Custom - Standardized JSON payload

---

*Stack analysis: 2026-02-28*
