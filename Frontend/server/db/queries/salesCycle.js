/**
 * SALES CYCLE PAGE QUERIES -- Insight+ Only
 *
 * Calls/days to close, 1-call vs multi-call distribution, close cycle analysis.
 * Uses v_close_cycle_stats_dated view for per-prospect close cycle data.
 *
 * Sections:
 *   callsToClose -- 9 scorecards with deltas: 1/2/3+ call counts & pcts,
 *                   avg/median calls to close, calls needed per deal
 *   daysToClose  -- 2 scorecards with deltas: avg/median days to close
 *
 * Charts:
 *   salesCyclePie          -- Pie: 1-Call vs 2-Call vs 3+ Call closes
 *   callsToCloseBar        -- Bar: Calls to close bucketed (1, 2, 3, 4, 5+)
 *   callsToCloseByCloser   -- Stacked bar: Calls to close by closer (insight+ only)
 *   daysToClosePie         -- Pie: Same day / 1-3 / 4-7 / 8-14 / 15-30 / 30+
 *   daysToCloseBar         -- Bar: Days to close bucketed (Same Day, 1-3, 4-7, 8-14, 15-30, 30+)
 *   daysToCloseByCloser    -- Stacked bar: Days to close by closer (insight+ only)
 *
 * Two distinct "calls to close" metrics:
 *   avgCallsToClose    = per-prospect average (e.g. 1.4 calls from v_close_cycle_stats_dated)
 *   callsNeededPerDeal = total calls held / total closed deals (e.g. 5, because not all prospects close)
 */

const bq = require('../BigQueryClient');
const logger = require('../../utils/logger');

// Mirror client/src/theme/constants.js COLORS.neon — single source for pie chart hex values
const NEON = {
  cyan:   '#4DD4E8',
  green:  '#6BCF7F',
  amber:  '#FFD93D',
  red:    '#FF4D6D',
  purple: '#B84DFF',
  blue:   '#4D7CFF',
  muted:  '#64748b',
};

/**
 * Fetch all sales cycle data for a client.
 *
 * @param {string} clientId - Client ID for data isolation
 * @param {object} filters - { dateStart, dateEnd, closerId }
 * @param {string} tier - Client's plan tier
 * @returns {Promise<object>} { sections, charts }
 */
async function getSalesCycleData(clientId, filters = {}, tier = 'insight') {
  if (!bq.isAvailable()) {
    logger.debug('Returning demo sales cycle data');
    return getDemoData(tier, filters);
  }

  try {
    return await queryBigQuery(clientId, filters, tier);
  } catch (err) {
    logger.error('Sales cycle BQ query failed, falling back to demo', {
      error: err.message,
      clientId,
    });
    return getDemoData(tier, filters);
  }
}

/**
 * Run real BigQuery queries for sales cycle data.
 * Placeholder -- will be filled with actual SQL when BQ credentials are available.
 *
 * Primary data source: v_close_cycle_stats_dated view
 *   Fields: prospect_email, client_id, closer_id, close_date, days_to_close, calls_to_close
 */
async function queryBigQuery(clientId, filters, tier) {
  // TODO: Real BQ queries when credentials available
  return getDemoData(tier, filters);
}

// ================================================================
// DEMO DATA -- Realistic sample data for development and demos
// ================================================================

