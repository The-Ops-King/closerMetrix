/**
 * PAYMENT SERVICE — Dual-Column Payment Processing
 *
 * Orchestrates the full payment processing pipeline with:
 * - Three-tier matching via MatchingService (email → exact name → fuzzy name)
 * - Dual-column semantics: cash_collected = first payment, total_payment_amount = all payments
 * - Payment deduplication (same email + amount + client within 60s)
 * - Refund handling across both columns
 * - Configurable closer credit attribution per client (first_only vs all_installments)
 *
 * Valid payment_type values: "full", "deposit", "payment_plan", "refund", "chargeback"
 *
 * Requirements: MTCH-01, PYMT-01, PYMT-02, PYMT-03, PYMT-04, PYMT-05, PYMT-06
 */

const prospectService = require('./ProspectService');
const prospectQueries = require('../db/queries/prospects');
const matchingService = require('./MatchingService');
const callQueries = require('../db/queries/calls');
const clientQueries = require('../db/queries/clients');
const callStateManager = require('./CallStateManager');
const auditLogger = require('../utils/AuditLogger');
const alertService = require('../utils/AlertService');
const logger = require('../utils/logger');
const { dateInTimezone } = require('../utils/dateUtils');

const VALID_PAYMENT_TYPES = ['full', 'deposit', 'payment_plan', 'refund', 'chargeback'];

/**
 * Simple in-memory dedupe cache. Entries expire after 60 seconds.
 * Key: `${clientId}:${email}:${amount}`
 * Value: timestamp of last seen
 */
const _dedupeCache = new Map();
const DEDUPE_WINDOW_MS = 60 * 1000;

class PaymentService {
  /**
   * Processes a payment webhook.
   *
   * @param {Object} payload — Raw payment payload from webhook
   * @param {string} clientId — Validated client ID
   * @returns {Object} Processing result with action, prospect_id, etc.
   */
  async processPayment(payload, clientId) {
    const {
      prospect_email,
      prospect_name,
      payment_amount,
      payment_date,
      payment_type = 'full',
      product_name,
      notes,
    } = payload;

    // Validate payment type
    const normalizedType = this._normalizePaymentType(payment_type);

    const isRefund = normalizedType === 'refund' || normalizedType === 'chargeback';
    const amount = Math.abs(Number(payment_amount));

    if (isNaN(amount) || amount <= 0) {
      return {
        status: 'error',
        message: 'Invalid payment_amount: must be a positive number',
      };
    }

    // PYMT-05: Payment deduplication — same email + amount + client within 60s
    if (!isRefund && this._isDuplicate(clientId, prospect_email, amount)) {
      logger.warn('Duplicate payment detected, skipping', {
        clientId,
        prospectEmail: prospect_email,
        amount,
      });
      return {
        status: 'ok',
        action: 'duplicate_skipped',
        message: 'Duplicate payment detected within 60-second window',
      };
    }

    // Fetch client config up front — needed for timezone-correct payment_date
    // and attribution mode.
    const client = await clientQueries.findById(clientId);
    const attributionMode = client?.attribution_mode || 'all_installments';

    // Resolve the payment date in the client's local timezone. If the webhook
    // sent a `YYYY-MM-DD` string, it's used as-is. If it sent a full ISO
    // timestamp, it's coerced to the client's local calendar day. If omitted,
    // we use "now" in the client's timezone — so a payment that lands at
    // 11pm PT for an LA-based client lands on the right day in their reports.
    const resolvedPaymentDate = dateInTimezone(client?.timezone, payment_date);

    // Step 1: Find or create prospect
    const { prospect } = await prospectService.findOrCreate(
      prospect_email,
      clientId,
      {
        prospect_name,
        triggerSource: 'payment_webhook',
      }
    );

    // Update prospect name if provided and not already set
    const updatedProspect = await prospectService.updateName(prospect, prospect_name, clientId);

    // Step 2: Find matching call BEFORE updating the prospect — we need call
    // context (first-payment-for-call?, contract value, full-refund?) to keep
    // Prospects.payment_count and Prospects.total_revenue_generated honest.
    const matchResult = await matchingService.findMatchingCall(clientId, prospect_email, prospect_name);
    const matchedCall = matchResult ? matchResult.call : null;

    // Step 3: Process based on payment type. The handler updates the call AND
    // the prospect (so the prospect update can include call context).
    let result;

    if (isRefund) {
      result = await this._processRefund(
        matchedCall, updatedProspect, amount, normalizedType, clientId,
        resolvedPaymentDate, product_name, notes
      );
    } else {
      result = await this._processPayment(
        matchedCall, updatedProspect, amount, normalizedType, clientId,
        resolvedPaymentDate, product_name, notes, attributionMode, payload
      );
    }

    // Add match metadata to result
    if (matchResult) {
      result.match_tier = matchResult.matchTier;
      result.match_score = matchResult.matchScore;
    }

    // Send alert for chargebacks
    if (normalizedType === 'chargeback') {
      await alertService.send({
        severity: 'high',
        title: 'Chargeback Received',
        details: `Prospect ${prospect_email} charged back $${amount}`,
        clientId,
        metadata: { prospect_email, amount, call_id: matchedCall?.call_id },
      });
    }

    return result;
  }

