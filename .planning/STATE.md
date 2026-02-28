# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-28)

**Core value:** When a payment webhook arrives, it must find the right call record and correctly track first payment vs total payments — even when the payment email doesn't match perfectly.
**Current focus:** Phase 1 — Schema Migration

## Current Position

Phase: 1 of 4 (Schema Migration)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-02-28 — Roadmap created, ready for Phase 1 planning

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

*Updated after each plan completion*

## Accumulated Context

### Decisions

- Fuzzy threshold: 0.82 (STACK.md, PubMed-backed) — stored in config with env var override
- Idempotency: Deterministic key `(client_id, prospect_email, payment_amount, payment_date)` checked against AuditLog
- Attribution default: `all_installments` — matches current behavior, avoids day-one metric disruption
- Historical backfill: PENDING Tyler decision — existing `cash_collected` has accumulated totals pre-migration

### Pending Todos

None yet.

### Blockers/Concerns

- **Tyler decision needed before Phase 3**: Historical `cash_collected` backfill strategy. Options: (a) backfill from AuditLog, or (b) treat pre-migration data as legacy semantics and move forward clean.

## Session Continuity

Last session: 2026-02-28
Stopped at: Roadmap created. Phase 1 ready to plan.
Resume file: None
