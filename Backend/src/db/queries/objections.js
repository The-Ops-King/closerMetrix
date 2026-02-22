/**
 * OBJECTIONS QUERIES
 *
 * Parameterized BigQuery queries for the Objections table.
 * Each objection is a child record of a Call — one call can have many objections.
 */

const bq = require('../BigQueryClient');

const OBJECTIONS_TABLE = bq.table('Objections');

module.exports = {
  /**
   * Finds all objections for a specific call.
   */
  async findByCallId(callId, clientId) {
    return bq.query(
      `SELECT * FROM ${OBJECTIONS_TABLE}
       WHERE call_id = @callId AND client_id = @clientId
       ORDER BY timestamp_seconds ASC`,
      { callId, clientId }
    );
  },

  /**
   * Inserts a batch of objections for a call (after AI processing).
   * Called after the AI extracts objections from the transcript.
   *
   * @param {Array<Object>} objections — Array of objection records
   */
  async createMany(objections) {
    if (objections.length === 0) return;
    await bq.insertMany('Objections', objections);
  },

  /**
   * Deletes existing objections for a call (used before re-processing).
   * BigQuery doesn't have true DELETE for streaming buffer, so we use DML.
   */
  async deleteByCallId(callId, clientId) {
    return bq.query(
      `DELETE FROM ${OBJECTIONS_TABLE}
       WHERE call_id = @callId AND client_id = @clientId`,
      { callId, clientId }
    );
  },
};
