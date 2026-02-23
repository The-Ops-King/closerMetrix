/**
 * PROJECTIONS PAGE QUERIES -- Insight+ Only
 *
 * Returns the baseline data that feeds the projection calculation engine.
 * The frontend handles all projection math -- the server just provides
 * the baseline rates and actuals.
 *
 * Data shape matches the existing Projections app API response
 * (see reference/projections/index.html).
 *
 * The response includes two formats:
 *   1. sections.baseline -- Scorecard format for display (value, label, format)
 *   2. projectionBaseline -- Raw numbers for the projection calculation engine
 *
 * The projection engine on the frontend uses ratio-based adjustments:
 *   pR = adjProspects / baseline.prospectsBookedPerMonth
 *   sR = adjShowRate / baseline.showRate
 *   cR = adjCloseRate / baseline.closeRate
 *   dR = adjDealSize / baseline.avgDealSize
 *   caR = adjCashPer / baseline.avgCashCollected
 *
 * And applies them cumulatively to calculate EOM/EOY projections.
 */

const bq = require('../BigQueryClient');
const logger = require('../../utils/logger');

/**
 * Fetch all projection baseline data for a client.
 *
 * @param {string} clientId - Client ID for data isolation
 * @param {object} filters - { dateStart, dateEnd, closerId }
 * @param {string} tier - Client's plan tier
 * @returns {Promise<object>} { sections, projectionBaseline, charts }
 */
async function getProjectionsData(clientId, filters = {}, tier = 'insight') {
  if (!bq.isAvailable() || clientId.startsWith('demo_')) {
    logger.debug('Returning demo projections data', { closerId: filters.closerId || 'all' });
    return getDemoData(filters);
  }

  try {
    return await queryBigQuery(clientId, filters, tier);
  } catch (err) {
    logger.error('Projections BQ query failed, falling back to demo', {
      error: err.message,
      clientId,
    });
    return getDemoData(filters);
  }
}

/**
 * Run real BigQuery queries for projection baseline data.
 * Runs 3 queries in parallel: period rates, MTD actuals, YTD actuals.
 */
