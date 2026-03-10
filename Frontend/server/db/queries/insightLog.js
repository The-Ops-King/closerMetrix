/**
 * INSIGHT LOG QUERIES
 *
 * Read/write helpers for the InsightLog BigQuery table.
 * Stores pre-generated daily AI insights and supports trend
 * context by fetching prior insights for a client+section.
 *
 * Table: `closer-automation.CloserAutomation.InsightLog`
 * Columns: insight_id, client_id, section, insight_text, metrics_snapshot,
 *          prior_insight_text, date_range_start, date_range_end, model_used,
 *          tokens_used, generation_type, generated_at, generated_date
 */

const bq = require('../BigQueryClient');
const logger = require('../../utils/logger');

/**
 * Get the most recent daily insight for a client + section.
 *
 * @param {string} clientId
 * @param {string} section - e.g. 'overview', 'financial'
 * @returns {Promise<{ text: string, generatedAt: string } | null>}
 */
async function getLatestInsight(clientId, section) {
  const sql = `
    SELECT insight_text, generated_at
    FROM ${bq.table('InsightLog')}
    WHERE client_id = @clientId
      AND section = @section
      AND generation_type = 'daily'
    ORDER BY generated_at DESC
    LIMIT 1
  `;

  const rows = await bq.runQuery(sql, { clientId, section });
  if (!rows || rows.length === 0) return null;

  return {
    text: rows[0].insight_text,
    generatedAt: rows[0].generated_at?.value || rows[0].generated_at,
  };
}

/**
 * Get the last N daily insights for trend context.
 * Returns most recent first.
 *
 * @param {string} clientId
 * @param {string} section
 * @param {number} count - How many prior insights to fetch (default 3)
 * @returns {Promise<Array<{ text: string, generatedAt: string }>>}
 */
async function getPriorInsights(clientId, section, count = 3) {
  const sql = `
    SELECT insight_text, generated_at
    FROM ${bq.table('InsightLog')}
    WHERE client_id = @clientId
      AND section = @section
      AND generation_type = 'daily'
    ORDER BY generated_at DESC
    LIMIT @count
  `;

  const rows = await bq.runQuery(sql, { clientId, section, count });
  return (rows || []).map(row => ({
    text: row.insight_text,
    generatedAt: row.generated_at?.value || row.generated_at,
  }));
}

/**
 * Insert a new insight row into InsightLog.
 * Uses runQuery with clientId for proper client isolation.
 *
 * @param {object} row
 * @param {string} row.insightId - UUID
 * @param {string} row.clientId
 * @param {string} row.section
 * @param {string} row.insightText
 * @param {string} [row.metricsSnapshot] - JSON string of metrics
 * @param {string} [row.priorInsightText] - Previous insight text
 * @param {string} [row.dateRangeStart] - ISO date
 * @param {string} [row.dateRangeEnd] - ISO date
 * @param {string} [row.modelUsed]
 * @param {number} [row.tokensUsed]
 * @param {string} row.generationType - 'daily' or 'on-demand'
 */
async function insertInsight(row) {
  const sql = `
    INSERT INTO ${bq.table('InsightLog')}
      (insight_id, client_id, section, insight_text, metrics_snapshot,
       prior_insight_text, date_range_start, date_range_end,
       model_used, tokens_used, generation_type, generated_at, generated_date)
    VALUES
      (@insightId, @clientId, @section, @insightText, @metricsSnapshot,
       @priorInsightText, @dateRangeStart, @dateRangeEnd,
       @modelUsed, @tokensUsed, @generationType, CURRENT_TIMESTAMP(), CURRENT_DATE())
  `;

  // BigQuery requires explicit types for any param that might be null
  const params = {
    insightId: row.insightId,
    clientId: row.clientId,
    section: row.section,
    insightText: row.insightText,
    metricsSnapshot: row.metricsSnapshot || '',
    priorInsightText: row.priorInsightText || '',
    dateRangeStart: row.dateRangeStart || '',
    dateRangeEnd: row.dateRangeEnd || '',
    modelUsed: row.modelUsed || '',
    tokensUsed: row.tokensUsed || 0,
    generationType: row.generationType,
  };

  await bq.runQuery(sql, params);

  logger.info('Insight inserted into InsightLog', {
    clientId: row.clientId,
    section: row.section,
    generationType: row.generationType,
  });
}

