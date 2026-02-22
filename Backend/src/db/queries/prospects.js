/**
 * PROSPECTS QUERIES
 *
 * Parameterized BigQuery queries for the Prospects table.
 * Prospects are identified by email + client_id (unique composite key).
 */

const bq = require('../BigQueryClient');

const PROSPECTS_TABLE = bq.table('Prospects');

module.exports = {
  /**
   * Finds a prospect by email within a specific client.
   * Email is the primary identifier for prospects.
   *
   * @param {string} prospectEmail — Prospect's email address
   * @param {string} clientId — Client scope
   * @returns {Object|null} Prospect record or null
   */
  async findByEmail(prospectEmail, clientId) {
    const rows = await bq.query(
      `SELECT * FROM ${PROSPECTS_TABLE}
       WHERE prospect_email = @prospectEmail AND client_id = @clientId
       LIMIT 1`,
      { prospectEmail, clientId }
    );
    return rows.length > 0 ? rows[0] : null;
  },

  /**
   * Finds a prospect by prospect_id.
   */
  async findById(prospectId, clientId) {
    const rows = await bq.query(
      `SELECT * FROM ${PROSPECTS_TABLE}
       WHERE prospect_id = @prospectId AND client_id = @clientId
       LIMIT 1`,
      { prospectId, clientId }
    );
    return rows.length > 0 ? rows[0] : null;
  },

  /**
   * Inserts a new prospect record.
   */
  async create(prospectData) {
    await bq.insert('Prospects', prospectData);
    return prospectData;
  },

  /**
   * Updates fields on an existing prospect record.
   */
  async update(prospectId, clientId, updates) {
    return bq.update('Prospects', {
      ...updates,
      last_modified: new Date().toISOString(),
    }, { prospect_id: prospectId, client_id: clientId });
  },
};