  /**
   * Processes a regular payment (full, deposit, payment_plan).
   *
   * Accounting model:
   * - `Calls.cash_collected` = running total of net cash on this deal (accumulator)
   * - `Calls.initial_cash_collected` = first payment amount (set once, never updated)
   * - `Calls.revenue_generated` = contract value (set once on first payment, never overwritten)
   * - `Calls.product_purchased` = latest payment's product wins
   * - `Calls.total_payment_amount` = DEPRECATED, no longer written
   *
   * Attribution (PYMT-06):
   * - first_only: closer gets credit only on first payment (call outcome transitions)
   * - all_installments: closer gets credit on every payment (no longer mutates revenue_generated)
   */
  async _processPayment(call, prospect, amount, paymentType, clientId, paymentDate, productName, notes, attributionMode, originalPayload) {
    if (!call) {
      // MTCH-04: No matching call — log enriched audit entry (no admin alert)
      logger.warn('Payment received but no matching call found', {
        prospectEmail: prospect.prospect_email,
        clientId,
        amount,
      });

      await auditLogger.log({
        clientId,
        entityType: 'prospect',
        entityId: prospect.prospect_id,
        action: 'payment_no_match',
        triggerSource: 'payment_webhook',
        triggerDetail: paymentType,
        metadata: {
          amount,
          reason: 'No call matched via email, exact name, or fuzzy name',
          original_payload: originalPayload,
        },
      });

      // No admin alert on unmatched payments — the audit log above is the
      // silent record. Prospect totals still advance below.

      // Still update the prospect — even without a call, lifetime totals advance
      const finalProspect = await prospectService.updateWithPayment(prospect, {
        amount, paymentType, paymentDate, productName,
        isFirstPaymentForCall: false,
        callRevenue: 0,
      }, clientId);

      return {
        status: 'ok',
        action: 'payment_recorded',
        prospect_id: prospect.prospect_id,
        total_cash_collected: finalProspect.total_cash_collected,
        note: 'No matching call found — payment recorded on prospect only',
      };
    }

    const oldCash = call.cash_collected || 0;
    const isFirstPayment = oldCash === 0;
    const currentOutcome = call.call_outcome || call.attendance;

    // cash_collected is now an accumulator — always grows by the payment amount
    const callUpdates = {
      cash_collected: oldCash + amount,
    };

    if (isFirstPayment) {
      // First payment for this deal: capture the initial deposit/PIF amount,
      // set the contract value (revenue_generated is immutable after this),
      // and snapshot the close date / payment plan / product.
      callUpdates.initial_cash_collected = amount;
      callUpdates.revenue_generated = amount;
      callUpdates.date_closed = paymentDate;
      callUpdates.payment_plan = this._mapPaymentTypeToPaymentPlan(paymentType);
      if (productName) callUpdates.product_purchased = productName;

      if (currentOutcome !== 'Closed - Won') {
        callUpdates.call_outcome = 'Closed - Won';
        callUpdates.processing_status = 'complete';
      }
    } else {
      // Subsequent payment: do NOT touch revenue_generated (contract value is
      // set once at deal close). Latest-wins product overwrite.
      if (productName) callUpdates.product_purchased = productName;
      // attributionMode is now informational only — stored on the audit row
      // below so reports can still distinguish first_only vs all_installments
      // closers without us mutating call.revenue_generated.
    }

    // Attempt state transition for first payment
    if (isFirstPayment && currentOutcome !== 'Closed - Won') {
      const previousOutcome = call.attendance;
      const trigger = call.attendance === 'Deposit' ? 'payment_received_full' : 'payment_received';

      const transitioned = await callStateManager.transitionState(
        call.call_id,
        clientId,
        'Closed - Won',
        trigger,
        callUpdates
      );

      if (!transitioned) {
        logger.warn('State transition failed for payment, applying direct update', {
          callId: call.call_id,
          currentState: call.attendance,
        });
        await callQueries.update(call.call_id, clientId, callUpdates);
      }

      await auditLogger.log({
        clientId,
        entityType: 'call',
        entityId: call.call_id,
        action: 'payment_close',
        fieldChanged: 'call_outcome',
        oldValue: previousOutcome,
        newValue: 'Closed - Won',
        triggerSource: 'payment_webhook',
        triggerDetail: paymentType,
        metadata: { amount, payment_type: paymentType, is_first_payment: true },
      });

      logger.info('Payment processed — new close', {
        callId: call.call_id,
        clientId,
        prospectEmail: prospect.prospect_email,
        amount,
        previousOutcome,
      });

      // Update prospect lifetime totals — first payment for this call bumps
      // total_revenue_generated by the contract value.
      await prospectService.updateWithPayment(prospect, {
        amount, paymentType, paymentDate, productName,
        isFirstPaymentForCall: true,
        callRevenue: callUpdates.revenue_generated || amount,
      }, clientId);

      return {
        status: 'ok',
        action: 'new_close',
        prospect_id: prospect.prospect_id,
        call_id: call.call_id,
        previous_outcome: previousOutcome,
        new_outcome: 'Closed - Won',
        cash_collected: callUpdates.cash_collected,
        revenue_generated: callUpdates.revenue_generated,
      };
    }

    // Subsequent payment or already Closed - Won
    await callQueries.update(call.call_id, clientId, callUpdates);

    await auditLogger.log({
      clientId,
      entityType: 'call',
      entityId: call.call_id,
      action: 'additional_payment',
      fieldChanged: 'cash_collected',
      oldValue: String(oldCash),
      newValue: String(callUpdates.cash_collected),
      triggerSource: 'payment_webhook',
      triggerDetail: paymentType,
      metadata: {
        amount,
        is_first_payment: false,
        attribution_mode: attributionMode,
        closer_credited: attributionMode === 'all_installments',
      },
    });

    // Subsequent payment for an existing closed call — do NOT bump
    // total_revenue_generated (contract was already counted on first payment).
    await prospectService.updateWithPayment(prospect, {
      amount, paymentType, paymentDate, productName,
      isFirstPaymentForCall: false,
      callRevenue: 0,
    }, clientId);

    return {
      status: 'ok',
      action: 'additional_payment',
      prospect_id: prospect.prospect_id,
      call_id: call.call_id,
      cash_collected: callUpdates.cash_collected,
      revenue_generated: call.revenue_generated || 0,
      attribution_mode: attributionMode,
    };
  }

