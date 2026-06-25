# Daily Scorecard Email — Design Spec

**Date:** 2026-06-25
**Status:** Approved design → pending spec review
**Author:** Tyler + Claude
**Supersedes:** `2026-06-16-daily-rubric-email-design.md` (carries it forward, adds manager bundle + Executive-tier gating)

---

## 1. Goal

For each watched closer, grade **every call they took that day** against a **client-defined scorecard rubric** — showing per call what they hit, partially hit, and missed — and deliver it as a daily email. Executives author the rubric (the "scorecard"). Phase 2 adds an AI summary of the day with the single highest-leverage fix and recurring issues, with continuity from the prior day.

This is an **enhancement to the existing Closer Watch daily email**, not a new email and not a new cron. It reuses the existing infrastructure that already runs in production.

## 2. What already exists (reuse, do not rebuild)

Verified in code as of 2026-06-25:

| Piece | Location | State |
|---|---|---|
| Daily per-closer email cron | `EmailScheduler.sendDailyOnboardingReports()` (`Backend/src/services/email/EmailScheduler.js:235`), wired at `Backend/src/index.js:63` | ✅ Runs hourly, fires 6 PM in closer's timezone |
| Delivery gate | `CLOSER_WATCH_GATE_RECIPIENT` (`Backend/src/config/index.js:107`) | ✅ Gates all sends to Tyler until go-live |
| Email render | `EmailTemplateEngine.renderDailyOnboardingReport()` (`EmailTemplateEngine.js:555`) | 🟡 Renders metrics/adherence/objections/violations — **no rubric section** |
| Data fetch | `EmailDataFetcher.fetchDailyOnboardingData()` (`EmailDataFetcher.js:728`) | 🟡 Fetches closer/team data — **no rubric data** |
| Resend send | `EmailService.sendEmail()` (`Backend/src/services/email/EmailService.js:55`), `resend@^6.12.4` | ✅ Production-ready |
| Watched-closer config | `settings_json.notifications.close_watches`, UI in `SettingsPage.jsx:2025–2130` | ✅ Selects which closers are watched |

**Not built (this spec delivers it):** rubric config UI, `RubricGrader`, `Calls.rubric_grades`/`rubric_version` columns, per-call grid in the email, manager bundle, `CloserDailyWrap` table + AI summary.

## 3. Locked decisions

| Decision | Choice |
|---|---|
| Grading engine | **Custom AI rubric** — client-authored items + criteria, graded **Hit / Partial / Miss** per item per call |
| Rubric source | **Custom**, authored by the client **Executive-tier** admin |
| Rubric scope | **One rubric per client** (all watched closers graded against it) |
| Who can edit the rubric | **Executive tier only** (enforced server-side via `requireTier('executive')`) |
| When grading runs | **At call ingestion** (transcript already in hand), not at 6 PM |
| Delivery | Extends the existing Closer Watch email; **adds a manager bundle** |
| Manager bundle | **Yes** — Executive toggle sends every rep's card in one email to the manager |
| Recipient gating | Reuse `CLOSER_WATCH_GATE_RECIPIENT` (stays gated to Tyler until go-live) |
| Rollout | Phased — Phase 1: config + grading + grid + manager bundle; Phase 2: AI summary + prior-day memory |

**Note on grading mechanism:** an earlier option was to threshold the existing numeric beat scores (`intro_score ≥ 7`, etc.). Rejected in favor of the custom AI rubric so Executives can define arbitrary beats, not just tune the fixed 7. Consequence accepted: grades are **forward-only** (calls ingested after ship), and there is one extra AI call per processed call.

## 4. Why grade at ingestion (not at 6 PM)

Custom-rubric grading needs the call transcript. Transcripts are **not persisted** today — processed in-flight at webhook time and discarded. Rather than introduce transcript storage, grade the call against the client's current rubric in the same pipeline that already AI-scores it (transcript already loaded), and store only the **compact result**.

**Consequences (accepted):**
- Only calls ingested *after* ship get rubric grades — the grid fills in over a day or two.
- Rubric edits apply to **future** calls; past calls keep the grade from the rubric version active at their ingestion (captured via `rubric_version`).
- No transcript storage, no large 6 PM LLM burst, cost amortized one call at a time.

Rejected alternative: persist transcripts + grade in a 6 PM batch (enables retroactive re-grading when the rubric changes, but adds storage, a heavy batch, and a slower email — not worth it for v1).

## 5. Architecture

Six components, each independently understandable/testable.