async function queryBigQuery(clientId, filters, tier) {
  const { runParallel, num, rate } = require('./helpers');
  const VIEW = bq.table('v_calls_joined_flat_prefixed');
  const cycleView = bq.table('v_close_cycle_stats_dated');

  const effectiveCloserId = tier === 'basic' ? null : filters.closerId;
  const closerFilter = effectiveCloserId ? 'AND calls_closer_id = @closerId' : '';
  const cycleCloserFilter = effectiveCloserId ? 'AND closer_id = @closerId' : '';

  const params = { clientId, dateStart: filters.dateStart, dateEnd: filters.dateEnd };
  if (effectiveCloserId) params.closerId = effectiveCloserId;

  const dateWhere = `WHERE clients_client_id = @clientId
    AND DATE(calls_appointment_date) BETWEEN DATE(@dateStart) AND DATE(@dateEnd)
    ${closerFilter}`;

  // Calculate daysInPeriod for prospects/month extrapolation
  const start = new Date(filters.dateStart);
  const end = new Date(filters.dateEnd);
  const daysInPeriod = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));

  // 1) Period rates from selected date range
  const periodSql = `SELECT
      SAFE_DIVIDE(COUNT(CASE WHEN calls_call_type = 'First Call' AND calls_attendance = 'Show' THEN 1 END),
                  COUNT(CASE WHEN calls_call_type = 'First Call' THEN 1 END)) as show_rate,
      SAFE_DIVIDE(COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END),
                  COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END)) as close_rate,
      SAFE_DIVIDE(SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_revenue_generated AS FLOAT64) ELSE 0 END),
                  COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END)) as avg_deal_size,
      SAFE_DIVIDE(SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_cash_collected AS FLOAT64) ELSE 0 END),
                  COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END)) as avg_cash_collected,
      COUNT(CASE WHEN calls_call_type = 'First Call' THEN 1 END) as prospects_booked,
      COUNT(*) as calls_scheduled,
      COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END) as calls_held,
      COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END) as closes,
      SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_revenue_generated AS FLOAT64) ELSE 0 END) as revenue,
      SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_cash_collected AS FLOAT64) ELSE 0 END) as cash
    FROM ${VIEW} ${dateWhere}`;

  // Avg calls to close from cycle view
  const cycleSql = `SELECT AVG(calls_to_close) as avg_calls_to_close
    FROM ${cycleView}
    WHERE client_id = @clientId
      AND close_date BETWEEN @dateStart AND @dateEnd
      ${cycleCloserFilter}`;

  // 2) MTD actuals
  const now = new Date();
  const mtdStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const mtdEnd = now.toISOString().split('T')[0];
  const mtdParams = { clientId, dateStart: mtdStart, dateEnd: mtdEnd };
  if (effectiveCloserId) mtdParams.closerId = effectiveCloserId;
  const mtdCloserFilter = effectiveCloserId ? 'AND calls_closer_id = @closerId' : '';

  const mtdSql = `SELECT
      COUNT(*) as calls_scheduled,
      COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END) as calls_held,
      COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END) as closes,
      SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_revenue_generated AS FLOAT64) ELSE 0 END) as revenue,
      SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_cash_collected AS FLOAT64) ELSE 0 END) as cash
    FROM ${VIEW}
    WHERE clients_client_id = @clientId
      AND DATE(calls_appointment_date) BETWEEN DATE(@dateStart) AND DATE(@dateEnd)
      ${mtdCloserFilter}`;

  // 3) YTD actuals
  const ytdStart = `${now.getFullYear()}-01-01`;
  const ytdParams = { clientId, dateStart: ytdStart, dateEnd: mtdEnd };
  if (effectiveCloserId) ytdParams.closerId = effectiveCloserId;

  const ytdSql = `SELECT
      COUNT(*) as calls_scheduled,
      COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END) as calls_held,
      COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END) as closes,
      SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_revenue_generated AS FLOAT64) ELSE 0 END) as revenue,
      SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_cash_collected AS FLOAT64) ELSE 0 END) as cash
    FROM ${VIEW}
    WHERE clients_client_id = @clientId
      AND DATE(calls_appointment_date) BETWEEN DATE(@dateStart) AND DATE(@dateEnd)
      ${mtdCloserFilter}`;

  // 4) WTD + QTD for pacing
  const dayOfWeek = now.getDay(); // 0=Sun
  const wtdStart = new Date(now);
  wtdStart.setDate(wtdStart.getDate() - dayOfWeek);
  const wtdStartStr = wtdStart.toISOString().split('T')[0];
  const wtdParams = { clientId, dateStart: wtdStartStr, dateEnd: mtdEnd };
  if (effectiveCloserId) wtdParams.closerId = effectiveCloserId;

  const qMonth = Math.floor(now.getMonth() / 3) * 3;
  const qtdStart = `${now.getFullYear()}-${String(qMonth + 1).padStart(2, '0')}-01`;
  const qtdParams = { clientId, dateStart: qtdStart, dateEnd: mtdEnd };
  if (effectiveCloserId) qtdParams.closerId = effectiveCloserId;

  const pacingSql = `SELECT
      SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_revenue_generated AS FLOAT64) ELSE 0 END) as revenue
    FROM ${VIEW}
    WHERE clients_client_id = @clientId
      AND DATE(calls_appointment_date) BETWEEN DATE(@dateStart) AND DATE(@dateEnd)
      ${mtdCloserFilter}`;

  const [periodRows, cycleRows, mtdRows, ytdRows, wtdRows, qtdRows] = await runParallel([
    bq.runQuery(periodSql, params),
    bq.runQuery(cycleSql, params),
    bq.runQuery(mtdSql, mtdParams),
    bq.runQuery(ytdSql, ytdParams),
    bq.runQuery(pacingSql, wtdParams),
    bq.runQuery(pacingSql, qtdParams),
  ]);

  const p = (periodRows && periodRows[0]) || {};
  const c = (cycleRows && cycleRows[0]) || {};
  const mtd = (mtdRows && mtdRows[0]) || {};
  const ytd = (ytdRows && ytdRows[0]) || {};
  const wtd = (wtdRows && wtdRows[0]) || {};
  const qtd = (qtdRows && qtdRows[0]) || {};

  const showRate = rate(p.show_rate);
  const closeRate = rate(p.close_rate);
  const avgDealSize = num(p.avg_deal_size);
  const avgCashCollected = num(p.avg_cash_collected);
  const prospectsBooked = num(p.prospects_booked);
  const prospectsBookedPerMonth = Math.round((prospectsBooked / daysInPeriod) * 30);
  const avgCallsToClose = num(c.avg_calls_to_close) || 2.3;

  // Calendar context
  const dayOfMonth = now.getDate();
  const daysInCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.ceil((now - startOfYear) / (1000 * 60 * 60 * 24));
  const year = now.getFullYear();
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const daysInYear = isLeapYear ? 366 : 365;

  const qStart = new Date(now.getFullYear(), qMonth, 1);
  const qEnd = new Date(now.getFullYear(), qMonth + 3, 1);
  const dayOfQuarter = Math.ceil((now - qStart) / (1000 * 60 * 60 * 24));
  const daysInQuarter = Math.ceil((qEnd - qStart) / (1000 * 60 * 60 * 24));

  // Format date range label
  const fmtDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const dateRange = `${fmtDate(start)} - ${fmtDate(end)}`;

  return {
    sections: {
      baseline: {
        showRate: { value: showRate, label: 'Show Rate', format: 'percent' },
        closeRate: { value: closeRate, label: 'Close Rate', format: 'percent' },
        avgDealSize: { value: avgDealSize, label: 'Avg Deal Size', format: 'currency' },
        avgCashCollected: { value: avgCashCollected, label: 'Avg Cash Collected', format: 'currency' },
        prospectsBookedPerMonth: { value: prospectsBookedPerMonth, label: 'Prospects / Month', format: 'number' },
        avgCallsToClose: { value: avgCallsToClose, label: 'Avg Calls to Close', format: 'decimal' },
      },
    },
    projectionBaseline: {
      showRate, closeRate, avgDealSize, avgCashCollected,
      prospectsBookedPerMonth, avgCallsToClose,
      callsScheduled: num(p.calls_scheduled),
      currentCallsHeld: num(p.calls_held),
      currentCloses: num(p.closes),
      currentRevenue: num(p.revenue),
      currentCash: num(p.cash),
      daysInPeriod,
      daysInCurrentMonth, dayOfMonth, daysInYear, dayOfYear,
      mtdCallsScheduled: num(mtd.calls_scheduled),
      mtdCallsHeld: num(mtd.calls_held),
      mtdCloses: num(mtd.closes),
      mtdRevenue: num(mtd.revenue),
      mtdCash: num(mtd.cash),
      ytdCallsScheduled: num(ytd.calls_scheduled),
      ytdCallsHeld: num(ytd.calls_held),
      ytdCloses: num(ytd.closes),
      ytdRevenue: num(ytd.revenue),
      ytdCash: num(ytd.cash),
      dateRange,
      monthlyGoal: 50000,
      quarterlyGoal: 150000,
      yearlyGoal: 600000,
      wtdRevenue: num(wtd.revenue),
      qtdRevenue: num(qtd.revenue),
      dayOfQuarter, daysInQuarter,
    },
    charts: {},
  };
}

