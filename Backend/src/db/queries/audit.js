/**
 * AUDIT LOG QUERIES
 *
 * Parameterized BigQuery queries for the AuditLog table.
 * Audit entries are append-only — they are never updated or deleted.
 */

const bq = require('../BigQueryClient');

const AUDIT_TABLE = bq.table('AuditLog');

module.exports = {
  /**
   * Inserts a single audit log entry.
   *
   * @param {Object} entry — Audit log entry
   */
  async create(entry) {
    await bq.insert('AuditLog', entry);
  },

  /**
   * Retrieves the audit trail for a specific entity.
   * Returns entries in chronological order.
   *
   * @param {string} entityType — 'call', 'closer', 'client', 'prospect', 'payment'
   * @param {string} entityId — The ID of the entity
   * @returns {Array} Array of audit entries
   */
  async findByEntity(entityType, entityId) {
    return bq.query(
      `SELECT * FROM ${AUDIT_TABLE}
       WHERE entity_type = @entityType AND entity_id = @entityId
       ORDER BY timestamp ASC`,
      { entityType, entityId }
    );
  },

  /**
   * Retrieves recent audit entries for a client.
   * Used for the admin dashboard and debugging.
   *
   * @param {string} clientId — Client scope
   * @param {number} limit — Max entries to return (default 100)
   * @returns {Array} Array of audit entries
   */
  async findByClient(clientId, limit = 100) {
    return bq.query(
      `SELECT * FROM ${AUDIT_TABLE}
       WHERE client_id = @clientId
       ORDER BY timestamp DESC
       LIMIT @limit`,
      { clientId, limit }
    );
  },
};
