# Requirements: CloserMetrix Payment Webhook Enhancement

**Defined:** 2026-02-28
**Core Value:** When a payment webhook arrives, it must find the right call record and correctly track first payment vs total payments.

## v1 Requirements

Requirements for milestone v1.0. Each maps to roadmap phases.

### Schema

- [ ] **SCHM-01**: `cash_collected` on Calls table redefined to mean first payment amount only
- [ ] **SCHM-02**: `total_payment_amount` column added to Calls table = sum of all payments (first + subsequent)
- [ ] **SCHM-03**: `attribution_mode` field added to Clients table (`first_only` or `all_installments`)
- [ ] **SCHM-04**: BigQuery view `v_calls_joined_flat_prefixed` updated via `CREATE OR REPLACE VIEW` to include `total_payment_amount`

### Matching

- [ ] **MTCH-01**: Tier 1 — payment matched to call by prospect email (existing behavior, preserved)
- [ ] **MTCH-02**: Tier 2 — if email match fails, match by exact name (case-insensitive, trimmed) against Calls for this client
- [ ] **MTCH-03**: Tier 3 — if exact name fails, fuzzy name match (Jaro-Winkler) against payers only (`cash_collected > 0 OR total_payment_amount > 0`)
- [ ] **MTCH-04**: No-match payments are logged, prospect record still updated, and admin alerted

### Payments

- [ ] **PYMT-01**: First payment for a call sets `cash_collected`; all payments (first + subsequent) add to `total_payment_amount`
- [ ] **PYMT-02**: Subsequent installments for same call add to `total_payment_amount` only (do not re-set `cash_collected`)
- [ ] **PYMT-03**: Refunds reduce `cash_collected` if refunding first payment, and always reduce `total_payment_amount`
- [ ] **PYMT-04**: Smart refund dedupe — same person cannot be refunded more than once for the same payment
- [ ] **PYMT-05**: Payment dedupe — same email + amount + client within 60-second window is skipped as duplicate
- [ ] **PYMT-06**: Closer credit attribution respects client's `attribution_mode` setting (first_only vs all_installments)

## v2 Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Frontend

- **FRNT-01**: Financial page shows dual-column scorecards (Cash on Close vs Total Collected)
- **FRNT-02**: Data Analysis page insight engine uses updated payment column names
- **FRNT-03**: Payment plan health metric (% of expected installments received)

### Audit

- **AUDT-01**: Payment matching audit trail logs match tier (email/exact/fuzzy) and confidence score
- **AUDT-02**: Fuzzy match threshold configurable per client

## Out of Scope

| Feature | Reason |
|---------|--------|
| Separate PaymentEvents log table | Tyler wants aggregates only on Calls table; AuditLog handles event history |
| Payment processor integrations (Stripe, PayPal direct) | Clients send via their own Zapier/GHL automation; standardized payload approach |
| Invoice generation / billing management | Separate product; refer to Stripe/Wave/QuickBooks |
| Payment reminders / dunning | No payment schedule data in webhook model; can't define "late" |
| Per-installment variable attribution | Binary first_only/all_installments covers 95% of cases |
| Frontend changes | Backend-only milestone; frontend deferred to v2 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHM-01 | Phase 1 | Pending |
| SCHM-02 | Phase 1 | Pending |
| SCHM-03 | Phase 1 | Pending |
| SCHM-04 | Phase 1 | Pending |
| MTCH-01 | Phase 3 | Pending |
| MTCH-02 | Phase 2 | Pending |
| MTCH-03 | Phase 2 | Pending |
| MTCH-04 | Phase 4 | Pending |
| PYMT-01 | Phase 3 | Pending |
| PYMT-02 | Phase 3 | Pending |
| PYMT-03 | Phase 3 | Pending |
| PYMT-04 | Phase 3 | Pending |
| PYMT-05 | Phase 3 | Pending |
| PYMT-06 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-28*
*Last updated: 2026-02-28 after roadmap creation*