### 5.1 Rubric config (Phase 1)
- Stored in `clients.settings_json.notifications.rubric`, parallel to `close_watches`:
  ```json
  {
    "version": 3,
    "items": [
      { "id": "agenda", "label": "Set the agenda", "criteria": "Stated the call structure and got a yes before discovery." },
      { "id": "budget", "label": "Confirmed budget", "criteria": "Explicitly confirmed the prospect can afford the offer." }
    ]
  }
  ```
- `version` is an integer bumped on every save (so grades record which rubric they were judged against).
- **UI:** new "Scorecard Rubric" section in `Frontend/client/src/pages/client/SettingsPage.jsx`, adjacent to the Closer Watch section (~lines 2025–2130). Add / edit / reorder / delete items; each item has a short `label` + a `criteria` line (the instruction the grader AI uses). **Section is rendered only for Executive-tier dashboards** (`useTier`), and disabled/hidden otherwise.
- **Persistence (server-side gate is the real enforcement):** rubric writes go through a path guarded by `requireTier('executive')`. The existing settings save paths (`PUT /dashboard/settings`, `PUT /admin/clients/:clientId`) accept full `settings_json`; the `notifications.rubric` key specifically must be writable only by Executive-tier (or admin). Use an allowlist on the settings update so non-Executive callers cannot mutate `notifications.rubric` (mass-assignment guard per CLAUDE.md). No new write route if the tier check can be applied to the rubric key within the existing handler; otherwise add a dedicated `PUT /dashboard/settings/rubric` behind `requireTier('executive')`.

### 5.2 Rubric grader (Phase 1)
- New module `Backend/src/services/ai/RubricGrader.js`, invoked from the call-processing pipeline right after the existing `AIProcessor` scoring step (transcript in scope).
- Input: transcript + the client's current `rubric` (items + criteria).
- Output written to the `Calls` row:
  - `rubric_grades` (JSON): `[{ "item_id": "agenda", "result": "hit|partial|miss", "evidence": "one-line quote/why" }]`
  - `rubric_version` (INT): the version graded against.
- Uses the client's configured `ai_provider` (same selection logic as `AIProcessor`). One additional AI call per processed call.
- Graceful: if the client has no rubric configured, skip (no grades written). If grading fails, log and leave `rubric_grades` null — never block call processing.

### 5.3 Daily wrap memory (Phase 2)
- New BigQuery table `CloserDailyWrap`:
  | column | type | notes |
  |---|---|---|
  | `client_id` | STRING | isolation key |
  | `closer_id` | STRING | |
  | `wrap_date` | DATE | one row per closer per day |
  | `summary` | STRING | AI narrative |
  | `lowest_hanging_fruit` | STRING | the #1 fix |
  | `recurring_issues` | STRING (JSON array) | |
  | `grade_totals` | STRING (JSON) | per-item hit/partial/miss counts for the day |
  | `created_at` | TIMESTAMP | |
- Written when the daily email is generated. The next day's summary generation reads the prior `wrap_date` row for that closer to provide continuity ("still missing X from yesterday").

### 5.4 Email content — per-closer card (Phase 1)
- New section appended to the Closer Watch report in `EmailTemplateEngine.renderDailyOnboardingReport`, fed by `EmailDataFetcher.fetchDailyOnboardingData`.
- **Rubric grid (Phase 1):** rows = rubric items, columns = today's graded calls, cells = ✓ (hit) / ◐ (partial) / ✗ (miss). Right-hand column = per-item hit-rate for the day. Uses the *current* rubric items; calls graded against an older version map by `item_id` where present, blank otherwise.
- **AI summary block (Phase 2):** "what they did well", the single lowest-hanging-fruit, and recurring issues — referencing yesterday's wrap.
- Styling follows the existing dark email theme (`COLORS`, GCS-hosted icons); no new colors.

### 5.5 Manager bundle (Phase 1 — new in this spec)
- New `settings_json.notifications.rubric_manager_bundle`:
  ```json
  { "enabled": true, "recipient": "" }
  ```
  `recipient` is optional; when blank, falls back to `notification_email`, then `primary_contact_email`.
- **Toggle in the same Executive-only Settings section** ("Email me the team bundle").
- **Delivery:** in `sendDailyOnboardingReports()`, after building each watched closer's card for a client, if the bundle is enabled, concatenate every rep's rendered card into one email and send it to the resolved manager recipient. Reuses the same per-closer card markup — the bundle is a stack of the same cards, not a new layout.
- Gated by `CLOSER_WATCH_GATE_RECIPIENT` like all sends. Skips reps with no graded calls that day (no empty cards in the bundle); if no rep had calls, the bundle is not sent.

