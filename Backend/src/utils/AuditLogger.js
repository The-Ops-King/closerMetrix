/**
 * AUDIT LOGGER
 *
 * Records every meaningful event in the system to the AuditLog table.
 * Creates a complete, queryable history of everything that happened to
 * every call, closer, client, prospect, and payment.
 *
 * WHAT TO LOG:
 * - Every call record creation
 * - Every state change (with before/after values)
 * - Every transcript match (or failure to match)
 * - Every AI processing result (or error)
 * - Every payment processed
 * - Every client/closer onboarded or deactivated
 * - Every error that affects data integrity
 *
 * WHAT NOT TO LOG:
 * - Health check pings
 * - Duplicate webhook rejections (debug note only)
 *
 * Usage:
 *   const auditLogger = require('./utils/AuditLogger');
 *   await auditLogger.log({
 *     clientId: 'xxx',
 *     entityType: 'call',
 *     entityId: callId,
 *     action: 'state_change',
 *     fieldChanged: 'attendance',
 *     oldValue: 'Scheduled',
 *     newValue: 'Show',
 *     triggerSource: 'transcript_webhook',
 *     triggerDetail: 'fathom',
 *   });
 */

const auditQueries = require('../db/queries/audit');
const { generateId } = require('./idGenerator');
const logger = require('./logger');

class AuditLogger {
  /**
   * Writes an audit log entry to BigQuery.
   *
   * @param {Object} params
   * @param {string} params.clientId — Client scope (null for system-level events)
   * @param {string} params.entityType — 'call', 'closer', 'client', 'prospect', 'payment', 'objection'
   * @param {string} params.entityId — The ID of the entity that changed
   * @param {string} params.action — 'created', 'updated', 'state_change', 'error'
   * @param {string} [params.fieldChanged] — Which field changed (null for creates)
   * @param {string} [params.oldValue] — Previous value (null for creates)
   * @param {string} [params.newValue] — New value
   * @param {string} params.triggerSource — 'calendar_webhook', 'transcript_webhook', 'payment_webhook', 'ai_processing', 'timeout', 'admin', 'system'
   * @param {string} [params.triggerDetail] — Additional context (provider name, webhook ID, etc.)
   * @param {Object} [params.metadata] — Any extra context as JSON
   */
  async log({
    clientId = null,
    entityType,
    entityId,
    action,
    fieldChanged = null,
    oldValue = null,
    newValue = null,
    triggerSource,
    triggerDetail = null,
    metadata = null,
  }) {
    const entry = {
      audit_id: generateId(),
      timestamp: new Date().toISOString(),
      client_id: clientId,
      entity_type: entityType,
      entity_id: entityId,
      action,
      field_changed: fieldChanged,
      old_value: oldValue != null ? String(oldValue) : null,
      new_value: newValue != null ? String(newValue) : null,
      trigger_source: triggerSource,
      trigger_detail: triggerDetail,
      metadata: metadata ? JSON.stringify(metadata) : null,
    };

    try {
      await auditQueries.create(entry);
    } catch (error) {
      // Audit logging should NEVER crash the main flow.
      // If it fails, log to console and continue.
      logger.error('Failed to write audit log entry', {
        entry,
        error: error.message,
      });
    }
  }

  /**
   * Retrieves the audit trail for a specific entity.
   *
   * @param {string} entityType — Entity type
   * @param {string} entityId — Entity ID
   * @returns {Array} Chronological array of audit entries
   */
  async getTrail(entityType, entityId) {
    return auditQueries.findByEntity(entityType, entityId);
  }
}

module.exports = new AuditLogger();
