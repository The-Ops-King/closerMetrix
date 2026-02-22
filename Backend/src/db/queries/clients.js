/**
 * CLIENTS QUERIES
 *
 * Parameterized BigQuery queries for the Clients table.
 * Used for client management, onboarding, and config lookups.
 */

const bq = require('../BigQueryClient');

const CLIENTS_TABLE = bq.table('Clients');

module.exports = {
  /**
   * Finds a client by client_id.
   *
   * @param {string} clientId — The client's UUID
   * @returns {Object|null} Client record or null
   */
  async findById(clientId) {
    const rows = await bq.query(
      `SELECT * FROM ${CLIENTS_TABLE}
       WHERE client_id = @clientId
       LIMIT 1`,
      { clientId }
    );
    return rows.length > 0 ? rows[0] : null;
  },

  /**
   * Lists all clients, optionally filtered by status.
   *
   * @param {string|null} status — Filter by status (null = all)
   * @returns {Array} Array of client records
   */
  async list(status = null) {
    if (status) {
      return bq.query(
        `SELECT client_id, name, company_name, status, plan_tier, closer_count, created_at
         FROM ${CLIENTS_TABLE}
         WHERE status = @status
         ORDER BY company_name ASC`,
        { status }
      );
    }
    return bq.query(
      `SELECT client_id, name, company_name, status, plan_tier, closer_count, created_at
       FROM ${CLIENTS_TABLE}
       ORDER BY company_name ASC`
    );
  },

  /**
   * Inserts a new client record.
   */
  async create(clientData) {
    await bq.insert('Clients', clientData);
    return clientData;
  },

  /**
   * Updates fields on an existing client record.
   */
  async update(clientId, updates) {
    return bq.update('Clients', {
      ...updates,
      last_modified: new Date().toISOString(),
    }, { client_id: clientId });
  },
};