  /**
   * Processes a refund or chargeback.
   *
   * Accounting model:
   * - `Calls.cash_collected` always decrements by the refund amount (floor 0)
   * - `call_outcome` only flips to `Refunded` when cash_collected reaches 0
   *   (i.e., the deal is fully unwound). A $1 refund of a $2997 deal stays
   *   `Closed - Won` — partial refunds don't kill the deal.
   * - `revenue_generated` (contract value) is preserved through partial
   *   refunds, and only zeroed on full refund.
   * - `Prospects.total_cash_collected` decrements via ProspectService.
   *
   * PYMT-04: Smart refund dedupe — same person cannot be refunded more than
   * once for the same payment (uses dedupe cache).
   */
  async _processRefund(call, prospect, amount, paymentType, clientId, paymentDate, productName, notes) {
    if (!call) {
      logger.warn('Refund received but no matching call found', {
        prospectEmail: prospect.prospect_email,
        clientId,
        amount,
      });

      await auditLogger.log({
        clientId,
        entityType: 'prospect',
        entityId: prospect.prospect_id,
        action: 'refund_no_match',
        triggerSource: 'payment_webhook',
        triggerDetail: paymentType,
        metadata: {
          amount,
          reason: 'Refund could not be matched to any call record',
        },
      });

      await alertService.send({
        severity: 'medium',
        title: 'Unmatched Refund Received',
        details: `Refund of $${amount} for ${prospect.prospect_email} could not be matched to any call record.`,
        clientId,
        metadata: { prospect_email: prospect.prospect_email, amount },
      });

      // Still update prospect lifetime totals
      const finalProspect = await prospectService.updateWithPayment(prospect, {
        amount, paymentType, paymentDate, productName,
        isFirstPaymentForCall: false,
        callRevenue: 0,
        isFullRefundOfCall: false,
      }, clientId);

      return {
        status: 'ok',
        action: 'refund',
        prospect_id: prospect.prospect_id,
        refund_amount: amount,
        remaining_cash: finalProspect.total_cash_collected,
        note: 'No matching call found — refund applied to prospect record only, admin alerted',
      };
    }

    // PYMT-04: Refund dedupe
    if (this._isDuplicate(clientId, `refund:${prospect.prospect_email}`, amount)) {
      logger.warn('Duplicate refund detected, skipping', {
        clientId,
        prospectEmail: prospect.prospect_email,
        amount,
      });
      return {
        status: 'ok',
        action: 'duplicate_refund_skipped',
        message: 'Duplicate refund detected within 60-second window',
      };
    }

    const oldCash = call.cash_collected || 0;
    const newCash = Math.max(0, oldCash - amount);
    const isFullRefund = newCash === 0 && oldCash > 0;
    const callRevenue = call.revenue_generated || 0;

    const callUpdates = {
      cash_collected: newCash,
    };

    if (isFullRefund) {
      // Full refund — flip outcome to Refunded and zero out the contract value.
      // The state machine handles the transition; if it rejects, fall back to
      // a direct update so the row still reflects reality.
      callUpdates.revenue_generated = 0;

      const transitioned = await callStateManager.transitionState(
        call.call_id,
        clientId,
        'Refunded',
        'full_refund_received',
        { ...callUpdates, call_outcome: 'Refunded' }
      );

      if (!transitioned) {
        callUpdates.call_outcome = 'Refunded';
        await callQueries.update(call.call_id, clientId, callUpdates);
      }

      await auditLogger.log({
        clientId,
        entityType: 'call',
        entityId: call.call_id,
        action: paymentType,
        fieldChanged: 'call_outcome',
        oldValue: call.call_outcome || 'Closed - Won',
        newValue: 'Refunded',
        triggerSource: 'payment_webhook',
        triggerDetail: paymentType,
        metadata: {
          refund_amount: amount,
          cash_collected_before: oldCash,
          cash_collected_after: 0,
          notes,
        },
      });

      logger.info(`${paymentType} processed — full refund, outcome → Refunded`, {
        callId: call.call_id, clientId, amount, oldCash,
      });

      // Prospect: decrement payment_count + decrement total_revenue_generated
      // by the contract value (this deal is no longer counted toward lifetime
      // contracts).
      await prospectService.updateWithPayment(prospect, {
        amount, paymentType, paymentDate, productName,
        isFirstPaymentForCall: false,
        callRevenue,
        isFullRefundOfCall: true,
      }, clientId);

      return {
        status: 'ok',
        action: 'refund',
        prospect_id: prospect.prospect_id,
        call_id: call.call_id,
        refund_amount: amount,
        remaining_cash: 0,
        outcome: 'Refunded',
      };
    }

    // Partial refund — decrement cash_collected, leave outcome alone
    // (a $1 refund of a $2997 deal still leaves it Closed - Won).
    await callQueries.update(call.call_id, clientId, callUpdates);

    await auditLogger.log({
      clientId,
      entityType: 'call',
      entityId: call.call_id,
      action: paymentType,
      fieldChanged: 'cash_collected',
      oldValue: String(oldCash),
      newValue: String(newCash),
      triggerSource: 'payment_webhook',
      triggerDetail: paymentType,
      metadata: {
        refund_amount: amount,
        cash_collected_before: oldCash,
        cash_collected_after: newCash,
        notes,
      },
    });

    logger.info(`${paymentType} processed — partial refund`, {
      callId: call.call_id, clientId, amount, oldCash, newCash,
    });

    // Prospect: decrement cash and payment_count (contract value untouched —
    // the deal is still active).
    await prospectService.updateWithPayment(prospect, {
      amount, paymentType, paymentDate, productName,
      isFirstPaymentForCall: false,
      callRevenue,
      isFullRefundOfCall: false,
    }, clientId);

    return {
      status: 'ok',
      action: 'refund',
      prospect_id: prospect.prospect_id,
      call_id: call.call_id,
      refund_amount: amount,
      remaining_cash: newCash,
      outcome: call.call_outcome || 'Closed - Won',
    };
  }

