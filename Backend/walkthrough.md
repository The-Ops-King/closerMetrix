# CloserMetrix Backend Walkthrough

How the backend works, end to end.

---

## The Big Picture

CloserMetrix is a sales call intelligence platform. It connects to your closers' calendars and transcript providers, automatically processes every sales call through AI, and stores structured data in BigQuery for dashboards.

There are three main pipelines:

1. **Calendar Pipeline** -- Calendar event happens --> call record created in BigQuery
2. **Transcript Pipeline** -- Recording finishes --> matched to call record --> AI analyzes --> scores and outcomes stored
3. **Payment Pipeline** -- Payment comes in --> matched to prospect --> call outcome updated

Plus one background job:

4. **TimeoutService** -- Checks every 5 minutes for calls that should be marked as ghosted/no-show

---

## How the Server Starts

**File: `src/index.js`**

```
1. Express app is loaded (from src/app.js)
2. Server starts listening on PORT (8080 in Cloud Run)
3. TimeoutService.start() kicks off the background ghost detection job
4. Process-level error handlers catch uncaught exceptions
```

**File: `src/app.js`**

Sets up Express with:
- Helmet (security headers)
- CORS
- JSON body parsing (10MB limit for large transcripts)
- Request logging middleware
- All routes registered via `src/routes/index.js`

---

## Pipeline 1: Calendar Events

**When a calendar event changes, here's exactly what happens:**

### Step 1: Google sends a push notification

Google Calendar sends a POST request to:
```
POST /webhooks/calendar/:clientId
```

This is headers-only (no body). The headers tell us what changed.

**File: `src/routes/webhooks/calendar.js`**

The route immediately returns `200 OK` (Google requires this), then processes asynchronously:

```javascript
res.status(200).json({ status: 'ok' });

// Process asynchronously
calendarService.processCalendarNotification(clientId, req.headers)
```

### Step 2: CalendarService fetches the changed events

**File: `src/services/calendar/CalendarService.js`**

1. Ignores `sync` notifications (sent when channel is first created)
2. Looks up the client record from BigQuery (to get `filter_word`, etc.)
3. Calls Google Calendar API to fetch the actual events that changed
4. For each event, runs `_processOneEvent()`

### Step 3: Process each event

For each raw Google Calendar event:

1. **In-memory dedup** -- Google often sends 2-3 notifications for the same change within seconds. A 60-second dedup window prevents duplicate records.

2. **Normalize** -- `GoogleCalendarAdapter` converts the raw Google event into a `StandardCalendarEvent` with consistent fields (eventId, startTime, endTime, attendees, status).

3. **Identify the closer** -- Look up the calendar owner's email in the Closers table. If no match, skip this event.

4. **Filter word check** -- Does the event title contain any of the client's filter words? (e.g., "strategy", "discovery", "sales call"). If not, skip it. Exception: cancelled/deleted events bypass this check because Google strips titles from them.

5. **Extract the prospect** -- From the attendees list, remove the closer and any known closer emails. The remaining attendee is the prospect.

6. **Hand off to CallStateManager**

### Step 4: CallStateManager creates or updates the call record

**File: `src/services/CallStateManager.js`**

This is the core state machine. It handles:

