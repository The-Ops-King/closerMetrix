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
const { NEON_HEX } = require('../../../shared/chartMappings');

/**
 * Fetch all sales cycle data for a client.
 *
 * @param {string} clientId - Client ID for data isolation
 * @param {object} filters - { dateStart, dateEnd, closerId }
 * @param {string} tier - Client's plan tier
 * @returns {Promise<object>} { sections, charts }
 */
async function getSalesCycleData(clientId, filters = {}, tier = 'insight') {
  if (!bq.isAvailable() || clientId.startsWith('demo_')) {
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
 * Uses v_close_cycle_stats_dated view for per-prospect close cycle metrics.
 * Also queries the main view for calls-needed-per-deal (total calls / total closes).
 */
async function queryBigQuery(clientId, filters, tier) {
  const { runParallel, num, rate } = require('./helpers');
  const isInsightPlus = tier === 'insight' || tier === 'executive';

  const cycleView = bq.table('v_close_cycle_stats_dated');
  const mainView = bq.table('v_calls_joined_flat_prefixed');

  const effectiveCloserId = tier === 'basic' ? null : filters.closerId;
  const closerFilter = effectiveCloserId ? 'AND closer_id IN UNNEST(@closerIds)' : '';
  const mainCloserFilter = effectiveCloserId ? 'AND calls_closer_id IN UNNEST(@closerIds)' : '';

  const params = { clientId, dateStart: filters.dateStart, dateEnd: filters.dateEnd };
  if (effectiveCloserId) params.closerIds = effectiveCloserId.split(',').map(id => id.trim());

  // 1) Scorecard: avg/median calls & days to close, bucket counts
  const scorecardSql = `SELECT
      AVG(calls_to_close) as avg_calls,
      APPROX_QUANTILES(calls_to_close, 2)[OFFSET(1)] as median_calls,
      AVG(days_to_close) as avg_days,
      APPROX_QUANTILES(days_to_close, 2)[OFFSET(1)] as median_days,
      COUNT(*) as total_closed,
      COUNT(CASE WHEN calls_to_close = 1 THEN 1 END) as one_call,
      COUNT(CASE WHEN calls_to_close = 2 THEN 1 END) as two_call,
      COUNT(CASE WHEN calls_to_close >= 3 THEN 1 END) as three_plus,
      -- Days buckets
      COUNT(CASE WHEN days_to_close = 0 THEN 1 END) as same_day,
      COUNT(CASE WHEN days_to_close BETWEEN 1 AND 3 THEN 1 END) as days_1_3,
      COUNT(CASE WHEN days_to_close BETWEEN 4 AND 7 THEN 1 END) as days_4_7,
      COUNT(CASE WHEN days_to_close BETWEEN 8 AND 14 THEN 1 END) as days_8_14,
      COUNT(CASE WHEN days_to_close BETWEEN 15 AND 30 THEN 1 END) as days_15_30,
      COUNT(CASE WHEN days_to_close > 30 THEN 1 END) as days_30_plus
    FROM ${cycleView}
    WHERE client_id = @clientId
      AND close_date BETWEEN @dateStart AND @dateEnd
      ${closerFilter}`;

  // 2) Calls needed per deal (total calls held / total closes) from main view
  const callsPerDealSql = `SELECT
      SAFE_DIVIDE(
        COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END),
        COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END)
      ) as calls_needed_per_deal
    FROM ${mainView}
    WHERE clients_client_id = @clientId
      AND DATE(calls_appointment_date) BETWEEN DATE(@dateStart) AND DATE(@dateEnd)
      ${mainCloserFilter}`;

  // 3) Per-closer (insight+)
  const closerSql = isInsightPlus ? `SELECT
      closer_id,
      MAX(closer_name) as closer_name,
      AVG(calls_to_close) as avg_calls,
      AVG(days_to_close) as avg_days,
      COUNT(CASE WHEN calls_to_close = 1 THEN 1 END) as one_call,
      COUNT(CASE WHEN calls_to_close = 2 THEN 1 END) as two_call,
      COUNT(CASE WHEN calls_to_close >= 3 THEN 1 END) as three_plus,
      COUNT(CASE WHEN days_to_close = 0 THEN 1 END) as same_day,
      COUNT(CASE WHEN days_to_close BETWEEN 1 AND 3 THEN 1 END) as days_1_3,
      COUNT(CASE WHEN days_to_close BETWEEN 4 AND 7 THEN 1 END) as days_4_7,
      COUNT(CASE WHEN days_to_close > 7 THEN 1 END) as days_8_plus
    FROM ${cycleView}
    WHERE client_id = @clientId
      AND close_date BETWEEN @dateStart AND @dateEnd
      ${closerFilter}
    GROUP BY closer_id ORDER BY avg_calls` : null;

  const queries = [
    bq.runQuery(scorecardSql, params),
    bq.runQuery(callsPerDealSql, params),
  ];
  if (closerSql) queries.push(bq.runQuery(closerSql, params));

  const results = await runParallel(queries);
  const sc = (results[0] && results[0][0]) || {};
  const cpd = (results[1] && results[1][0]) || {};
  const cl = results[2] || [];

  const totalClosed = num(sc.total_closed) || 1;
  const oneCall = num(sc.one_call);
  const twoCall = num(sc.two_call);
  const threePlus = num(sc.three_plus);

  const result = {
    sections: {
      callsToClose: {
        oneCallCloses: { value: oneCall, label: '1-Call Closes', format: 'number' },
        oneCallClosePct: { value: oneCall / totalClosed, label: '1-Call Close %', format: 'percent' },
        twoCallCloses: { value: twoCall, label: '2-Call Closes', format: 'number' },
        twoCallClosePct: { value: twoCall / totalClosed, label: '2-Call Close %', format: 'percent' },
        threeCallCloses: { value: threePlus, label: '3+ Call Closes', format: 'number' },
        threeCallClosePct: { value: threePlus / totalClosed, label: '3+ Call Close %', format: 'percent' },
        avgCallsToClose: { value: num(sc.avg_calls), label: 'Avg Calls to Close', format: 'decimal' },
        medianCallsToClose: { value: num(sc.median_calls), label: 'Median Calls to Close', format: 'decimal' },
        callsNeededPerDeal: { value: num(cpd.calls_needed_per_deal), label: 'Calls Needed per Deal', format: 'decimal' },
      },
      daysToClose: {
        avgDaysToClose: { value: num(sc.avg_days), label: 'Avg Days to Close', format: 'decimal' },
        medianDaysToClose: { value: num(sc.median_days), label: 'Median Days to Close', format: 'decimal' },
      },
    },
    charts: {
      salesCyclePie: {
        type: 'pie', label: '1-Call vs Multi-Call Closes',
        data: [
          { label: '1-Call Close', value: oneCall, color: NEON_HEX.green },
          { label: '2-Call Close', value: twoCall, color: NEON_HEX.cyan },
          { label: '3+ Call Close', value: threePlus, color: NEON_HEX.amber },
        ].filter(d => d.value > 0),
      },
      callsToCloseBar: {
        type: 'bar', label: '# of Calls to Close',
        series: [{ key: 'deals', label: 'Deals Closed', color: 'cyan' }],
        data: [
          { date: '1 Call', deals: oneCall },
          { date: '2 Calls', deals: twoCall },
          { date: '3+ Calls', deals: threePlus },
        ],
      },
      daysToClosePie: {
        type: 'pie', label: 'Days to Close Distribution',
        data: [
          { label: 'Same Day', value: num(sc.same_day), color: NEON_HEX.green },
          { label: '1-3 Days', value: num(sc.days_1_3), color: NEON_HEX.cyan },
          { label: '4-7 Days', value: num(sc.days_4_7), color: NEON_HEX.amber },
          { label: '8-14 Days', value: num(sc.days_8_14), color: NEON_HEX.purple },
          { label: '15-30 Days', value: num(sc.days_15_30), color: NEON_HEX.red },
          { label: '30+ Days', value: num(sc.days_30_plus), color: NEON_HEX.muted },
        ].filter(d => d.value > 0),
      },
      daysToCloseBar: {
        type: 'bar', label: '# of Days to Close',
        series: [{ key: 'deals', label: 'Deals Closed', color: 'amber' }],
        data: [
          { date: 'Same Day', deals: num(sc.same_day) },
          { date: '1-3', deals: num(sc.days_1_3) },
          { date: '4-7', deals: num(sc.days_4_7) },
          { date: '8-14', deals: num(sc.days_8_14) },
          { date: '15-30', deals: num(sc.days_15_30) },
          { date: '30+', deals: num(sc.days_30_plus) },
        ],
      },
    },
  };

  // Per-closer charts (Insight+ only)
  if (isInsightPlus && cl.length > 0) {
    result.charts.callsToCloseByCloser = {
      type: 'bar', label: 'Calls to Close by Closer',
      series: [
        { key: 'oneCall', label: '1 Call', color: 'green' },
        { key: 'twoCalls', label: '2 Calls', color: 'cyan' },
        { key: 'threePlus', label: '3+', color: 'amber' },
      ],
      data: cl.map(r => ({
        date: r.closer_name || r.closer_id,
        oneCall: num(r.one_call), twoCalls: num(r.two_call), threePlus: num(r.three_plus),
      })),
    };
    result.charts.daysToCloseByCloser = {
      type: 'bar', label: 'Days to Close by Closer',
      series: [
        { key: 'sameDay', label: 'Same Day', color: 'green' },
        { key: 'oneToThree', label: '1-3', color: 'cyan' },
        { key: 'fourToSeven', label: '4-7', color: 'amber' },
        { key: 'eightPlus', label: '8+', color: 'red' },
      ],
      data: cl.map(r => ({
        date: r.closer_name || r.closer_id,
        sameDay: num(r.same_day), oneToThree: num(r.days_1_3),
        fourToSeven: num(r.days_4_7), eightPlus: num(r.days_8_plus),
      })),
    };
  }

  return result;
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
          { label: '1-Call Close', value: 9, color: NEON_HEX.green },
          { label: '2-Call Close', value: 8, color: NEON_HEX.cyan },
          { label: '3+ Call Close', value: 6, color: NEON_HEX.amber },
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
          { label: 'Same Day',  value: 5, color: NEON_HEX.green },
          { label: '1-3 Days',  value: 4, color: NEON_HEX.cyan },
          { label: '4-7 Days',  value: 5, color: NEON_HEX.amber },
          { label: '8-14 Days', value: 3, color: NEON_HEX.purple },
          { label: '15-30 Days', value: 4, color: NEON_HEX.red },
          { label: '30+ Days',  value: 2, color: NEON_HEX.muted },
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
