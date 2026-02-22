# CLOSERMETRIX — NODE.JS BACKEND

## READ THIS FIRST

You are building the backend engine for **CloserMetrix**, a sales call intelligence platform. This document is your single source of truth. Read it completely before writing any code. If something contradicts this document, this document wins.

**Your job:** Build a production-grade Node.js/Express API that replaces an n8n automation system. This system ingests calendar events and call transcripts, processes them through AI, stores structured data in Google BigQuery, and serves as the backbone for a sales intelligence dashboard.

**The human building this (Tyler) is a solo founder.** He codes in JavaScript. He needs this documented so thoroughly that anyone could pick it up and understand the entire system in 10 minutes. Comment everything. Document every decision. Make every function self-explanatory.

---

## TABLE OF CONTENTS

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Directory Structure](#3-directory-structure)
4. [Configuration System](#4-configuration-system)
5. [Database Schema](#5-database-schema)
6. [Call Lifecycle State Machine](#6-call-lifecycle-state-machine)
7. [Calendar Integration](#7-calendar-integration)
8. [Transcript Integration](#8-transcript-integration)
9. [AI Processing Pipeline](#9-ai-processing-pipeline)
10. [Payment Integration](#10-payment-integration)
11. [Client & Closer Onboarding](#11-client--closer-onboarding)
12. [Data Isolation & Security](#12-data-isolation--security)
13. [Audit Logging](#13-audit-logging)
14. [Error Handling & Alerting](#14-error-handling--alerting)
15. [Cost Tracking](#15-cost-tracking)
16. [API Endpoints Reference](#16-api-endpoints-reference)
17. [Test Scenarios](#17-test-scenarios)
18. [Future Expansion Notes](#18-future-expansion-notes)
19. [Build Order](#19-build-order)
20. [Coding Standards](#20-coding-standards)

---

## 1. PROJECT OVERVIEW

### What CloserMetrix Does

CloserMetrix automatically transforms sales calls into structured business intelligence. The flow is:

```
Calendar Event → Call Record Created in BigQuery
                        ↓
Transcript Arrives → Matched to Call Record
                        ↓
AI Analyzes Transcript → Scores, Objections, Outcomes extracted
                        ↓
All Data Written to BigQuery → Powers Looker Studio Dashboards
                        ↓
(Future) Email/Slack Wrapups → Pushed to managers & closers
```

There is also a parallel financial pipeline:

```
Payment Webhook → Matched to Prospect (by email + client_id)
                        ↓
Prospect Record Updated → total_cash_collected, payment_count, etc.
                        ↓
Most Recent Call Updated → call_outcome changed to "Closed - Won" if needed
                        ↓
Revenue fields on Call Record Updated → revenue_generated, cash_collected
```

The payment pipeline runs independently of the call pipeline. A payment can arrive hours or days after the call. The system matches by prospect email and updates both the Prospect record and the originating Call record.

### What This Node Project Replaces

This replaces an n8n workflow system that was fragile and hard to test. The n8n system had:
- Per-client listener workflows (Google Calendar triggers)
- A central handler workflow (business logic)
- Webhook endpoints for Fathom transcripts and payments
- Google Form-based onboarding

All of that logic now lives in this Node.js project.

### Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Runtime | Node.js 22+ | Tyler codes in JS, runs on Cloud Run |
| Framework | Express.js | Simple, well-documented, lightweight |
| Database | Google BigQuery | Already in use, all existing data lives here |
| AI | Anthropic Claude Sonnet | Best quality/cost ratio for transcript analysis |
| Hosting | Google Cloud Run | Already has `closer-automation` project set up |
| Calendar | Google Calendar API (Push Notifications) | Real-time, reliable |
| Future Dashboard | React (self-hosted) | Will replace Looker Studio eventually |

### GCP Project

- **Project ID:** `closer-automation`
- **Dataset:** `CloserAutomation`
- **Full table paths:** `closer-automation.CloserAutomation.{TableName}`

---

## 2. ARCHITECTURE

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    INGESTION LAYER                       │
│                                                         │
│  Google Calendar ──→ /webhooks/calendar/:clientId        │
│  Fathom ──────────→ /webhooks/transcript/fathom          │
│  Otter ───────────→ /webhooks/transcript/otter           │
│  Read.ai ─────────→ /webhooks/transcript/readai          │
│  TDLV ────────────→ /webhooks/transcript/tdlv            │
│  Generic ─────────→ /webhooks/transcript/generic         │
│  Payments ────────→ /webhooks/payment                    │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                   PROCESSING LAYER                       │
│                                                         │
│  CalendarService ──→ Normalizes calendar events          │
│  TranscriptService → Normalizes transcripts              │
│  CallStateManager ─→ State machine for call lifecycle    │
│  AIProcessor ──────→ Sends to Claude, parses response    │
│  ObjectionExtractor → Writes objections to BigQuery      │
│  PaymentProcessor ─→ Matches payments to prospects/calls │
│  ProspectService ──→ Manages prospect lifecycle          │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                    DATA LAYER                            │
│                                                         │
│  BigQueryClient ───→ All reads/writes to BigQuery        │
│  AuditLogger ──────→ Every state change is logged        │
│  CostTracker ──────→ Tracks AI processing costs          │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                    ADMIN LAYER                           │
│                                                         │
│  /admin/clients ───→ Onboard/manage clients              │
│  /admin/closers ───→ Onboard/manage closers              │
│  /admin/health ────→ System health & diagnostics         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Key Architectural Principles

1. **Configuration over hardcoding.** Every list, threshold, category, and setting lives in config files. Nothing is buried in business logic.
2. **Pluggable adapters.** Calendar sources and transcript providers use adapter patterns. Adding a new one means adding one file.
3. **Strict client isolation.** Every query, every write, every log entry includes `client_id`. There is no path to cross-client data leakage.
4. **Idempotent operations.** Duplicate webhooks, late-arriving data, out-of-order events — the system handles all of these gracefully.
5. **Audit everything.** Every state transition is logged with before/after state, timestamp, and trigger source.
6. **Fail gracefully.** If AI processing fails, the call record is preserved with `processing_status: 'error'`. Nothing is silently lost.

---

## 3. DIRECTORY STRUCTURE

```
closermetrix-api/
├── CLAUDE.md                          # THIS FILE — read first
├── README.md                          # Setup & deployment instructions
├── package.json
├── .env.example                       # Template for environment variables
├── .gcloudignore
│
├── src/
│   ├── index.js                       # Entry point — starts Express server
│   ├── app.js                         # Express app setup, middleware, routes
│   │
│   ├── config/                        # ALL configurable values live here
│   │   ├── index.js                   # Main config loader (reads .env + defaults)
│   │   ├── objection-types.js         # Standardized objection categories
│   │   ├── call-outcomes.js           # Valid call outcome values
│   │   ├── attendance-types.js        # Valid attendance status values
│   │   ├── call-types.js              # First Call, Follow Up, etc.
│   │   ├── risk-categories.js         # FTC/SEC risk categories (future)
│   │   ├── scoring-rubric.js          # AI scoring guidelines (1-10 scale)
│   │   ├── transcript-providers.js    # Supported transcript providers + config
│   │   └── calendar-providers.js      # Supported calendar sources + config
│   │
│   ├── routes/                        # Express route definitions
│   │   ├── webhooks/
│   │   │   ├── calendar.js            # POST /webhooks/calendar/:clientId
│   │   │   ├── transcript.js          # POST /webhooks/transcript/:provider
│   │   │   └── payment.js             # POST /webhooks/payment
│   │   ├── admin/
│   │   │   ├── clients.js             # CRUD for clients
│   │   │   ├── closers.js             # CRUD for closers
│   │   │   └── health.js              # System health checks
│   │   └── index.js                   # Route aggregator
│   │
│   ├── services/                      # Business logic (NO Express req/res here)
│   │   ├── calendar/
│   │   │   ├── CalendarService.js     # Orchestrates calendar event handling
│   │   │   ├── adapters/
│   │   │   │   ├── GoogleCalendarAdapter.js
│   │   │   │   ├── CalendlyAdapter.js       # Stub — future
│   │   │   │   ├── GHLAdapter.js            # Stub — future
│   │   │   │   └── BaseCalendarAdapter.js   # Interface definition
│   │   │   └── GoogleCalendarPush.js  # Push notification setup & renewal
│   │   │
│   │   ├── transcript/
│   │   │   ├── TranscriptService.js   # Orchestrates transcript handling
│   │   │   └── adapters/
│   │   │       ├── FathomAdapter.js
│   │   │       ├── OtterAdapter.js
│   │   │       ├── ReadAIAdapter.js
│   │   │       ├── TDLVAdapter.js
│   │   │       ├── GenericAdapter.js
│   │   │       └── BaseTranscriptAdapter.js  # Interface definition
│   │   │
│   │   ├── ai/
│   │   │   ├── AIProcessor.js         # Sends transcript to Claude, parses response
│   │   │   ├── PromptBuilder.js       # Builds the AI prompt from client config
│   │   │   └── ResponseParser.js      # Validates & normalizes AI response
│   │   │
│   │   ├── CallStateManager.js        # THE CORE — call lifecycle state machine
│   │   ├── PaymentService.js          # Matches payments to prospects/calls
│   │   ├── ProspectService.js         # Manages prospect records
│   │   ├── OnboardingService.js       # Client & closer onboarding logic
│   │   └── TimeoutService.js          # Checks for calls awaiting transcripts
│   │
│   ├── db/
│   │   ├── BigQueryClient.js          # All BigQuery operations
│   │   ├── queries/                   # Parameterized SQL queries
│   │   │   ├── calls.js
│   │   │   ├── closers.js
│   │   │   ├── clients.js
│   │   │   ├── objections.js
│   │   │   ├── prospects.js
│   │   │   └── audit.js
│   │   └── migrations/                # Schema changes & new tables
│   │       ├── 001_create_prospects.js
│   │       ├── 002_create_audit_log.js
│   │       └── 003_create_cost_tracking.js
│   │
│   ├── middleware/
│   │   ├── clientIsolation.js         # Ensures client_id on every request
│   │   ├── errorHandler.js            # Global error handler
│   │   ├── requestLogger.js           # Logs all incoming requests
│   │   └── webhookAuth.js             # Validates webhook signatures
│   │
│   └── utils/
│       ├── AuditLogger.js             # Writes audit trail to BigQuery
│       ├── CostTracker.js             # Tracks AI processing costs
│       ├── AlertService.js            # Sends error alerts to Tyler
│       ├── dateUtils.js               # Timezone conversion, UTC normalization
│       └── idGenerator.js             # UUID generation
│
├── tests/
│   ├── scenarios/                     # The 48 test scenarios
│   │   ├── 01-scheduled-then-canceled.test.js
│   │   ├── 02-ghosted-no-show.test.js
│   │   ├── ... (one file per scenario)
│   │   └── 48-webhook-cant-determine-client.test.js
│   ├── services/                      # Unit tests per service
│   ├── integration/                   # End-to-end flow tests
│   └── helpers/
│       ├── mockBigQuery.js
│       ├── mockCalendar.js
│       └── fixtures/                  # Sample payloads per provider
│           ├── fathom-webhook.json
│           ├── otter-webhook.json
│           ├── google-calendar-created.json
│           ├── google-calendar-cancelled.json
│           └── google-calendar-updated.json
│
└── docs/
    ├── ARCHITECTURE.md                # Visual diagrams & explanations
    ├── STATE-MACHINE.md               # Call lifecycle documentation
    ├── ADDING-CALENDAR-PROVIDER.md    # How to add Calendly, GHL, etc.
    ├── ADDING-TRANSCRIPT-PROVIDER.md  # How to add a new transcript source
    ├── DEPLOYMENT.md                  # Cloud Run deployment steps
    └── TROUBLESHOOTING.md             # Common issues & fixes
```

---

## 4. CONFIGURATION SYSTEM

### Environment Variables (.env)

```bash
# ──────────────────────────────────────────
# GCP / BigQuery
# ──────────────────────────────────────────
GCP_PROJECT_ID=closer-automation
BQ_DATASET=CloserAutomation
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json

# ──────────────────────────────────────────
# Server
# ──────────────────────────────────────────
PORT=8080
NODE_ENV=production
BASE_URL=https://api.closermetrix.com

# ──────────────────────────────────────────
# Anthropic (AI Processing)
# ──────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-sonnet-4-20250514
AI_MAX_TOKENS=8000

# ──────────────────────────────────────────
# Google Calendar Push Notifications
# ──────────────────────────────────────────
GOOGLE_CALENDAR_WEBHOOK_URL=https://api.closermetrix.com/webhooks/calendar

# ──────────────────────────────────────────
# Alerting (Tyler's personal channels)
# ──────────────────────────────────────────
ALERT_EMAIL=tyler@closermetrix.com
ALERT_SLACK_WEBHOOK=https://hooks.slack.com/services/...

# ──────────────────────────────────────────
# Timeouts
# ──────────────────────────────────────────
TRANSCRIPT_TIMEOUT_MINUTES=120
GHOST_CHECK_INTERVAL_MINUTES=30
```

### Configurable Lists

**CRITICAL DESIGN PRINCIPLE:** Every categorical value (objection types, call outcomes, attendance types, etc.) is defined in its own config file as an exportable array/object. Business logic references these configs — never hardcoded strings.

#### src/config/objection-types.js
```javascript
/**
 * OBJECTION TYPES
 * 
 * These are the standardized categories for sales objections.
 * The AI processor is instructed to classify every objection into one of these types.
 * 
 * TO ADD A NEW TYPE: Add an entry to this array. The AI prompt is built dynamically
 * from this list, so no other code changes are needed.
 * 
 * TO REMOVE A TYPE: Remove the entry. Existing data with that type remains in BigQuery
 * but new objections won't be classified into it.
 */
module.exports = [
  { key: 'financial',     label: 'Financial',           description: 'Price too high, can\'t afford, budget concerns, payment plan needed' },
  { key: 'spouse',        label: 'Spouse/Partner',      description: 'Need to talk to spouse, partner not on board, family decision' },
  { key: 'think_about',   label: 'Think About It',      description: 'Need time to decide, want to think it over, not ready to commit today' },
  { key: 'timing',        label: 'Timing',              description: 'Not the right time, too busy, want to wait, bad season' },
  { key: 'trust',         label: 'Trust/Credibility',   description: 'Skeptical of results, seems too good to be true, want proof' },
  { key: 'already_tried', label: 'Already Tried',       description: 'Tried similar before and it didn\'t work, burned before' },
  { key: 'diy',           label: 'DIY',                 description: 'Can do it myself, don\'t need help, have the skills already' },
  { key: 'not_ready',     label: 'Not Ready',           description: 'Not at the right stage, need more preparation first' },
  { key: 'competitor',    label: 'Competitor',           description: 'Considering other options, already working with someone, comparing' },
  { key: 'authority',     label: 'Authority',            description: 'Not the decision maker, need approval from boss/board/partner' },
  { key: 'value',         label: 'Value',                description: 'Don\'t see the value, not sure it\'s worth it, ROI unclear' },
  { key: 'commitment',    label: 'Commitment',           description: 'Scared of long-term commitment, want flexibility, contract concerns' },
  { key: 'other',         label: 'Other',                description: 'Anything not fitting the above categories' },
];
```

#### src/config/call-outcomes.js
```javascript
/**
 * CALL OUTCOMES
 * 
 * Every call that gets AI-processed will be assigned one of these outcomes.
 * The AI is instructed to pick EXACTLY one.
 * 
 * TO ADD/REMOVE: Update this array. The AI prompt and all validation logic
 * reads from this config automatically.
 */
module.exports = [
  { key: 'closed_won',    label: 'Closed - Won',   description: 'Prospect fully committed and purchased' },
  { key: 'deposit',       label: 'Deposit',         description: 'Prospect made a partial payment with intent to pay remainder' },
  { key: 'follow_up',     label: 'Follow Up',       description: 'Prospect interested but did not commit, another call expected' },
  { key: 'lost',          label: 'Lost',             description: 'Prospect clearly declined or expressed no interest' },
  { key: 'disqualified',  label: 'Disqualified',     description: 'Prospect does not meet criteria for the offer' },
  { key: 'not_pitched',   label: 'Not Pitched',       description: 'Closer spoke with prospect but chose not to pitch — prospect wasn\'t ready, didn\'t qualify emotionally, or closer felt it wasn\'t the right time' },
];
```

#### src/config/attendance-types.js
```javascript
/**
 * ATTENDANCE TYPES
 *
 * These represent what happened with a scheduled call in terms of who showed up.
 * Set by the system based on calendar events and transcript analysis.
 *
 * IMPORTANT: New calls start with attendance: null (blank on dashboard).
 * The TimeoutService transitions them through the lifecycle automatically.
 */
module.exports = [
  { key: 'scheduled',            label: 'Scheduled',              description: 'DEPRECATED — legacy only. New calls start with attendance: null. Kept for backward compatibility with existing data.' },
  { key: 'waiting_for_outcome',  label: 'Waiting for Outcome',    description: 'Appointment end time has passed. Waiting for transcript to arrive or timeout to trigger Ghosted.' },
  { key: 'show',                 label: 'Show',                   description: 'Both parties showed up and had a real conversation (2+ speakers, substantive dialogue)' },
  { key: 'ghosted',              label: 'Ghosted - No Show',      description: 'The meeting time passed and either: (a) no transcript exists, (b) transcript shows only one participant, or (c) transcript is essentially blank (< 50 chars). The prospect didn\'t show up.' },
  { key: 'canceled',             label: 'Canceled',               description: 'Call was canceled before it happened. Triggered by: calendar event deleted, status changed to cancelled, or an attendee declined.' },
  { key: 'rescheduled',          label: 'Rescheduled',            description: 'Call was moved to a different time. Original record gets this status, new record created at new time.' },
  { key: 'no_recording',         label: 'No Recording',           description: 'RARE — system-level failure. The call may have happened but the recording system failed. No transcript was ever generated.' },
  { key: 'overbooked',           label: 'Overbooked',             description: 'Closer was double-booked and took another call during this time slot. The call wasn\'t missed because the prospect ghosted — it was missed because the closer was in a different meeting.' },
];
```

#### src/config/call-types.js
```javascript
/**
 * CALL TYPES
 * 
 * Determined by looking at prospect history in the Calls table.
 * A prospect who has never had a "Show" call is always a First Call.
 * A prospect who HAS had a "Show" call and books again is a Follow Up.
 */
module.exports = [
  { key: 'first_call',             label: 'First Call',              description: 'Prospect has never had a Show call before' },
  { key: 'follow_up',              label: 'Follow Up',              description: 'Prospect has had at least one prior Show call' },
  { key: 'rescheduled_first',      label: 'Rescheduled First Call',  description: 'First call that was rescheduled (no prior Show)' },
  { key: 'rescheduled_follow_up',  label: 'Rescheduled Follow Up',   description: 'Follow-up call that was rescheduled' },
];
```

#### src/config/scoring-rubric.js
```javascript
/**
 * SCORING RUBRIC
 * 
 * Used to instruct the AI on how to score calls.
 * Each score type gets a description that's injected into the AI prompt.
 * Scale is always 1.0 - 10.0.
 * 
 * TO ADJUST SCORING: Change the descriptions here.
 * The AI prompt is built dynamically from these descriptions.
 */
module.exports = {
  scale: { min: 1.0, max: 10.0 },
  levels: [
    { range: '1-3',  label: 'Poor',           description: 'Major issues, fundamental problems, clearly unprepared or ineffective' },
    { range: '4-5',  label: 'Below Average',   description: 'Notable gaps but some effort shown, needs significant improvement' },
    { range: '6-7',  label: 'Average',         description: 'Competent but room for improvement, gets the job done' },
    { range: '8-9',  label: 'Good',            description: 'Strong performance with only minor areas to improve' },
    { range: '10',   label: 'Exceptional',     description: 'Textbook execution, masterful handling' },
  ],
  scoreTypes: [
    { key: 'discovery_score',           label: 'Discovery',          description: 'How well the closer uncovered goals, pains, and situation' },
    { key: 'pitch_score',               label: 'Pitch',              description: 'How effectively the closer presented the offer' },
    { key: 'close_attempt_score',       label: 'Close Attempt',      description: 'How well the closer asked for the sale' },
    { key: 'objection_handling_score',  label: 'Objection Handling', description: 'How well objections were addressed and overcome' },
    { key: 'overall_call_score',        label: 'Overall',            description: 'Holistic call quality considering all factors' },
    { key: 'script_adherence_score',    label: 'Script Adherence',   description: 'How closely the closer followed the script template' },
    { key: 'prospect_fit_score',        label: 'Prospect Fit',       description: 'How good a fit this prospect is for the offer' },
  ],
};
```

#### src/config/transcript-providers.js
```javascript
/**
 * TRANSCRIPT PROVIDERS
 * 
 * Each provider has a unique webhook payload format.
 * The adapter pattern normalizes all of them into a standard internal format.
 * 
 * TO ADD A NEW PROVIDER:
 * 1. Add an entry here
 * 2. Create src/services/transcript/adapters/{Name}Adapter.js
 * 3. The adapter must implement: normalize(rawPayload) → StandardTranscript
 * 4. Register it in TranscriptService.js adapter map
 * That's it. No other code changes needed.
 */
module.exports = [
  { key: 'fathom',   label: 'Fathom',    webhookPath: 'fathom',   hasWebhook: true,  hasPullAPI: false },
  { key: 'otter',    label: 'Otter.ai',  webhookPath: 'otter',    hasWebhook: true,  hasPullAPI: true },
  { key: 'readai',   label: 'Read.ai',   webhookPath: 'readai',   hasWebhook: true,  hasPullAPI: false },
  { key: 'tdlv',     label: 'TDLV',      webhookPath: 'tdlv',     hasWebhook: true,  hasPullAPI: false },
  { key: 'generic',  label: 'Generic',    webhookPath: 'generic',  hasWebhook: true,  hasPullAPI: false },
];
```

#### src/config/calendar-providers.js
```javascript
/**
 * CALENDAR PROVIDERS
 * 
 * Same adapter pattern as transcript providers.
 * Google Calendar is the only one implemented for MVP.
 * Others are stubbed with clear interfaces.
 * 
 * TO ADD A NEW PROVIDER:
 * 1. Add an entry here
 * 2. Create src/services/calendar/adapters/{Name}Adapter.js
 * 3. The adapter must implement: normalizeEvent(rawEvent) → StandardCalendarEvent
 * 4. Register it in CalendarService.js adapter map
 */
module.exports = [
  { key: 'google_calendar', label: 'Google Calendar', implemented: true },
  { key: 'calendly',        label: 'Calendly',        implemented: false },
  { key: 'ghl',             label: 'GoHighLevel',     implemented: false },
  { key: 'hubspot',         label: 'HubSpot',         implemented: false },
];
```

---

## 5. DATABASE SCHEMA

### Existing Tables (DO NOT modify structure — only ADD columns)

These tables already exist in BigQuery with data. Preserve all existing columns. You may add new columns.

#### `closer-automation.CloserAutomation.Calls`

| Field | Type | Description |
|-------|------|-------------|
| call_id | STRING | Primary key (UUID) |
| appointment_id | STRING | Calendar event ID (for deduplication) |
| client_id | STRING | FK to Clients |
| closer_id | STRING | FK to Closers |
| prospect_name | STRING | From calendar invitee or AI extraction |
| prospect_email | STRING | From calendar invitee |
| appointment_date | STRING | UTC ISO timestamp (yes, it's a STRING — legacy decision, keep it) |
| timezone | STRING | Original timezone of the event |
| call_type | STRING | From call-types.js config |
| attendance | STRING | From attendance-types.js config |
| call_outcome | STRING | From call-outcomes.js config (set by AI) |
| source | STRING | Calendar provider (e.g., "Google Calendar") |
| transcript_status | STRING | "Pending", "Received", "No Transcript", "Processing", "Processed", "Error" |
| transcript_provider | STRING | From transcript-providers.js config |
| transcript_link | STRING | URL to transcript |
| recording_url | STRING | URL to recording |
| call_url | STRING | URL to call (may differ from recording) |
| duration_minutes | FLOAT | Call duration from recording |
| goals | STRING | AI-extracted prospect goals |
| pains | STRING | AI-extracted prospect pains |
| situation | STRING | AI-extracted prospect situation |
| discovery_score | FLOAT | 1.0-10.0 |
| pitch_score | FLOAT | 1.0-10.0 |
| close_attempt_score | FLOAT | 1.0-10.0 |
| objection_handling_score | FLOAT | 1.0-10.0 |
| overall_call_score | FLOAT | 1.0-10.0 |
| script_adherence_score | FLOAT | 1.0-10.0 |
| prospect_fit_score | FLOAT | 1.0-10.0 |
| prospect_temperature | STRING | "Hot", "Warm", "Cold" |
| buying_signals | STRING | AI-extracted |
| ai_summary | STRING | 3-5 sentence call summary |
| ai_feedback | STRING | Coaching feedback for closer |
| key_moments | JSON | Array of {timestamp, label, description} |
| objections | STRING | Comma-separated objection types (legacy) |
| objections_json | JSON | Full objection data from AI |
| close_amount | FLOAT | Deal value if closed |
| payment_plan | STRING | "Full", "Deposit", "Payment Plan", null |
| lost_reason | STRING | Why the deal was lost |
| follow_up_scheduled | BOOLEAN | Whether follow-up was discussed |
| follow_up_date | DATE | When follow-up is scheduled |
| product_purchased | STRING | What they bought |
| revenue_generated | FLOAT | Total deal value |
| cash_collected | FLOAT | Cash received so far |
| date_closed | DATE | When the deal closed |
| processing_status | STRING | "pending", "processing", "completed", "error" |
| processing_error | STRING | Error message if processing failed |
| ingestion_source | STRING | "calendar", "transcript", "manual" |
| created | STRING | ISO timestamp |
| last_modified | STRING | ISO timestamp |
| processed | STRING | ISO timestamp when AI processing completed |
| f_closed | FLOAT | Legacy field — keep but don't rely on |
| client | STRING | Client name (denormalized) |
| closer | STRING | Closer name (denormalized) |

#### `closer-automation.CloserAutomation.Closers`

| Field | Type | Description |
|-------|------|-------------|
| closer_id | STRING | Primary key (UUID) |
| client_id | STRING | FK to Clients (a closer belongs to one client) |
| name | STRING | Display name |
| work_email | STRING | **KEY FIELD** — used to match calendar events to closers |
| personal_email | STRING | Personal email |
| phone | STRING | Phone number |
| timezone | STRING | Closer's timezone |
| status | STRING | "active", "inactive", "terminated" |
| hire_date | DATE | When they started |
| termination_date | DATE | When they left (null if active) |
| transcript_provider | STRING | Which provider this closer uses |
| transcript_api_key | STRING | API key for their transcript provider (if needed) |
| current_client_ids | STRING | Comma-separated client IDs (legacy — use client_id instead) |
| lifetime_calls_booked | INTEGER | Running total |
| lifetime_calls_held | INTEGER | Running total |
| lifetime_shows | INTEGER | Running total |
| lifetime_closes | INTEGER | Running total |
| lifetime_show_rate | FLOAT | Calculated |
| lifetime_close_rate | FLOAT | Calculated |
| lifetime_revenue_generated | FLOAT | Running total |
| notes | STRING | Admin notes |
| created_at | TIMESTAMP | |
| last_modified | TIMESTAMP | |

#### `closer-automation.CloserAutomation.Clients`

| Field | Type | Description |
|-------|------|-------------|
| client_id | STRING | Primary key (UUID) |
| name | STRING | Client's name |
| company_name | STRING | Business name |
| industry | STRING | |
| website | STRING | |
| primary_contact_name | STRING | |
| primary_contact_email | STRING | |
| primary_contact_phone | STRING | |
| timezone | STRING | Client's timezone |
| business_overview | STRING | Description of the business |
| target_customer_description | STRING | Who they sell to |
| offer_name | STRING | Name of their offer/product |
| offer_price | FLOAT | Price of the offer |
| offer_description | STRING | Description of the offer |
| unique_selling_points | STRING | |
| common_objections | STRING | Objections they typically face |
| competitor_landscape | STRING | |
| ai_prompt_discovery | STRING | Custom AI prompt for discovery scoring |
| ai_prompt_pitch | STRING | Custom AI prompt for pitch scoring |
| ai_prompt_close | STRING | Custom AI prompt for close scoring |
| ai_prompt_objections | STRING | Custom AI prompt for objection analysis |
| ai_prompt_overall | STRING | **MAIN AI PROMPT** — overall context for this client |
| ai_context_notes | STRING | Additional context for AI |
| script_template | STRING | The client's sales script |
| required_discovery_questions | STRING | Questions closers must ask |
| disqualification_criteria | STRING | When to DQ a prospect |
| ideal_close_phrases | STRING | What good closes sound like |
| plan_tier | STRING | "basic", "insight", "executive" |
| closer_count | INTEGER | Number of active closers |
| monthly_rate | FLOAT | Monthly billing amount |
| setup_fee_paid | FLOAT | One-time setup fee |
| billing_start_date | DATE | |
| contract_end_date | DATE | |
| status | STRING | "active", "inactive", "onboarding", "churned" |
| calendar_source | STRING | "google_calendar", "calendly", etc. |
| calendar_integration_id | STRING | Provider-specific integration ID |
| transcript_provider | STRING | Default transcript provider for this client |
| transcript_integration_id | STRING | |
| crm_type | STRING | Client's CRM system |
| crm_integration_id | STRING | |
| slack_webhook_url | STRING | For sending notifications |
| notification_email | STRING | Where to send email notifications |
| filter_word | STRING | **CRITICAL** — comma-separated words to match in calendar event titles to identify sales calls vs personal events. Stored as comma-separated string in BigQuery but always parsed into an array in code. Example: "strategy,discovery,sales call,intro call". Can have as many filter words as needed. |
| onboarding_completed | BOOLEAN | |
| notes | STRING | |
| created_at | TIMESTAMP | |
| last_modified | TIMESTAMP | |

#### `closer-automation.CloserAutomation.Objections`

| Field | Type | Description |
|-------|------|-------------|
| objection_id | STRING | Primary key (UUID) |
| call_id | STRING | FK to Calls |
| client_id | STRING | FK to Clients |
| closer_id | STRING | FK to Closers |
| objection_type | STRING | From objection-types.js config |
| objection_text | STRING | What the prospect actually said |
| timestamp_seconds | INTEGER | When in the call it happened |
| timestamp_minutes | FLOAT | Same, in minutes |
| resolved | BOOLEAN | Was it overcome? |
| resolution_method | STRING | How it was addressed |
| resolution_text | STRING | What the closer said |
| resolution_timestamp_seconds | INTEGER | When the resolution happened |
| resolution_timestamp_minutes | FLOAT | Same, in minutes |
| created_at | TIMESTAMP | |
| last_modified | TIMESTAMP | |

### New Tables to Create

#### `closer-automation.CloserAutomation.Prospects`

```sql
CREATE TABLE `closer-automation.CloserAutomation.Prospects` (
  prospect_id STRING NOT NULL,          -- UUID
  client_id STRING NOT NULL,            -- FK to Clients
  prospect_email STRING NOT NULL,       -- Primary identifier
  prospect_name STRING,                 -- Most recent name from calls
  first_call_date DATE,                 -- When they first appeared
  last_call_date DATE,                  -- Most recent call
  total_calls INTEGER DEFAULT 0,        -- How many calls total
  total_shows INTEGER DEFAULT 0,        -- How many they showed up to
  status STRING DEFAULT 'active',       -- active, closed, lost, churned
  deal_status STRING,                   -- open, closed_won, lost, follow_up
  total_revenue_generated FLOAT DEFAULT 0,  -- Total deal value
  total_cash_collected FLOAT DEFAULT 0,     -- Total cash received
  last_payment_date DATE,               -- Most recent payment
  payment_count INTEGER DEFAULT 0,      -- Number of payments made
  product_purchased STRING,             -- What they bought
  assigned_closer_id STRING,            -- Current closer assignment
  notes STRING,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);
```

#### `closer-automation.CloserAutomation.AuditLog`

```sql
CREATE TABLE `closer-automation.CloserAutomation.AuditLog` (
  audit_id STRING NOT NULL,             -- UUID
  timestamp TIMESTAMP NOT NULL,
  client_id STRING,
  entity_type STRING NOT NULL,          -- 'call', 'closer', 'client', 'objection', 'prospect', 'payment'
  entity_id STRING NOT NULL,            -- The ID of the thing that changed
  action STRING NOT NULL,               -- 'created', 'updated', 'state_change', 'error'
  field_changed STRING,                 -- Which field changed (null for creates)
  old_value STRING,                     -- Previous value
  new_value STRING,                     -- New value
  trigger_source STRING NOT NULL,       -- 'calendar_webhook', 'transcript_webhook', 'payment_webhook', 'ai_processing', 'timeout', 'admin', 'system'
  trigger_detail STRING,                -- Additional context (e.g., provider name, webhook ID)
  metadata JSON,                        -- Any extra context as JSON
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);
```

#### `closer-automation.CloserAutomation.CostTracking`

```sql
CREATE TABLE `closer-automation.CloserAutomation.CostTracking` (
  cost_id STRING NOT NULL,              -- UUID
  timestamp TIMESTAMP NOT NULL,
  client_id STRING NOT NULL,
  call_id STRING NOT NULL,
  model STRING NOT NULL,                -- e.g., 'claude-sonnet-4-20250514'
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  input_cost_usd FLOAT NOT NULL,        -- Calculated from token count
  output_cost_usd FLOAT NOT NULL,       -- Calculated from token count
  total_cost_usd FLOAT NOT NULL,        -- Sum of input + output
  processing_time_ms INTEGER,           -- How long the API call took
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);
```

### Existing Views (Read-Only — do NOT modify these)

These views power the Looker Studio dashboards. They must continue to work.

- `v_calls_joined_flat_prefixed` — Main view, joins Calls + Closers + Clients with prefixed columns
- `v_objections_joined` — One row per objection with all call/closer/client data
- `v_calls_with_objection_counts` — One row per call with objection summary stats
- `v_calls_with_objections_filterable` — Calls LEFT JOIN Objections for filtering
- `v_funnel_calls_all_types` — Funnel data for charts
- `v_close_cycle_stats_dated` — Close cycle analysis

**IMPORTANT:** Any new columns you add to base tables will automatically appear in the views (since they use `SELECT *` or explicit column lists). If you add columns, verify the views still work.

---

## 6. CALL LIFECYCLE STATE MACHINE

This is the heart of the system. Every call follows this state machine.

### States

```
                 ┌──────────────┐
                 │ null (new)   │  ← New calls start here (blank on dashboard)
                 │ or Scheduled │  ← Legacy records start here
                 └──────────────┘
                  │  │  │  │  │
     ┌────────────┘  │  │  │  └──────────────────┐
     ↓               │  │  │                     ↓
┌───────────┐        │  │  │            ┌────────────────┐
│ CANCELED  │        │  │  │            │  RESCHEDULED   │
└───────────┘        │  │  │            └────────────────┘
     ↑               │  │  │                    │
     │               │  │  │                    ↓
(event deleted,      │  │  │            (new record created
 canceled, or        │  │  │             at new time)
 declined)           │  │  │
                     │  │  └───────────────────────┐
                     │  │                          ↓
                     │  │                   ┌──────────────┐
                     │  │                   │  OVERBOOKED  │
                     │  │                   └──────────────┘
                     │  │                   (closer took another call)
                     ↓  ↓
           ┌──────────────────────────┐
           │  WAITING FOR OUTCOME     │  ← TimeoutService Phase 1
           │  (end time has passed)   │    (triggers at appointment end time)
           └──────────────────────────┘
                  │         │
       transcript │         │ timeout (configurable, default 2hrs)
       arrives    │         │
                  ↓         ↓
           ┌────────┐  ┌───────────────────┐
           │ eval   │  │ GHOSTED - NO SHOW │  ← TimeoutService Phase 2
           └────────┘  └───────────────────┘
           │        │
 real talk │        │ empty/blank/1 person
 (2+ spkr) │        │
           ↓        ↓
     ┌────────┐  (also Ghosted)
     │  SHOW  │
     └────────┘
           │
           ↓ (AI processes transcript inline)
           │
           ├── Closed - Won
           ├── Deposit
           ├── Follow Up
           ├── Lost
           ├── Disqualified
           ├── Not Pitched
           └── Error (AI failed → processing_status: 'error')
```

**KEY CHANGE FROM ORIGINAL SPEC:** New calls start with `attendance: null` instead of `'Scheduled'`.
This keeps the dashboard clean — only calls that need attention are visible.
The `TimeoutService` automatically transitions calls through the lifecycle:
- Phase 1: `null/Scheduled` → `Waiting for Outcome` (when appointment end time passes)
- Phase 1.5: Poll Fathom API for missed transcripts (for closers with API keys)
- Phase 2: `Waiting for Outcome` → `Ghosted - No Show` (after configurable timeout)

### State Transition Rules

```javascript
/**
 * CALL STATE TRANSITIONS
 * 
 * This object defines every valid state transition.
 * Key = current state, Value = array of valid next states with their triggers.
 * 
 * If a transition is not listed here, it is INVALID and should be logged as an error.
 * 
 * IMPORTANT NOTES ON CANCEL LOGIC:
 * "Canceled" is set when:
 * - The Google Calendar event is deleted
 * - The Google Calendar event status changes to "cancelled"
 * - An attendee (prospect or closer) responds "No" / declines the event
 * 
 * IMPORTANT NOTES ON GHOSTED LOGIC:
 * "Ghosted - No Show" is the most common non-show state. It means:
 * - The meeting was scheduled and the time passed
 * - Either no transcript exists, OR the transcript shows only one participant,
 *   OR the transcript is essentially blank (< 50 chars)
 * This is NOT the same as "No Recording" which is a rare system failure.
 * 
 * IMPORTANT NOTES ON RESCHEDULE LOGIC:
 * Rescheduled can happen two ways:
 * 1. The calendar event is moved to a new time (same event ID, new datetime)
 *    → In this case, if the call has NOT been held yet, just update the appointment_date.
 *      Don't mark it as rescheduled unless it was a significant change.
 *    → If the call HAS been held (attendance = 'Show' with an outcome), 
 *      and the event moves, that means the closer moved the event for a follow-up.
 *      Create a NEW call record for the new time as a Follow Up.
 * 2. The original event is canceled and a new one is booked
 *    → Original record → 'Canceled', new record created normally
 *    → The new record's call_type is determined by prospect history
 * 
 * IMPORTANT NOTES ON APPOINTMENT_ID vs DEDUPLICATION:
 * The appointment_id (calendar event ID) is NOT always unique per call.
 * When a closer moves a calendar event from 9am to 10am, the event ID stays the same.
 * Deduplication logic:
 * - If event ID exists AND the call has NOT been held → update the existing record (time change)
 * - If event ID exists AND the call HAS been held → create a NEW record (it's a follow-up)
 * - Use a composite key of (appointment_id + client_id + a "version" counter) or
 *   generate a fresh call_id and store appointment_id as a reference field, not a dedup key.
 */
const STATE_TRANSITIONS = {
  // New calls start with attendance: null (blank on dashboard)
  'null': [
    { to: 'Canceled',            trigger: 'calendar_cancelled_or_deleted_or_declined' },
    { to: 'Rescheduled',         trigger: 'calendar_moved_and_not_yet_held' },
    { to: 'Show',                trigger: 'transcript_received_valid' },
    { to: 'Ghosted - No Show',   trigger: 'transcript_received_empty_or_one_speaker' },
    { to: 'Waiting for Outcome', trigger: 'appointment_time_passed' },
    { to: 'No Recording',        trigger: 'system_recording_failure' },
    { to: 'Overbooked',          trigger: 'closer_double_booked' },
  ],
  // Legacy — existing records may still have 'Scheduled' attendance
  'Scheduled': [
    { to: 'Canceled',            trigger: 'calendar_cancelled_or_deleted_or_declined' },
    { to: 'Rescheduled',         trigger: 'calendar_moved_and_not_yet_held' },
    { to: 'Show',                trigger: 'transcript_received_valid' },
    { to: 'Ghosted - No Show',   trigger: 'transcript_received_empty_or_one_speaker' },
    { to: 'Ghosted - No Show',   trigger: 'transcript_timeout' },
    { to: 'Waiting for Outcome', trigger: 'appointment_time_passed' },
    { to: 'No Recording',        trigger: 'system_recording_failure' },
    { to: 'Overbooked',          trigger: 'closer_double_booked' },
  ],
  // Appointment end time passed — waiting for transcript or timeout
  'Waiting for Outcome': [
    { to: 'Canceled',            trigger: 'calendar_cancelled_or_deleted_or_declined' },
    { to: 'Show',                trigger: 'transcript_received_valid' },
    { to: 'Ghosted - No Show',   trigger: 'transcript_timeout' },
    { to: 'Ghosted - No Show',   trigger: 'transcript_received_empty_or_one_speaker' },
    { to: 'No Recording',        trigger: 'system_recording_failure' },
    { to: 'Overbooked',          trigger: 'closer_double_booked' },
  ],
  'No Recording': [
    { to: 'Show',               trigger: 'transcript_received_valid' },
    { to: 'Ghosted - No Show',  trigger: 'transcript_received_empty' },
  ],
  'Ghosted - No Show': [
    { to: 'Show',               trigger: 'transcript_reprocessed' },
    { to: 'Overbooked',         trigger: 'closer_double_booked' },
  ],
  'Show': [
    { to: 'Closed - Won',       trigger: 'ai_outcome' },
    { to: 'Deposit',            trigger: 'ai_outcome' },
    { to: 'Follow Up',          trigger: 'ai_outcome' },
    { to: 'Lost',               trigger: 'ai_outcome' },
    { to: 'Disqualified',       trigger: 'ai_outcome' },
    { to: 'Not Pitched',        trigger: 'ai_outcome' },
  ],
  'Follow Up': [
    { to: 'Closed - Won',       trigger: 'payment_received' },
  ],
  'Lost': [
    { to: 'Closed - Won',       trigger: 'payment_received' },
    { to: 'Follow Up',          trigger: 'new_call_scheduled' },
  ],
  'Not Pitched': [
    { to: 'Follow Up',          trigger: 'new_call_scheduled' },
    { to: 'Closed - Won',       trigger: 'payment_received' },
  ],
  'Rescheduled': [
    { to: 'Canceled',           trigger: 'calendar_cancelled_or_deleted_or_declined' },
  ],
  'Canceled': [],
  'Closed - Won': [],
  'Deposit': [
    { to: 'Closed - Won',       trigger: 'payment_received_full' },
  ],
  // Closer was double-booked and took another call during this slot
  'Overbooked': [
    { to: 'Show',               trigger: 'transcript_received_valid' },
    { to: 'Canceled',           trigger: 'calendar_cancelled_or_deleted_or_declined' },
  ],
};
```

### Call Type Determination Logic

```javascript
/**
 * Determines the call_type for a new call record.
 * 
 * Looks at the prospect's history in the Calls table for this client.
 * 
 * @param {string} prospectEmail - The prospect's email
 * @param {string} clientId - The client this call belongs to
 * @returns {string} One of the call-types.js values
 */
async function determineCallType(prospectEmail, clientId) {
  // Query: Has this prospect had ANY prior call with attendance = 'Show' for this client?
  const priorShows = await bigquery.query(`
    SELECT COUNT(*) as show_count 
    FROM \`closer-automation.CloserAutomation.Calls\`
    WHERE prospect_email = @prospectEmail 
      AND client_id = @clientId 
      AND attendance = 'Show'
  `, { prospectEmail, clientId });

  if (priorShows[0].show_count > 0) {
    return 'Follow Up';  // They've had a real conversation before
  }
  return 'First Call';   // Brand new prospect (even if they no-showed before)
}
```

### Duplicate Detection & Calendar Event ID Handling

```javascript
/**
 * CRITICAL: appointment_id (calendar event ID) is NOT a reliable dedup key.
 * 
 * When a closer moves a calendar event from 9am to 10am, the event ID stays the same.
 * This creates several scenarios we must handle:
 * 
 * SCENARIO A: Event moved BEFORE the call happened
 *   - appointment_id exists in Calls table
 *   - Existing record has attendance = 'Scheduled'
 *   - ACTION: Just update the appointment_date on the existing record. 
 *     This is a simple time change, not a reschedule. Don't create a new record.
 * 
 * SCENARIO B: Event moved AFTER the call happened (closer reused the event for a follow-up)
 *   - appointment_id exists in Calls table
 *   - Existing record has attendance = 'Show' (with an AI-processed outcome)
 *   - ACTION: Create a NEW call record. This is a follow-up. The closer just moved
 *     the original calendar event instead of creating a new one.
 *   - The new record gets a fresh call_id, call_type = 'Follow Up', 
 *     and the same appointment_id (that's okay — call_id is the true PK).
 * 
 * SCENARIO C: Same appointment_id, genuinely new webhook (duplicate delivery)
 *   - appointment_id exists AND appointment_date matches AND attendance matches
 *   - ACTION: Skip. This is a duplicate webhook.
 * 
 * DEDUP STRATEGY:
 * - call_id (UUID) is the TRUE primary key. Always generated fresh.
 * - appointment_id is stored as a REFERENCE field, not a dedup key.
 * - Dedup logic uses: appointment_id + client_id + appointment_date + attendance
 *   to determine if this is a duplicate, an update, or a new record.
 * 
 * @param {string} appointmentId - The calendar event ID
 * @param {string} clientId - The client this call belongs to
 * @param {string} newAppointmentDate - The (possibly new) date/time from the calendar event
 * @returns {Object} { action: 'skip'|'update'|'create_new', existingRecord: Object|null }
 */
async function handleCalendarEvent(appointmentId, clientId, newAppointmentDate) {
  const existing = await bigquery.query(`
    SELECT * FROM \`closer-automation.CloserAutomation.Calls\`
    WHERE appointment_id = @appointmentId AND client_id = @clientId
    ORDER BY created DESC
    LIMIT 1
  `, { appointmentId, clientId });

  if (existing.length === 0) {
    // No existing record — this is a brand new call
    return { action: 'create_new', existingRecord: null };
  }

  const record = existing[0];

  // If the call has already been held (Show + outcome), and the event moved,
  // this means the closer reused the event for a follow-up
  if (record.attendance === 'Show' && record.call_outcome) {
    return { action: 'create_new', existingRecord: record };
  }

  // If the call is still Scheduled and the time changed, just update it
  if (record.attendance === 'Scheduled') {
    const dateChanged = record.appointment_date !== newAppointmentDate;
    if (dateChanged) {
      return { action: 'update', existingRecord: record };
    }
    // Same date, same status — duplicate webhook
    return { action: 'skip', existingRecord: record };
  }

  // For any other state (Canceled, Ghosted, etc.), create new if date is different
  return { action: 'create_new', existingRecord: record };
}
```

### Transcript Matching Logic

```javascript
/**
 * Matches an incoming transcript to an existing call record.
 * 
 * Matching priority:
 * 1. closer_work_email + prospect_email + scheduled_start_time (within 30 min tolerance)
 * 2. closer_work_email + scheduled_start_time (within 30 min tolerance)
 * 3. prospect_email + scheduled_start_time (within 30 min tolerance)
 * 
 * If no match found, create a new call record (the calendar webhook may not have fired yet).
 * 
 * @param {Object} transcript - Normalized transcript data
 * @returns {Object} Matched or newly created call record
 */
async function matchTranscriptToCall(transcript) {
  const { closerEmail, prospectEmail, scheduledStartTime, clientId } = transcript;
  
  // Try exact match first
  let match = await bigquery.query(`
    SELECT * FROM \`closer-automation.CloserAutomation.Calls\`
    WHERE client_id = @clientId
      AND closer_id IN (SELECT closer_id FROM \`closer-automation.CloserAutomation.Closers\` WHERE work_email = @closerEmail)
      AND prospect_email = @prospectEmail
      AND ABS(TIMESTAMP_DIFF(
            PARSE_TIMESTAMP('%Y-%m-%dT%H:%M:%S', appointment_date),
            TIMESTAMP(@scheduledStartTime),
            MINUTE
          )) <= 30
      AND attendance IN ('Scheduled', 'No Recording')
    ORDER BY appointment_date DESC
    LIMIT 1
  `, { clientId, closerEmail, prospectEmail, scheduledStartTime });

  if (match.length > 0) return match[0];

  // Fallback: match without prospect email
  match = await bigquery.query(`
    SELECT * FROM \`closer-automation.CloserAutomation.Calls\`
    WHERE client_id = @clientId
      AND closer_id IN (SELECT closer_id FROM \`closer-automation.CloserAutomation.Closers\` WHERE work_email = @closerEmail)
      AND ABS(TIMESTAMP_DIFF(
            PARSE_TIMESTAMP('%Y-%m-%dT%H:%M:%S', appointment_date),
            TIMESTAMP(@scheduledStartTime),
            MINUTE
          )) <= 30
      AND attendance IN ('Scheduled', 'No Recording')
    ORDER BY appointment_date DESC
    LIMIT 1
  `, { clientId, closerEmail, scheduledStartTime });

  if (match.length > 0) return match[0];

  // No match — create new record (transcript arrived before calendar webhook)
  return null; // Caller should create a new record
}
```

---

## 7. CALENDAR INTEGRATION

### Google Calendar Push Notifications

Instead of polling (which the n8n system did), use Google Calendar's push notification system. This sends real-time webhooks when calendar events change.

#### How Push Notifications Work

1. We register a "watch" on each closer's calendar
2. Google sends a POST to our webhook URL when anything changes
3. We then fetch the changed event(s) using the Calendar API
4. Watch channels expire and must be renewed (typically every 7 days)

#### GoogleCalendarPush.js

```javascript
/**
 * Manages Google Calendar push notification channels.
 * 
 * For each closer, we create a watch channel on their calendar.
 * Google sends notifications to: POST /webhooks/calendar/:clientId
 * 
 * Channels expire after ~7 days. The TimeoutService handles renewal.
 * 
 * PREREQUISITE: Tyler's Google account must have read access to each closer's calendar.
 * This is done by the closer sharing their calendar with Tyler's account.
 */
```

#### Event Normalization

All calendar events (regardless of provider) are normalized to this format:

```javascript
/**
 * STANDARD CALENDAR EVENT FORMAT
 * 
 * Every calendar adapter must normalize its events into this shape.
 * This is the contract between calendar adapters and the CalendarService.
 */
const StandardCalendarEvent = {
  eventId: 'string',              // Provider's unique event ID
  eventType: 'string',            // 'created', 'updated', 'cancelled'
  title: 'string',                // Event title/summary
  startTime: 'string',            // UTC ISO timestamp
  endTime: 'string',              // UTC ISO timestamp
  originalTimezone: 'string',     // The timezone the event was created in
  organizerEmail: 'string',       // Who created/hosts the event
  attendees: [{                   // List of attendees
    email: 'string',
    name: 'string',
    isOrganizer: 'boolean',
  }],
  status: 'string',               // 'confirmed', 'cancelled', 'tentative'
  calendarId: 'string',           // Which calendar this came from
  rawEvent: {},                   // Original unmodified event for debugging
};
```

#### Filter Word Matching

```javascript
/**
 * Determines if a calendar event is a sales call for this client.
 * 
 * Each client has a `filter_word` field — comma-separated words.
 * If the event title contains ANY of these words (case-insensitive), it's a match.
 * 
 * Example: filter_word = "strategy,discovery,sales call"
 * Event title "Discovery Call with John" → MATCH
 * Event title "Team Standup" → NO MATCH
 * 
 * @param {string} eventTitle - The calendar event title
 * @param {string} filterWords - Comma-separated filter words from client config
 * @returns {boolean}
 */
function isClientSalesCall(eventTitle, filterWords) {
  if (!filterWords) return false;
  const words = filterWords.split(',').map(w => w.trim().toLowerCase());
  const title = eventTitle.toLowerCase();
  return words.some(word => title.includes(word));
}
```

#### Closer Identification

```javascript
/**
 * Identifies which closer this calendar event belongs to.
 * 
 * The closer is identified by matching the calendar's owner email (or the organizer email)
 * against the `work_email` field in the Closers table.
 * 
 * @param {string} calendarEmail - The email of the calendar that fired the event
 * @param {string} clientId - The client to search within
 * @returns {Object|null} Closer record or null if not found
 */
async function identifyCloser(calendarEmail, clientId) {
  const result = await bigquery.query(`
    SELECT * FROM \`closer-automation.CloserAutomation.Closers\`
    WHERE work_email = @calendarEmail 
      AND client_id = @clientId
      AND status = 'active'
    LIMIT 1
  `, { calendarEmail, clientId });
  
  return result.length > 0 ? result[0] : null;
}
```

#### Prospect Identification

```javascript
/**
 * Extracts the prospect from calendar event attendees.
 * 
 * Logic:
 * 1. Get all attendees
 * 2. Remove the organizer (that's the closer)
 * 3. Remove any emails that match known closer work_emails for this client
 * 4. The remaining attendee is the prospect
 * 5. If no prospect found, check the event description (Calendly puts it there)
 * 6. If still nothing, set prospect_email to "unknown"
 */
```

---

## 8. TRANSCRIPT INTEGRATION

### Standard Transcript Format

All transcript adapters normalize to this shape:

```javascript
/**
 * STANDARD TRANSCRIPT FORMAT
 * 
 * Every transcript adapter must produce this shape.
 * This is the contract between transcript adapters and the TranscriptService.
 */
const StandardTranscript = {
  closerEmail: 'string',           // Email of the person who recorded
  prospectEmail: 'string|null',    // Prospect email if available
  prospectName: 'string|null',     // Prospect name if available
  scheduledStartTime: 'string',    // UTC ISO timestamp of when the meeting was scheduled
  recordingStartTime: 'string',    // When recording actually started
  recordingEndTime: 'string',      // When recording ended
  durationSeconds: 'number',       // Recording duration
  transcript: 'string|null',       // Full transcript text
  shareUrl: 'string|null',        // Link to recording
  transcriptUrl: 'string|null',   // Link to transcript
  title: 'string|null',           // Meeting title
  summary: 'string|null',         // Auto-generated summary (if provider offers it)
  provider: 'string',             // From transcript-providers.js
  speakerCount: 'number|null',    // Number of distinct speakers detected
  rawPayload: {},                  // Original unmodified webhook payload
};
```

### Fathom Adapter (Reference Implementation)

```javascript
/**
 * FATHOM WEBHOOK PAYLOAD
 * 
 * Fathom sends this when a recording is complete:
 * {
 *   "title": "Call Title",
 *   "meeting_title": "Full meeting title",
 *   "url": "https://fathom.video/calls/XXXXX",
 *   "created_at": "ISO timestamp",
 *   "scheduled_start_time": "ISO timestamp",
 *   "scheduled_end_time": "ISO timestamp",
 *   "recording_id": 12345,
 *   "recording_start_time": "ISO timestamp",
 *   "recording_end_time": "ISO timestamp",
 *   "calendar_invitees": [
 *     { "name": "...", "email": "...", "is_external": true/false }
 *   ],
 *   "recorded_by": { "name": "...", "email": "..." },
 *   "share_url": "...",
 *   "transcript": "full transcript text OR null",
 *   "default_summary": "..."
 * }
 * 
 * The `recorded_by.email` is the closer's email.
 * The `calendar_invitees` where `is_external = true` is the prospect.
 */
```

### Transcript Evaluation

```javascript
/**
 * Determines if a transcript represents a real conversation (Show)
 * or a failed/no-show call (Ghosted).
 *
 * RULES (SIMPLIFIED — let AI handle edge cases):
 * 1. If transcript is null or empty → Ghosted
 * 2. If transcript length < 50 characters → Ghosted
 * 3. If only one speaker is detected → Ghosted (closer talked to themselves)
 * 4. 2+ speakers = ALWAYS Show → AI determines outcome
 *
 * KEY DESIGN DECISION: We removed minimum prospect utterance/word thresholds.
 * If two people spoke, it's a Show. Even a short "I need to cancel" exchange
 * is a real conversation — the AI will classify it as 'Not Pitched', 'Lost',
 * 'Disqualified', etc. appropriately. This prevents false Ghosted classifications
 * for short but real calls.
 *
 * Configurable threshold:
 */
const TRANSCRIPT_THRESHOLDS = {
  minLength: 50,  // Minimum characters for a valid transcript
};
```

### Client Identification from Transcript

```javascript
/**
 * When a transcript webhook arrives, we need to figure out which client it belongs to.
 * 
 * Strategy:
 * 1. Look up the closer by their email (recorded_by.email or equivalent)
 * 2. The closer record has a client_id → that's our client
 * 3. If the closer works for multiple clients (future), use the calendar event
 *    match to disambiguate
 * 4. If we can't identify the client → log error, alert Tyler, hold the transcript
 *    for manual review
 */
```

---

## 9. AI PROCESSING PIPELINE

### Prompt Builder

The AI prompt has TWO layers:

**Layer 1: Master Prompt (same for every call, every client)**
This is the core instruction set that tells the AI how to analyze a sales call. It includes:
- The scoring rubric (from config)
- The objection types list (from config)
- The call outcomes list (from config)
- The output JSON schema
- General rules for analysis

**Layer 2: Client-Specific Mini-Prompts (unique per client)**
Each client can provide custom instructions for specific aspects of the analysis. These are stored in the Clients table:
- `ai_prompt_overall` — General context about the client's business, offer, and sales approach
- `ai_prompt_discovery` — How this client wants discovery scored (e.g., "We require 5 specific questions to be asked...")
- `ai_prompt_pitch` — How this client wants the pitch scored (e.g., "The closer must mention our 3 USPs...")
- `ai_prompt_close` — How this client wants close attempts scored
- `ai_prompt_objections` — How this client wants objection handling scored (e.g., "For financial objections, we always offer payment plans first...")
- `ai_context_notes` — Any additional context for the AI
- `script_template` — The client's sales script (for adherence scoring)
- `common_objections` — Objections this client typically faces
- `disqualification_criteria` — When to DQ a prospect

The prompt builder assembles these dynamically:

```javascript
/**
 * Builds the complete AI prompt for transcript analysis.
 * 
 * ARCHITECTURE:
 * The system prompt = Master Prompt + Client Mini-Prompts
 * The user message = Call metadata + Transcript
 * 
 * The Master Prompt is built from config files (objection types, outcomes, scoring rubric).
 * The Client Mini-Prompts are pulled from the client's database record.
 * Both are assembled at runtime — nothing is hardcoded.
 * 
 * This means:
 * - Adding a new objection type? Update objection-types.js → every future AI call includes it.
 * - Client wants custom discovery scoring? Update their ai_prompt_discovery in BigQuery → done.
 * - Want to change the scoring scale? Update scoring-rubric.js → all clients affected.
 * 
 * @param {Object} client - The client record from BigQuery
 * @param {Object} callMetadata - Call type, closer name, duration, etc.
 * @param {string} transcript - The full transcript text
 * @returns {Object} { systemPrompt, userMessage } ready for the Anthropic API
 */
function buildPrompt(client, callMetadata, transcript) {
  const objectionTypes = require('../config/objection-types');
  const callOutcomes = require('../config/call-outcomes');
  const scoringRubric = require('../config/scoring-rubric');

  // ── MASTER PROMPT (universal) ──────────────────────────────

  // Build the objection types instruction dynamically
  const objectionInstruction = objectionTypes
    .map(o => `- ${o.label} (${o.description})`)
    .join('\n');

  // Build the outcomes instruction dynamically
  const outcomeInstruction = callOutcomes
    .map(o => `- "${o.label}": ${o.description}`)
    .join('\n');

  // Build the scoring instruction dynamically
  const scoringInstruction = scoringRubric.levels
    .map(l => `- ${l.range}: ${l.label} — ${l.description}`)
    .join('\n');

  const scoreFields = scoringRubric.scoreTypes
    .map(s => `"${s.key}": "number ${scoringRubric.scale.min}-${scoringRubric.scale.max} — ${s.description}"`)
    .join(',\n  ');

  // ── CLIENT MINI-PROMPTS (per-client) ──────────────────────
  
  // Only include non-empty client prompts
  const clientSections = [];
  
  if (client.ai_prompt_overall) 
    clientSections.push(`CLIENT CONTEXT:\n${client.ai_prompt_overall}`);
  if (client.offer_name) 
    clientSections.push(`OFFER: ${client.offer_name} — $${client.offer_price}\n${client.offer_description || ''}`);
  if (client.script_template) 
    clientSections.push(`SCRIPT TEMPLATE (for adherence scoring):\n${client.script_template}`);
  if (client.ai_prompt_discovery) 
    clientSections.push(`DISCOVERY SCORING INSTRUCTIONS:\n${client.ai_prompt_discovery}`);
  if (client.ai_prompt_pitch) 
    clientSections.push(`PITCH SCORING INSTRUCTIONS:\n${client.ai_prompt_pitch}`);
  if (client.ai_prompt_close) 
    clientSections.push(`CLOSE SCORING INSTRUCTIONS:\n${client.ai_prompt_close}`);
  if (client.ai_prompt_objections) 
    clientSections.push(`OBJECTION HANDLING INSTRUCTIONS:\n${client.ai_prompt_objections}`);
  if (client.disqualification_criteria) 
    clientSections.push(`DISQUALIFICATION CRITERIA:\n${client.disqualification_criteria}`);
  if (client.common_objections) 
    clientSections.push(`KNOWN COMMON OBJECTIONS:\n${client.common_objections}`);
  if (client.ai_context_notes) 
    clientSections.push(`ADDITIONAL CONTEXT:\n${client.ai_context_notes}`);

  // ... assemble master prompt + client sections into full system prompt
}
```

### AI Response Validation

```javascript
/**
 * Validates and normalizes the AI response.
 * 
 * The AI sometimes returns slightly wrong values (e.g., "Financial Objection" instead of "Financial").
 * This function:
 * 1. Parses the JSON (strips markdown fences if present)
 * 2. Validates call_outcome against call-outcomes.js
 * 3. Validates each objection_type against objection-types.js (fuzzy match)
 * 4. Clamps scores to the valid range
 * 5. Sets defaults for any missing fields
 * 
 * If the response is completely unparseable → processing_status = 'error'
 */
```

### Cost Tracking

```javascript
/**
 * After every AI API call, record the cost.
 * 
 * Claude Sonnet pricing (as of Feb 2026):
 * - Input: $3 per million tokens
 * - Output: $15 per million tokens
 * 
 * IMPORTANT: These prices are configurable in .env so they can be updated
 * without code changes when Anthropic updates pricing.
 * 
 * Each record goes into the CostTracking table so Tyler can see:
 * - Cost per call
 * - Cost per client
 * - Total monthly AI spend
 * - Average tokens per analysis
 */
```

---

## 10. PAYMENT INTEGRATION

### Payment Webhook Endpoint

```
POST /webhooks/payment
```

Clients send payment data through their own automation (Zapier, Make, custom). The payload format is standardized:

```javascript
/**
 * EXPECTED PAYMENT PAYLOAD
 * 
 * This is the minimum viable payment notification.
 * Clients configure their payment processor (Stripe, PayPal, etc.) to send this.
 * 
 * {
 *   "client_id": "xxx",                // Which CloserMetrix client this is for
 *   "prospect_email": "john@example.com",
 *   "prospect_name": "John Smith",      // Optional
 *   "payment_amount": 5000,             // In dollars
 *   "payment_date": "2026-02-15",       // ISO date, optional (defaults to now)
 *   "payment_type": "full",             // "full", "deposit", "payment_plan", "refund"
 *   "product_name": "Coaching Program", // Optional
 *   "notes": "Paid via Stripe"          // Optional
 * }
 */
```

### Payment Processing Logic

```javascript
/**
 * When a payment comes in:
 * 
 * 1. Find or create the Prospect record by email + client_id
 * 2. Update the Prospect record (total_cash_collected, payment_count, etc.)
 * 3. Find the most recent call for this prospect that has attendance = 'Show'
 * 4. If that call's outcome is 'Follow Up' or 'Lost' → update to 'Closed - Won'
 * 5. If that call's outcome is already 'Closed - Won' → just add to cash_collected
 * 6. If payment_type is 'refund' → subtract from cash_collected, potentially revert outcome
 * 7. Log everything in AuditLog
 */
```

---

## 11. CLIENT & CLOSER ONBOARDING

### Client Onboarding Flow

```
POST /admin/clients
```

```javascript
/**
 * Creates a new client in CloserMetrix.
 * 
 * Steps:
 * 1. Validate required fields
 * 2. Generate client_id (UUID)
 * 3. Insert into Clients table
 * 4. Set up Google Calendar push notification channel for this client
 *    (channel will be created per-closer as closers are added)
 * 5. Return client_id and onboarding instructions
 * 
 * Required fields:
 * - company_name
 * - primary_contact_email
 * - offer_name
 * - offer_price
 * - filter_word (CRITICAL — without this, we can't identify their sales calls)
 * - plan_tier
 * - timezone
 */
```

### Closer Onboarding Flow

```
POST /admin/clients/:clientId/closers
```

```javascript
/**
 * Adds a closer to a client.
 * 
 * Steps:
 * 1. Validate required fields
 * 2. Check closer doesn't already exist for this client (by work_email)
 * 3. Generate closer_id (UUID)
 * 4. Insert into Closers table
 * 5. Set up Google Calendar push notification watch for this closer's calendar
 * 6. Update client's closer_count
 * 7. Return closer_id
 * 
 * Required fields:
 * - name
 * - work_email (CRITICAL — this is how we identify them on calendar events)
 * - transcript_provider
 * 
 * PREREQUISITE: The closer must have shared their Google Calendar with Tyler's account.
 */
```

### Closer Removal

```
DELETE /admin/clients/:clientId/closers/:closerId
```

```javascript
/**
 * Deactivates a closer (does NOT delete data).
 * 
 * Steps:
 * 1. Set closer status to 'inactive'
 * 2. Stop the Google Calendar push notification watch for this closer
 * 3. Update client's closer_count
 * 4. All historical data stays in BigQuery and remains queryable
 */
```

---

## 12. DATA ISOLATION & SECURITY

### CRITICAL: Client Data Isolation

```javascript
/**
 * EVERY BigQuery query MUST include a client_id filter.
 * 
 * There is NO query in this system that returns data across multiple clients.
 * 
 * The clientIsolation middleware ensures:
 * 1. Every request that touches client data has a valid client_id
 * 2. The client_id is injected into every database query
 * 3. No endpoint can accidentally omit the client_id filter
 * 
 * The BigQueryClient class enforces this at the query level:
 * - Every query method requires client_id as a parameter
 * - Queries that don't include client_id throw an error
 * 
 * THIS IS NON-NEGOTIABLE. A client must NEVER see another client's data.
 */
```

### Webhook Authentication

```javascript
/**
 * Webhook endpoints need to verify the caller is legitimate.
 * 
 * For Google Calendar: Verify the X-Goog-Channel-Token header matches our stored token
 * For Transcript providers: Each provider has its own auth mechanism
 * For Payments: client_id in the payload + optional shared secret per client
 * 
 * For MVP: Use a per-client webhook secret stored in the Clients table.
 * The client includes this in the Authorization header or as a query parameter.
 */
```

---

## 13. AUDIT LOGGING

```javascript
/**
 * AuditLogger — Records every meaningful event in the system.
 * 
 * WHAT TO LOG:
 * - Every call record creation
 * - Every state change (with before/after values)
 * - Every transcript match (or failure to match)
 * - Every AI processing result (or error)
 * - Every payment processed
 * - Every client/closer onboarded or deactivated
 * - Every error that affects data integrity
 * 
 * WHAT NOT TO LOG:
 * - Health check pings
 * - Duplicate webhook rejections (log as a debug note, not full audit)
 * 
 * Each audit entry includes:
 * - Who/what triggered it (webhook, admin, system timeout)
 * - What changed (entity type, entity ID, field, old value, new value)
 * - When it happened (UTC timestamp)
 * - Context (client_id, additional metadata)
 * 
 * This creates a complete, queryable history of everything that happened
 * to every call, every closer, every client. Invaluable for debugging
 * and for Tyler to understand system behavior.
 */
```

---

## 14. ERROR HANDLING & ALERTING

### Error Categories

```javascript
/**
 * ERROR SEVERITY LEVELS
 * 
 * CRITICAL — Data loss or corruption risk. Alert immediately.
 *   Examples: BigQuery write failure, duplicate call created, client isolation breach
 * 
 * HIGH — Feature broken but data safe. Alert within 5 minutes.
 *   Examples: AI processing failure, transcript match failure, calendar push expired
 * 
 * MEDIUM — Degraded but functional. Alert in daily summary.
 *   Examples: Slow AI response, unknown transcript provider, missing prospect email
 * 
 * LOW — Informational. Log only.
 *   Examples: Duplicate webhook ignored, non-sales calendar event filtered out
 */
```

### Alert Delivery

```javascript
/**
 * AlertService — Sends error notifications to Tyler.
 * 
 * For MVP:
 * - CRITICAL & HIGH → Slack webhook + email immediately
 * - MEDIUM → Daily summary email
 * - LOW → Log only (queryable in AuditLog)
 * 
 * Alert format:
 * {
 *   severity: 'critical',
 *   title: 'BigQuery Write Failed',
 *   details: 'INSERT into Calls table failed for call_id abc123',
 *   client: 'Acme Corp',
 *   error: 'Error message...',
 *   timestamp: '2026-02-16T10:30:00Z',
 *   suggestedAction: 'Check BigQuery quotas and service account permissions'
 * }
 */
```

---

## 15. COST TRACKING

```javascript
/**
 * CostTracker — Tracks AI processing costs per call, per client.
 * 
 * After every Anthropic API call:
 * 1. Extract token counts from the API response (usage.input_tokens, usage.output_tokens)
 * 2. Calculate cost using configurable per-token rates
 * 3. Write to CostTracking table
 * 
 * Configurable rates (in .env):
 * AI_INPUT_COST_PER_MILLION=3.00
 * AI_OUTPUT_COST_PER_MILLION=15.00
 * 
 * Queryable aggregations:
 * - Total spend today / this week / this month
 * - Average cost per call
 * - Cost per client
 * - Highest-cost calls (long transcripts)
 * 
 * Future: Add configurable caps per client or globally
 */
```

---

## 16. API ENDPOINTS REFERENCE

### Authentication for All Endpoints

All admin endpoints require an API key in the header:
```
Authorization: Bearer {ADMIN_API_KEY}
```

Webhook endpoints use per-client or per-provider authentication (see individual endpoints below).

---

### Webhook Endpoints (called by external systems)

#### POST `/webhooks/calendar/:clientId`

**Called by:** Google Calendar Push Notifications (automatic)

**Headers:**
```
X-Goog-Channel-ID: {channel_id}        — The channel ID we created during watch setup
X-Goog-Channel-Token: {client_id}       — We set this to the client_id during watch setup
X-Goog-Resource-ID: {resource_id}       — Google's resource identifier
X-Goog-Resource-State: {sync|exists|not_exists} — What happened
X-Goog-Message-Number: {number}         — Sequential message number
```

**Body:** Empty — Google sends headers only. We then use the Calendar API to fetch the changed events.

**Auth:** Validate `X-Goog-Channel-Token` matches the `clientId` in the URL.

**Response:**
```json
{ "status": "ok" }  // 200 — Always return 200 quickly, process async
```

---

#### POST `/webhooks/transcript/:provider`

**Called by:** Fathom, Otter, Read.ai, TDLV, or any generic transcript provider

**URL Examples:**
```
POST /webhooks/transcript/fathom
POST /webhooks/transcript/otter
POST /webhooks/transcript/readai
POST /webhooks/transcript/tdlv
POST /webhooks/transcript/generic
```

**Headers:**
```
Content-Type: application/json
X-Webhook-Secret: {per_client_webhook_secret}   — Optional but recommended. Stored in Clients table.
```

**Body (Fathom example — each provider has its own format, adapter normalizes it):**
```json
{
  "title": "Discovery Call with John Smith",
  "meeting_title": "Discovery Call with John Smith",
  "url": "https://fathom.video/calls/abc123",
  "created_at": "2026-02-16T15:30:00Z",
  "scheduled_start_time": "2026-02-16T15:00:00Z",
  "scheduled_end_time": "2026-02-16T16:00:00Z",
  "recording_id": 12345,
  "recording_start_time": "2026-02-16T15:02:00Z",
  "recording_end_time": "2026-02-16T15:45:00Z",
  "calendar_invitees": [
    { "name": "John Smith", "email": "john@example.com", "is_external": true },
    { "name": "Tyler Ray", "email": "tyler@closermetrix.com", "is_external": false }
  ],
  "recorded_by": { "name": "Tyler Ray", "email": "tyler@closermetrix.com" },
  "share_url": "https://fathom.video/share/abc123",
  "transcript": "Full transcript text here...",
  "default_summary": "AI-generated summary from Fathom..."
}
```

**Body (Generic — for providers without a specific adapter):**
```json
{
  "client_id": "xxx",
  "closer_email": "closer@example.com",
  "prospect_email": "prospect@example.com",
  "prospect_name": "John Smith",
  "scheduled_start_time": "2026-02-16T15:00:00Z",
  "recording_start_time": "2026-02-16T15:02:00Z",
  "recording_end_time": "2026-02-16T15:45:00Z",
  "transcript": "Full transcript text here...",
  "recording_url": "https://example.com/recording/123",
  "transcript_url": "https://example.com/transcript/123",
  "provider": "zoom"
}
```

**Auth:** Match `closer_email` to a closer record → get `client_id`. Optionally validate `X-Webhook-Secret` against client's stored secret.

**Response:**
```json
// Success
{ "status": "ok", "call_id": "uuid-of-matched-or-created-call", "processing": true }  // 200

// Unmatched (no call found, no closer found)
{ "status": "unmatched", "reason": "Could not identify client from closer email", "held": true }  // 202

// Error
{ "status": "error", "message": "Invalid payload: missing transcript field" }  // 400
```

---

#### POST `/webhooks/payment`

**Called by:** Client's automation (Zapier, Make, custom) connected to their payment processor

**Headers:**
```
Content-Type: application/json
Authorization: Bearer {client_webhook_secret}    — Per-client secret stored in Clients table
```

**Body:**
```json
{
  "client_id": "xxx",
  "prospect_email": "john@example.com",
  "prospect_name": "John Smith",
  "payment_amount": 5000,
  "payment_date": "2026-02-15",
  "payment_type": "full",
  "product_name": "Coaching Program",
  "notes": "Paid via Stripe"
}
```

**Required fields:** `client_id`, `prospect_email`, `payment_amount`
**Optional fields:** `prospect_name`, `payment_date` (defaults to now), `payment_type` (defaults to "full"), `product_name`, `notes`

**Valid `payment_type` values:** `"full"`, `"deposit"`, `"payment_plan"`, `"refund"`, `"chargeback"`

**Auth:** Validate `Authorization` header against the client's stored `webhook_secret` in the Clients table. If no secret is configured for the client, reject the request.

**Response:**
```json
// Success — new close
{ 
  "status": "ok", 
  "action": "new_close",
  "prospect_id": "uuid",
  "call_id": "uuid-of-updated-call",
  "previous_outcome": "Follow Up",
  "new_outcome": "Closed - Won"
}  // 200

// Success — additional payment on existing close
{
  "status": "ok",
  "action": "additional_payment",
  "prospect_id": "uuid",
  "total_cash_collected": 7500
}  // 200

// Success — refund processed
{
  "status": "ok",
  "action": "refund",
  "prospect_id": "uuid",
  "refund_amount": 5000,
  "remaining_cash": 0
}  // 200

// Error — client not found or auth failed
{ "status": "error", "message": "Invalid client_id or unauthorized" }  // 401

// Error — missing required fields
{ "status": "error", "message": "Missing required field: prospect_email" }  // 400
```

---

### Admin Endpoints (called by Tyler or onboarding tools)

All admin endpoints require:
```
Authorization: Bearer {ADMIN_API_KEY}
Content-Type: application/json
```

#### POST `/admin/clients` — Create new client

**Body:**
```json
{
  "company_name": "Acme Coaching",
  "name": "John Founder",
  "primary_contact_email": "john@acmecoaching.com",
  "primary_contact_phone": "+15551234567",
  "timezone": "America/New_York",
  "offer_name": "Executive Coaching Program",
  "offer_price": 10000,
  "offer_description": "12-week executive coaching...",
  "filter_word": "strategy,discovery,sales call,intro call",
  "plan_tier": "insight",
  "calendar_source": "google_calendar",
  "transcript_provider": "fathom",
  "script_template": "Full script text here...",
  "ai_prompt_overall": "This is a high-ticket executive coaching offer...",
  "ai_prompt_discovery": "Discovery must cover these 5 questions...",
  "common_objections": "Price, time commitment, skepticism about coaching",
  "disqualification_criteria": "Under $100k income, less than 2 years in role"
}
```

**Required:** `company_name`, `primary_contact_email`, `offer_name`, `offer_price`, `filter_word`, `plan_tier`, `timezone`
**Optional:** Everything else (can be added/updated later)

**Response:**
```json
{
  "status": "ok",
  "client_id": "generated-uuid",
  "webhook_secret": "auto-generated-secret-for-this-client",
  "transcript_webhook_url": "https://api.closermetrix.com/webhooks/transcript/fathom",
  "payment_webhook_url": "https://api.closermetrix.com/webhooks/payment",
  "next_steps": [
    "Add closers via POST /admin/clients/{client_id}/closers",
    "Have closers share their Google Calendar with tyler@closermetrix.com",
    "Configure Fathom webhook to send to the transcript_webhook_url",
    "Configure payment processor to send to the payment_webhook_url with Authorization header"
  ]
}
```

---

#### POST `/admin/clients/:clientId/closers` — Add closer

**Body:**
```json
{
  "name": "Sarah Closer",
  "work_email": "sarah@acmecoaching.com",
  "personal_email": "sarah@gmail.com",
  "phone": "+15559876543",
  "timezone": "America/Chicago",
  "transcript_provider": "fathom"
}
```

**Required:** `name`, `work_email`
**Optional:** Everything else

**Response:**
```json
{
  "status": "ok",
  "closer_id": "generated-uuid",
  "calendar_watch_status": "active",
  "message": "Closer added. Calendar watch created for sarah@acmecoaching.com"
}
```

---

#### GET `/admin/clients` — List all clients

**Response:**
```json
{
  "clients": [
    {
      "client_id": "xxx",
      "company_name": "Acme Coaching",
      "status": "active",
      "plan_tier": "insight",
      "closer_count": 5,
      "created_at": "2026-01-15T00:00:00Z"
    }
  ]
}
```

---

#### GET `/admin/clients/:clientId` — Get client details

**Response:** Full client record from BigQuery

---

#### PUT `/admin/clients/:clientId` — Update client

**Body:** Any fields from the Clients table that need updating
**Response:** Updated client record

---

#### GET `/admin/clients/:clientId/closers` — List closers

**Response:**
```json
{
  "closers": [
    {
      "closer_id": "xxx",
      "name": "Sarah Closer",
      "work_email": "sarah@acmecoaching.com",
      "status": "active",
      "lifetime_close_rate": 0.23,
      "calendar_watch_active": true
    }
  ]
}
```

---

#### DELETE `/admin/clients/:clientId/closers/:closerId` — Deactivate closer

**Response:**
```json
{
  "status": "ok",
  "action": "deactivated",
  "message": "Closer deactivated. Calendar watch stopped. Historical data preserved."
}
```

---

#### GET `/admin/health` — System health

**Response:**
```json
{
  "status": "healthy",
  "bigquery": "connected",
  "active_calendar_watches": 12,
  "expiring_watches_24h": 2,
  "calls_processing": 0,
  "calls_errored_today": 0,
  "ai_cost_today_usd": 4.52
}
```

---

#### GET `/admin/costs` — AI cost summary

**Query params:** `?period=today|week|month&client_id=xxx` (optional filter)

**Response:**
```json
{
  "period": "month",
  "total_calls_processed": 342,
  "total_cost_usd": 89.50,
  "avg_cost_per_call_usd": 0.26,
  "by_client": [
    { "client_id": "xxx", "company_name": "Acme", "calls": 120, "cost_usd": 31.20 }
  ]
}
```

---

#### GET `/admin/audit/:entityType/:entityId` — Audit trail

**Example:** `GET /admin/audit/call/abc-123`

**Response:**
```json
{
  "entity_type": "call",
  "entity_id": "abc-123",
  "trail": [
    { "timestamp": "2026-02-16T15:00:00Z", "action": "created", "trigger_source": "calendar_webhook", "new_value": "Scheduled" },
    { "timestamp": "2026-02-16T15:45:00Z", "action": "state_change", "field_changed": "attendance", "old_value": "Scheduled", "new_value": "Show", "trigger_source": "transcript_webhook" },
    { "timestamp": "2026-02-16T15:46:00Z", "action": "updated", "field_changed": "processing_status", "old_value": "pending", "new_value": "processing", "trigger_source": "ai_processing" },
    { "timestamp": "2026-02-16T15:48:00Z", "action": "updated", "field_changed": "call_outcome", "old_value": null, "new_value": "Follow Up", "trigger_source": "ai_processing" }
  ]
}
```

---

### Diagnostic Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/calls/unmatched` | Transcripts that couldn't match to a call |
| GET | `/admin/calls/stuck` | Calls in Scheduled state past their time |
| GET | `/admin/calendar/channels` | Active push notification channels and expiry dates |
| POST | `/admin/calendar/renew` | Force-renew all calendar channels |

---

## 17. TEST SCENARIOS

Every scenario below must have a corresponding test file. Tests should simulate the webhook payload, run it through the processing pipeline, and verify the BigQuery state.

### Pre-Call Scenarios

| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 1 | Call scheduled then canceled | Record created with attendance='Scheduled', then updated to 'Canceled' |
| 2 | Call scheduled, closer shows, prospect doesn't (Ghosted) | Record created, transcript arrives empty/one-speaker → 'Ghosted - No Show' |
| 3 | Call scheduled then rescheduled (same event ID, new time) | Original record → 'Rescheduled', new record created at new time |
| 3.5 | Call scheduled, canceled, rebooked (new event ID) | First record → 'Canceled', second record created as new call |
| 4 | Call scheduled, both show, call held | Record created, transcript arrives → 'Show' → AI processes |
| 5 | Prospect no-shows (closer doesn't show either / system glitch) | No transcript arrives → timeout → 'No Recording' |
| 6 | Prospect shows up late, shorter call | Transcript arrives with short duration, still processes normally |
| 7 | Call scheduled to wrong closer, gets reassigned | New calendar event with correct closer creates new record |
| 8 | Call rescheduled 3-4 times before happening | Each reschedule creates chain: Rescheduled → Rescheduled → Scheduled → Show |
| 9 | Duplicate booking (same prospect, two calls) | Both records created independently, both processed |
| 10 | Flaky prospect: book, cancel, rebook, cancel, rebook | Each action creates/updates records appropriately |

### Outcome Scenarios

| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 11 | Prospect says no (Lost) | AI returns 'Lost', call_outcome updated |
| 12 | Prospect pays in full (Closed - Won) | AI returns 'Closed - Won', revenue fields populated |
| 13 | Prospect needs follow-up | AI returns 'Follow Up', follow_up fields set |
| 14 | Prospect cancels after showing up | Calendar cancel after 'Show' — call record keeps 'Show' status (the call happened) |
| 15 | Multiple follow-ups before close | Each follow-up is a separate call record, all linked by prospect_email |
| 16 | Close then refund | Payment webhook with type='refund', cash_collected reduced |
| 17 | Prospect says no, then changes mind | Payment webhook arrives → updates 'Lost' call to 'Closed - Won' |

### Transcript Edge Cases

| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 18 | No transcript generated (recording fails) | Timeout → 'No Recording' |
| 19 | Garbage quality transcript | AI attempts processing, may return lower scores, still stores results |
| 20 | Call held but outcome not logged by AI | AI returns null outcome → processing_status='error', alert sent |
| 21 | Closed-won with $0 revenue | Valid — stored as-is (free trial, comp'd) |
| 22 | Closed-won with deposit only | payment_plan='Deposit', close_amount=deposit amount |
| 23 | Prospect says yes, payment fails | AI says 'Closed - Won' but no payment webhook → stays as AI outcome |
| 24 | Two closers on same call (training ride-along) | Transcript has one recorded_by → credit goes to that closer |
| 25 | Prospect is disqualified | AI returns 'Disqualified', appropriate fields set |

### Follow-Up Chaos

| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 26 | Follow-up scheduled, never happens | Sits in 'Scheduled', eventually times out to 'No Recording' |
| 27 | Follow-up happens, no → another follow-up anyway | Each is a separate call record |
| 28 | Follow-up with different closer | New call record with different closer_id, same prospect_email |
| 29 | Prospect books new first call instead of follow-up link | System correctly identifies as 'Follow Up' (prospect has prior Show) |
| 30 | Multiple follow-ups, then ghost on final one | Last record → 'Ghosted' or 'No Recording', prior records unchanged |

### Revenue Edge Cases

| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 31 | date_closed doesn't match call date | Payment sets date_closed from payment_date, not call date |
| 32 | Payment plan — revenue vs cash diverge | revenue_generated = full deal, cash_collected = what's been paid |
| 33 | Partial refund | cash_collected reduced by refund amount, outcome stays 'Closed - Won' |
| 34 | Chargeback | Same as refund but payment_type='chargeback', alert sent |
| 35 | Close then upgrade | New payment added to existing prospect, cash_collected increases |
| 36 | Calendar mismatch (wrong name on event) | System matches by email, not name — works correctly |

### System/Data Integrity

| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 37 | Calendar event exists, no call record created | Bug — should never happen. Audit log helps diagnose. |
| 38 | Call record has wrong client_id or closer_id | Rejected at creation time by validation |
| 39 | Transcript arrives hours/days late | Still matches and processes correctly (matching uses time window) |
| 40 | Duplicate call records | Prevented by appointment_id dedup check |
| 41 | Closer terminated mid-period | Status set to 'inactive', calendar watch stopped, data preserved |
| 42 | New closer added, calls already happening | New watch created, future events captured. Past events stay as-is. |
| 43 | Timezone mismatch | Everything stored in UTC, converted for display |
| 44 | AI hallucinates objections | Response validator checks objection types against config |
| 45 | Same prospect, different email addresses | Treated as different prospects (email is the key) |

### Multi-Client Scenarios

| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 46 | One closer works for two clients | Closer has two records (one per client_id). Calendar events matched by filter_word to determine which client. |
| 47 | Same prospect email across different clients | Separate prospect records per client. Complete isolation. |
| 48 | Webhook can't determine which client | Log error, alert Tyler, hold data for manual review |

---

## 18. FUTURE EXPANSION NOTES

These features are NOT in MVP but the architecture should make them easy to add:

### Email/Slack Wrapups (#1 priority after MVP)
- Add a `WrapupService` that queries BigQuery on a schedule
- Uses client's timezone for scheduling
- Templates are configurable per client
- Delivery via SendGrid/SES for email, webhook for Slack
- The audit log data makes it easy to compute "what changed this week"

### Customer-Facing Dashboard (replaces Looker Studio)
- Add React frontend served from same domain or subdomain
- Auth system: unique links first, then OAuth later
- Dashboard queries go through this API with client_id isolation
- Tier-based access: frontend checks `plan_tier` and shows/hides sections

### CRM Note Writing
- Add a `CRMService` with adapters (same pattern as calendar/transcript)
- After AI processing, push notes to client's CRM
- Configurable per client (which CRM, what format, which fields)

### Executive Tier (Compliance)
- AI prompt already extracts scores that support this
- Add `ComplianceService` that analyzes transcripts for risk phrases
- Risk categories defined in config (same pattern as objection types)
- Separate compliance-specific AI prompt addition

### Calendly/GHL/HubSpot Calendar Integration
- Create adapter (implements BaseCalendarAdapter)
- Register in calendar-providers.js config
- Each adapter normalizes to StandardCalendarEvent
- CalendarService routes to the right adapter based on client's `calendar_source`

---

## 19. BUILD ORDER

Build in this exact order. Each step is testable independently.

### Phase 1: Foundation
1. Project scaffolding (package.json, directory structure, .env)
2. Configuration system (all config files)
3. BigQueryClient (connection, parameterized queries, client isolation)
4. AuditLogger
5. Error handler + AlertService
6. Express app with health check endpoint

### Phase 2: Calendar Pipeline
7. BaseCalendarAdapter interface
8. GoogleCalendarAdapter (normalize events)
9. CalendarService (filter word matching, closer identification, prospect extraction)
10. CallStateManager (state machine, call type determination, duplicate detection)
11. Calendar webhook route
12. GoogleCalendarPush (channel creation and renewal)
13. Tests for scenarios 1-10

### Phase 3: Transcript Pipeline
14. BaseTranscriptAdapter interface
15. FathomAdapter
16. GenericAdapter (for other providers)
17. TranscriptService (matching, evaluation, routing)
18. Transcript webhook route
19. Tests for scenarios 18-25

### Phase 4: AI Processing
20. PromptBuilder (dynamic from config)
21. ResponseParser (validation, normalization)
22. AIProcessor (Anthropic API call, cost tracking)
23. CostTracker
24. Objection extraction + BigQuery writes
25. Tests for AI response handling

### Phase 5: Payments
26. PaymentService
27. ProspectService (create/update prospects)
28. Payment webhook route
29. Tests for scenarios 16-17, 31-35

### Phase 6: Admin & Onboarding
30. Client CRUD routes
31. Closer CRUD routes
32. OnboardingService (creates calendar watches)
33. Diagnostic endpoints

### Phase 7: Background Jobs
34. TimeoutService (checks for calls awaiting transcripts)
35. Calendar channel renewal job
36. Tests for timeout scenarios

### Phase 8: Integration Testing
37. Full end-to-end tests (calendar event → transcript → AI → BigQuery)
38. Multi-client isolation tests
39. All 48 scenario tests passing
- you can use the client_id: friends_inc for unfiltered testing. they're a test client.

---

## 20. CODING STANDARDS

### Documentation

```javascript
/**
 * EVERY function gets a JSDoc comment explaining:
 * 1. What it does (in plain English)
 * 2. Why it exists (what problem it solves)
 * 3. What it takes as input
 * 4. What it returns
 * 5. What can go wrong (error cases)
 * 6. Any non-obvious behavior or edge cases
 * 
 * Think of it this way: if Tyler hands this codebase to a contractor
 * who has never seen it, they should understand every function's purpose
 * without reading the implementation.
 */
```

### Error Handling

```javascript
// ALWAYS catch and handle errors explicitly
// NEVER let errors silently disappear
// ALWAYS log what failed and why
// ALWAYS preserve the data even if processing fails

try {
  const result = await aiProcessor.analyze(transcript);
  await bigquery.updateCall(callId, result);
} catch (error) {
  // 1. Log the full error with context
  logger.error('AI processing failed', { callId, clientId, error: error.message });
  
  // 2. Update the record to show it errored (don't leave it in limbo)
  await bigquery.updateCall(callId, { 
    processing_status: 'error', 
    processing_error: error.message 
  });
  
  // 3. Audit log the failure
  await auditLogger.log({
    entityType: 'call',
    entityId: callId,
    action: 'error',
    triggerSource: 'ai_processing',
    metadata: { error: error.message, stack: error.stack }
  });
  
  // 4. Alert Tyler if it's critical
  await alertService.send({
    severity: 'high',
    title: 'AI Processing Failed',
    details: `Call ${callId} for client ${clientId} failed AI processing`,
    error: error.message
  });
}
```

### SQL Safety

```javascript
// NEVER use string interpolation for SQL values
// ALWAYS use parameterized queries

// ❌ BAD — SQL injection risk, quote escaping nightmare
const query = `SELECT * FROM Calls WHERE client_id = '${clientId}'`;

// ✅ GOOD — parameterized
const query = `SELECT * FROM Calls WHERE client_id = @clientId`;
const params = { clientId };
```

### Naming Conventions

```
Files:          PascalCase for classes (CalendarService.js), camelCase for utils (dateUtils.js)
Functions:      camelCase, verb-first (getCloserByEmail, updateCallState, processTranscript)
Constants:      UPPER_SNAKE_CASE (TRANSCRIPT_THRESHOLDS, STATE_TRANSITIONS)
Config keys:    snake_case (objection_types, call_outcomes)
Database fields: snake_case (client_id, appointment_date) — matches existing BigQuery schema
Route paths:    kebab-case (/webhooks/calendar, /admin/clients)
```

### Testing

```javascript
/**
 * Tests use Jest.
 * 
 * Structure:
 * - Unit tests mock BigQuery and test individual functions
 * - Integration tests use a test dataset in BigQuery
 * - Scenario tests simulate full webhook → processing → verification flows
 * 
 * Every test file follows the pattern:
 * 
 * describe('Scenario X: Description', () => {
 *   it('should [expected behavior] when [condition]', async () => {
 *     // Arrange: Set up test data
 *     // Act: Trigger the event
 *     // Assert: Verify BigQuery state
 *   });
 * });
 */
```

---

## 21. DECISIONS LOG (from Tyler Q&A)

These decisions were made during the initial planning session and override or supplement anything above.

### Codebase & Data

- **Fresh repo** — no existing code, building from scratch
- **BigQuery is live** — existing tables (Calls, Closers, Clients, Objections) have production data. Do NOT drop or modify existing columns. Only ADD columns and CREATE new tables (Prospects, AuditLog, CostTracking).
- **Existing views** are read-only and power Looker Studio dashboards — must not break them.
- **Test client** — use `client_id: 'friends_inc'` for unfiltered testing.

### Scale & Architecture

- **Target scale:** 100+ active clients, each with 3-10 closers, each taking 5-8 calls/day. That's **1,500-8,000+ calls/day**.
- **AI processing MUST be async** — at this volume, synchronous processing in webhook handlers won't work.
- **Queue system:** Google Cloud Tasks — GCP-native, serverless, built-in retry logic, fits the existing Cloud Run infrastructure.
- **Webhook handlers return 200 immediately**, enqueue work, and process asynchronously.

### Transcript Providers

- **Fathom is the primary provider** — build this first and most thoroughly.
- **All other providers (Otter, Read.ai, TDLV, Generic) should be built as real implementations**, not just stubs.
- **Fathom API keys are per-closer or per-client** — stored in the Closers table (`transcript_api_key`) or Clients table (`transcript_integration_id`).
- **Fathom transcript polling** — the webhook may arrive WITHOUT the transcript text. In that case, poll the Fathom API to fetch the transcript. Design a retry/polling mechanism with backoff.
- **Fathom API documentation** — Tyler will provide. Build the polling logic based on their API.

### Multi-Client Closer Resolution

- A closer working for multiple clients has **separate closer records with different work_emails** per client.
  - Example: `luke@goshenites.com` → closer record for Goshenites client
  - Example: `luke@nomoremondays.io` → closer record for No More Mondays client
- The **work_email is the definitive link** to determine which client a call belongs to.
- The **filter_word** on the client config determines whether a calendar event is a sales call vs. a personal event — it does NOT determine which client the call belongs to (work_email does that).
- This means the multi-client filter_word collision scenario is a non-issue.

### AI Model

- Use the **latest Claude Sonnet model** — currently `claude-sonnet-4-5-20250929`.
- The model ID MUST be configurable via environment variable (`AI_MODEL` in .env).
- Token pricing MUST be configurable via environment variables so it can be updated without code changes.

### Deployment

- Include **Dockerfile** and **cloudbuild.yaml** in the repo.
- Deploying to **Google Cloud Run** in the `closer-automation` GCP project.
- Tyler and Claude will deploy together when the code is ready.

### Authentication & Security

- **Admin API key** is a single static key — this system is just for Tyler (solo founder).
- Stored in `.env` as `ADMIN_API_KEY`.
- Per-client webhook secrets are auto-generated during client onboarding and stored in the Clients table.

### Credentials

- All credentials (GCP service account, Anthropic API key, Fathom API keys, etc.) will be added when it's time to deploy.
- Use **placeholder configs** and **`.env.example`** with clear instructions for what each credential is and where to get it.
- Tyler has a personal Fathom API key for testing his own calls as if he were a closer.

### Alerting

- Tyler does NOT have a Slack account or an email service provider (SendGrid, etc.) set up.
- **AlertService design:** Pluggable channels with structured console logging as the default.
  - Console/structured logging — always on, immediate (this IS the MVP alert system)
  - Slack webhook — configurable, off by default, enabled when Tyler sets up Slack
  - Email (SendGrid/SES) — configurable, off by default, enabled when Tyler picks a provider
- Alert severity levels still apply (CRITICAL, HIGH, MEDIUM, LOW) — they just route to console for now.
- The AlertService interface should make it trivial to add Slack/email later (just provide the webhook URL or API key in .env).

### Existing System / n8n

- There are NO existing n8n webhook payloads or saved data to reference.
- We are building everything from scratch. The n8n system is being fully replaced.

### GCP Service Account & Calendar API

- Tyler has the `closer-automation` GCP project set up.
- Service account and Calendar API details will be configured together when we reach Phase 2 (Calendar Pipeline).
- Claude will walk Tyler through the setup steps.

---

## 22. FATHOM API REFERENCE

Complete reference for the Fathom API, used for transcript polling and webhook management.

### Base URL & Auth

```
Base URL: https://api.fathom.ai/external/v1
Auth: X-Api-Key header OR Authorization: Bearer {token}
```

Each closer (or client) has their own Fathom API key, stored in:
- `Closers.transcript_api_key` — per-closer key
- `Clients.transcript_integration_id` — per-client fallback key

### Webhook Registration

```
POST /webhooks
```

**Request:**
```json
{
  "destination_url": "https://api.closermetrix.com/webhooks/transcript/fathom",
  "triggered_for": ["my_recordings"],
  "include_transcript": true,
  "include_summary": true,
  "include_action_items": false,
  "include_crm_matches": false
}
```

At least one of `include_transcript`, `include_summary`, `include_action_items`, or `include_crm_matches` must be `true`.

**`triggered_for` options:**
- `my_recordings` — Personal recordings (this is what closers use)
- `shared_external_recordings` — Recordings from other users
- `my_shared_with_team_recordings` — Team Plan: shared with teams
- `shared_team_recordings` — Team Plan: accessible team recordings

**Response (201):**
```json
{
  "id": "webhook-id",
  "url": "https://api.closermetrix.com/webhooks/transcript/fathom",
  "secret": "auto-generated-secret-for-signature-verification",
  "created_at": "2026-02-16T00:00:00Z",
  "triggered_for": ["my_recordings"],
  "include_transcript": true,
  "include_summary": true,
  "include_action_items": false,
  "include_crm_matches": false
}
```

**Important:** The `secret` in the response is used to verify webhook signatures.

### Webhook Deletion

```
DELETE /webhooks/{id}
```

Returns 204 No Content on success.

### Webhook Payload (new-meeting-content-ready)

When Fathom finishes processing a recording, it sends a POST to the registered `destination_url`.

**Headers:**
```
webhook-id: unique-message-id
webhook-timestamp: unix-epoch-seconds
webhook-signature: v1,base64-encoded-signature
```

**Payload — complete Meeting object:**
```json
{
  "title": "Call Title",
  "meeting_title": "Calendar Event Title (nullable)",
  "recording_id": 12345,
  "url": "https://fathom.video/calls/XXXXX",
  "share_url": "https://fathom.video/share/XXXXX",
  "created_at": "2026-02-16T15:30:00Z",
  "scheduled_start_time": "2026-02-16T15:00:00Z",
  "scheduled_end_time": "2026-02-16T16:00:00Z",
  "recording_start_time": "2026-02-16T15:02:00Z",
  "recording_end_time": "2026-02-16T15:45:00Z",
  "calendar_invitees_domains_type": "one_or_more_external",
  "transcript_language": "en",
  "recorded_by": {
    "name": "Closer Name",
    "email": "closer@example.com"
  },
  "calendar_invitees": [
    {
      "name": "Prospect Name",
      "email": "prospect@example.com",
      "is_external": true
    },
    {
      "name": "Closer Name",
      "email": "closer@example.com",
      "is_external": false
    }
  ],
  "transcript": [
    {
      "speaker": {
        "display_name": "Closer Name",
        "matched_calendar_invitee_email": "closer@example.com"
      },
      "text": "Hey John, thanks for joining today.",
      "timestamp": "00:00:05"
    },
    {
      "speaker": {
        "display_name": "Prospect Name",
        "matched_calendar_invitee_email": "prospect@example.com"
      },
      "text": "Happy to be here!",
      "timestamp": "00:00:12"
    }
  ],
  "default_summary": "Markdown-formatted summary (nullable)",
  "action_items": null,
  "crm_matches": null
}
```

**IMPORTANT:** The `transcript` field may be `null` even in the webhook payload. When this happens, we must poll the Fathom API to fetch the transcript.

### Transcript Polling (when webhook has no transcript)

```
GET /recordings/{recording_id}/transcript
```

**Response (200):**
```json
{
  "transcript": [
    {
      "speaker": {
        "display_name": "string",
        "matched_calendar_invitee_email": "email@example.com"
      },
      "text": "string",
      "timestamp": "HH:MM:SS"
    }
  ]
}
```

**Polling strategy:**
1. Webhook arrives with `transcript: null`
2. Enqueue a polling job with exponential backoff
3. Poll intervals: 30s, 1min, 2min, 5min, 10min, 15min (then give up and alert)
4. Use the `recording_id` from the webhook payload to fetch the transcript
5. Once transcript is received, continue with normal processing pipeline

**Async mode:** The endpoint also supports `destination_url` query parameter. If provided, Fathom will POST the transcript to that URL when ready instead of returning it directly.

### List Meetings (for reconciliation/backfill)

```
GET /meetings
```

**Query params:**
- `recorded_by[]` — Filter by closer email(s)
- `created_after` / `created_before` — Date range filters (ISO 8601)
- `include_transcript` — Include full transcript (default: false)
- `include_summary` — Include summary (default: false)
- `cursor` — Pagination cursor

**Response:**
```json
{
  "limit": 25,
  "next_cursor": "cursor-string-or-null",
  "items": [Meeting objects]
}
```

Useful for:
- Backfilling missed webhooks
- Reconciliation checks
- Initial data migration when onboarding a closer who already has recordings

### Fathom Adapter Normalization

The FathomAdapter must convert Fathom's transcript format (array of speaker/text/timestamp objects) into a single string for AI processing:

```javascript
/**
 * Converts Fathom's structured transcript into a flat string.
 *
 * Input: [{ speaker: { display_name, email }, text, timestamp }]
 * Output: "00:00:05 - Closer Name: Hey John, thanks for joining today.\n00:00:12 - Prospect Name: Happy to be here!"
 *
 * Also extracts:
 * - speakerCount: number of unique speakers
 * - prospectEmail: from calendar_invitees where is_external = true
 * - closerEmail: from recorded_by.email
 * - durationSeconds: calculated from recording_start_time to recording_end_time
 */
```

### Error Responses (all endpoints)

- **400:** Bad request (invalid parameters)
- **401:** Missing or invalid API key / Bearer token
- **404:** Resource not found (webhook ID, recording ID)
- **429:** Rate limited — implement retry with backoff

---

## 23. TRANSCRIPT PROVIDER STRATEGY

### Design Principle

The system must support **any** transcript provider — Fathom, tl;dv, Grain, Gong, Otter.ai, Read.ai, or anything else a client might use. The adapter pattern makes this possible:

1. **Specific adapters** for providers with known webhook/API formats (Fathom, tl;dv)
2. **Generic adapter** as a catch-all for any provider that can send a standardized JSON payload
3. Every adapter normalizes to the same `StandardTranscript` format

### Provider Tier System

**Tier 1 — Full integration (webhook + API polling):**
- Fathom (see Section 22)
- tl;dv (see below)

**Tier 2 — Webhook receiver only (adapter normalizes their payload):**
- Read.ai (webhook payload fields: session_id, trigger, title, start_time, end_time, participants, owner, summary, action_items, key_questions, topics, report_url, chapter_summaries)
- Otter.ai
- Grain
- Gong

**Tier 3 — Generic (client sends standardized payload via their own automation):**
- Any provider not listed above
- Client uses Zapier/Make/custom code to format the payload

For Tier 2 providers, the adapter handles whatever webhook format they send. If we don't have their exact payload format, the adapter attempts best-effort normalization and falls back to the Generic format.

### Updated Provider Config

```javascript
// src/config/transcript-providers.js
module.exports = [
  { key: 'fathom',   label: 'Fathom',     webhookPath: 'fathom',   tier: 1, hasWebhook: true,  hasAPI: true },
  { key: 'tldv',     label: 'tl;dv',      webhookPath: 'tldv',     tier: 1, hasWebhook: true,  hasAPI: true },
  { key: 'otter',    label: 'Otter.ai',   webhookPath: 'otter',    tier: 2, hasWebhook: true,  hasAPI: false },
  { key: 'readai',   label: 'Read.ai',    webhookPath: 'readai',   tier: 2, hasWebhook: true,  hasAPI: false },
  { key: 'grain',    label: 'Grain',       webhookPath: 'grain',    tier: 2, hasWebhook: true,  hasAPI: false },
  { key: 'gong',     label: 'Gong',        webhookPath: 'gong',     tier: 2, hasWebhook: true,  hasAPI: false },
  { key: 'generic',  label: 'Generic',     webhookPath: 'generic',  tier: 3, hasWebhook: true,  hasAPI: false },
];
```

---

## 24. TL;DV API REFERENCE

### Base URL & Auth

```
Base URL: https://pasta.tldv.io/v1alpha1
Auth: x-api-key header
```

**Note:** tl;dv API is currently in alpha (v1alpha1). Expect possible changes.

### Webhook Events

tl;dv supports two webhook triggers:
- `MeetingReady` — fires when meeting processing completes
- `TranscriptReady` — fires when transcript generation finishes

Webhooks can be configured at User, Team, or Organization level.

**Webhook payload:**
```json
{
  "id": "unique-event-id",
  "event": "MeetingReady",
  "data": {
    "id": "meeting-id",
    "name": "Meeting Title",
    "happenedAt": "2026-02-16T15:00:00Z",
    "url": "https://tldv.io/app/meetings/xxx",
    "duration": 2580,
    "organizer": { "name": "Closer Name", "email": "closer@example.com" },
    "invitees": [
      { "name": "Prospect Name", "email": "prospect@example.com" }
    ]
  },
  "executedAt": "2026-02-16T15:45:00Z"
}
```

### Transcript Endpoint

```
GET /meetings/{meetingId}/transcript
```

**Response:**
```json
{
  "id": "transcript-id",
  "meetingId": "meeting-id",
  "data": [
    {
      "speaker": "Closer Name",
      "text": "Hey John, thanks for joining.",
      "startTime": 5.0,
      "endTime": 8.5
    },
    {
      "speaker": "Prospect Name",
      "text": "Happy to be here!",
      "startTime": 9.0,
      "endTime": 11.0
    }
  ]
}
```

### List Meetings (for reconciliation)

```
GET /meetings
```

Query params: `query`, `from`, `to`, `participatedOnly`

### tl;dv Adapter Normalization

The TLDVAdapter must convert tl;dv's format to StandardTranscript:
- `organizer.email` → closerEmail
- `invitees[0].email` → prospectEmail (filter out known closer emails)
- `happenedAt` → scheduledStartTime
- `duration` (seconds) → durationSeconds
- Transcript `data` array → flattened string format: `"00:00:05 - Speaker: text"`
- `data[].speaker` → count unique speakers for speakerCount

---

## 25. IMPLEMENTATION STATUS & CHANGES FROM SPEC

This section documents what has been built and any deviations from the original spec.

### Build Progress

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Foundation | COMPLETE | BigQuery, config, audit, alerts, Express app |
| Phase 2: Calendar Pipeline | COMPLETE | Google Calendar push, adapter, service, webhook, state machine |
| Phase 3: Transcript Pipeline | COMPLETE | Fathom adapter, TranscriptService, webhook, Fathom polling fallback |
| Phase 4: AI Processing | COMPLETE | PromptBuilder, ResponseParser, AIProcessor, CostTracker, wired into TranscriptService |
| Phase 5: Payments | COMPLETE | PaymentService, ProspectService, payment webhook |
| Phase 6: Admin & Onboarding | COMPLETE | Client CRUD, closer CRUD, Fathom auto-registration |
| Phase 7: Background Jobs | COMPLETE | TimeoutService (three-phase), ghost detection, Fathom polling |
| Phase 8: Integration Testing | COMPLETE | 446+ tests passing |

### Key Changes from Original Spec

#### 1. Attendance starts as `null`, not `'Scheduled'`
New calls are created with `attendance: null`. This keeps the dashboard clean — only calls needing attention are visible. The TimeoutService automatically moves them to `'Waiting for Outcome'` when the appointment end time passes. Legacy `'Scheduled'` records are still handled by the state machine.

#### 2. Two-phase ghost detection with Fathom polling
The TimeoutService runs a three-phase sweep every 5 minutes (configurable):
- **Phase 1:** `null/Scheduled` → `Waiting for Outcome` (appointment end time passed)
- **Phase 1.5:** Poll Fathom API for recordings matching waiting calls (30-min time tolerance)
- **Phase 2:** `Waiting for Outcome` → `Ghosted - No Show` (configurable timeout, default 2 hours)

#### 3. Simplified transcript evaluation
Removed `minProspectUtterances` and `minProspectWords` thresholds. Now: 2+ speakers = always Show. The AI determines the outcome (Follow Up, Lost, Not Pitched, etc.) even for short conversations. This prevents false Ghosted classifications.

#### 4. Overbooked attendance type
Added `'Overbooked'` state for when a closer is double-booked and takes another call. Detected by checking for overlapping call times when a transcript arrives for one of the calls.

#### 5. AI processing is inline (not queued)
The original spec called for Google Cloud Tasks for async processing. Currently, AI processing runs inline after transcript evaluation in TranscriptService. This works for current scale and can be moved to a queue later.

#### 6. Fathom webhook auto-registration
When a closer is onboarded with a `transcript_api_key`, the system auto-registers a Fathom webhook via their API. The webhook secret is stored in the closer record for verification.

#### 7. BigQuery uses DML INSERT, not streaming
Streaming inserts put rows in a buffer where they CANNOT be updated/deleted for up to 90 minutes. All inserts use `INSERT INTO ... VALUES` DML statements so rows are immediately updatable.

#### 8. `appointment_end_date` column added to Calls
Stores the calendar event's end time. Used by TimeoutService for accurate "is the call over?" detection. Falls back to `appointment_date` for legacy records.

#### 9. Google strips titles from cancelled events
When Google Calendar marks an event as cancelled or deleted, it often strips the title. The calendar pipeline bypasses the filter word check for cancelled events to ensure they're processed correctly.

#### 10. Calendar event deduplication by event ID
The same calendar event can appear on multiple closers' calendars. The system deduplicates by event ID before processing to prevent duplicate call records.

### Environment Variables (Current)

```bash
TRANSCRIPT_TIMEOUT_MINUTES=5        # Testing: 5 min. Production: 120
GHOST_CHECK_INTERVAL_MINUTES=5      # How often TimeoutService runs
```

### Deployment

```bash
# Deploy to Cloud Run
export PATH="/Users/user/google-cloud-sdk/bin:$PATH"
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=COMMIT_SHA=$(git rev-parse --short HEAD) \
  --project=closer-automation
```

---

## END OF DOCUMENT

This document contains everything needed to build the CloserMetrix Node.js backend. Read it fully before writing code. Follow the build order. Test as you go. Document everything.

If something is ambiguous, the answer is probably in this document. If it truly isn't, ask Tyler before assuming.