### 5.6 Scheduling
- No change to timing. `sendDailyOnboardingReports()` already runs hourly and fires at 6 PM in the closer's timezone, gated by `CLOSER_WATCH_GATE_RECIPIENT`. The rubric section is included when the closer has graded calls that day and the client has a rubric. The manager bundle fires in the same client pass.

## 6. Data flow

```
Call webhook → TranscriptService → AIProcessor (existing scores)
                                  → RubricGrader (NEW: grade vs rubric@version)
                                  → Calls row: rubric_grades + rubric_version
...
hourly cron → EmailScheduler.sendDailyOnboardingReports()
   for each active client at its 6 PM:
     EmailDataFetcher (reads rubric_grades for the day per closer,
                       reads yesterday's CloserDailyWrap [P2])
     → [P2] generate AI summary → write today's CloserDailyWrap
     → EmailTemplateEngine (per-closer card: grid + summary)
     → Resend → each watched closer (gated)
     → if rubric_manager_bundle.enabled: stack all reps' cards
       → Resend → manager recipient (gated)
```

## 7. Edge cases & error handling
- **No rubric configured** → grader skips; email omits the rubric section; manager bundle not sent.
- **No held/graded calls that day** → grid shows "No graded calls today"; no summary written; rep excluded from manager bundle.
- **Grading failure on a call** → `rubric_grades` null; call still processes; that call shows "—" in the grid.
- **Rubric changed mid-watch** → grid renders current items; older-version grades map by `item_id`, missing items blank.
- **Manager recipient unresolved** (toggle on but no recipient and no fallbacks) → log and skip the bundle; per-closer emails still send.
- **Non-Executive tries to edit rubric** → server rejects (403 via `requireTier('executive')`); UI hides the section.
- **First day after ship** → grid sparse until calls accumulate (documented expectation).

## 8. Security (per CLAUDE.md)
- Every BQ read/write (`CloserDailyWrap`, `Calls.rubric_grades`) includes `client_id`; parameterized queries only.
- Rubric config and manager-bundle writes are gated server-side to Executive tier (`requireTier('executive')`) and pass through an allowlisted settings update — non-Executive callers cannot mutate `notifications.rubric` or `notifications.rubric_manager_bundle` (mass-assignment guard).
- Manager recipient email is validated (format) before send; sends remain gated by `CLOSER_WATCH_GATE_RECIPIENT` until go-live.
- No transcripts persisted; grading evidence strings are short, model-generated, client-scoped.
- No secrets in source; Resend key already via env/Secret Manager.

## 9. Out of scope (v1)
- Retroactive grading of historical calls.
- Per-closer or per-watch-type rubrics (single per-client rubric only).
- Numeric per-item scoring or trend charts over time.
- True per-closer authenticated self-serve (dashboard token is client-level; the rubric and toggles are managed in the shared Executive Settings panel).
- Client-facing (un-gated) delivery — remains gated until a separate go-live decision.

## 10. Phasing
- **Phase 1:** rubric config UI (Executive-only) + `RubricGrader` + `Calls.rubric_grades`/`rubric_version` columns + per-call grid in the per-closer email + **manager bundle**. Delivers a usable graded grid to reps and managers.
- **Phase 2:** `CloserDailyWrap` table + AI summary block + prior-day continuity.

## 11. Open verification items (resolve during planning, not blockers)
- **Exact beat/score column names:** `adherence.js` uses `calls_pitch_score` / `calls_close_attempt_score` / `calls_objection_handling_score` and a `calls_discovery_score`, while CLAUDE.md lists `pitch_adherence_score` / `close_adherence_score` / `objection_adherence_score` and says `discovery_score` does not exist. Rubric grading does **not** depend on these (it reads transcript), but confirm against `docs/database.md` before touching any adherence rendering.
- **`Calls` schema migration:** confirm the migration pattern in `Backend/src/db/migrations/` (latest is `004_payment_enhancement.js`) for adding `rubric_grades` (JSON/STRING) and `rubric_version` (INT).
- **Settings write path:** confirm whether the existing `PUT /dashboard/settings` handler can carry an Executive-only allowlist for the `rubric` key, or whether a dedicated `PUT /dashboard/settings/rubric` route behind `requireTier('executive')` is cleaner.
- **AI provider selection:** confirm `AIProcessor`'s provider-selection helper is reusable by `RubricGrader`.
