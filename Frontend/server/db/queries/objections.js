/**
 * OBJECTIONS PAGE QUERIES -- Insight+ Only
 *
 * Objection intelligence: counts, resolution rates, per-type breakdowns,
 * per-closer breakdowns, and drill-down table data.
 *
 * Primary data sources:
 *   v_objections_joined -- Objection-level drill-downs (one row per objection)
 *   v_calls_with_objection_counts -- Call-level objection stats (obj_count, resolved, etc.)
 *   v_calls_with_objections_filterable -- For "% of calls with objections" metric
 *
 * Sections:
 *   summary -- 9 scorecards: calls held, objections faced, resolution rate, etc.
 *
 * Charts:
 *   objectionsByType -- Stacked bar: Resolved vs Unresolved by objection type
 *   objectionTrends -- Line: Top 3 objection types over time
 *   unresolvedByType -- Pie/Donut: Unresolved objections by type
 *   resolutionByCloser -- Bar: Resolution rate per closer
 *
 * Tables:
 *   byType -- Objection Type Summary: Type, Total, Resolved, Resolution Rate
 */

const bq = require('../BigQueryClient');
const logger = require('../../utils/logger');
const { generateTimeSeries } = require('./demoTimeSeries');

/**
 * Fetch all objection intelligence data for a client.
 *
 * @param {string} clientId - Client ID for data isolation
 * @param {object} filters - { dateStart, dateEnd, closerId, objectionType }
 * @param {string} tier - Client's plan tier
 * @returns {Promise<object>} { sections, charts, tables }
 */
async function getObjectionsData(clientId, filters = {}, tier = 'insight') {
  if (!bq.isAvailable()) {
    logger.debug('Returning demo objections data');
    return getDemoData(tier, filters);
  }

  try {
    return await queryBigQuery(clientId, filters, tier);
  } catch (err) {
    logger.error('Objections BQ query failed, falling back to demo', {
      error: err.message,
      clientId,
    });
    return getDemoData(tier, filters);
  }
}

/**
 * Run real BigQuery queries for objection data.
 * Placeholder -- will be filled with actual SQL when BQ credentials are available.
 *
 * The "% of calls with objections" metric requires a blended query:
 *   COUNT(DISTINCT obj_call_id) / COUNT(DISTINCT calls_call_id)
 *   WHERE calls_attendance = 'Show'
 * This uses v_calls_with_objections_filterable (LEFT JOIN so calls without objections included).
 */
async function queryBigQuery(clientId, filters, tier) {
  // TODO: Real BQ queries when credentials available
  return getDemoData();
}

// ================================================================
// DEMO DATA -- Realistic sample data for development and demos
// ================================================================

function getDemoData(tier = 'insight', filters = {}) {
  return {
    sections: {
      summary: {
        callsHeld: { value: 164, label: 'Calls Held', format: 'number' },
        objectionsFaced: { value: 89, label: 'Objections Faced', format: 'number' },
        callsWithObjections: { value: 0.524, label: '% Calls w/ Objections', format: 'percent' },
        avgObjectionsPerCall: { value: 1.4, label: 'Avg Objections / Call', format: 'decimal' },
        resolvedObjections: { value: 52, label: 'Resolved', format: 'number' },
        resolutionRate: { value: 0.584, label: 'Resolution Rate', format: 'percent' },
        objectionlessCloses: { value: 8, label: 'Objectionless Closes', format: 'number' },
        closedWithObjections: { value: 15, label: 'Closed w/ Objections', format: 'number' },
        lostToObjections: { value: 7, label: 'Lost to Objections', format: 'number' },
      },
    },
    charts: {
      objectionsByType: {
        type: 'bar',
        label: 'Objections by Type (Resolved vs Unresolved)',
        series: [
          { key: 'resolved', label: 'Resolved', color: 'green' },
          { key: 'unresolved', label: 'Unresolved', color: 'red' },
        ],
        data: [
          { date: 'Financial', resolved: 12, unresolved: 8 },
          { date: 'Think About It', resolved: 10, unresolved: 9 },
          { date: 'Spouse/Partner', resolved: 8, unresolved: 7 },
          { date: 'Timing', resolved: 7, unresolved: 4 },
          { date: 'Already Tried', resolved: 6, unresolved: 3 },
          { date: 'Not Interested', resolved: 5, unresolved: 4 },
          { date: 'Other', resolved: 4, unresolved: 2 },
        ],
      },
      objectionTrends: {
        type: 'line',
        label: 'Top 3 Objections Over Time',
        series: [
          { key: 'financial', label: 'Financial', color: 'cyan' },
          { key: 'thinkAbout', label: 'Think About It', color: 'amber' },
          { key: 'spouse', label: 'Spouse/Partner', color: 'magenta' },
        ],
        data: generateTimeSeries(filters, [
          { key: 'financial', base: 3, variance: 1.5 },
          { key: 'thinkAbout', base: 2.5, variance: 1.5 },
          { key: 'spouse', base: 2, variance: 1 },
        ]),
      },
      unresolvedByType: {
        type: 'pie',
        label: 'Unresolved Objections by Type',
        data: [
          { label: 'Think About It', value: 9, color: '#FFD93D' },
          { label: 'Financial', value: 8, color: '#4DD4E8' },
          { label: 'Spouse/Partner', value: 7, color: '#ff00e5' },
          { label: 'Timing', value: 4, color: '#B84DFF' },
          { label: 'Not Interested', value: 4, color: '#FF4D6D' },
          { label: 'Other', value: 5, color: '#64748b' },
        ],
      },
      resolutionByCloser: {
        type: 'bar',
        label: 'Resolution Rate by Closer',
        series: [{ key: 'resRate', label: 'Resolution Rate', color: 'green' }],
        data: [
          { date: 'Sarah', resRate: 0.72 },
          { date: 'Mike', resRate: 0.61 },
          { date: 'Jessica', resRate: 0.54 },
          { date: 'Alex', resRate: 0.48 },
        ],
      },
    },
    tables: {
      byType: {
        columns: ['Type', 'Total', 'Resolved', 'Resolution Rate'],
        rows: [
          { type: 'Financial', total: 20, resolved: 12, resRate: 0.60 },
          { type: 'Think About It', total: 19, resolved: 10, resRate: 0.526 },
          { type: 'Spouse/Partner', total: 15, resolved: 8, resRate: 0.533 },
          { type: 'Timing', total: 11, resolved: 7, resRate: 0.636 },
          { type: 'Already Tried', total: 9, resolved: 6, resRate: 0.667 },
          { type: 'Not Interested', total: 9, resolved: 5, resRate: 0.556 },
          { type: 'Other', total: 6, resolved: 4, resRate: 0.667 },
        ],
      },
    },
  };
}

module.exports = { getObjectionsData };
