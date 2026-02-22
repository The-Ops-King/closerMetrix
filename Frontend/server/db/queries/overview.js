/**
 * OVERVIEW PAGE QUERIES
 *
 * All BigQuery queries for the Overview page (all tiers).
 * Returns scorecards, chart data, and trend metrics.
 *
 * When BQ is unavailable, returns realistic demo data so the UI
 * can be fully developed and demoed without credentials.
 *
 * Sections:
 *   atAGlance — Top-row headline scorecards (10 metrics)
 *   volume — Call volume and activity metrics
 *   attendance — Show rates, no-shows, ghosted, rescheduled, canceled
 *   outcomes — Close rates, funnel, deposits, DQ
 *   salesCycle — Calls/days to close, 1-call vs multi-call
 *   revenue — Revenue, cash collected, per-call metrics
 *   trends — Week-over-week deltas
 *
 * Charts:
 *   revenueOverTime — Line: Total revenue + cash by week
 *   showCloseRateOverTime — Line: Show rate + close rate by week
 *   attendanceBreakdown — Pie: Show / Ghost / Reschedule / Cancel / No-Show
 *   outcomeBreakdown — Pie: Closed / Follow-Up / Lost / DQ
 *   callVolume — Bar: First Calls vs Follow-Ups by week
 */

const bq = require('../BigQueryClient');
const logger = require('../../utils/logger');

/**
 * Compute a human-readable delta label from a date range.
 * Maps common durations to friendly names; falls back to "vs prev N days".
 *
 * @param {string} dateStart - ISO date string (YYYY-MM-DD or full ISO)
 * @param {string} dateEnd - ISO date string
 * @returns {string} e.g. "vs prev week", "vs prev month", "vs prev 14 days"
 */
function computeDeltaLabel(dateStart, dateEnd) {
  if (!dateStart || !dateEnd) return 'vs prev period';
  const start = new Date(dateStart);
  const end = new Date(dateEnd);
  const days = Math.round((end - start) / (1000 * 60 * 60 * 24));

  if (days >= 6 && days <= 8) return 'vs prev week';
  if (days >= 13 && days <= 15) return 'vs prev 2 weeks';
  if (days >= 28 && days <= 31) return 'vs prev month';
  if (days >= 59 && days <= 62) return 'vs prev 2 months';
  if (days >= 89 && days <= 92) return 'vs prev quarter';
  if (days >= 180 && days <= 184) return 'vs prev 6 months';
  if (days >= 364 && days <= 366) return 'vs prev year';
  return `vs prev ${days} days`;
}

/**
 * Compute the previous comparison period for a given date range.
 * Returns the same-length period immediately preceding the current one.
 *
 * @param {string} dateStart - ISO date string
 * @param {string} dateEnd - ISO date string
 * @returns {{ prevStart: string, prevEnd: string, deltaLabel: string }}
 */
function computePreviousPeriod(dateStart, dateEnd) {
  if (!dateStart || !dateEnd) return { prevStart: null, prevEnd: null, deltaLabel: 'vs prev period' };
  const start = new Date(dateStart);
  const end = new Date(dateEnd);
  const durationMs = end - start;
  const prevEnd = new Date(start.getTime() - 1); // day before current start
  const prevStart = new Date(prevEnd.getTime() - durationMs);
  return {
    prevStart: prevStart.toISOString().split('T')[0],
    prevEnd: prevEnd.toISOString().split('T')[0],
    deltaLabel: computeDeltaLabel(dateStart, dateEnd),
  };
}

/**
 * Simple seeded pseudo-random number generator.
 * Produces consistent deltas for a given seed string so values
 * don't jump on every request but vary by period/metric.
 */
function seededRandom(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  // Convert hash to a float between 0 and 1
  return ((hash & 0x7fffffff) % 10000) / 10000;
}

/**
 * Fetch all overview data for a client.
 *
 * @param {string} clientId - Client ID for data isolation
 * @param {object} filters - { dateStart, dateEnd, closerId }
 * @param {string} tier - Client's plan tier (Basic ignores closerId)
 * @returns {Promise<object>} { sections, charts }
 */
