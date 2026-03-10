/**
 * ACTIVITY LOG QUERIES
 *
 * Insert helpers for the ClientActivityLog BigQuery table.
 * Tracks client logins, page views, and time-on-page.
 *
 * Table: `closer-automation.CloserAutomation.ClientActivityLog`
 * Columns: activity_id, client_id, event_type, page, session_id,
 *          duration_seconds, ip_address, user_agent, created_at
 *
 * Design: fire-and-forget — callers should NOT await these inserts.
 * If BQ is unavailable or the table doesn't exist, logs a warning and returns.
 */

const bq = require('../BigQueryClient');
const logger = require('../../utils/logger');

/**
 * Insert an activity event into ClientActivityLog.
 * Gracefully no-ops if BQ is unavailable or if the table doesn't exist.
 *
 * @param {object} row
 * @param {string} row.activityId - UUID
 * @param {string} row.clientId
 * @param {string} row.eventType - 'session_start' | 'page_view'
 * @param {string} [row.page] - Page name (e.g. 'overview', 'financial')
 * @param {string} [row.sessionId] - Browser session UUID
 * @param {number} [row.durationSeconds] - Time spent on previous page
 * @param {string} [row.ipAddress]
 * @param {string} [row.userAgent]
 */
async function insertActivity(row) {
  if (!bq.isAvailable()) {
    logger.debug('Activity log skipped — BQ unavailable (demo mode)');
    return;
  }

  const sql = `
    INSERT INTO ${bq.table('ClientActivityLog')}
      (activity_id, client_id, event_type, page, session_id,
       duration_seconds, ip_address, user_agent, created_at)
    VALUES
      (@activityId, @clientId, @eventType, @page, @sessionId,
       @durationSeconds, @ipAddress, @userAgent, CURRENT_TIMESTAMP())
  `;

  const params = {
    activityId: row.activityId,
    clientId: row.clientId,
    eventType: row.eventType,
    page: row.page || '',
    sessionId: row.sessionId || '',
    durationSeconds: row.durationSeconds || 0,
    ipAddress: row.ipAddress || '',
    userAgent: row.userAgent || '',
  };

  try {
    await bq.runQuery(sql, params);
    logger.debug('Activity logged', {
      clientId: row.clientId,
      eventType: row.eventType,
      page: row.page,
    });
  } catch (err) {
    // Graceful no-op if table doesn't exist yet
    if (err.message && err.message.includes('Not found')) {
      logger.warn('ClientActivityLog table not found — skipping activity insert');
    } else {
      logger.warn('Activity log insert failed', { error: err.message });
    }
  }
}

module.exports = { insertActivity };