// ================================================================
// DEMO DATA -- Realistic sample data for development and demos
// ================================================================

/**
 * Demo closer profiles — when a closerId filter is active, return that
 * closer's individual metrics (lower volumes, slightly different rates).
 * This lets Tyler see "what would it look like for THIS closer" in demo mode.
 */
/**
 * Demo closer profiles — keyed by the same closer_id values from DEMO_CLIENTS
 * in tokenManager.js (demo_closer_1 = Sarah Johnson, demo_closer_2 = Mike Chen, etc.)
 * When a closerId filter is active, the individual closer's metrics are returned
 * so Tyler can see "what would it look like for THIS closer" scenarios.
 */
const DEMO_CLOSERS = {
  demo_closer_1: {
    name: 'Sarah Johnson',
    showRate: 0.78, closeRate: 0.26, avgDealSize: 5200, avgCashCollected: 3100,
    prospectsBookedPerMonth: 14, avgCallsToClose: 2.1,
    callsScheduled: 62, currentCallsHeld: 48, currentCloses: 8, currentRevenue: 41600, currentCash: 24800,
    mtdCallsScheduled: 11, mtdCallsHeld: 9, mtdCloses: 2, mtdRevenue: 10400, mtdCash: 6200,
    ytdCallsScheduled: 80, ytdCallsHeld: 62, ytdCloses: 16, ytdRevenue: 83200, ytdCash: 49600,
    wtdRevenue: 3100, qtdRevenue: 34000,
  },
  demo_closer_2: {
    name: 'Mike Chen',
    showRate: 0.69, closeRate: 0.19, avgDealSize: 4800, avgCashCollected: 2900,
    prospectsBookedPerMonth: 12, avgCallsToClose: 2.6,
    callsScheduled: 54, currentCallsHeld: 37, currentCloses: 5, currentRevenue: 24000, currentCash: 14500,
    mtdCallsScheduled: 9, mtdCallsHeld: 6, mtdCloses: 1, mtdRevenue: 4800, mtdCash: 2900,
    ytdCallsScheduled: 70, ytdCallsHeld: 48, ytdCloses: 9, ytdRevenue: 43200, ytdCash: 26100,
    wtdRevenue: 1800, qtdRevenue: 18000,
  },
  demo_closer_3: {
    name: 'Alex Rivera',
    showRate: 0.75, closeRate: 0.23, avgDealSize: 5100, avgCashCollected: 3050,
    prospectsBookedPerMonth: 11, avgCallsToClose: 2.2,
    callsScheduled: 50, currentCallsHeld: 38, currentCloses: 6, currentRevenue: 30600, currentCash: 18300,
    mtdCallsScheduled: 9, mtdCallsHeld: 7, mtdCloses: 2, mtdRevenue: 10200, mtdCash: 6100,
    ytdCallsScheduled: 65, ytdCallsHeld: 49, ytdCloses: 11, ytdRevenue: 56100, ytdCash: 33550,
    wtdRevenue: 2200, qtdRevenue: 23000,
  },
  demo_closer_4: {
    name: 'Jordan Kim',
    showRate: 0.71, closeRate: 0.20, avgDealSize: 4700, avgCashCollected: 2800,
    prospectsBookedPerMonth: 11, avgCallsToClose: 2.5,
    callsScheduled: 52, currentCallsHeld: 41, currentCloses: 4, currentRevenue: 18800, currentCash: 11200,
    mtdCallsScheduled: 9, mtdCallsHeld: 6, mtdCloses: 1, mtdRevenue: 4700, mtdCash: 2800,
    ytdCallsScheduled: 65, ytdCallsHeld: 45, ytdCloses: 9, ytdRevenue: 42300, ytdCash: 25200,
    wtdRevenue: 1400, qtdRevenue: 20000,
  },
  demo_closer_5: {
    name: 'Taylor Brooks',
    showRate: 0.74, closeRate: 0.22, avgDealSize: 5000, avgCashCollected: 3000,
    prospectsBookedPerMonth: 10, avgCallsToClose: 2.3,
    callsScheduled: 48, currentCallsHeld: 36, currentCloses: 5, currentRevenue: 25000, currentCash: 15000,
    mtdCallsScheduled: 8, mtdCallsHeld: 6, mtdCloses: 1, mtdRevenue: 5000, mtdCash: 3000,
    ytdCallsScheduled: 60, ytdCallsHeld: 44, ytdCloses: 10, ytdRevenue: 50000, ytdCash: 30000,
    wtdRevenue: 1900, qtdRevenue: 21000,
  },
};