**Deduplication logic:**
- No existing record with this event ID? --> Create new call
- Existing record is still pre-outcome (null/Scheduled/Waiting)? --> Update it (time change, info update)
- Existing record already has an outcome (Show + AI result)? --> Create a new record (it's a follow-up)
- Event is cancelled/deleted? --> Cancel the existing record

**Creating a new call:**
- Generates a UUID for `call_id`
- Sets `attendance: null` (blank on dashboard)
- Determines `call_type` (First Call or Follow Up) by checking if this prospect has any prior "Show" calls
- Writes to BigQuery
- Logs to audit trail

**Cancelling a call:**
- Transitions attendance to `'Canceled'`
- Works from any pre-outcome state (null, Scheduled, Waiting for Outcome)

**Updating an existing call:**
- Updates appointment date, prospect info, etc.
- Checks for overbooking (if the time changed and now overlaps another call)

---

## Pipeline 2: Transcript Processing

**When a recording finishes, here's exactly what happens:**

### Step 1: Transcript provider sends a webhook

```
POST /webhooks/transcript/:provider
```

Where `:provider` is `fathom`, `tldv`, `otter`, `readai`, `generic`, etc.

**File: `src/routes/webhooks/transcript.js`**

Same pattern as calendar: returns 200 immediately, processes async.

### Step 2: TranscriptService orchestrates everything

**File: `src/services/transcript/TranscriptService.js`**

**Step 2a: Normalize the payload**

Each provider has a different webhook format. The adapter converts it to a `StandardTranscript`:
- `closerEmail` -- who recorded it
- `prospectEmail` -- who was the other participant
- `scheduledStartTime` -- when it was supposed to happen
- `transcript` -- the full text (flattened from speaker/text/timestamp objects)
- `speakerCount` -- how many distinct speakers
- `durationSeconds` -- how long the call was
- `shareUrl` -- link to the recording

For Fathom specifically (`src/services/transcript/adapters/FathomAdapter.js`):
- `recorded_by.email` --> closerEmail
- `calendar_invitees` where `is_external = true` --> prospectEmail
- Transcript is an array of `{speaker, text, timestamp}` objects --> flattened to a single string like `"00:00:05 - Speaker Name: What they said"`

**Step 2b: Identify the client**

Look up the closer's email in the Closers table (across all clients). The closer record tells us which client this belongs to.

**Step 2c: Match to an existing call record**

Matching priority:
1. Closer email + prospect email + scheduled time (within 30 minutes) -- high confidence
2. Closer email + scheduled time (within 30 minutes) -- medium confidence
3. No match found --> create a new call record from the transcript data

**Step 2d: Evaluate the transcript**

Simple rules:
- No transcript text? --> Ghosted
- Less than 50 characters? --> Ghosted
- Only 1 speaker? --> Ghosted (closer talked to themselves)
- 2+ speakers? --> **Always Show**. The AI will determine the specific outcome.

**Step 2e: Update the call record**

Transition the call's attendance:
- If Show: `attendance = 'Show'`, `processing_status = 'queued'`
- If Ghosted: `attendance = 'Ghosted - No Show'`, `processing_status = 'complete'`

**Step 2f: AI processing (inline, if Show)**

If the call is a Show with transcript text, AI processing kicks off immediately:

### Step 3: AI Processing Pipeline

**File: `src/services/ai/AIProcessor.js`**

1. **Fetch the client record** -- needed for custom AI prompts
2. **Build the prompt** (`src/services/ai/PromptBuilder.js`):
   - Layer 1: Master prompt (scoring rubric, objection types, outcome categories, output schema)
   - Layer 2: Client-specific mini-prompts (business context, script template, custom scoring instructions)
   - Both layers are built dynamically from config files
3. **Call the Anthropic API** -- sends transcript + prompt to Claude Sonnet
4. **Parse the response** (`src/services/ai/ResponseParser.js`):
   - Strip markdown fences
   - Parse JSON
   - Validate `call_outcome` against config
   - Clamp scores to 1.0-10.0 range
   - Fuzzy-match objection types against config
5. **Update the call record** with:
   - `call_outcome` (Closed - Won, Follow Up, Lost, Disqualified, Not Pitched, Deposit)
   - 7 scores (discovery, pitch, close attempt, objection handling, overall, script adherence, prospect fit)
   - Goals, pains, situation (AI-extracted)
   - AI summary and coaching feedback
   - Key moments
6. **Store objections** in the Objections table (one row per objection)
7. **Record cost** in the CostTracking table (input tokens, output tokens, USD cost)
8. **Transition state** from Show to the final outcome

If AI fails at any point, the call stays as "Show" with `processing_status: 'error'` so it can be retried.

---

## Pipeline 3: Payments

**When a payment comes in:**

```
POST /webhooks/payment
```

**File: `src/services/PaymentService.js`**

1. Validate the payload (client_id, prospect_email, payment_amount required)
2. Find or create a Prospect record (by email + client_id)
3. Update the prospect (total_cash_collected, payment_count, etc.)
4. Find the most recent "Show" call for this prospect
5. If that call's outcome is Follow Up or Lost --> transition to Closed - Won
6. If it's already Closed - Won --> just add to cash_collected
7. For refunds/chargebacks --> subtract from cash_collected
8. Log everything

---

## Background Job: TimeoutService

**File: `src/services/TimeoutService.js`**

Runs every 5 minutes (configurable). Does a three-phase sweep:

### Phase 1: null/Scheduled --> Waiting for Outcome

Finds all calls where:
- Attendance is `null` or `'Scheduled'`
- The appointment END TIME has passed (not start time -- the call might still be happening)

Transitions them to `'Waiting for Outcome'`. This removes them from "upcoming calls" on the dashboard and signals the system is waiting for a transcript.

### Phase 1.5: Poll Fathom for missing transcripts

Sometimes Fathom webhooks don't arrive (unreliable delivery). This fallback:
1. Finds all active closers with Fathom API keys
2. For each closer, finds their calls in Waiting for Outcome (no transcript yet)
3. Calls the Fathom API: `GET /meetings?include_transcript=true&created_after={24h ago}`
4. Matches returned meetings to waiting calls by scheduled time (within 30 minutes)
5. Processes any matches through the normal transcript pipeline

### Phase 2: Waiting for Outcome --> Ghosted - No Show

Finds all calls where:
- Attendance is `'Waiting for Outcome'`
- The appointment end time is past the timeout threshold (now - TRANSCRIPT_TIMEOUT_MINUTES)

Transitions them to `'Ghosted - No Show'` with `transcript_status: 'No Transcript'`.

**Current settings (testing):**
- `GHOST_CHECK_INTERVAL_MINUTES=5` (how often the sweep runs)
- `TRANSCRIPT_TIMEOUT_MINUTES=5` (how long to wait for a transcript before declaring ghosted)

**Production settings:**
- `GHOST_CHECK_INTERVAL_MINUTES=5`
- `TRANSCRIPT_TIMEOUT_MINUTES=120` (2 hours)

---

## The State Machine

Every call follows this lifecycle. The state is stored in the `attendance` field.

```
null (new call)
  |
  |--> Canceled (event deleted/cancelled/declined)
  |--> Rescheduled (event moved to new time)
  |--> Overbooked (closer was in another call)
  |--> Waiting for Outcome (appointment end time passed) -- TimeoutService Phase 1
  |       |
  |       |--> Show (transcript arrived, 2+ speakers) -- transcript pipeline
  |       |--> Ghosted - No Show (timeout, no transcript) -- TimeoutService Phase 2
  |       |--> Canceled (event cancelled while waiting)
  |
  |--> Show (transcript arrived before timeout)
  |       |
  |       |--> Closed - Won (AI outcome or payment)
  |       |--> Deposit (AI outcome)
  |       |--> Follow Up (AI outcome)
  |       |--> Lost (AI outcome)
  |       |--> Disqualified (AI outcome)
  |       |--> Not Pitched (AI outcome)
  |
  |--> Ghosted - No Show (transcript was empty/single speaker)
```

Valid transitions are enforced by `CallStateManager.transitionState()`. Invalid transitions are rejected and logged.

---

## Data Storage

Everything lives in Google BigQuery, dataset `closer-automation.CloserAutomation`.

**Tables:**
| Table | Purpose |
|-------|---------|
| `Calls` | One row per call. The main table. |
| `Closers` | One row per closer per client. Contains work_email (key for matching). |
| `Clients` | One row per client. Contains filter_word, AI prompts, config. |
| `Objections` | One row per objection. FK to Calls. Created by AI processing. |
| `Prospects` | One row per prospect per client. Created by payment pipeline or transcript pipeline. |
| `AuditLog` | Every state change, create, update, error is logged here. |
| `CostTracking` | Every AI API call is recorded with token counts and USD cost. |

**Key design decisions:**
- `appointment_date` is a STRING (legacy), not TIMESTAMP
- `call_id` (UUID) is the true primary key, not `appointment_id`
- All inserts use DML `INSERT INTO` (not streaming inserts -- streaming buffers prevent updates for 90 minutes)
- Every query includes `client_id` for data isolation between clients

---

## Key Files Quick Reference

| File | What It Does |
|------|-------------|
| `src/index.js` | Entry point. Starts server, starts TimeoutService. |
| `src/app.js` | Express setup, middleware, routes. |
| `src/config/index.js` | Loads all config from .env with defaults. |
| `src/config/attendance-types.js` | Valid attendance states. |
| `src/config/call-outcomes.js` | Valid AI outcomes. |
| `src/config/objection-types.js` | Valid objection categories (used in AI prompt). |
| `src/config/scoring-rubric.js` | Scoring scale and descriptions (used in AI prompt). |
| `src/db/BigQueryClient.js` | All BigQuery reads and writes. Singleton. |
| `src/db/queries/calls.js` | All call-related queries. |
| `src/db/queries/closers.js` | All closer-related queries. |
| `src/db/queries/clients.js` | All client-related queries. |
| `src/services/CallStateManager.js` | State machine. Handles calendar events, state transitions, dedup. |
| `src/services/calendar/CalendarService.js` | Processes Google Calendar push notifications. |
| `src/services/calendar/adapters/GoogleCalendarAdapter.js` | Normalizes Google Calendar events. |
| `src/services/calendar/GoogleCalendarPush.js` | Creates and renews calendar watch channels. |
| `src/services/transcript/TranscriptService.js` | Orchestrates transcript processing. Calls AI inline. |
| `src/services/transcript/adapters/FathomAdapter.js` | Normalizes Fathom webhook payloads. |
| `src/services/transcript/FathomAPI.js` | Fathom API client (webhook registration, meeting polling). |
| `src/services/ai/AIProcessor.js` | Sends transcript to Claude, updates call with results. |
| `src/services/ai/PromptBuilder.js` | Builds the two-layer AI prompt dynamically from config. |
| `src/services/ai/ResponseParser.js` | Validates and normalizes AI response JSON. |
| `src/services/PaymentService.js` | Matches payments to prospects and calls. |
| `src/services/ProspectService.js` | CRUD for prospect records. |
| `src/services/TimeoutService.js` | Background ghost detection (three-phase sweep). |
| `src/utils/AuditLogger.js` | Writes audit trail to BigQuery. |
| `src/utils/AlertService.js` | Error alerting (console, Slack, email). |
| `src/utils/CostTracker.js` | Records AI processing costs. |
| `src/middleware/webhookAuth.js` | Admin API key authentication. |
| `src/routes/webhooks/calendar.js` | Calendar webhook endpoint. |
| `src/routes/webhooks/transcript.js` | Transcript webhook endpoint. |
| `src/routes/webhooks/payment.js` | Payment webhook endpoint. |
| `src/routes/admin/closers.js` | Closer CRUD + Fathom webhook registration. |
| `src/routes/admin/clients.js` | Client CRUD. |
| `src/routes/admin/health.js` | Health check + diagnostics. |

---

## Admin Endpoints

All require `Authorization: Bearer {ADMIN_API_KEY}` header.

| Method | Path | What It Does |
|--------|------|-------------|
| GET | `/admin/health` | Health check (BigQuery connectivity, active watches) |
| POST | `/admin/clients` | Create a new client |
| GET | `/admin/clients` | List all clients |
| GET | `/admin/clients/:id` | Get client details |
| PUT | `/admin/clients/:id` | Update client |
| POST | `/admin/clients/:id/closers` | Add a closer (auto-registers Fathom webhook if API key provided) |
| GET | `/admin/clients/:id/closers` | List closers |
| DELETE | `/admin/clients/:id/closers/:closerId` | Deactivate closer |
| POST | `/admin/clients/:id/closers/:closerId/register-fathom` | Register Fathom webhook for existing closer |
| POST | `/admin/jobs/check-timeouts` | Manually trigger the ghost detection sweep |

---

## Deploying

```bash
export PATH="/Users/user/google-cloud-sdk/bin:$PATH"
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=COMMIT_SHA=$(git rev-parse --short HEAD) \
  --project=closer-automation
```

This builds a Docker image and deploys to Cloud Run in the `closer-automation` GCP project.

---

## Onboarding a New Client

1. `POST /admin/clients` with company info, offer details, filter_word, AI prompts
2. `POST /admin/clients/:id/closers` for each closer (name, work_email, transcript_api_key)
3. Each closer shares their Google Calendar with Tyler's Google account
4. Calendar watch channels are created automatically
5. If closer has a Fathom API key, the webhook is auto-registered

That's it. The system starts tracking their calls automatically.

---

## Onboarding a New Closer

1. `POST /admin/clients/:clientId/closers` with name, work_email, transcript_api_key
2. Closer shares their Google Calendar with Tyler
3. System auto-registers Fathom webhook (if API key provided)
4. Future calendar events that match the client's filter_word create call records
5. When Fathom sends a transcript webhook, it matches to the call record and AI processes it

---

## Error Handling Philosophy

- Webhook handlers always return 200 immediately, then process async
- If AI fails, the call stays as "Show" with `processing_status: 'error'` -- nothing is lost
- If a transcript can't match to a call, a new record is created from transcript data
- Every state change is logged to the AuditLog table
- Errors are logged with full context (callId, clientId, error message)
- AlertService sends notifications for high-severity errors