async function getOverviewData(clientId, filters = {}, tier = 'basic') {
  // If BQ is unavailable, return demo data
  if (!bq.isAvailable()) {
    logger.debug('Returning demo overview data');
    return getDemoData(filters);
  }

  // Real BQ queries — will be implemented when credentials are available
  // TODO: Replace with actual BQ queries in Phase 3 when Tyler provides credentials
  try {
    return await queryBigQuery(clientId, filters, tier);
  } catch (err) {
    logger.error('Overview BQ query failed, falling back to demo', {
      error: err.message,
      clientId,
    });
    return getDemoData(filters);
  }
}

/**
 * Run real BigQuery queries for overview data.
 * Runs the main query for the current period and a comparison query
 * for the previous period to compute deltas.
 */
async function queryBigQuery(clientId, filters, tier) {
  const { dateStart, dateEnd, closerId } = filters;

  // For Basic tier, always ignore closerId
  const effectiveCloserId = tier === 'basic' ? null : closerId;

  const closerFilter = effectiveCloserId
    ? 'AND calls_closer_id = @closerId'
    : '';

  // Shared SQL for both current and previous period queries
  const selectSql = `SELECT
      COUNT(CASE WHEN calls_call_type = 'First Call' THEN 1 END) as prospects_booked,
      COUNT(CASE WHEN calls_call_type = 'First Call' AND calls_attendance = 'Show' THEN 1 END) as prospects_held,
      COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END) as calls_held,
      COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END) as closed_deals,
      SAFE_DIVIDE(
        COUNT(CASE WHEN calls_call_type = 'First Call' AND calls_attendance = 'Show' THEN 1 END),
        COUNT(CASE WHEN calls_call_type = 'First Call' THEN 1 END)
      ) as show_rate,
      SAFE_DIVIDE(
        COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END),
        COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END)
      ) as close_rate,
      SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_revenue_generated AS FLOAT64) ELSE 0 END) as revenue,
      SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_cash_collected AS FLOAT64) ELSE 0 END) as cash,
      SAFE_DIVIDE(
        SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_cash_collected AS FLOAT64) ELSE 0 END),
        COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END)
      ) as cash_per_call,
      SAFE_DIVIDE(
        SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_revenue_generated AS FLOAT64) ELSE 0 END),
        COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END)
      ) as avg_deal_size
    FROM ${bq.table('v_calls_joined_flat_prefixed')}`;

  // --- Current period query ---
  const dateFilter = dateStart && dateEnd
    ? 'AND PARSE_TIMESTAMP("%Y-%m-%dT%H:%M:%S", calls_appointment_date) BETWEEN @dateStart AND @dateEnd'
    : '';

  const params = { clientId };
  if (dateStart) params.dateStart = dateStart;
  if (dateEnd) params.dateEnd = dateEnd;
  if (effectiveCloserId) params.closerId = effectiveCloserId;

  const atAGlanceRows = await bq.runQuery(
    `${selectSql} WHERE clients_client_id = @clientId ${dateFilter} ${closerFilter}`,
    params
  );
  const ag = atAGlanceRows[0] || {};

  // --- Previous period comparison query ---
  let prev = null;
  const { prevStart, prevEnd, deltaLabel } = computePreviousPeriod(dateStart, dateEnd);
  if (prevStart && prevEnd) {
    try {
      const prevParams = { clientId, dateStart: prevStart, dateEnd: prevEnd };
      if (effectiveCloserId) prevParams.closerId = effectiveCloserId;
      const prevDateFilter = 'AND PARSE_TIMESTAMP("%Y-%m-%dT%H:%M:%S", calls_appointment_date) BETWEEN @dateStart AND @dateEnd';
      const prevRows = await bq.runQuery(
        `${selectSql} WHERE clients_client_id = @clientId ${prevDateFilter} ${closerFilter}`,
        prevParams
      );
      prev = prevRows[0] || null;
    } catch (err) {
      logger.warn('Previous period comparison query failed', { error: err.message });
    }
  }

  // --- Build response from query results ---
  return {
    sections: {
      atAGlance: buildAtAGlance(ag, prev, deltaLabel),
      volume: {},    // TODO: query
      attendance: {},
      outcomes: {},
      salesCycle: {},
      revenue: {},
      trends: {},
    },
    charts: {},
  };
}

/**
 * Calculate percentage delta between current and previous values.
 * Returns null if previous value is 0 or missing.
 */