function getDemoData(filters = {}) {
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.ceil((now - startOfYear) / (1000 * 60 * 60 * 24));
  // Leap year check: divisible by 4, except centuries unless divisible by 400
  const year = now.getFullYear();
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const daysInYear = isLeapYear ? 366 : 365;

  // If a closerId is selected, use that closer's individual demo metrics
  const closer = filters.closerId ? DEMO_CLOSERS[filters.closerId] : null;

  // Rates and volumes — use closer-specific data when filtered
  const showRate = closer?.showRate ?? 0.732;
  const closeRate = closer?.closeRate ?? 0.221;
  const avgDealSize = closer?.avgDealSize ?? 5000;
  const avgCashCollected = closer?.avgCashCollected ?? 3000;
  const prospectsBookedPerMonth = closer?.prospectsBookedPerMonth ?? 48;
  const avgCallsToClose = closer?.avgCallsToClose ?? 2.3;

  return {
    sections: {
      baseline: {
        showRate: { value: showRate, label: 'Show Rate', format: 'percent' },
        closeRate: { value: closeRate, label: 'Close Rate', format: 'percent' },
        avgDealSize: { value: avgDealSize, label: 'Avg Deal Size', format: 'currency' },
        avgCashCollected: { value: avgCashCollected, label: 'Avg Cash Collected', format: 'currency' },
        prospectsBookedPerMonth: { value: prospectsBookedPerMonth, label: 'Prospects / Month', format: 'number' },
        avgCallsToClose: { value: avgCallsToClose, label: 'Avg Calls to Close', format: 'decimal' },
      },
    },
    // Raw numbers for the projection calculation engine on the frontend.
    // This mirrors the exact shape from the existing Projections app API.
    projectionBaseline: {
      showRate,
      closeRate,
      avgDealSize,
      avgCashCollected,
      prospectsBookedPerMonth,
      avgCallsToClose,

      // Period metrics (from selected date range)
      callsScheduled: closer?.callsScheduled ?? 218,
      currentCallsHeld: closer?.currentCallsHeld ?? 164,
      currentCloses: closer?.currentCloses ?? 23,
      currentRevenue: closer?.currentRevenue ?? 115000,
      currentCash: closer?.currentCash ?? 69000,
      daysInPeriod: 90,

      // Calendar context (calculated dynamically)
      daysInCurrentMonth,
      dayOfMonth,
      daysInYear,
      dayOfYear,

      // MTD actuals (for "MTD + projected remaining" toggle mode)
      mtdCallsScheduled: closer?.mtdCallsScheduled ?? 38,
      mtdCallsHeld: closer?.mtdCallsHeld ?? 28,
      mtdCloses: closer?.mtdCloses ?? 6,
      mtdRevenue: closer?.mtdRevenue ?? 30000,
      mtdCash: closer?.mtdCash ?? 18000,

      // YTD actuals (for "YTD + projected remaining" toggle mode)
      ytdCallsScheduled: closer?.ytdCallsScheduled ?? 280,
      ytdCallsHeld: closer?.ytdCallsHeld ?? 204,
      ytdCloses: closer?.ytdCloses ?? 45,
      ytdRevenue: closer?.ytdRevenue ?? 225000,
      ytdCash: closer?.ytdCash ?? 135000,

      // Date range label for display
      dateRange: 'Nov 19, 2025 - Feb 17, 2026',

      // ── Goals (from Clients table — shared across all closers) ──
      monthlyGoal: 50000,
      quarterlyGoal: 150000,
      yearlyGoal: 600000,

      // ── Pacing actuals (WTD/QTD aggregated from Calls) ──
      // mtdRevenue and ytdRevenue already exist above
      wtdRevenue: closer?.wtdRevenue ?? 8500,
      qtdRevenue: closer?.qtdRevenue ?? 95000,

      // ── Quarter calendar context ──
      dayOfQuarter: (() => {
        const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        return Math.ceil((now - qStart) / (1000 * 60 * 60 * 24));
      })(),
      daysInQuarter: (() => {
        const qMonth = Math.floor(now.getMonth() / 3) * 3;
        const qStart = new Date(now.getFullYear(), qMonth, 1);
        const qEnd = new Date(now.getFullYear(), qMonth + 3, 1);
        return Math.ceil((qEnd - qStart) / (1000 * 60 * 60 * 24));
      })(),
    },
    charts: {},
  };
}

module.exports = { getProjectionsData };
