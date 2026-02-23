/**
 * SHARED QUERY HELPERS
 *
 * Common SQL fragments and utilities used across all dashboard query files.
 * Prevents SQL duplication and ensures consistent date parsing / filtering.
 */

const bq = require('../BigQueryClient');

/** The main pre-joined view — calls + closers + clients with prefixed columns */
const VIEW = bq.table('v_calls_joined_flat_prefixed');

/**
 * Build the WHERE clause for the main view, with optional closer filter.
 *
 * @param {string|null} closerId - If truthy, adds calls_closer_id filter
 * @returns {string} SQL WHERE clause
 */
function buildBaseWhere(closerId) {
  return `WHERE clients_client_id = @clientId
    AND DATE(calls_appointment_date) BETWEEN DATE(@dateStart) AND DATE(@dateEnd)
    ${closerId ? 'AND calls_closer_id = @closerId' : ''}`;
}

/**
 * Build the standard params object from filters.
 * Basic tier always ignores closerId.
 *
 * @param {string} clientId
 * @param {object} filters - { dateStart, dateEnd, closerId }
 * @param {string} tier
 * @returns {{ params: object, closerId: string|null, where: string }}
 */
function buildQueryContext(clientId, filters, tier) {
  const { dateStart, dateEnd, closerId } = filters;
  const effectiveCloserId = tier === 'basic' ? null : closerId;

  const params = { clientId, dateStart, dateEnd };
  if (effectiveCloserId) params.closerId = effectiveCloserId;

  return {
    params,
    closerId: effectiveCloserId,
    where: buildBaseWhere(effectiveCloserId),
  };
}

/**
 * SQL expression for weekly time buckets from appointment_date.
 * @returns {string} SQL expression
 */
function timeBucket() {
  return `DATE_TRUNC(DATE(calls_appointment_date), WEEK)`;
}

/**
 * Run multiple queries in parallel, returning null for any that fail
 * (so one failing query doesn't take down the whole page).
 *
 * @param {Array<Promise>} queries - Array of bq.runQuery() promises
 * @returns {Promise<Array>} Array of results (null for failures)
 */
async function runParallel(queries) {
  return Promise.all(
    queries.map(q => q.catch(err => {
      const logger = require('../../utils/logger');
      logger.warn('Parallel query failed, returning null', { error: err.message });
      return null;
    }))
  );
}

/** Safe number: returns 0 if null/undefined/NaN */
function num(val) {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

/** Safe rate: returns 0 if null/undefined/NaN, keeps as float */
function rate(val) {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

module.exports = {
  VIEW,
  buildBaseWhere,
  buildQueryContext,
  timeBucket,
  runParallel,
  num,
  rate,
};
