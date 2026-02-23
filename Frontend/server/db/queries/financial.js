/**
 * FINANCIAL PAGE QUERIES -- Insight+ Only
 *
 * Revenue, cash, deal size, per-closer financial breakdowns.
 * Returns scorecards and chart data for the Financial page.
 *
 * Sections:
 *   revenue -- Revenue, cash, % collected, per-call, deal size (6 KPIs)
 *
 * Charts:
 *   revenueOverTime -- Line: Revenue + Cash by week
 *   perCallOverTime -- Line: Rev/Call + Cash/Call by week
 *   revenueByCloserPie -- Donut: % of revenue by closer
 *   revenueByCloserBar -- Stacked bar: Total Revenue + Cash by closer
 *   avgPerDealByCloser -- Stacked bar: Avg Revenue + Cash per closer
 *   perCallByCloser -- Stacked bar: Rev/Call + Cash/Call by closer
 */

const bq = require('../BigQueryClient');
const logger = require('../../utils/logger');
const { generateTimeSeries } = require('./demoTimeSeries');

/**
 * Fetch all financial data for a client.
 *
 * @param {string} clientId - Client ID for data isolation
 * @param {object} filters - { dateStart, dateEnd, closerId }
 * @param {string} tier - Client's plan tier
 * @returns {Promise<object>} { sections, charts }
 */
async function getFinancialData(clientId, filters = {}, tier = 'insight') {
  if (!bq.isAvailable() || clientId.startsWith('demo_')) {
    logger.debug('Returning demo financial data');
    return getDemoData(tier, filters);
  }

  try {
    return await queryBigQuery(clientId, filters, tier);
  } catch (err) {
    logger.error('Financial BQ query failed, falling back to demo', {
      error: err.message,
      clientId,
    });
    return getDemoData();
  }
}

/**
 * Run real BigQuery queries for financial data.
 * Runs 3 queries in parallel: scorecard, time-series, per-closer.
 */
