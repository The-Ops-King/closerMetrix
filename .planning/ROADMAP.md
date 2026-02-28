# Roadmap: CloserMetrix Payment Webhook Enhancement

## Overview

This milestone upgrades the existing payment webhook backend with four capabilities that must ship together: a BigQuery schema migration (root dependency for everything), a three-tier matching chain (email → exact name → fuzzy name against payers only), dual-column payment tracking with correct refund semantics, and configurable closer credit attribution. Each phase is blocked by the one before it. No frontend work ships in this milestone.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Schema Migration** - Add `total_payment_amount` to Calls, `attribution_mode` to Clients, update BigQuery view
- [ ] **Phase 2: FuzzyMatcher + Call Queries** - Pure name-scoring utility and payer-scoped call lookup queries
- [ ] **Phase 3: MatchingService + PaymentService Refactor** - Three-tier matching, dual-column semantics, refunds, attribution, idempotency
- [ ] **Phase 4: No-Match Handling + Admin Alert** - Log unmatched payments, alert admin, still update prospect

## Phase Details

### Phase 1: Schema Migration
**Goal**: BigQuery schema is correct and complete so every downstream phase has columns to read and write
**Depends on**: Nothing (first phase)
**Requirements**: SCHM-01, SCHM-02, SCHM-03, SCHM-04
**Success Criteria** (what must be TRUE):
  1. `total_payment_amount` column exists on the Calls table and accepts numeric values
  2. `attribution_mode` column exists on the Clients table with a valid default value
  3. `v_calls_joined_flat_prefixed` BigQuery view includes `total_payment_amount` and returns it in SELECT *
  4. Migration script is idempotent — running it twice produces no errors and no duplicate columns
  5. `cash_collected` column definition is unchanged (migration does not drop or alter its type)
**Plans**: TBD

### Phase 2: FuzzyMatcher + Call Queries
**Goal**: Name-scoring utility and payer-scoped call queries exist and are independently tested before MatchingService is built
**Depends on**: Phase 1
**Requirements**: MTCH-02, MTCH-03
**Success Criteria** (what must be TRUE):
  1. `FuzzyMatcher.findBestMatch(name, callsArray)` returns the highest-scoring call above threshold or null — with no BigQuery calls
  2. Jaro-Winkler threshold is read from config (not hardcoded), defaulting to 0.82
  3. `findCallByName(clientId, name)` queries Calls table with case-insensitive, trimmed comparison and returns a match or null
  4. `findCallsByPayers(clientId)` returns only calls where `cash_collected > 0 OR total_payment_amount > 0` (enforced in SQL WHERE, not application code)
**Plans**: TBD

### Phase 3: MatchingService + PaymentService Refactor
**Goal**: A webhook payment correctly finds the right call record, sets the right columns, handles refunds, respects attribution config, and rejects duplicates
**Depends on**: Phase 2
**Requirements**: MTCH-01, MTCH-04 (partial), PYMT-01, PYMT-02, PYMT-03, PYMT-04, PYMT-05, PYMT-06
**Success Criteria** (what must be TRUE):
  1. A payment webhook with a known email sets `cash_collected` on first payment and accumulates `total_payment_amount` on every payment for that call
  2. A payment webhook where the email fails but the name matches exactly (case-insensitive) still credits the correct call
  3. A fuzzy name match against a known payer credits the correct call; a fuzzy match against a non-payer never matches
  4. A refund webhook reduces `total_payment_amount` always, and reduces `cash_collected` only when the refund amount represents the first payment being returned
  5. Sending the same webhook payload twice within 60 seconds results in exactly one update (idempotency enforced)
  6. A client with `attribution_mode = 'first_only'` does not receive closer credit for installment payments; a client with `all_installments` does
**Plans**: TBD

### Phase 4: No-Match Handling + Admin Alert
**Goal**: When no call record can be found for a payment, the system fails gracefully — logs the event, updates the prospect record, and alerts admin
**Depends on**: Phase 3
**Requirements**: MTCH-04
**Success Criteria** (what must be TRUE):
  1. A payment with no email, name, or fuzzy match still creates or updates the prospect record in BigQuery
  2. The AuditLog entry for a no-match payment includes the reason no match was found and the original payload
  3. An admin alert fires for every no-match payment (via existing AlertService)
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Schema Migration | 0/TBD | Not started | - |
| 2. FuzzyMatcher + Call Queries | 0/TBD | Not started | - |
| 3. MatchingService + PaymentService Refactor | 0/TBD | Not started | - |
| 4. No-Match Handling + Admin Alert | 0/TBD | Not started | - |
