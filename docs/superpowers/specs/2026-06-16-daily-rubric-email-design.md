# Daily Rubric Email — Design Spec

**Date:** 2026-06-16
**Status:** Approved design → pending spec review
**Author:** Tyler + Claude

---

## 1. Goal

Enhance the existing daily **Closer Watch** email so that, for each watched closer, it grades every call they took that day against a **client-defined rubric** — showing what they hit and missed per call — plus an AI summary of their performance, lowest-hanging fruit, and recurring issues (informed by the prior day's wrap).

This is an **enhancement to the existing Closer Watch email**, not a new email. It reuses the existing 6 PM cron, per-closer structure, recipient resolution, and the `CLOSER_WATCH_GATE_RECIPIENT` gate.

## 2. Locked Decisions

| Decision | Choice |
|---|---|
| Rubric source | **Custom**, authored by the client admin |
| Rubric scope | **One rubric per client** (all watched closers graded against it) |
| Grading scale | **Hit / Partial / Miss** per rubric item, per call |
| When grading runs | **At call ingestion** (transcript already in hand), not at 6 PM |
| Delivery | Extends the existing Closer Watch email |
| Rollout | Phased — Phase 1: config + grading + grid; Phase 2: AI summary + prior-day memory |
| Recipient gating | Reuse `CLOSER_WATCH_GATE_RECIPIENT` (stays gated to Tyler until go-live) |

## 3. Why grade at ingestion (not at 6 PM)

Custom-rubric grading needs the call transcript. Transcripts are **not persisted** today — they are processed in-flight at webhook time and discarded. Rather than introduce transcript storage, we grade the call against the client's current rubric in the same pipeline that already AI-scores it (transcript already loaded), and store only the **compact result**.

**Consequences (accepted):**
- Only calls ingested *after* ship get rubric grades — the grid fills in over a day or two.
- Rubric edits apply to **future** calls; past calls keep the grade from the rubric version active at their ingestion (captured via `rubric_version`).
- No transcript storage, no large 6 PM LLM burst, cost amortized one-call-at-a-time.

Rejected alternative: persist transcripts + grade in a 6 PM batch (enables retroactive re-grading when the rubric changes, but adds storage, a heavy batch, and a slower email — not worth it for v1).

## 4. Architecture

Five components, each independently understandable/testable:

### 4.1 Rubric config (Phase 1)
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
- **UI:** new section in `Frontend/client/src/pages/client/SettingsPage.jsx`, adjacent to the Closer Watch section (~lines 2025–2130). Add / edit / reorder / delete items; each item has a short `label` + a `criteria` line (the instruction the grader AI uses).
- **Persistence:** existing save paths — client dashboard `PUT /dashboard/settings` and admin `PUT /admin/clients/:clientId` (both already accept full `settings_json`). No new write route.

### 4.2 Rubric grader (Phase 1)
- New module `Backend/src/services/ai/RubricGrader.js`, invoked from the call-processing pipeline right after the existing `AIProcessor` scoring step (transcript in scope).
- Input: transcript + the client's current `rubric` (items + criteria).
- Output written to the `Calls` row:
  - `rubric_grades` (JSON): `[{ "item_id": "agenda", "result": "hit|partial|miss", "evidence": "one-line quote/why" }]`
  - `rubric_version` (INT): the version graded against.
- Uses the client's configured `ai_provider` (same selection logic as `AIProcessor`). One additional AI call per processed call.
- Graceful: if the client has no rubric configured, skip (no grades written). If grading fails, log and leave `rubric_grades` null — never block call processing.

### 4.3 Daily wrap memory (Phase 2)
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

### 4.4 Email content
- New section appended to the Closer Watch report in `Backend/src/services/email/EmailTemplateEngine.js` (`renderDailyOnboardingReport`), fed by `EmailDataFetcher.fetchDailyOnboardingData`.
- **Rubric grid (Phase 1):** rows = rubric items, columns = today's graded calls, cells = ✓ (hit) / ◐ (partial) / ✗ (miss). Right-hand column = per-item hit-rate for the day. Uses the *current* rubric items; calls graded against an older version map by `item_id` where present, blank otherwise.
- **AI summary block (Phase 2):** "what they did well", the single lowest-hanging-fruit, and recurring issues — referencing yesterday's wrap.
- Styling follows the existing dark email theme (`COLORS`, GCS-hosted icons); no new colors.

### 4.5 Scheduling
- No change to timing. `EmailScheduler.sendDailyOnboardingReports()` already runs hourly and fires at 6 PM in the closer's timezone, gated by `CLOSER_WATCH_GATE_RECIPIENT`. The new section is included when the closer has graded calls that day and the client has a rubric.

## 5. Data flow

```
Call webhook → TranscriptService → AIProcessor (existing scores)
                                  → RubricGrader (NEW: grade vs rubric@version)
                                  → Calls row: rubric_grades + rubric_version
...
6 PM cron → EmailScheduler → EmailDataFetcher (reads rubric_grades for the day,
                                               reads yesterday's CloserDailyWrap)
                           → generate AI summary → write today's CloserDailyWrap
                           → EmailTemplateEngine (grid + summary)
                           → Resend → recipient (gated)
```

## 6. Edge cases & error handling
- **No rubric configured** → grader skips; email omits the rubric section entirely.
- **No held/graded calls that day** → grid shows "No graded calls today"; no summary written.
- **Grading failure on a call** → `rubric_grades` null; call still processes; that call shows "—" in the grid.
- **Rubric changed mid-watch** → grid renders current items; older-version grades map by `item_id`, missing items blank.
- **First day after ship** → grid sparse until calls accumulate (documented expectation).

## 7. Security (per CLAUDE.md)
- Every BQ read/write (`CloserDailyWrap`, `Calls.rubric_grades`) includes `client_id`; parameterized queries only.
- Rubric config flows through existing allowlisted settings update paths — no new mass-assignment surface.
- No transcripts persisted; grading evidence strings are short, model-generated, client-scoped.

## 8. Out of scope (v1)
- Retroactive grading of historical calls.
- Per-closer or per-watch-type rubrics (single per-client rubric only).
- Numeric per-item scoring or trend charts over time.
- Client-facing (un-gated) delivery — remains gated until a separate go-live decision.

## 9. Phasing
- **Phase 1:** rubric config UI + `RubricGrader` + `Calls` columns + the per-call grid in the email. Delivers a usable graded grid.
- **Phase 2:** `CloserDailyWrap` table + AI summary block + prior-day continuity.