async function queryBigQuery(clientId, filters, tier) {
  const { buildQueryContext, timeBucket, runParallel, num, rate, VIEW } = require('./helpers');
  const { params, where } = buildQueryContext(clientId, filters, tier);
  const tb = timeBucket();

  // 1) Scorecard aggregation
  const scorecardSql = `SELECT
      SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_revenue_generated AS FLOAT64) ELSE 0 END) as revenue,
      SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_cash_collected AS FLOAT64) ELSE 0 END) as cash,
      COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END) as calls_held,
      COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END) as closed_deals,
      SAFE_DIVIDE(
        SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_revenue_generated AS FLOAT64) ELSE 0 END),
        COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END)
      ) as rev_per_call,
      SAFE_DIVIDE(
        SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_cash_collected AS FLOAT64) ELSE 0 END),
        COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END)
      ) as cash_per_call,
      SAFE_DIVIDE(
        SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_revenue_generated AS FLOAT64) ELSE 0 END),
        COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END)
      ) as avg_deal_revenue,
      SAFE_DIVIDE(
        SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_cash_collected AS FLOAT64) ELSE 0 END),
        COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END)
      ) as avg_cash_per_deal,
      SAFE_DIVIDE(
        COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' AND CAST(calls_cash_collected AS FLOAT64) >= CAST(calls_revenue_generated AS FLOAT64) THEN 1 END),
        COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END)
      ) as pif_pct
    FROM ${VIEW} ${where}`;

  // 2) Time-series: revenue + cash by week
  const tsSql = `SELECT
      ${tb} as bucket,
      SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_revenue_generated AS FLOAT64) ELSE 0 END) as revenue,
      SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_cash_collected AS FLOAT64) ELSE 0 END) as cash,
      COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END) as calls_held,
      SAFE_DIVIDE(
        SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_revenue_generated AS FLOAT64) ELSE 0 END),
        COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END)
      ) as rev_per_call,
      SAFE_DIVIDE(
        SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_cash_collected AS FLOAT64) ELSE 0 END),
        COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END)
      ) as cash_per_call
    FROM ${VIEW} ${where}
    GROUP BY bucket ORDER BY bucket`;

  // 3) Per-closer: revenue, cash, deal size, calls held
  const closerSql = `SELECT
      closers_name as closer_name,
      SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_revenue_generated AS FLOAT64) ELSE 0 END) as revenue,
      SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_cash_collected AS FLOAT64) ELSE 0 END) as cash,
      COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END) as closed_deals,
      COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END) as calls_held,
      SAFE_DIVIDE(
        SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_revenue_generated AS FLOAT64) ELSE 0 END),
        COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END)
      ) as avg_deal_rev,
      SAFE_DIVIDE(
        SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_cash_collected AS FLOAT64) ELSE 0 END),
        COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END)
      ) as avg_deal_cash,
      SAFE_DIVIDE(
        SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_revenue_generated AS FLOAT64) ELSE 0 END),
        COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END)
      ) as rev_per_call,
      SAFE_DIVIDE(
        SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_cash_collected AS FLOAT64) ELSE 0 END),
        COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END)
      ) as cash_per_call
    FROM ${VIEW} ${where}
    GROUP BY closers_name ORDER BY revenue DESC`;

  const [scRows, tsRows, clRows] = await runParallel([
    bq.runQuery(scorecardSql, params),
    bq.runQuery(tsSql, params),
    bq.runQuery(closerSql, params),
  ]);

  const sc = (scRows && scRows[0]) || {};
  const ts = tsRows || [];
  const cl = clRows || [];

  const revenue = num(sc.revenue);
  const cash = num(sc.cash);

  // Build time-series data
  const timeData = ts.map(r => ({
    date: r.bucket ? r.bucket.value : r.bucket,
    revenue: num(r.revenue),
    cash: num(r.cash),
    revPerCall: num(r.rev_per_call),
    cashPerCall: num(r.cash_per_call),
  }));

  // Build per-closer data
  const closerData = cl.map(r => ({
    label: r.closer_name,
    revenue: num(r.revenue),
    cash: num(r.cash),
    uncollected: Math.max(0, num(r.revenue) - num(r.cash)),
    avgCash: num(r.avg_deal_cash),
    avgUncollected: Math.max(0, num(r.avg_deal_rev) - num(r.avg_deal_cash)),
    revPerCall: num(r.rev_per_call),
    cashPerCall: num(r.cash_per_call),
  }));

  return {
    sections: {
      revenue: {
        revenue: { value: revenue, label: 'Revenue Generated', format: 'currency' },
        cashCollected: { value: cash, label: 'Cash Collected', format: 'currency' },
        revenuePerCall: { value: num(sc.rev_per_call), label: 'Revenue / Call', format: 'currency' },
        cashPerCall: { value: num(sc.cash_per_call), label: 'Cash / Call', format: 'currency' },
        collectedPct: { value: revenue > 0 ? cash / revenue : 0, label: '% Collected', format: 'percent' },
        avgDealRevenue: { value: num(sc.avg_deal_revenue), label: 'Avg Revenue Per Deal', format: 'currency' },
        avgCashPerDeal: { value: num(sc.avg_cash_per_deal), label: 'Avg Cash Per Deal', format: 'currency' },
        pifPct: { value: rate(sc.pif_pct), label: '% PIFs', format: 'percent' },
      },
    },
    charts: {
      revenueOverTime: {
        type: 'line',
        label: 'Total Cash & Revenue Over Time',
        series: [
          { key: 'revenue', label: 'Revenue Generated', color: 'green' },
          { key: 'cash', label: 'Cash Collected', color: 'cyan' },
        ],
        data: timeData,
      },
      perCallOverTime: {
        type: 'line',
        label: 'Cash & Revenue per Call Over Time',
        series: [
          { key: 'revPerCall', label: 'Revenue / Call', color: 'purple' },
          { key: 'cashPerCall', label: 'Cash / Call', color: 'blue' },
        ],
        data: timeData,
      },
      revenueByCloserPie: {
        type: 'pie',
        label: '% of Revenue Generated by Closer',
        data: closerData.map(c => ({ label: c.label, value: c.revenue, color: 'cyan' })),
      },
      revenueByCloserBar: {
        type: 'bar',
        label: 'Total Cash & Revenue per Closer',
        series: [
          { key: 'cash', label: 'Cash Collected', color: 'teal' },
          { key: 'uncollected', label: 'Uncollected', color: 'green' },
        ],
        data: closerData.map(c => ({ date: c.label, cash: c.cash, uncollected: c.uncollected })),
      },
      avgPerDealByCloser: {
        type: 'bar',
        label: 'Avg Cash & Revenue per Closer',
        series: [
          { key: 'avgCash', label: 'Avg Cash', color: 'teal' },
          { key: 'avgUncollected', label: 'Avg Uncollected', color: 'green' },
        ],
        data: closerData.map(c => ({ date: c.label, avgCash: c.avgCash, avgUncollected: c.avgUncollected })),
      },
      perCallByCloser: {
        type: 'bar',
        label: 'Cash & Revenue per Call by Closer',
        series: [
          { key: 'revPerCall', label: 'Revenue / Call', color: 'purple' },
          { key: 'cashPerCall', label: 'Cash / Call', color: 'blue' },
        ],
        data: closerData.map(c => ({ date: c.label, revPerCall: c.revPerCall, cashPerCall: c.cashPerCall })),
      },
    },
  };
}