  /**
   * RECONCILIATION — replay payments that previously failed to match a call.
   *
   * Root cause this fixes: the payment webhook frequently fires minutes BEFORE
   * the call's matchable ('Show') record exists (the transcript creates it after
   * the call). The payment logs 'payment_no_match', advances prospect totals, and
   * is never retried — so the close never gets marked. This replays those
   * unmatched payments once a matching call exists.
   *
   * Idempotency: each successful replay writes a prospect-level
   * 'payment_reconciled' audit row keyed by amount|date|product. Re-runs skip
   * keys already reconciled. AuditLog is append-only, so this is our marker.
   *
   * Safety: if the matched call is ALREADY 'Closed - Won', we mark the payment
   * reconciled but make NO monetary change (the close is already recorded — e.g.
   * via a manual/CSV backfill). This prevents double-counting cash_collected.
   *
   * Prospect totals: at 'payment_no_match' time cash + payment_count were already
   * advanced; only total_revenue_generated was not. So on a first-payment close we
   * bump prospect revenue ONLY (never re-add cash/count).
   *
   * @param {string} clientId
   * @param {string} prospectEmail
   * @param {string|null} prospectName
   * @param {Object} [options] — { dryRun } — when true, computes what would change
   *        but performs no writes (used by the backfill script's preview mode).
   * @returns {Object} { reconciled, alreadyClosed, stillUnmatched, closes: [] }
   */
  async reconcileProspectPayments(clientId, prospectEmail, prospectName = null, options = {}) {
    const { dryRun = false } = options;
    const results = { reconciled: 0, alreadyClosed: 0, stillUnmatched: 0, closes: [] };
    if (!prospectEmail || prospectEmail === 'unknown') return results;

    // Look up WITHOUT creating — the prospect already exists (it was created at
    // 'payment_no_match' time). Never write a prospect during reconciliation
    // (especially in dryRun). If absent, there's no unmatched-payment trail.
    const prospect = await prospectQueries.findByEmail(prospectEmail, clientId);
    if (!prospect) return results;

    const trail = await auditLogger.getTrail('prospect', prospect.prospect_id);
    const keyOf = (amount, date, product) => `${amount}|${date || ''}|${product || ''}`;
    const reconciledKeys = new Set();
    for (const e of trail) {
      if (e.action !== 'payment_reconciled') continue;
      try {
        const m = JSON.parse(e.metadata || '{}');
        reconciledKeys.add(keyOf(m.amount, m.payment_date, m.product_name));
      } catch (_) { /* ignore malformed */ }
    }

    const client = await clientQueries.findById(clientId);

    for (const e of trail) {
      if (e.action !== 'payment_no_match') continue;
      let meta;
      try { meta = JSON.parse(e.metadata || '{}'); } catch (_) { continue; }
      const p = meta.original_payload || {};
      const amount = Math.abs(Number(meta.amount != null ? meta.amount : p.payment_amount));
      if (!Number.isFinite(amount) || amount <= 0) continue;

      const paymentType = this._normalizePaymentType(p.payment_type);
      if (paymentType === 'refund' || paymentType === 'chargeback') continue; // refunds handled elsewhere

      const key = keyOf(amount, p.payment_date, p.product_name);
      if (reconciledKeys.has(key)) continue; // already reconciled

      const match = await matchingService.findMatchingCall(
        clientId, p.prospect_email || prospectEmail, p.prospect_name || prospectName
      );
      if (!match || !match.call) { results.stillUnmatched++; continue; }
      const call = match.call;

      // Already a close → record reconciled, no monetary change (avoid double-count).
      if (call.call_outcome === 'Closed - Won') {
        results.alreadyClosed++;
      } else {
        results.reconciled++;
        results.closes.push({ call_id: call.call_id, amount });
        if (!dryRun) {
          const paymentDate = dateInTimezone(client?.timezone, p.payment_date);
          await this._applyReconciledPayment(call, prospect, amount, paymentType, clientId, paymentDate, p.product_name, match.matchTier);
        }
      }

      if (dryRun) { reconciledKeys.add(key); continue; }

      // Idempotency marker (prospect-level), regardless of which branch.
      await auditLogger.log({
        clientId,
        entityType: 'prospect',
        entityId: prospect.prospect_id,
        action: 'payment_reconciled',
        triggerSource: 'reconciliation',
        triggerDetail: match.matchTier,
        metadata: {
          amount,
          payment_date: p.payment_date,
          product_name: p.product_name,
          call_id: call.call_id,
          already_closed: call.call_outcome === 'Closed - Won',
        },
      });
      reconciledKeys.add(key);
    }

    return results;
  }