function calcDelta(current, previous) {
  if (previous == null || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

/** Build atAGlance scorecards from a BQ result row, with optional previous period for deltas */
function buildAtAGlance(row, prevRow, deltaLabel) {
  const dl = deltaLabel || 'vs prev period';
  return {
    prospectsBooked: { value: row.prospects_booked || 0, label: 'Prospects Booked', format: 'number', delta: prevRow ? calcDelta(row.prospects_booked, prevRow.prospects_booked) : null, deltaLabel: dl, desiredDirection: 'up' },
    prospectsHeld: { value: row.prospects_held || 0, label: 'Prospect Calls Held', format: 'number', delta: prevRow ? calcDelta(row.prospects_held, prevRow.prospects_held) : null, deltaLabel: dl, desiredDirection: 'up' },
    showRate: { value: row.show_rate || 0, label: 'Show Rate', format: 'percent', delta: prevRow ? calcDelta(row.show_rate, prevRow.show_rate) : null, deltaLabel: dl, desiredDirection: 'up' },
    closedDeals: { value: row.closed_deals || 0, label: 'Closed Deals', format: 'number', delta: prevRow ? calcDelta(row.closed_deals, prevRow.closed_deals) : null, deltaLabel: dl, desiredDirection: 'up' },
    closeRate: { value: row.close_rate || 0, label: 'Close Rate', format: 'percent', delta: prevRow ? calcDelta(row.close_rate, prevRow.close_rate) : null, deltaLabel: dl, desiredDirection: 'up' },
    revenue: { value: row.revenue || 0, label: 'Revenue Generated', format: 'currency', delta: prevRow ? calcDelta(row.revenue, prevRow.revenue) : null, deltaLabel: dl, desiredDirection: 'up' },
    cashCollected: { value: row.cash || 0, label: 'Cash Collected', format: 'currency', delta: prevRow ? calcDelta(row.cash, prevRow.cash) : null, deltaLabel: dl, desiredDirection: 'up' },
    cashPerCall: { value: row.cash_per_call || 0, label: 'Cash per Call Held', format: 'currency', delta: prevRow ? calcDelta(row.cash_per_call, prevRow.cash_per_call) : null, deltaLabel: dl, desiredDirection: 'up' },
    avgDealSize: { value: row.avg_deal_size || 0, label: 'Avg Deal Size', format: 'currency', delta: prevRow ? calcDelta(row.avg_deal_size, prevRow.avg_deal_size) : null, deltaLabel: dl, desiredDirection: 'up' },
    potentialViolations: { value: row.violations || 0, label: 'Potential Violations', format: 'number', delta: prevRow ? calcDelta(row.violations, prevRow.violations) : null, deltaLabel: dl, desiredDirection: 'down' },
  };
}

// ═══════════════════════════════════════════════════════════════
// DEMO DATA — Realistic sample data for development and demos
// ═══════════════════════════════════════════════════════════════

function getDemoData(filters = {}) {
  const { dateStart, dateEnd, closerId } = filters;
  const deltaLabel = computeDeltaLabel(dateStart, dateEnd);

  // Generate seeded deltas so they stay consistent per date range
  // but vary when the filter changes
  const seed = `${dateStart || 'default'}-${dateEnd || 'default'}`;
  function demoDelta(metricKey, baseRange) {
    const r = seededRandom(seed + metricKey);
    // Map 0..1 to -baseRange..+baseRange, then round to 1 decimal
    return Math.round((r * 2 - 1) * baseRange * 10) / 10;
  }

  // Demo closers — if closerId is provided, filter to just that closer's data
  const demoClosers = [
    { id: 'closer_sarah', name: 'Sarah Chen' },
    { id: 'closer_michael', name: 'Michael Torres' },
    { id: 'closer_jessica', name: 'Jessica Kim' },
    { id: 'closer_david', name: 'David Brown' },
    { id: 'closer_amanda', name: 'Amanda Garcia' },
  ];
  const isFiltered = closerId && demoClosers.some(c => c.id === closerId);
  // Scale values down when filtering to a single closer (~20% of team)
  const scale = isFiltered ? 0.22 : 1;

  return {
    sections: {
      atAGlance: {
        prospectsBooked: { value: Math.round(142 * scale), label: 'Prospects Booked', format: 'number', delta: demoDelta('prospectsBooked', 15), deltaLabel, desiredDirection: 'up' },
        prospectsHeld: { value: Math.round(104 * scale), label: 'Prospect Calls Held', format: 'number', delta: demoDelta('prospectsHeld', 12), deltaLabel, desiredDirection: 'up' },
        showRate: { value: 0.732, label: 'Show Rate', format: 'percent', delta: demoDelta('showRate', 8), deltaLabel, desiredDirection: 'up' },
        closedDeals: { value: Math.round(23 * scale), label: 'Closed Deals', format: 'number', delta: demoDelta('closedDeals', 20), deltaLabel, desiredDirection: 'up' },
        closeRate: { value: 0.221, label: 'Close Rate', format: 'percent', delta: demoDelta('closeRate', 6), deltaLabel, desiredDirection: 'up' },
        revenue: { value: Math.round(115000 * scale), label: 'Revenue Generated', format: 'currency', delta: demoDelta('revenue', 20), deltaLabel, desiredDirection: 'up' },
        cashCollected: { value: Math.round(69000 * scale), label: 'Cash Collected', format: 'currency', delta: demoDelta('cashCollected', 18), deltaLabel, desiredDirection: 'up' },
        cashPerCall: { value: 663, label: 'Cash per Call Held', format: 'currency', delta: demoDelta('cashPerCall', 10), deltaLabel, desiredDirection: 'up' },
        avgDealSize: { value: 5000, label: 'Avg Deal Size', format: 'currency', delta: demoDelta('avgDealSize', 12), deltaLabel, desiredDirection: 'up' },
        potentialViolations: { value: Math.round(7 * scale) || 1, label: 'Potential Violations', format: 'number', delta: demoDelta('violations', 25), deltaLabel, desiredDirection: 'down' },
      },
      volume: {
        prospectsBooked: { value: 142, label: 'Prospects Booked', format: 'number' },
        totalCallsBooked: { value: 218, label: 'Total Calls Booked', format: 'number' },
        totalCallsHeld: { value: 164, label: 'Total Calls Held', format: 'number' },
        firstCallsScheduled: { value: 142, label: 'First Calls Scheduled', format: 'number' },
        firstCallsHeld: { value: 104, label: 'First Calls Held', format: 'number' },
        followUpsScheduled: { value: 76, label: 'Follow-Ups Scheduled', format: 'number' },
        followUpsHeld: { value: 60, label: 'Follow-Up Calls Held', format: 'number' },
        activeFollowUps: { value: 34, label: 'Active Follow-Ups Pending', format: 'number' },
      },
      attendance: {
        showRateTotal: { value: 0.752, label: 'Show Rate (Total)', format: 'percent' },
        showRateFirst: { value: 0.732, label: 'Show Rate (First)', format: 'percent' },
        showRateFollowUp: { value: 0.789, label: 'Show Rate (Follow-Up)', format: 'percent' },
        noShows: { value: 22, label: 'No-Shows', format: 'number' },
        noShowPct: { value: 0.101, label: 'No-Show %', format: 'percent' },
        ghosted: { value: 14, label: 'Ghosted', format: 'number' },
        ghostedPctBooked: { value: 0.064, label: 'Ghosted (% of Booked)', format: 'percent' },
        ghostedPctNoShow: { value: 0.636, label: 'Ghosted (% of No-Shows)', format: 'percent' },
        rescheduled: { value: 18, label: 'Rescheduled', format: 'number' },
        rescheduledPct: { value: 0.083, label: 'Rescheduled %', format: 'percent' },
        canceled: { value: 14, label: 'Canceled', format: 'number' },
        canceledPct: { value: 0.064, label: 'Canceled %', format: 'percent' },
      },
      outcomes: {
        closedDeals: { value: 23, label: 'Deals Closed', format: 'number' },
        closeRateTotal: { value: 0.221, label: 'Close Rate (Total)', format: 'percent' },
        closeRateFirst: { value: 0.183, label: 'Close Rate (First Calls)', format: 'percent' },
        closeRateFollowUp: { value: 0.283, label: 'Close Rate (Follow-Ups)', format: 'percent' },
        bookCloseRate: { value: 0.162, label: 'Book → Close Rate', format: 'percent' },
        showCloseRate: { value: 0.221, label: 'Show → Close Rate', format: 'percent' },
        scheduledPerDeal: { value: 6.2, label: 'Calls Scheduled per Deal', format: 'decimal' },
        heldPerDeal: { value: 4.5, label: 'Calls Held per Deal', format: 'decimal' },
        deposits: { value: 18, label: 'Deposits Taken', format: 'number' },
        depositsConverted: { value: 15, label: 'Deposits → Closed', format: 'number' },
        depositConvertPct: { value: 0.833, label: 'Deposit → Close %', format: 'percent' },
        dqCount: { value: 8, label: 'Disqualified', format: 'number' },
        dqPct: { value: 0.049, label: 'DQ %', format: 'percent' },
      },
      salesCycle: {
        avgCallsToClose: { value: 2.3, label: 'Avg Calls to Close', format: 'decimal' },
        medianCallsToClose: { value: 2.0, label: 'Median Calls to Close', format: 'decimal' },
        avgDaysToClose: { value: 8.7, label: 'Avg Days to Close', format: 'decimal' },
        medianDaysToClose: { value: 6.0, label: 'Median Days to Close', format: 'decimal' },
        oneCallCloses: { value: 9, label: '1-Call Closes', format: 'number' },
        oneCallClosePct: { value: 0.391, label: '1-Call Close %', format: 'percent' },
        twoCallCloses: { value: 8, label: '2-Call Closes', format: 'number' },
        twoCallClosePct: { value: 0.348, label: '2-Call Close %', format: 'percent' },
        threeCallCloses: { value: 6, label: '3+ Call Closes', format: 'number' },
        threeCallClosePct: { value: 0.261, label: '3+ Call Close %', format: 'percent' },
      },
      revenue: {
        totalRevenue: { value: 115000, label: 'Total Revenue', format: 'currency' },
        cashCollected: { value: 69000, label: 'Cash Collected', format: 'currency' },
        collectedPct: { value: 0.60, label: '% Collected', format: 'percent' },
        revenuePerShow: { value: 1106, label: 'Revenue per Show', format: 'currency' },
        revenuePerCall: { value: 701, label: 'Revenue per Total Call', format: 'currency' },
        cashPerCall: { value: 663, label: 'Cash per Call Held', format: 'currency' },
      },
      trends: {
        wowShowRate: { value: 0.023, label: 'WoW Show Rate', format: 'percent', delta: 0.023 },
        wowCloseRate: { value: -0.018, label: 'WoW Close Rate', format: 'percent', delta: -0.018 },
        wowCallsHeld: { value: 0.05, label: 'WoW Calls Held', format: 'percent', delta: 0.05 },
        wowDealsClosed: { value: 0.12, label: 'WoW Deals Closed', format: 'percent', delta: 0.12 },
      },
    },
    charts: {
      revenueOverTime: {
        type: 'line',
        label: 'Revenue & Cash Over Time',
        series: [
          { key: 'revenue', label: 'Revenue', color: 'cyan' },
          { key: 'cash', label: 'Cash Collected', color: 'green' },
        ],
        data: generateTimeSeries(dateStart, dateEnd, [
          { key: 'revenue', base: 14000, variance: 3000 },
          { key: 'cash', base: 8400, variance: 2000 },
        ]),
      },
      closesOverTime: {
        type: 'bar',
        label: 'Deals Closed Over Time',
        series: [
          { key: 'closes', label: 'Deals Closed', color: 'green' },
        ],
        data: generateTimeSeries(dateStart, dateEnd, [
          { key: 'closes', base: 3, variance: 2 },
        ]),
      },
      showCloseRateOverTime: {
        type: 'line',
        label: 'Show Rate & Close Rate',
        series: [
          { key: 'showRate', label: 'Show Rate', color: 'cyan' },
          { key: 'closeRate', label: 'Close Rate', color: 'amber' },
        ],
        data: generateTimeSeries(dateStart, dateEnd, [
          { key: 'showRate', base: 0.72, variance: 0.06 },
          { key: 'closeRate', base: 0.22, variance: 0.05 },
        ]),
      },
      attendanceBreakdown: {
        type: 'pie',
        label: 'Attendance Breakdown',
        data: [
          { label: 'Show', value: 164, color: '#6BCF7F' },
          { label: 'Ghosted', value: 14, color: '#FF4D6D' },
          { label: 'No-Show', value: 8, color: '#ff00e5' },
          { label: 'Rescheduled', value: 18, color: '#FFD93D' },
          { label: 'Canceled', value: 14, color: '#64748b' },
        ],
      },
      outcomeBreakdown: {
        type: 'pie',
        label: 'Call Outcomes',
        data: [
          { label: 'Closed', value: 23, color: '#6BCF7F' },
          { label: 'Follow-Up', value: 34, color: '#4DD4E8' },
          { label: 'Lost', value: 12, color: '#FF4D6D' },
          { label: 'DQ', value: 8, color: '#64748b' },
          { label: 'Deposit', value: 18, color: '#FFD93D' },
          { label: 'Other', value: 9, color: '#B84DFF' },
        ],
      },
      callVolume: {
        type: 'bar',
        label: 'Calls by Type',
        series: [
          { key: 'firstCalls', label: 'First Calls', color: 'cyan' },
          { key: 'followUps', label: 'Follow-Ups', color: 'amber' },
        ],
        data: generateTimeSeries(dateStart, dateEnd, [
          { key: 'firstCalls', base: 18, variance: 5 },
          { key: 'followUps', base: 10, variance: 3 },
        ]),
      },
      salesCyclePie: {
        type: 'pie',
        label: '1-Call vs Multi-Call Closes',
        data: [
          { label: '1-Call Close', value: 9, color: '#6BCF7F' },
          { label: '2-Call Close', value: 8, color: '#4DD4E8' },
          { label: '3+ Call Close', value: 6, color: '#FFD93D' },
        ],
      },
    },
    leaderboard: [
      { name: 'Sarah Chen', dealsClosed: 42, revenue: 680000 },
      { name: 'Michael Torres', dealsClosed: 38, revenue: 615000 },
      { name: 'Jessica Kim', dealsClosed: 35, revenue: 580000 },
      { name: 'David Brown', dealsClosed: 31, revenue: 520000 },
      { name: 'Amanda Garcia', dealsClosed: 28, revenue: 485000 },
    ],
    funnel: [
      { stage: 'Leads', count: 1400 },
      { stage: 'Qualified', count: 900 },
      { stage: 'Proposal', count: 550 },
      { stage: 'Negotiation', count: 300 },
      { stage: 'Closed', count: 147 },
    ],
  };
}

/**
 * Compute smart granularity based on date range duration.
 *   7 days → daily (1 point per day)
 *   ~30 days (month) → every 2 days
 *   ~90 days (quarter) → weekly
 *   ~365 days (year) → monthly
 *
 * @param {string} dateStart - ISO date string
 * @param {string} dateEnd - ISO date string
 * @returns {{ intervalDays: number, label: string }}
 */
function computeGranularity(dateStart, dateEnd) {
  if (!dateStart || !dateEnd) return { intervalDays: 7, label: 'weekly' };
  const start = new Date(dateStart);
  const end = new Date(dateEnd);
  const days = Math.round((end - start) / (1000 * 60 * 60 * 24));

  if (days <= 10) return { intervalDays: 1, label: 'daily' };
  if (days <= 45) return { intervalDays: 2, label: 'biDaily' };
  if (days <= 120) return { intervalDays: 7, label: 'weekly' };
  return { intervalDays: 30, label: 'monthly' };
}

/**
 * Generate time-series demo data that respects the selected date range.
 * Adjusts interval automatically based on range duration.
 *
 * @param {string} dateStart - ISO date string (or null for default 8 weeks back)
 * @param {string} dateEnd - ISO date string (or null for today)
 * @param {Array} seriesDefs - [{key, base, variance}]
 * @returns {Array<object>} [{date, ...seriesValues}]
 */
function generateTimeSeries(dateStart, dateEnd, seriesDefs) {
  const { intervalDays } = computeGranularity(dateStart, dateEnd);
  const start = dateStart ? new Date(dateStart) : new Date(Date.now() - 56 * 86400000);
  const end = dateEnd ? new Date(dateEnd) : new Date();
  const totalDays = Math.round((end - start) / (1000 * 60 * 60 * 24));

  const data = [];
  const current = new Date(start);
  let i = 0;

  while (current <= end) {
    const point = { date: current.toISOString().split('T')[0] };
    const progress = totalDays > 0 ? i / Math.max(totalDays / intervalDays, 1) : 0;

    for (const { key, base, variance } of seriesDefs) {
      // Slight upward trend + seeded noise for realistic look
      const trendFactor = 1 + progress * 0.08;
      const noise = (Math.random() - 0.5) * 2 * variance;
      const value = base * trendFactor + noise;
      point[key] = base < 1 ? Math.round(value * 1000) / 1000 : Math.round(value);
    }

    data.push(point);
    current.setDate(current.getDate() + intervalDays);
    i++;
  }

  return data;
}

module.exports = { getOverviewData };