/**
 * Get today's insight for a client + section (for data-analysis daily cache).
 * Returns the stored JSON text if generated today, null otherwise.
 *
 * @param {string} clientId
 * @param {string} section - e.g. 'data-analysis-overview'
 * @param {string} date - ISO date string 'YYYY-MM-DD'
 * @returns {Promise<{ text: string, generatedAt: string } | null>}
 */
async function getLatestInsightForDate(clientId, section, date) {
  const sql = `
    SELECT insight_text, generated_at
    FROM ${bq.table('InsightLog')}
    WHERE client_id = @clientId
      AND section = @section
      AND generated_date = @date
    ORDER BY generated_at DESC
    LIMIT 1
  `;

  const rows = await bq.runQuery(sql, { clientId, section, date });
  if (!rows || rows.length === 0) return null;

  return {
    text: rows[0].insight_text,
    generatedAt: rows[0].generated_at?.value || rows[0].generated_at,
  };
}

/**
 * Get all data-analysis-compare insights for a client for a given date.
 * Each row is one closer's comparison vs team avg.
 *
 * @param {string} clientId
 * @param {string} date - ISO date string 'YYYY-MM-DD'
 * @returns {Promise<Array<{ section: string, text: string, generatedAt: string }>>}
 */
async function getCompareInsightsForDate(clientId, date) {
  const sql = `
    SELECT section, insight_text, generated_at
    FROM ${bq.table('InsightLog')}
    WHERE client_id = @clientId
      AND section LIKE 'data-analysis-compare-%'
      AND generated_date = @date
    ORDER BY section
  `;

  const rows = await bq.runQuery(sql, { clientId, date });
  return (rows || []).map(row => ({
    section: row.section,
    text: row.insight_text,
    generatedAt: row.generated_at?.value || row.generated_at,
  }));
}

/**
 * Get the freshest insight generated today for a client + section.
 * Matches any generation_type (daily or on-demand).
 *
 * @param {string} clientId
 * @param {string} section
 * @returns {Promise<{ text: string, generatedAt: string } | null>}
 */
async function getInsightForToday(clientId, section) {
  const sql = `
    SELECT insight_text, generated_at
    FROM ${bq.table('InsightLog')}
    WHERE client_id = @clientId
      AND section = @section
      AND generated_date = CURRENT_DATE()
    ORDER BY generated_at DESC
    LIMIT 1
  `;

  const rows = await bq.runQuery(sql, { clientId, section });
  if (!rows || rows.length === 0) return null;

  return {
    text: rows[0].insight_text,
    generatedAt: rows[0].generated_at?.value || rows[0].generated_at,
  };
}

/**
 * Count on-demand insight generations for a client in the last hour.
 * Used for server-side rate limiting (max 10/hr).
 *
 * @param {string} clientId
 * @returns {Promise<number>}
 */
async function countRecentOnDemand(clientId) {
  const sql = `
    SELECT COUNT(*) AS cnt
    FROM ${bq.table('InsightLog')}
    WHERE client_id = @clientId
      AND generation_type = 'on-demand'
      AND generated_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
  `;

  const rows = await bq.runQuery(sql, { clientId });
  if (!rows || rows.length === 0) return 0;
  return rows[0].cnt || 0;
}

module.exports = {
  getLatestInsight,
  getPriorInsights,
  insertInsight,
  getLatestInsightForDate,
  getCompareInsightsForDate,
  getInsightForToday,
  countRecentOnDemand,
};