  /**
   * Applies a previously-unmatched payment to a now-matched, NOT-yet-won call.
   * Mirrors the first-payment branch of _processPayment but does NOT re-advance
   * prospect cash/count (already advanced at no-match time) — only bumps revenue.
   */
  async _applyReconciledPayment(call, prospect, amount, paymentType, clientId, paymentDate, productName, matchTier) {
    const oldCash = call.cash_collected || 0;
    const isFirstPayment = oldCash === 0;
    const currentOutcome = call.call_outcome || call.attendance;

    const callUpdates = { cash_collected: oldCash + amount };
    if (isFirstPayment) {
      callUpdates.initial_cash_collected = amount;
      callUpdates.revenue_generated = amount;
      callUpdates.date_closed = paymentDate;
      callUpdates.payment_plan = this._mapPaymentTypeToPaymentPlan(paymentType);
      if (productName) callUpdates.product_purchased = productName;
      callUpdates.call_outcome = 'Closed - Won';
      callUpdates.processing_status = 'complete';
    } else if (productName) {
      callUpdates.product_purchased = productName;
    }

    if (callUpdates.call_outcome === 'Closed - Won') {
      const transitioned = await callStateManager.transitionState(
        call.call_id, clientId, 'Closed - Won', 'payment_received', callUpdates
      );
      if (!transitioned) {
        await callQueries.update(call.call_id, clientId, callUpdates);
      }
      // Bump prospect lifetime contract value (cash/count already counted).
      if (callUpdates.revenue_generated > 0) {
        await prospectService.bumpRevenue(prospect, callUpdates.revenue_generated, clientId);
      }
    } else {
      await callQueries.update(call.call_id, clientId, callUpdates);
    }

    await auditLogger.log({
      clientId,
      entityType: 'call',
      entityId: call.call_id,
      action: 'payment_reconciled',
      fieldChanged: 'call_outcome',
      oldValue: currentOutcome,
      newValue: callUpdates.call_outcome || currentOutcome,
      triggerSource: 'reconciliation',
      triggerDetail: matchTier,
      metadata: { amount, is_first_payment: isFirstPayment, reconciled: true },
    });
  }

