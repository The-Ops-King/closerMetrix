/**
 * CLOSERS QUERIES
 *
 * Parameterized BigQuery queries for the Closers table.
 * Used for closer identification, onboarding, and management.
 */

const bq = require('../BigQueryClient');

const CLOSERS_TABLE = bq.table('Closers');

module.exports = {
  /**
   * Finds a closer by their work email and client_id.
   * This is the primary way we identify which closer a calendar event
   * or transcript belongs to.
   *
   * @param {string} workEmail — The closer's work email address
   * @param {string} clientId — Client scope
   * @returns {Object|null} Closer record or null
   */
  async findByWorkEmail(workEmail, clientId) {
    const rows = await bq.query(
      `SELECT * FROM ${CLOSERS_TABLE}
       WHERE work_email = @workEmail
         AND client_id = @clientId
         AND LOWER(status) = 'active'
       LIMIT 1`,
      { workEmail, clientId }
    );
    return rows.length > 0 ? rows[0] : null;
  },

  /**
   * Finds a closer by work email across ALL clients.
   * Used when a transcript arrives and we need to determine the client.
   * The closer's client_id tells us which client this call belongs to.
   *
   * @param {string} workEmail — The closer's work email address
   * @returns {Object|null} Closer record (with client_id) or null
   */
  async findByWorkEmailAnyClient(workEmail) {
    const rows = await bq.query(
      `SELECT * FROM ${CLOSERS_TABLE}
       WHERE work_email = @workEmail
         AND LOWER(status) = 'active'
       LIMIT 1`,
      { workEmail }
    );
    return rows.length > 0 ? rows[0] : null;
  },

  /**
   * Finds a closer by their closer_id.
   */
  async findById(closerId, clientId) {
    const rows = await bq.query(
      `SELECT * FROM ${CLOSERS_TABLE}
       WHERE closer_id = @closerId AND client_id = @clientId
       LIMIT 1`,
      { closerId, clientId }
    );
    return rows.length > 0 ? rows[0] : null;
  },

  /**
   * Lists all active closers for a client.
   */
  async listByClient(clientId) {
    return bq.query(
      `SELECT * FROM ${CLOSERS_TABLE}
       WHERE client_id = @clientId AND LOWER(status) = 'active'
       ORDER BY name ASC`,
      { clientId }
    );
  },

  /**
   * Lists ALL closers for a client (including inactive).
   */
  async listAllByClient(clientId) {
    return bq.query(
      `SELECT * FROM ${CLOSERS_TABLE}
       WHERE client_id = @clientId
       ORDER BY status ASC, name ASC`,
      { clientId }
    );
  },

  /**
   * Checks if a closer with this work_email already exists for a client.
   * Used during onboarding to prevent duplicate closer records.
   */
  async existsByWorkEmail(workEmail, clientId) {
    const rows = await bq.query(
      `SELECT closer_id FROM ${CLOSERS_TABLE}
       WHERE work_email = @workEmail AND client_id = @clientId
       LIMIT 1`,
      { workEmail, clientId }
    );
    return rows.length > 0;
  },

  /**
   * Inserts a new closer record.
   */
  async create(closerData) {
    await bq.insert('Closers', closerData);
    return closerData;
  },

  /**
   * Finds all active closers using Fathom who have a transcript_api_key set.
   * Used by TimeoutService to poll Fathom for recordings when webhooks don't arrive.
   *
   * @returns {Array} Array of closer records with transcript_api_key
   */
  async findFathomClosersWithApiKey() {
    return bq.query(
      `SELECT * FROM ${CLOSERS_TABLE}
       WHERE LOWER(status) = 'active'
         AND transcript_provider = 'fathom'
         AND transcript_api_key IS NOT NULL
         AND transcript_api_key != ''
       ORDER BY client_id, name ASC`
    );
  },

  /**
   * Updates fields on an existing closer record.
   */
  async update(closerId, clientId, updates) {
    return bq.update('Closers', {
      ...updates,
      last_modified: new Date().toISOString(),
    }, { closer_id: closerId, client_id: clientId });
  },
};