// ================================================================
// DEMO DATA -- Realistic sample data for development and demos
// ================================================================

/** Closer names used across all per-closer chart data */
const CLOSER_NAMES = ['Sarah', 'Mike', 'Jessica', 'Alex'];

function getDemoData(tier = 'insight', filters = {}) {
  return {
    sections: {
      revenue: {
        revenue:          { value: 115000, label: 'Revenue Generated',      format: 'currency', delta: 18.5, deltaLabel: 'vs prev period' },
        cashCollected:    { value: 69000,  label: 'Cash Collected',         format: 'currency', delta: 12.3, deltaLabel: 'vs prev period' },
        revenuePerCall:   { value: 701,    label: 'Revenue / Call',         format: 'currency', delta: 5.2,  deltaLabel: 'vs prev period' },
        cashPerCall:      { value: 663,    label: 'Cash / Call',            format: 'currency', delta: 4.8,  deltaLabel: 'vs prev period' },
        collectedPct:     { value: 0.60,   label: '% Collected',            format: 'percent',  delta: 3.1,  deltaLabel: 'vs prev period' },
        avgDealRevenue:   { value: 5000,   label: 'Avg Revenue Per Deal',    format: 'currency', delta: 2.1,  deltaLabel: 'vs prev period' },
        avgCashPerDeal:   { value: 3000,   label: 'Avg Cash Per Deal',      format: 'currency', delta: 1.8,  deltaLabel: 'vs prev period' },
        pifPct:           { value: 0.34,   label: '% PIFs',                 format: 'percent',  delta: 2.5,  deltaLabel: 'vs prev period' },
        refundCount:      { value: 3,      label: '# of Refunds',           format: 'number',   delta: -1,   deltaLabel: 'vs prev period', desiredDirection: 'down' },
        refundAmount:     { value: 8500,   label: '$ of Refunds',           format: 'currency', delta: -12.4, deltaLabel: 'vs prev period', desiredDirection: 'down' },
      },
    },
    charts: {
      // Section 1 chart: Revenue & Cash over time (dual line)
      revenueOverTime: {
        type: 'line',
        label: 'Total Cash & Revenue Over Time',
        series: [
          { key: 'revenue', label: 'Revenue Generated', color: 'green' },
          { key: 'cash', label: 'Cash Collected', color: 'cyan' },
        ],
        data: generateTimeSeries(filters, [
          { key: 'revenue', base: 14000, variance: 3000 },
          { key: 'cash', base: 8400, variance: 2000 },
        ]),
      },

      // Section 2 chart: Per-call economics over time
      perCallOverTime: {
        type: 'line',
        label: 'Cash & Revenue per Call Over Time',
        series: [
          { key: 'revPerCall', label: 'Revenue / Call', color: 'purple' },
          { key: 'cashPerCall', label: 'Cash / Call', color: 'blue' },
        ],
        data: generateTimeSeries(filters, [
          { key: 'revPerCall', base: 700, variance: 150 },
          { key: 'cashPerCall', base: 420, variance: 100 },
        ]),
      },

      // Section 3 chart: Revenue by closer (donut)
      revenueByCloserPie: {
        type: 'pie',
        label: '% of Revenue Generated by Closer',
        data: [
          { label: 'Sarah',   value: 38000, color: '#6BCF7F' },
          { label: 'Mike',    value: 32000, color: '#4DD4E8' },
          { label: 'Jessica', value: 28000, color: '#B84DFF' },
          { label: 'Alex',    value: 17000, color: '#4D7CFF' },
        ],
      },

      // Total cash & revenue per closer (stacked bar — cash is portion of revenue)
      revenueByCloserBar: {
        type: 'bar',
        label: 'Total Cash & Revenue per Closer',
        series: [
          { key: 'cash', label: 'Cash Collected', color: 'teal' },
          { key: 'uncollected', label: 'Uncollected', color: 'green' },
        ],
        data: [
          { date: 'Sarah',   cash: 22800, uncollected: 15200 },
          { date: 'Mike',    cash: 19200, uncollected: 12800 },
          { date: 'Jessica', cash: 16800, uncollected: 11200 },
          { date: 'Alex',    cash: 10200, uncollected: 6800 },
        ],
      },

      // Section 5 chart: Per-call by closer (stacked bar)
      perCallByCloser: {
        type: 'bar',
        label: 'Cash & Revenue per Call by Closer',
        series: [
          { key: 'revPerCall', label: 'Revenue / Call', color: 'purple' },
          { key: 'cashPerCall', label: 'Cash / Call', color: 'blue' },
        ],
        data: [
          { date: 'Sarah',   revPerCall: 826, cashPerCall: 495 },
          { date: 'Mike',    revPerCall: 711, cashPerCall: 427 },
          { date: 'Jessica', revPerCall: 651, cashPerCall: 390 },
          { date: 'Alex',    revPerCall: 586, cashPerCall: 352 },
        ],
      },

      // Avg cash & revenue per closer (stacked bar — cash is portion of revenue)
      avgPerDealByCloser: {
        type: 'bar',
        label: 'Avg Cash & Revenue per Closer',
        series: [
          { key: 'avgCash', label: 'Avg Cash', color: 'teal' },
          { key: 'avgUncollected', label: 'Avg Uncollected', color: 'green' },
        ],
        data: [
          { date: 'Sarah',   avgCash: 3480, avgUncollected: 2320 },
          { date: 'Mike',    avgCash: 3120, avgUncollected: 2080 },
          { date: 'Jessica', avgCash: 2760, avgUncollected: 1840 },
          { date: 'Alex',    avgCash: 2460, avgUncollected: 1640 },
        ],
      },

      // Payment plan breakdown (donut)
      paymentPlanBreakdown: {
        type: 'pie',
        label: 'Payment Plan Breakdown',
        data: [
          { label: 'PIF',         value: 8,  color: '#6BCF7F' },
          { label: '2-Pay',       value: 6,  color: '#4DD4E8' },
          { label: '3-Pay',       value: 5,  color: '#B84DFF' },
          { label: 'Custom Plan', value: 4,  color: '#FFD93D' },
        ],
      },
    },
  };
}

module.exports = { getFinancialData };