function getDemoData(tier = 'insight', filters = {}) {
  const isInsightPlus = tier === 'insight' || tier === 'executive';

  const result = {
    sections: {
      // ── Calls to Close: 9 scorecards ──
      callsToClose: {
        oneCallCloses:       { value: 9,   label: '1-Call Closes',         format: 'number',  delta: 2,    deltaLabel: 'vs prev period' },
        oneCallClosePct:     { value: 0.391, label: '1-Call Close %',      format: 'percent', delta: 0.03, deltaLabel: 'vs prev period' },
        twoCallCloses:       { value: 8,   label: '2-Call Closes',         format: 'number',  delta: 1,    deltaLabel: 'vs prev period' },
        twoCallClosePct:     { value: 0.348, label: '2-Call Close %',      format: 'percent', delta: 0.01, deltaLabel: 'vs prev period' },
        threeCallCloses:     { value: 6,   label: '3+ Call Closes',        format: 'number',  delta: -1,   deltaLabel: 'vs prev period' },
        threeCallClosePct:   { value: 0.261, label: '3+ Call Close %',     format: 'percent', delta: -0.02, deltaLabel: 'vs prev period' },
        avgCallsToClose:     { value: 1.8, label: 'Avg Calls to Close',    format: 'decimal', delta: -0.1, deltaLabel: 'vs prev period' },
        medianCallsToClose:  { value: 2.0, label: 'Median Calls to Close', format: 'decimal', delta: 0,    deltaLabel: 'vs prev period' },
        callsNeededPerDeal:  { value: 4.5, label: 'Calls Needed per Deal', format: 'decimal', delta: -0.3, deltaLabel: 'vs prev period' },
      },

      // ── Days to Close: 2 scorecards ──
      daysToClose: {
        avgDaysToClose:    { value: 8.7, label: 'Avg Days to Close',    format: 'decimal', delta: -1.2, deltaLabel: 'vs prev period' },
        medianDaysToClose: { value: 6.0, label: 'Median Days to Close', format: 'decimal', delta: -0.5, deltaLabel: 'vs prev period' },
      },
    },

    charts: {
      // Pie: 1-Call vs 2-Call vs 3+ Call Closes
      salesCyclePie: {
        type: 'pie',
        label: '1-Call vs Multi-Call Closes',
        data: [
          { label: '1-Call Close', value: 9, color: NEON.green },
          { label: '2-Call Close', value: 8, color: NEON.cyan },
          { label: '3+ Call Close', value: 6, color: NEON.amber },
        ],
      },

      // Bar: Calls to Close — bucketed distribution
      callsToCloseBar: {
        type: 'bar',
        label: '# of Calls to Close',
        series: [{ key: 'deals', label: 'Deals Closed', color: 'cyan' }],
        data: [
          { date: '1 Call',   deals: 9 },
          { date: '2 Calls',  deals: 8 },
          { date: '3 Calls',  deals: 4 },
          { date: '4 Calls',  deals: 1 },
          { date: '5+ Calls', deals: 1 },
        ],
      },

      // Pie: Days to Close Distribution
      daysToClosePie: {
        type: 'pie',
        label: 'Days to Close Distribution',
        data: [
          { label: 'Same Day',  value: 5, color: NEON.green },
          { label: '1-3 Days',  value: 4, color: NEON.cyan },
          { label: '4-7 Days',  value: 5, color: NEON.amber },
          { label: '8-14 Days', value: 3, color: NEON.purple },
          { label: '15-30 Days', value: 4, color: NEON.red },
          { label: '30+ Days',  value: 2, color: NEON.muted },
        ],
      },

      // Bar: Days to Close — bucketed distribution
      daysToCloseBar: {
        type: 'bar',
        label: '# of Days to Close',
        series: [{ key: 'deals', label: 'Deals Closed', color: 'amber' }],
        data: [
          { date: 'Same Day', deals: 5 },
          { date: '1-3',      deals: 4 },
          { date: '4-7',      deals: 5 },
          { date: '8-14',     deals: 3 },
          { date: '15-30',    deals: 4 },
          { date: '30+',      deals: 2 },
        ],
      },
    },
  };

  // Stacked by-closer charts — insight+ only
  if (isInsightPlus) {
    result.charts.callsToCloseByCloser = {
      type: 'bar',
      label: 'Calls to Close by Closer',
      series: [
        { key: 'oneCall',   label: '1 Call',  color: 'green' },
        { key: 'twoCalls',  label: '2 Calls', color: 'cyan' },
        { key: 'threePlus', label: '3+',      color: 'amber' },
      ],
      data: [
        { date: 'Sarah',   oneCall: 4, twoCalls: 3, threePlus: 1 },
        { date: 'Mike',    oneCall: 2, twoCalls: 3, threePlus: 2 },
        { date: 'Jessica', oneCall: 2, twoCalls: 1, threePlus: 2 },
        { date: 'Alex',    oneCall: 1, twoCalls: 1, threePlus: 1 },
      ],
    };

    result.charts.daysToCloseByCloser = {
      type: 'bar',
      label: 'Days to Close by Closer',
      series: [
        { key: 'sameDay',    label: 'Same Day', color: 'green' },
        { key: 'oneToThree', label: '1-3',      color: 'cyan' },
        { key: 'fourToSeven', label: '4-7',     color: 'amber' },
        { key: 'eightPlus',  label: '8+',       color: 'red' },
      ],
      data: [
        { date: 'Sarah',   sameDay: 2, oneToThree: 3, fourToSeven: 2, eightPlus: 1 },
        { date: 'Mike',    sameDay: 1, oneToThree: 1, fourToSeven: 2, eightPlus: 3 },
        { date: 'Jessica', sameDay: 1, oneToThree: 0, fourToSeven: 1, eightPlus: 3 },
        { date: 'Alex',    sameDay: 1, oneToThree: 0, fourToSeven: 0, eightPlus: 2 },
      ],
    };
  }

  return result;
}

module.exports = { getSalesCycleData };
