/**
 * PROSPECT SERVICE — Manages Prospect Records
 *
 * Prospects are identified by email + client_id (unique composite key).
 * Each prospect tracks their complete journey:
 * - How many calls they've had
 * - How many they showed up to
 * - Deal status (open, closed_won, lost, follow_up)
 * - Revenue and cash collected
 * - Payment history
 *
 * Primary consumers:
 * - PaymentService (find or create prospect, update payment data)
 * - TranscriptService (increment call counts on Show)
 * - AIProcessor (update deal_status based on outcome)
 */

const prospectQueries = require('../db/queries/prospects');
const auditLogger = require('../utils/AuditLogger');
const { generateId } = require('../utils/idGenerator');
const { nowISO } = require('../utils/dateUtils');
const logger = require('../utils/logger');

class ProspectService {
  /**
   * Finds an existing prospect or creates a new one.
   *
   * @param {string} prospectEmail — Prospect's email
   * @param {string} clientId — Client scope
   * @param {Object} [defaults] — Default values for a new prospect
   * @returns {Object} { prospect, created }
   */
  async findOrCreate(prospectEmail, clientId, defaults = {}) {
    const existing = await prospectQueries.findByEmail(prospectEmail, clientId);

    if (existing) {
      return { prospect: existing, created: false };
    }

    const now = nowISO();
    const today = now.split('T')[0];

    const prospect = {
      prospect_id: generateId(),
      client_id: clientId,
      prospect_email: prospectEmail,
      prospect_name: defaults.prospect_name || null,
      first_call_date: defaults.first_call_date || today,
      last_call_date: defaults.last_call_date || today,
      total_calls: defaults.total_calls || 0,
      total_shows: defaults.total_shows || 0,
      status: 'active',
      deal_status: defaults.deal_status || 'open',
      total_revenue_generated: defaults.total_revenue_generated || 0,
      total_cash_collected: defaults.total_cash_collected || 0,
      last_payment_date: null,
      payment_count: 0,
      product_purchased: null,
      assigned_closer_id: defaults.assigned_closer_id || null,
      notes: null,
      created_at: now,
      last_modified: now,
    };

    await prospectQueries.create(prospect);

    await auditLogger.log({
      clientId,
      entityType: 'prospect',
      entityId: prospect.prospect_id,
      action: 'created',
      newValue: prospectEmail,
      triggerSource: defaults.triggerSource || 'system',
      metadata: { prospect_name: prospect.prospect_name },
    });

    logger.info('Prospect created', {
      prospectId: prospect.prospect_id,
      clientId,
      email: prospectEmail,
    });

    return { prospect, created: true };
  }

  /**
   * Updates a prospect record with payment data.
   *
   * @param {Object} prospect — Existing prospect record
   * @param {Object} paymentData — { amount, paymentType, paymentDate, productName }
   * @param {string} clientId — Client scope
   * @returns {Object} Updated prospect
   */
  async updateWithPayment(prospect, paymentData, clientId) {
    const {
      amount,
      paymentType,
      paymentDate,
      productName,
      // Optional call context — passed by PaymentService once a matching call is known.
      // Lets us bump/decrement Prospects.total_revenue_generated correctly per deal.
      isFirstPaymentForCall = false,
      callRevenue = 0,
      isFullRefundOfCall = false,
    } = paymentData;
    const isRefund = paymentType === 'refund' || paymentType === 'chargeback';

    const updates = {};

    if (isRefund) {
      updates.total_cash_collected = Math.max(0, (prospect.total_cash_collected || 0) - Math.abs(amount));
      // Decrement payment_count, floor at 0
      updates.payment_count = Math.max(0, (prospect.payment_count || 0) - 1);
      // If this refund wiped the deal entirely, also remove its contract value
      // from the prospect's lifetime revenue.
      if (isFullRefundOfCall && callRevenue > 0) {
        updates.total_revenue_generated = Math.max(0, (prospect.total_revenue_generated || 0) - callRevenue);
      }
    } else {
      updates.total_cash_collected = (prospect.total_cash_collected || 0) + amount;
      updates.payment_count = (prospect.payment_count || 0) + 1;
      updates.last_payment_date = paymentDate || new Date().toISOString().split('T')[0];

      // First payment for a NEW call → bump lifetime contract value
      if (isFirstPaymentForCall && callRevenue > 0) {
        updates.total_revenue_generated = (prospect.total_revenue_generated || 0) + callRevenue;
      }

      // Latest-wins on product_purchased — last sale's product is what's currently active
      if (productName) {
        updates.product_purchased = productName;
      }

      updates.deal_status = 'closed_won';
    }

    // If refund brings cash to 0, mark as refunded (not lost — preserves reporting distinction)
    if (isRefund && updates.total_cash_collected === 0) {
      updates.deal_status = 'refunded';
    }

    await prospectQueries.update(prospect.prospect_id, clientId, updates);

    // Apply updates to the in-memory object for return
    const updated = { ...prospect, ...updates };

    await auditLogger.log({
      clientId,
      entityType: 'prospect',
      entityId: prospect.prospect_id,
      action: 'updated',
      fieldChanged: 'total_cash_collected',
      oldValue: String(prospect.total_cash_collected || 0),
      newValue: String(updated.total_cash_collected),
      triggerSource: 'payment_webhook',
      triggerDetail: paymentType,
      metadata: { amount, paymentType },
    });

    return updated;
  }

  /**
   * Bumps a prospect's lifetime contract value by `amount`, leaving cash and
   * payment_count untouched. Used by payment reconciliation: at 'payment_no_match'
   * time cash + count were already advanced, but total_revenue_generated was not,
   * so when the deal is later linked to a call we add only the contract value.
   */
  async bumpRevenue(prospect, amount, clientId) {
    if (!amount || amount <= 0) return prospect;
    const updates = {
      total_revenue_generated: (prospect.total_revenue_generated || 0) + amount,
      deal_status: 'closed_won',
    };
    await prospectQueries.update(prospect.prospect_id, clientId, updates);
    return { ...prospect, ...updates };
  }

  /**
   * Directly updates a prospect's deal_status.
   * Used when PaymentService needs to set 'refunded' independently of updateWithPayment.
   */
  async updateDealStatus(prospect, dealStatus, clientId) {
    await prospectQueries.update(prospect.prospect_id, clientId, { deal_status: dealStatus });
    return { ...prospect, deal_status: dealStatus };
  }

  /**
   * Updates prospect name if not already set.
   */
  async updateName(prospect, name, clientId) {
    if (!name || prospect.prospect_name) return prospect;

    await prospectQueries.update(prospect.prospect_id, clientId, {
      prospect_name: name,
    });

    return { ...prospect, prospect_name: name };
  }
}

module.exports = new ProspectService();
