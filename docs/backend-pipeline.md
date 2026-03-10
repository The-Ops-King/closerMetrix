# Backend Pipeline Reference

## Config (`Backend/src/config/`)

### `index.js` — Main config (from `.env` at repo root)
```
server:    { port, nodeEnv, baseUrl }
admin:     { apiKey }
gcp:       { projectId, location, credentials }
bigquery:  { projectId, dataset }
ai:        { apiKey(Anthropic), openaiApiKey, geminiApiKey, model }
email:     { host, port, user, pass }
```

### Other config files
| File | Exports |
|------|---------|
| `attendance-types.js` | Array of `{ key, label, description }` |
| `calendar-providers.js` | Provider configs |
| `call-outcomes.js` | Valid outcome values |
| `call-types.js` | `'First Call'`, `'Follow Up'` |
| `objection-types.js` | Objection category list |
| `risk-categories.js` | Compliance risk categories |
| `scoring-rubric.js` | AI scoring criteria |
| `transcript-providers.js` | Provider adapter configs |

## Services

### CallStateManager (`services/CallStateManager.js`)
| Method | Signature |
|--------|-----------|
| `handleCalendarEvent` | `(event, clientId, closer, filterWord?) → { action, callRecord }` |
| `handleTranscript` | `(transcript, clientId) → { action, callRecord }` |
| `handleTimeout` | `(callId, clientId) → boolean` |
| `transitionState` | `(callId, clientId, newState, trigger, updates?) → boolean` |

**State Transitions (`attendance` field):**

| From | To | Trigger |
|------|----|---------|
| null | `Canceled` | calendar cancelled/deleted/declined |
| null | `Rescheduled` | calendar moved, not yet held |
| null | `Show` | transcript received (valid) |
| null | `Ghosted - No Show` | transcript empty/one-speaker |
| null | `Waiting for Outcome` | appointment time passed |
| null | `No Recording` | recording failure |
| null | `Overbooked` | closer double-booked |
| `Waiting for Outcome` | `Show` | transcript received (valid) |
| `Waiting for Outcome` | `Ghosted - No Show` | transcript timeout |
| `Show` | `Follow Up` / `Lost` / `Closed - Won` / `Deposit` / `Disqualified` / `Not Pitched` | AI processing complete |

### AI Services (`services/ai/`)
| Service | Key Methods |
|---------|-------------|
| `aiClient.js` | `callAI(prompt, { provider, model, maxTokens }) → { text, inputTokens, outputTokens }` |
| `AIProcessor.js` | `processCall(callId, clientId, transcriptText) → { success, callOutcome, scores, summary, objectionCount, costUsd }` |
| `InsightEngine.js` | `generateInsight(clientId, section, metrics, opts) → { insight, generatedAt }` |
| `MarketPulse.js` | `condenseTexts(clientId, type, texts, opts) → { themes }` |
| `PromptBuilder.js` | Builds AI prompts from transcript + config |
| `ResponseParser.js` | Parses structured AI responses |

### Calendar (`services/calendar/`)
| Method | Signature |
|--------|-----------|
| `CalendarService.processCalendarNotification` | `(clientId, headers) → { processed, errors }` |
| `CalendarService.isClientSalesCall` | `(event, callSources, filterWord) → boolean` |

### Transcript (`services/transcript/`)
| Method | Signature |
|--------|-----------|
| `TranscriptService.processTranscript` | `(provider, rawPayload, clientId) → { action, callRecord }` |

Adapters: `FathomAdapter`, `GenericAdapter`, `BaseTranscriptAdapter`

### Email (`services/email/`)
| Service | Key Methods |
|---------|-------------|
| `EmailTemplateEngine` | `renderWeeklyReport(data, insights, sections) → HTML` |
| `EmailService` | `sendEmail({ to, subject, html, attachments })` |
| `EmailDataFetcher` | `fetchEmailData(clientId, type) → report data` |
| `EmailInsightGenerator` | `generateInsights(data, sections) → { section: narrative }` |
| `EmailScheduler` | `sendWeeklyReports()`, `sendReportForClient(clientId, type, { to? })` |

Cron: weekly = Monday 9am EST, monthly = 1st 9am EST

### Other Services
| Service | Key Methods |
|---------|-------------|
| `MatchingService` | `matchPaymentToCall(prospectEmail/name, clientId)` — 3-tier: email → exact name → fuzzy name |
| `PaymentService` | `processPayment(payload, clientId)` — links payment to call record |
| `TimeoutService` | `processTimeouts()` — Phase 1: Scheduled→Waiting, Phase 2: Waiting→Ghosted |
| `ProspectService` | `findOrCreate(prospectData, clientId)` |

## Webhook Routes (`Backend/src/routes/webhooks/`)

### `POST /webhooks/calendar/:clientId`
Headers: `x-goog-resource-state`, `x-goog-channel-id` (Google push). No body. Returns 200 immediately; processes async.

### `POST /webhooks/transcript/:provider`
Provider: `fathom|tldv|otter|readai|grain|gong|generic`. Body: provider-specific payload. Auth: webhook signing. Returns 200 immediately; processes async via TranscriptService.

### `POST /webhooks/payment`
Body: `{ prospect_email, ... }` payment event. Auth: webhook middleware. Updates call record.

## Admin Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/clients` | List all clients |
| GET | `/admin/clients/:id` | Client detail |
| POST | `/admin/clients/:id/tier` | Change tier |
| GET | `/admin/overview` | Cross-client summary |
| GET | `/admin/email/preview/:type` | Render email HTML (dev) |
| POST | `/admin/email/trigger/weekly` | Trigger weekly send (`?client_id=&to=`) |
| GET | `/admin/health` | Server + BQ check |

## Environment Variables

```
BACKEND_PORT / PORT          GCP_PROJECT_ID          ANTHROPIC_API_KEY
NODE_ENV                     GCP_LOCATION            OPENAI_API_KEY
BASE_URL                     GOOGLE_APPLICATION_CREDENTIALS  GOOGLE_AI_API_KEY
ADMIN_API_KEY                BQ_DATASET              SMTP_HOST/PORT/USER/PASS
```

## BigQuery Client API (`Backend/src/db/BigQueryClient.js`)

| Method | Signature | Notes |
|--------|-----------|-------|
| `query` | `(sql, params) → Array` | Core query; no clientId enforcement at this level |
| `insert` | `(tableName, row)` | DML INSERT; strips nulls; objects → PARSE_JSON |
| `insertMany` | `(tableName, rows)` | Sequential insert loop |
| `update` | `(tableName, updates, where)` | DML UPDATE; nulls → literal NULL |
| `table` | `(name) → string` | Fully-qualified backtick path |
| `healthCheck` | `() → boolean` | SELECT 1 |
