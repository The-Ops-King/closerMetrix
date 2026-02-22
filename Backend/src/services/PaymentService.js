/**
 * PAYMENT SERVICE — Matches Payments to Prospects and Calls
 *
 * Orchestrates the full payment processing pipeline:
 *
 * 1. Validate the payment payload
 * 2. Find or create the Prospect record by email + client_id
 * 3. Update the Prospect record (total_cash_collected, payment_count, etc.)
 * 4. Find the most recent call for this prospect that has attendance = 'Show'
 * 5. If that call's outcome is 'Follow Up' or 'Lost' → update to 'Closed - Won'
 * 6. If that call's outcome is already 'Closed - Won' → just add to cash_collected
 * 7. If payment_type is 'refund' → subtract from cash_collected, potentially revert outcome
 * 8. Log everything in AuditLog
 *
 * Valid payment_type values: "full", "deposit", "payment_plan", "refund", "chargeback"
 */

const prospectService = require('./ProspectService');
const callQueries = require('../db/queries/calls');
const callStateManager = require('./CallStateManager');
const auditLogger = require('../utils/AuditLogger');
const alertService = require('../utils/AlertService');
const logger = require('../utils/logger');

const VALID_PAYMENT_TYPES = ['full', 'deposit', 'payment_plan', 'refund', 'chargeback'];

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

    // Step 1: Find or create prospect
    const { prospect, created } = await prospectService.findOrCreate(
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

    // Step 3: Find the most recent Show call for this prospect
    const recentCall = await callQueries.findMostRecentShowForProspect(prospect_email, clientId);

    // Step 4: Process based on payment type
    let result;

    if (isRefund) {
      result = await this._processRefund(
        recentCall, finalProspect, amount, normalizedType, clientId, notes
      );
    } else {
      result = await this._processPayment(
        recentCall, finalProspect, amount, normalizedType, clientId, payment_date, product_name, notes
      );
    }

    // Step 5: Send alert for chargebacks
    if (normalizedType === 'chargeback') {
      await alertService.send({
        severity: 'high',
        title: 'Chargeback Received',
        details: `Prospect ${prospect_email} charged back $${amount}`,
        clientId,
        metadata: { prospect_email, amount, call_id: recentCall?.call_id },
      });
    }

    return result;
  }

  /**
   * Processes a regular payment (full, deposit, payment_plan).
   */
  async _processPayment(call, prospect, amount, paymentType, clientId, paymentDate, productName, notes) {
    if (!call) {
      // No matching call — payment arrived without a call record
      logger.warn('Payment received but no matching Show call found', {
        prospectEmail: prospect.prospect_email,
        clientId,
        amount,
      });

      await auditLogger.log({
        clientId,
        entityType: 'prospect',
        entityId: prospect.prospect_id,
        action: 'payment_received',
        triggerSource: 'payment_webhook',
        triggerDetail: paymentType,
        metadata: { amount, note: 'no_matching_call' },
      });

      return {
        status: 'ok',
        action: 'payment_recorded',
        prospect_id: prospect.prospect_id,
        total_cash_collected: prospect.total_cash_collected,
        note: 'No matching Show call found — payment recorded on prospect only',
      };
    }

    const currentOutcome = call.call_outcome || call.attendance;

    // If call is already Closed - Won, this is an additional payment
    if (currentOutcome === 'Closed - Won') {
      const callUpdates = {
        cash_collected: (call.cash_collected || 0) + amount,
      };
      if (productName) callUpdates.product_purchased = productName;

      await callQueries.update(call.call_id, clientId, callUpdates);

      await auditLogger.log({
        clientId,
        entityType: 'call',
        entityId: call.call_id,
        action: 'additional_payment',
        fieldChanged: 'cash_collected',
        oldValue: String(call.cash_collected || 0),
        newValue: String(callUpdates.cash_collected),
        triggerSource: 'payment_webhook',
        triggerDetail: paymentType,
        metadata: { amount },
      });

      return {
        status: 'ok',
        action: 'additional_payment',
        prospect_id: prospect.prospect_id,
        call_id: call.call_id,
        total_cash_collected: callUpdates.cash_collected,
      };
    }

    // Call outcome is Follow Up, Lost, Not Pitched, Deposit, or Show → transition to Closed - Won
    const callUpdates = {
      call_outcome: 'Closed - Won',
      processing_status: 'complete',
      cash_collected: (call.cash_collected || 0) + amount,
      revenue_generated: amount,
      date_closed: paymentDate || new Date().toISOString().split('T')[0],
      payment_plan: this._mapPaymentTypeToPaymentPlan(paymentType),
    };
    if (productName) callUpdates.product_purchased = productName;

    // Determine the trigger based on current state
    // Deposit → Closed - Won uses 'payment_received_full' in the state machine
    const trigger = call.attendance === 'Deposit' ? 'payment_received_full' : 'payment_received';
    const previousOutcome = call.attendance;

    const transitioned = await callStateManager.transitionState(
      call.call_id,
      clientId,
      'Closed - Won',
      trigger,
      callUpdates
    );

    if (!transitioned) {
      // Direct update if state transition isn't valid (e.g., Show → Closed - Won not via payment)
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
      metadata: { amount, payment_type: paymentType },
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
    };
  }

  /**
   * Processes a refund or chargeback.
   */
  async _processRefund(call, prospect, amount, paymentType, clientId, notes) {
    if (!call) {
      logger.warn('Refund received but no matching Show call found', {
        prospectEmail: prospect.prospect_email,
        clientId,
        amount,
      });

      return {
        status: 'ok',
        action: 'refund',
        prospect_id: prospect.prospect_id,
        refund_amount: amount,
        remaining_cash: prospect.total_cash_collected,
        note: 'No matching call found — refund applied to prospect record only',
      };
    }

    const oldCash = call.cash_collected || 0;
    const newCash = Math.max(0, oldCash - amount);

    const callUpdates = {
      cash_collected: newCash,
    };

    // If cash goes to 0, consider reverting the outcome
    if (newCash === 0 && call.call_outcome === 'Closed - Won') {
      callUpdates.call_outcome = 'Lost';
      callUpdates.lost_reason = `${paymentType === 'chargeback' ? 'Chargeback' : 'Full refund'}: $${amount}`;
    }

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
      metadata: { refund_amount: amount, notes },
    });

    logger.info(`${paymentType} processed`, {
      callId: call.call_id,
      clientId,
      amount,
      oldCash,
      newCash,
    });

    return {
      status: 'ok',
      action: 'refund',
      prospect_id: prospect.prospect_id,
      call_id: call.call_id,
      refund_amount: amount,
      remaining_cash: newCash,
    };
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