  /**
   * PYMT-05: Checks if a payment is a duplicate.
   * Same email + amount + client within 60-second window.
   *
   * @returns {boolean} true if duplicate
   */
  _isDuplicate(clientId, email, amount) {
    const key = `${clientId}:${email}:${amount}`;
    const now = Date.now();

    // Clean expired entries
    for (const [k, ts] of _dedupeCache) {
      if (now - ts > DEDUPE_WINDOW_MS) _dedupeCache.delete(k);
    }

    if (_dedupeCache.has(key)) {
      const lastSeen = _dedupeCache.get(key);
      if (now - lastSeen < DEDUPE_WINDOW_MS) return true;
    }

    _dedupeCache.set(key, now);
    return false;
  }

  /**
   * Normalizes and validates payment type.
   */
  _normalizePaymentType(type) {
    if (!type) return 'full';
    const lower = String(type).toLowerCase().trim();
    if (VALID_PAYMENT_TYPES.includes(lower)) return lower;
    logger.warn('Unknown payment type, defaulting to full', { rawType: type });
    return 'full';
  }

  /**
   * Maps payment_type to the payment_plan field on the call record.
   */
  _mapPaymentTypeToPaymentPlan(paymentType) {
    const map = {
      full: 'Full',
      deposit: 'Deposit',
      payment_plan: 'Payment Plan',
    };
    return map[paymentType] || 'Full';
  }
}

module.exports = new PaymentService();
