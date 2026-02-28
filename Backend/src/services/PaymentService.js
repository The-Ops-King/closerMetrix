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
const matchingService = require('./MatchingService');
const callQueries = require('../db/queries/calls');
const clientQueries = require('../db/queries/clients');
const callStateManager = require('./CallStateManager');
const auditLogger = require('../utils/AuditLogger');
const alertService = require('../utils/AlertService');
const logger = require('../utils/logger');

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

    // Step 2: Update prospect with payment data
    const finalProspect = await prospectService.updateWithPayment(
      updatedProspect,
      {
        amount,
        paymentType: normalizedType,
        paymentDate: payment_date || new Date().toISOString().split('T')[0],
        productName: product_name,
      },
      clientId
    );

    // Step 3: Find matching call using three-tier matching
    const matchResult = await matchingService.findMatchingCall(clientId, prospect_email, prospect_name);
    const matchedCall = matchResult ? matchResult.call : null;

    // Step 4: Fetch client config for attribution mode
    const client = await clientQueries.findById(clientId);
    const attributionMode = client?.attribution_mode || 'all_installments';

    // Step 5: Process based on payment type
    let result;

    if (isRefund) {
      result = await this._processRefund(
        matchedCall, finalProspect, amount, normalizedType, clientId, notes
      );
    } else {
      result = await this._processPayment(
        matchedCall, finalProspect, amount, normalizedType, clientId,
        payment_date, product_name, notes, attributionMode, payload
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
   * Dual-column semantics (PYMT-01, PYMT-02):
   * - First payment for a call: sets cash_collected AND adds to total_payment_amount
   * - Subsequent payments: adds to total_payment_amount only (cash_collected unchanged)
   *
   * Attribution (PYMT-06):
   * - first_only: closer gets credit only on first payment (call outcome transitions)
   * - all_installments: closer gets credit on every payment
   */
  async _processPayment(call, prospect, amount, paymentType, clientId, paymentDate, productName, notes, attributionMode, originalPayload) {
    if (!call) {
      // MTCH-04: No matching call — log enriched audit entry and alert admin
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

      // Alert admin for every no-match payment
      await alertService.send({
        severity: 'medium',
        title: 'Unmatched Payment Received',
        details: `Payment of $${amount} from ${prospect.prospect_email} could not be matched to any call record. Prospect record updated.`,
        clientId,
        metadata: {
          prospect_email: prospect.prospect_email,
          prospect_name: originalPayload?.prospect_name,
          amount,
          prospect_id: prospect.prospect_id,
        },
      });

      return {
        status: 'ok',
        action: 'payment_recorded',
        prospect_id: prospect.prospect_id,
        total_cash_collected: prospect.total_cash_collected,
        note: 'No matching call found — payment recorded on prospect only, admin alerted',
      };
    }

    const isFirstPayment = !call.cash_collected || call.cash_collected === 0;
    const currentOutcome = call.call_outcome || call.attendance;

    // Build updates based on first vs subsequent payment
    const callUpdates = {
      // total_payment_amount always accumulates (PYMT-01, PYMT-02)
      total_payment_amount: (call.total_payment_amount || 0) + amount,
    };

    if (isFirstPayment) {
      // First payment: set cash_collected (PYMT-01)
      callUpdates.cash_collected = amount;
      callUpdates.revenue_generated = amount;
      callUpdates.date_closed = paymentDate || new Date().toISOString().split('T')[0];
      callUpdates.payment_plan = this._mapPaymentTypeToPaymentPlan(paymentType);
      if (productName) callUpdates.product_purchased = productName;

      // First payment always transitions to Closed - Won
      if (currentOutcome !== 'Closed - Won') {
        callUpdates.call_outcome = 'Closed - Won';
        callUpdates.processing_status = 'complete';
      }
    } else {
      // Subsequent payment (PYMT-02): cash_collected stays the same
      // Attribution check (PYMT-06)
      if (attributionMode === 'all_installments') {
        // Closer gets credit — update revenue_generated to reflect total
        callUpdates.revenue_generated = (call.total_payment_amount || 0) + amount;
      }
      // If first_only: no revenue update, closer doesn't get credit for installments
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

      return {
        status: 'ok',
        action: 'new_close',
        prospect_id: prospect.prospect_id,
        call_id: call.call_id,
        previous_outcome: previousOutcome,
        new_outcome: 'Closed - Won',
        cash_collected: callUpdates.cash_collected,
        total_payment_amount: callUpdates.total_payment_amount,
      };
    }

    // Subsequent payment or already Closed - Won
    await callQueries.update(call.call_id, clientId, callUpdates);

    await auditLogger.log({
      clientId,
      entityType: 'call',
      entityId: call.call_id,
      action: 'additional_payment',
      fieldChanged: 'total_payment_amount',
      oldValue: String(call.total_payment_amount || 0),
      newValue: String(callUpdates.total_payment_amount),
      triggerSource: 'payment_webhook',
      triggerDetail: paymentType,
      metadata: {
        amount,
        is_first_payment: false,
        attribution_mode: attributionMode,
        closer_credited: attributionMode === 'all_installments',
      },
    });

    return {
      status: 'ok',
      action: 'additional_payment',
      prospect_id: prospect.prospect_id,
      call_id: call.call_id,
      cash_collected: call.cash_collected || 0,
      total_payment_amount: callUpdates.total_payment_amount,
      attribution_mode: attributionMode,
    };
  }

  /**
   * Processes a refund or chargeback.
   *
   * PYMT-03: Refunds reduce cash_collected (if refunding first payment)
   * and always reduce total_payment_amount.
   *
   * PYMT-04: Smart refund dedupe — same person cannot be refunded more than
   * once for the same payment (uses dedupe cache).
   */
  async _processRefund(call, prospect, amount, paymentType, clientId, notes) {
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

      return {
        status: 'ok',
        action: 'refund',
        prospect_id: prospect.prospect_id,
        refund_amount: amount,
        remaining_cash: prospect.total_cash_collected,
        note: 'No matching call found — refund applied to prospect record only, admin alerted',
      };
    }

    // PYMT-04: Refund dedupe — check if same refund amount already processed
    const refundDedupeKey = `refund:${clientId}:${prospect.prospect_email}:${amount}`;
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
    const oldTotal = call.total_payment_amount || 0;

    // PYMT-03: Determine if this refund hits cash_collected
    // If the refund amount equals or exceeds the first payment (cash_collected),
    // it's refunding the first payment
    const refundHitsFirstPayment = amount >= oldCash && oldCash > 0;

    const callUpdates = {
      // total_payment_amount always reduced
      total_payment_amount: Math.max(0, oldTotal - amount),
    };

    if (refundHitsFirstPayment) {
      // Refunding the first payment — reduce cash_collected
      callUpdates.cash_collected = Math.max(0, oldCash - amount);
    }

    // If total goes to 0, revert outcome
    if (callUpdates.total_payment_amount === 0 && call.call_outcome === 'Closed - Won') {
      callUpdates.call_outcome = 'Lost';
      callUpdates.lost_reason = `${paymentType === 'chargeback' ? 'Chargeback' : 'Full refund'}: $${amount}`;
    }

    await callQueries.update(call.call_id, clientId, callUpdates);

    await auditLogger.log({
      clientId,
      entityType: 'call',
      entityId: call.call_id,
      action: paymentType,
      fieldChanged: 'total_payment_amount',
      oldValue: String(oldTotal),
      newValue: String(callUpdates.total_payment_amount),
      triggerSource: 'payment_webhook',
      triggerDetail: paymentType,
      metadata: {
        refund_amount: amount,
        cash_collected_before: oldCash,
        cash_collected_after: callUpdates.cash_collected ?? oldCash,
        refund_hits_first_payment: refundHitsFirstPayment,
        notes,
      },
    });

    logger.info(`${paymentType} processed`, {
      callId: call.call_id,
      clientId,
      amount,
      oldCash,
      oldTotal,
      newTotal: callUpdates.total_payment_amount,
    });

    return {
      status: 'ok',
      action: 'refund',
      prospect_id: prospect.prospect_id,
      call_id: call.call_id,
      refund_amount: amount,
      remaining_cash: callUpdates.cash_collected ?? oldCash,
      remaining_total: callUpdates.total_payment_amount,
    };
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
