/**
 * EMAIL DATA FETCHER
 *
 * Queries BigQuery for real data to populate email reports.
 * Returns data in the exact same shape as testData.js so the
 * EmailTemplateEngine works identically with real or test data.
 *
 * CRITICAL: All metrics are pre-computed here using the SAME queries
 * and views as the dashboard (Frontend/server/db/queries/*).
 * The AI receives only pre-computed numbers for narrative generation.
 * If you look at the email and the dashboard, they should read the same.
 *
 * Two modes:
 *   - Weekly:  last 7 days (Mon-Sun) vs the 7 days before that
 *   - Monthly: previous full month vs the month before that
 */

const bq = require('../../db/BigQueryClient');
const logger = require('../../utils/logger');

// ── Date helpers ──────────────────────────────────────────

/**
 * Returns { current, prev } date ranges for weekly reports.
 * Weekly = last 7 days (yesterday back 6 days) vs the 7 days before that.
 * This ensures the report always covers the most recent complete days.
 */
function getWeeklyRanges(now = new Date()) {
  const d = new Date(now);

  // Current period: yesterday back 6 more days (7 days total)
  const currentEnd = new Date(d);
  currentEnd.setUTCDate(d.getUTCDate() - 1);
  currentEnd.setUTCHours(23, 59, 59, 999);

  const currentStart = new Date(currentEnd);
  currentStart.setUTCDate(currentEnd.getUTCDate() - 6);
  currentStart.setUTCHours(0, 0, 0, 0);

  // Previous period: the 7 days before that
  const prevEnd = new Date(currentStart);
  prevEnd.setUTCDate(currentStart.getUTCDate() - 1);
  prevEnd.setUTCHours(23, 59, 59, 999);

  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevEnd.getUTCDate() - 6);
  prevStart.setUTCHours(0, 0, 0, 0);

  return {
    current: { start: fmtDate(currentStart), end: fmtDate(currentEnd), label: `${fmtLabel(currentStart)} – ${fmtLabel(currentEnd)}` },
    prev: { start: fmtDate(prevStart), end: fmtDate(prevEnd), label: `${fmtLabel(prevStart)} – ${fmtLabel(prevEnd)}` },
  };
}

/**
 * Returns { current, prev } date ranges for monthly reports.
 * Monthly = previous full calendar month vs the month before that.
 */
function getMonthlyRanges(now = new Date()) {
  const d = new Date(now);
  const currentEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0));
  const currentStart = new Date(Date.UTC(currentEnd.getUTCFullYear(), currentEnd.getUTCMonth(), 1));

  const prevEnd = new Date(Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth(), 0));
  const prevStart = new Date(Date.UTC(prevEnd.getUTCFullYear(), prevEnd.getUTCMonth(), 1));

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  return {
    current: { start: fmtDate(currentStart), end: fmtDate(currentEnd), label: `${monthNames[currentStart.getUTCMonth()]} ${currentStart.getUTCFullYear()}` },
    prev: { start: fmtDate(prevStart), end: fmtDate(prevEnd), label: `${monthNames[prevStart.getUTCMonth()]} ${prevStart.getUTCFullYear()}` },
  };
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

function fmtLabel(d) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

// ── Main fetcher ──────────────────────────────────────────

/**
 * Fetches all email report data for a client.
 * All metrics are pre-computed in BigQuery using the same queries
 * and views as the dashboard pages.
 *
 * @param {string} clientId - The client to fetch data for
 * @param {'weekly'|'monthly'} reportType - Which report period to use
 * @returns {Object} Data in the same shape as testData.js
 */
async function fetchEmailData(clientId, reportType = 'weekly') {
  const ranges = reportType === 'monthly'
    ? getMonthlyRanges()
    : getWeeklyRanges();

  const { current, prev } = ranges;

  logger.info('EmailDataFetcher: Fetching data', { clientId, reportType, current, prev });

  // Fetch client info
  const clientRows = await bq.query(
    `SELECT company_name, primary_contact_email, settings_json
     FROM ${bq.table('Clients')}
     WHERE client_id = @clientId`,
    { clientId }
  );
  const client = clientRows[0];
  if (!client) throw new Error(`Client not found: ${clientId}`);

  // Run all section queries in parallel
  // Each query matches the EXACT same SQL as the dashboard
  const [
    overviewCurrent, overviewPrev,
    financialCurrent, financialPrev,
    attendanceCurrent, attendancePrev,
    outcomesCurrent, outcomesPrev,
    salesCycleCurrent, salesCyclePrev,
    callsPerDealCurrent, callsPerDealPrev,
    objectionsCurrent, objectionsPrev,
    objTopCurrent,
    painsCurrent, goalsCurrent,
    violationsCurrent, violationsPrev,
    leaderboard,
  ] = await Promise.all([
    // Overview — uses v_calls_joined_flat_prefixed (same as dashboard overview.js)
    queryOverview(clientId, current.start, current.end),
    queryOverview(clientId, prev.start, prev.end),
    // Financial — uses v_calls_joined_flat_prefixed (same as dashboard financial.js)
    queryFinancial(clientId, current.start, current.end),
    queryFinancial(clientId, prev.start, prev.end),
    // Attendance — uses v_calls_joined_flat_prefixed (same as dashboard attendance.js)
    queryAttendance(clientId, current.start, current.end),
    queryAttendance(clientId, prev.start, prev.end),
    // Call Outcomes — uses v_calls_joined_flat_prefixed (same as dashboard callOutcomes.js)
    queryCallOutcomes(clientId, current.start, current.end),
    queryCallOutcomes(clientId, prev.start, prev.end),
    // Sales Cycle — uses v_close_cycle_stats_dated (same as dashboard salesCycle.js)
    querySalesCycle(clientId, current.start, current.end),
    querySalesCycle(clientId, prev.start, prev.end),
    // Calls needed per deal — uses v_calls_joined_flat_prefixed (same as dashboard salesCycle.js)
    queryCallsNeededPerDeal(clientId, current.start, current.end),
    queryCallsNeededPerDeal(clientId, prev.start, prev.end),
    // Objections — uses Objections table joined with Calls
    queryObjectionsSummary(clientId, current.start, current.end),
    queryObjectionsSummary(clientId, prev.start, prev.end),
    queryTopObjections(clientId, current.start, current.end),
    // Market Insight — pains/goals from Calls table
    queryTopPains(clientId, current.start, current.end),
    queryTopGoals(clientId, current.start, current.end),
    // Violations — risk flags from key_moments
    queryViolations(clientId, current.start, current.end),
    queryViolationsSummary(clientId, prev.start, prev.end),
    // Leaderboard
    queryCloserLeaderboard(clientId, current.start, current.end),
  ]);

  // Assemble data in testData.js shape — ALL values are pre-computed
  const data = {
    company_name: client.company_name,
    report_type: reportType,
    report_period: { label: current.label, start: current.start, end: current.end },
    prev_period: { label: prev.label, start: prev.start, end: prev.end },

    overview: {
      total_calls: num(overviewCurrent.total_booked),
      shows: num(overviewCurrent.calls_held),
      closes: num(overviewCurrent.closed_deals),
      // Show rate = First Call shows / First Call booked (matches dashboard overview.js line 148-149)
      show_rate: num(overviewCurrent.show_rate),
      // Close rate = Closed / Shows (matches dashboard overview.js line 150-151)
      close_rate: num(overviewCurrent.close_rate),
      revenue: num(overviewCurrent.revenue),
      cash_collected: num(overviewCurrent.cash),
      prev: {
        total_calls: num(overviewPrev.total_booked),
        shows: num(overviewPrev.calls_held),
        closes: num(overviewPrev.closed_deals),
        show_rate: num(overviewPrev.show_rate),
        close_rate: num(overviewPrev.close_rate),
        revenue: num(overviewPrev.revenue),
        cash_collected: num(overviewPrev.cash),
      },
    },

    financial: {
      revenue: num(financialCurrent.revenue),
      cash_collected: num(financialCurrent.cash),
      avg_deal_size: num(financialCurrent.avg_deal_revenue),
      deals_closed: num(financialCurrent.closed_deals),
      revenue_per_call: num(financialCurrent.rev_per_call),
      cash_per_call: num(financialCurrent.cash_per_call),
      deposits: num(financialCurrent.deposits),
      deposit_total: num(financialCurrent.deposit_total),
      prev: {
        revenue: num(financialPrev.revenue),
        cash_collected: num(financialPrev.cash),
        avg_deal_size: num(financialPrev.avg_deal_revenue),
        deals_closed: num(financialPrev.closed_deals),
        revenue_per_call: num(financialPrev.rev_per_call),
        cash_per_call: num(financialPrev.cash_per_call),
        deposits: num(financialPrev.deposits),
        deposit_total: num(financialPrev.deposit_total),
      },
    },

    attendance: {
      total_booked: num(attendanceCurrent.total_scheduled),
      shows: num(attendanceCurrent.total_held),
      ghosted: num(attendanceCurrent.ghosted),
      canceled: num(attendanceCurrent.cancelled),
      rescheduled: num(attendanceCurrent.rescheduled),
      show_rate: num(attendanceCurrent.total_show_rate),
      ghost_rate: num(attendanceCurrent.total_scheduled) > 0
        ? num(attendanceCurrent.ghosted) / num(attendanceCurrent.total_scheduled) : 0,
      cancel_rate: num(attendanceCurrent.total_scheduled) > 0
        ? num(attendanceCurrent.cancelled) / num(attendanceCurrent.total_scheduled) : 0,
      prev: {
        total_booked: num(attendancePrev.total_scheduled),
        shows: num(attendancePrev.total_held),
        ghosted: num(attendancePrev.ghosted),
        canceled: num(attendancePrev.cancelled),
        rescheduled: num(attendancePrev.rescheduled),
        show_rate: num(attendancePrev.total_show_rate),
        ghost_rate: num(attendancePrev.total_scheduled) > 0
          ? num(attendancePrev.ghosted) / num(attendancePrev.total_scheduled) : 0,
        cancel_rate: num(attendancePrev.total_scheduled) > 0
          ? num(attendancePrev.cancelled) / num(attendancePrev.total_scheduled) : 0,
      },
    },

    callOutcomes: {
      closed_won: num(outcomesCurrent.closes),
      deposit: num(outcomesCurrent.deposits),
      follow_up: num(outcomesCurrent.follow_ups),
      lost: num(outcomesCurrent.lost),
      disqualified: num(outcomesCurrent.dq),
      not_pitched: num(outcomesCurrent.not_pitched),
      close_rate: num(outcomesCurrent.close_rate),
      prev: {
        closed_won: num(outcomesPrev.closes),
        deposit: num(outcomesPrev.deposits),
        follow_up: num(outcomesPrev.follow_ups),
        lost: num(outcomesPrev.lost),
        disqualified: num(outcomesPrev.dq),
        not_pitched: num(outcomesPrev.not_pitched),
        close_rate: num(outcomesPrev.close_rate),
      },
    },

    salesCycle: {
      avg_calls_to_close: num(salesCycleCurrent.avg_calls),
      median_calls_to_close: num(salesCycleCurrent.median_calls),
      avg_days_to_close: num(salesCycleCurrent.avg_days),
      median_days_to_close: num(salesCycleCurrent.median_days),
      one_call_closes: num(salesCycleCurrent.one_call),
      one_call_close_rate: num(salesCycleCurrent.total_closed) > 0
        ? num(salesCycleCurrent.one_call) / num(salesCycleCurrent.total_closed) : 0,
      two_call_closes: num(salesCycleCurrent.two_call),
      three_plus_closes: num(salesCycleCurrent.three_plus),
      calls_needed_per_deal: num(callsPerDealCurrent.calls_needed_per_deal),
      longest_cycle_days: num(salesCycleCurrent.longest_days),
      shortest_cycle_days: num(salesCycleCurrent.shortest_days),
      avg_follow_ups_before_close: num(salesCycleCurrent.avg_calls) > 1
        ? num(salesCycleCurrent.avg_calls) - 1 : 0,
      prev: {
        avg_calls_to_close: num(salesCyclePrev.avg_calls),
        median_calls_to_close: num(salesCyclePrev.median_calls),
        avg_days_to_close: num(salesCyclePrev.avg_days),
        median_days_to_close: num(salesCyclePrev.median_days),
        one_call_closes: num(salesCyclePrev.one_call),
        one_call_close_rate: num(salesCyclePrev.total_closed) > 0
          ? num(salesCyclePrev.one_call) / num(salesCyclePrev.total_closed) : 0,
        two_call_closes: num(salesCyclePrev.two_call),
        three_plus_closes: num(salesCyclePrev.three_plus),
        calls_needed_per_deal: num(callsPerDealPrev.calls_needed_per_deal),
        longest_cycle_days: num(salesCyclePrev.longest_days),
        shortest_cycle_days: num(salesCyclePrev.shortest_days),
        avg_follow_ups_before_close: num(salesCyclePrev.avg_calls) > 1
          ? num(salesCyclePrev.avg_calls) - 1 : 0,
      },
    },

    objections: {
      total: num(objectionsCurrent.total),
      resolved: num(objectionsCurrent.resolved),
      overall_resolution_rate: num(objectionsCurrent.total) > 0
        ? num(objectionsCurrent.resolved) / num(objectionsCurrent.total) : 0,
      top: objTopCurrent,
      prev: {
        total: num(objectionsPrev.total),
        resolved: num(objectionsPrev.resolved),
        overall_resolution_rate: num(objectionsPrev.total) > 0
          ? num(objectionsPrev.resolved) / num(objectionsPrev.total) : 0,
      },
    },

    marketInsight: {
      top_pains: painsCurrent,
      top_goals: goalsCurrent,
    },

    violations: {
      flagged_calls: violationsCurrent.length,
      total_flags: violationsCurrent.reduce((sum, v) => sum + (v.flag_count || 1), 0),
      items: violationsCurrent.map(v => ({
        closer_name: v.closer_name,
        call_date: v.call_date,
        risk_category: v.risk_category,
        phrase: v.phrase,
        severity: v.severity || 'medium',
      })),
      prev: {
        flagged_calls: num(violationsPrev.flagged_calls),
        total_flags: num(violationsPrev.total_flags),
      },
    },

    // Insights will be populated by EmailInsightGenerator
    insights: {},

    closerLeaderboard: leaderboard,

    // Alerts are computed from leaderboard data
    alerts: computeAlerts(leaderboard),
  };

  logger.info('EmailDataFetcher: Data fetched successfully', {
    clientId,
    reportType,
    totalCalls: data.overview.total_calls,
    sections: Object.keys(data).length,
  });

  return data;
}

// ── Section queries ───────────────────────────────────────
// Each query matches the EXACT SQL used by the dashboard pages.
// View references use the same views the dashboard uses.

/**
 * Overview — matches dashboard overview.js scorecardSql (lines 133-158)
 * Uses v_calls_joined_flat_prefixed view.
 */
async function queryOverview(clientId, startDate, endDate) {
  const VIEW = bq.table('v_calls_joined_flat_prefixed');
  const rows = await bq.query(`
    SELECT
      COUNT(*) as total_booked,
      COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END) as calls_held,
      COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END) as closed_deals,
      SAFE_DIVIDE(COUNT(CASE WHEN calls_call_type = 'First Call' AND calls_attendance = 'Show' THEN 1 END),
                  COUNT(CASE WHEN calls_call_type = 'First Call' THEN 1 END)) as show_rate,
      SAFE_DIVIDE(COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END),
                  COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END)) as close_rate,
      SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_revenue_generated AS FLOAT64) ELSE 0 END) as revenue,
      SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_cash_collected AS FLOAT64) ELSE 0 END) as cash,
      SAFE_DIVIDE(SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_cash_collected AS FLOAT64) ELSE 0 END),
                  COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END)) as cash_per_call,
      SAFE_DIVIDE(SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_revenue_generated AS FLOAT64) ELSE 0 END),
                  COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END)) as avg_deal_size
    FROM ${VIEW}
    WHERE clients_client_id = @clientId
      AND DATE(calls_appointment_date) BETWEEN DATE(@startDate) AND DATE(@endDate)
  `, { clientId, startDate, endDate });
  return rows[0] || {};
}

/**
 * Financial — matches dashboard financial.js scorecardSql (lines 58-83)
 * Uses v_calls_joined_flat_prefixed view.
 * Revenue/cash only counted for Closed-Won calls.
 */
async function queryFinancial(clientId, startDate, endDate) {
  const VIEW = bq.table('v_calls_joined_flat_prefixed');
  const rows = await bq.query(`
    SELECT
      SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_revenue_generated AS FLOAT64) ELSE 0 END) as revenue,
      SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_cash_collected AS FLOAT64) ELSE 0 END) as cash,
      COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END) as calls_held,
      COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END) as closed_deals,
      COUNT(CASE WHEN calls_call_outcome = 'Deposit' THEN 1 END) as deposits,
      SUM(CASE WHEN calls_call_outcome = 'Deposit' THEN CAST(calls_cash_collected AS FLOAT64) ELSE 0 END) as deposit_total,
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
      ) as avg_cash_per_deal
    FROM ${VIEW}
    WHERE clients_client_id = @clientId
      AND DATE(calls_appointment_date) BETWEEN DATE(@startDate) AND DATE(@endDate)
  `, { clientId, startDate, endDate });
  return rows[0] || {};
}

/**
 * Attendance — matches dashboard attendance.js scorecardSql (lines 63-100)
 * Uses v_calls_joined_flat_prefixed view.
 * Ghosted uses LIKE '%Ghost%' OR LIKE '%No Show%' pattern.
 */
async function queryAttendance(clientId, startDate, endDate) {
  const VIEW = bq.table('v_calls_joined_flat_prefixed');
  const rows = await bq.query(`
    SELECT
      COUNT(*) as total_scheduled,
      COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END) as total_held,
      SAFE_DIVIDE(COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END), COUNT(*)) as total_show_rate,
      COUNT(CASE WHEN calls_attendance LIKE '%Ghost%' OR calls_attendance LIKE '%No Show%' THEN 1 END) as ghosted,
      COUNT(CASE WHEN calls_attendance IN ('Canceled', 'Cancelled') THEN 1 END) as cancelled,
      COUNT(CASE WHEN calls_attendance = 'Rescheduled' THEN 1 END) as rescheduled
    FROM ${VIEW}
    WHERE clients_client_id = @clientId
      AND DATE(calls_appointment_date) BETWEEN DATE(@startDate) AND DATE(@endDate)
  `, { clientId, startDate, endDate });
  return rows[0] || {};
}

/**
 * Call Outcomes — matches dashboard callOutcomes.js scorecardSql (lines 62-98)
 * Uses v_calls_joined_flat_prefixed view.
 * Only counts outcomes for calls where attendance = 'Show'.
 */
async function queryCallOutcomes(clientId, startDate, endDate) {
  const VIEW = bq.table('v_calls_joined_flat_prefixed');
  const rows = await bq.query(`
    SELECT
      COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END) as held,
      COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END) as closes,
      COUNT(CASE WHEN calls_call_outcome = 'Deposit' THEN 1 END) as deposits,
      COUNT(CASE WHEN calls_call_outcome = 'Follow Up' OR calls_call_outcome = 'Follow-Up' THEN 1 END) as follow_ups,
      COUNT(CASE WHEN calls_call_outcome = 'Lost' THEN 1 END) as lost,
      COUNT(CASE WHEN calls_call_outcome = 'Disqualified' THEN 1 END) as dq,
      COUNT(CASE WHEN calls_call_outcome = 'Not Pitched' THEN 1 END) as not_pitched,
      SAFE_DIVIDE(COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END),
                  COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END)) as close_rate
    FROM ${VIEW}
    WHERE clients_client_id = @clientId
      AND DATE(calls_appointment_date) BETWEEN DATE(@startDate) AND DATE(@endDate)
  `, { clientId, startDate, endDate });
  return rows[0] || {};
}

/**
 * Sales Cycle — matches dashboard salesCycle.js scorecardSql (lines 74-93)
 * Uses v_close_cycle_stats_dated view with calls_to_close and days_to_close.
 * This is the CORRECT way — NOT computing from raw Calls table.
 */
async function querySalesCycle(clientId, startDate, endDate) {
  const cycleView = bq.table('v_close_cycle_stats_dated');
  const rows = await bq.query(`
    SELECT
      AVG(calls_to_close) as avg_calls,
      APPROX_QUANTILES(calls_to_close, 2)[OFFSET(1)] as median_calls,
      AVG(days_to_close) as avg_days,
      APPROX_QUANTILES(days_to_close, 2)[OFFSET(1)] as median_days,
      MAX(days_to_close) as longest_days,
      MIN(days_to_close) as shortest_days,
      COUNT(*) as total_closed,
      COUNT(CASE WHEN calls_to_close = 1 THEN 1 END) as one_call,
      COUNT(CASE WHEN calls_to_close = 2 THEN 1 END) as two_call,
      COUNT(CASE WHEN calls_to_close >= 3 THEN 1 END) as three_plus
    FROM ${cycleView}
    WHERE client_id = @clientId
      AND close_date BETWEEN @startDate AND @endDate
  `, { clientId, startDate, endDate });
  return rows[0] || {};
}

/**
 * Calls needed per deal — matches dashboard salesCycle.js callsPerDealSql (lines 96-104)
 * Total calls held / total closed deals from the main view.
 * This is a DIFFERENT metric from avg_calls_to_close (per-prospect average).
 */
async function queryCallsNeededPerDeal(clientId, startDate, endDate) {
  const mainView = bq.table('v_calls_joined_flat_prefixed');
  const rows = await bq.query(`
    SELECT
      SAFE_DIVIDE(
        COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END),
        COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END)
      ) as calls_needed_per_deal
    FROM ${mainView}
    WHERE clients_client_id = @clientId
      AND DATE(calls_appointment_date) BETWEEN DATE(@startDate) AND DATE(@endDate)
  `, { clientId, startDate, endDate });
  return rows[0] || {};
}

/**
 * Objections summary — total and resolved count.
 */
async function queryObjectionsSummary(clientId, startDate, endDate) {
  const rows = await bq.query(`
    SELECT
      COUNT(*) AS total,
      COUNTIF(resolved = TRUE) AS resolved
    FROM ${bq.table('Objections')} o
    JOIN ${bq.table('Calls')} c ON o.call_id = c.call_id
    WHERE o.client_id = @clientId
      AND CAST(c.appointment_date AS DATE) BETWEEN @startDate AND @endDate
  `, { clientId, startDate, endDate });
  return rows[0] || {};
}

/**
 * Top objections by type with resolution rates.
 */
async function queryTopObjections(clientId, startDate, endDate) {
  const rows = await bq.query(`
    SELECT
      o.objection_type AS type,
      COUNT(*) AS count,
      COUNTIF(o.resolved = TRUE) AS resolved,
      SAFE_DIVIDE(COUNTIF(o.resolved = TRUE), COUNT(*)) AS res_rate
    FROM ${bq.table('Objections')} o
    JOIN ${bq.table('Calls')} c ON o.call_id = c.call_id
    WHERE o.client_id = @clientId
      AND CAST(c.appointment_date AS DATE) BETWEEN @startDate AND @endDate
    GROUP BY o.objection_type
    ORDER BY count DESC
    LIMIT 6
  `, { clientId, startDate, endDate });
  return rows;
}

/**
 * Top pains from calls — unique pain strings.
 */
async function queryTopPains(clientId, startDate, endDate) {
  const VIEW = bq.table('v_calls_joined_flat_prefixed');
  const rows = await bq.query(`
    SELECT calls_pains as pains
    FROM ${VIEW}
    WHERE clients_client_id = @clientId
      AND DATE(calls_appointment_date) BETWEEN DATE(@startDate) AND DATE(@endDate)
      AND calls_attendance = 'Show'
      AND calls_pains IS NOT NULL AND calls_pains != ''
    ORDER BY calls_appointment_date DESC
    LIMIT 20
  `, { clientId, startDate, endDate });
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    const pain = (row.pains || '').trim();
    if (pain && !seen.has(pain.toLowerCase())) {
      seen.add(pain.toLowerCase());
      result.push(pain);
      if (result.length >= 4) break;
    }
  }
  return result;
}

/**
 * Top goals from calls — unique goal strings.
 */
async function queryTopGoals(clientId, startDate, endDate) {
  const VIEW = bq.table('v_calls_joined_flat_prefixed');
  const rows = await bq.query(`
    SELECT calls_goals as goals
    FROM ${VIEW}
    WHERE clients_client_id = @clientId
      AND DATE(calls_appointment_date) BETWEEN DATE(@startDate) AND DATE(@endDate)
      AND calls_attendance = 'Show'
      AND calls_goals IS NOT NULL AND calls_goals != ''
    ORDER BY calls_appointment_date DESC
    LIMIT 20
  `, { clientId, startDate, endDate });
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    const goal = (row.goals || '').trim();
    if (goal && !seen.has(goal.toLowerCase())) {
      seen.add(goal.toLowerCase());
      result.push(goal);
      if (result.length >= 4) break;
    }
  }
  return result;
}

/**
 * Violations — compliance risk flags from compliance_flags column on Calls table.
 * compliance_flags JSON structure:
 *   { categories_found: [...], has_ftc_warning: bool, total_flags: N,
 *     flags: [{ category, phrase, severity, timestamp_seconds, why_flagged }] }
 *
 * Unnests the flags array to get individual violation entries.
 */
async function queryViolations(clientId, startDate, endDate) {
  const rows = await bq.query(`
    SELECT
      cl.name AS closer_name,
      CAST(c.appointment_date AS DATE) AS call_date,
      JSON_VALUE(flag, '$.category') AS risk_category,
      JSON_VALUE(flag, '$.phrase') AS phrase,
      JSON_VALUE(flag, '$.why_flagged') AS why_flagged,
      JSON_VALUE(flag, '$.severity') AS severity,
      1 AS flag_count
    FROM ${bq.table('Calls')} c
    CROSS JOIN UNNEST(JSON_EXTRACT_ARRAY(c.compliance_flags, '$.flags')) AS flag
    JOIN ${bq.table('Closers')} cl ON c.closer_id = cl.closer_id
    WHERE c.client_id = @clientId
      AND CAST(c.appointment_date AS DATE) BETWEEN @startDate AND @endDate
      AND c.attendance = 'Show'
      AND c.compliance_flags IS NOT NULL
      AND JSON_VALUE(c.compliance_flags, '$.has_ftc_warning') = 'true'
    ORDER BY c.appointment_date DESC
    LIMIT 10
  `, { clientId, startDate, endDate });
  return rows;
}

/**
 * Violations summary for previous period comparison.
 * Counts distinct flagged calls and total flags from compliance_flags.
 */
async function queryViolationsSummary(clientId, startDate, endDate) {
  const rows = await bq.query(`
    SELECT
      COUNT(DISTINCT c.call_id) AS flagged_calls,
      COUNT(*) AS total_flags
    FROM ${bq.table('Calls')} c
    CROSS JOIN UNNEST(JSON_EXTRACT_ARRAY(c.compliance_flags, '$.flags')) AS flag
    WHERE c.client_id = @clientId
      AND CAST(c.appointment_date AS DATE) BETWEEN @startDate AND @endDate
      AND c.attendance = 'Show'
      AND c.compliance_flags IS NOT NULL
      AND JSON_VALUE(c.compliance_flags, '$.has_ftc_warning') = 'true'
  `, { clientId, startDate, endDate });
  return rows[0] || {};
}

/**
 * Closer leaderboard — matches dashboard overview patterns.
 * Uses v_calls_joined_flat_prefixed for consistent data.
 */
async function queryCloserLeaderboard(clientId, startDate, endDate) {
  const VIEW = bq.table('v_calls_joined_flat_prefixed');
  const rows = await bq.query(`
    SELECT
      closers_name as name,
      COUNT(*) AS calls,
      COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END) AS shows,
      COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END) AS closes,
      SAFE_DIVIDE(COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END),
                  COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END)) AS close_rate,
      SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_revenue_generated AS FLOAT64) ELSE 0 END) AS revenue,
      SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_cash_collected AS FLOAT64) ELSE 0 END) AS cash_collected
    FROM ${VIEW}
    WHERE clients_client_id = @clientId
      AND DATE(calls_appointment_date) BETWEEN DATE(@startDate) AND DATE(@endDate)
    GROUP BY closers_name
    ORDER BY cash_collected DESC
  `, { clientId, startDate, endDate });
  return rows;
}

// ── Utilities ─────────────────────────────────────────────

/** Safe number: returns 0 if null/undefined/NaN */
function num(val) {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

/**
 * Computes threshold-based alerts from leaderboard data.
 * Flags closers with show_rate < 75% or close_rate < 15%.
 */
function computeAlerts(leaderboard) {
  const alerts = [];
  for (const closer of leaderboard) {
    if (closer.calls >= 3) {
      const showRate = closer.shows / closer.calls;
      if (showRate < 0.75) {
        alerts.push({
          metric: 'show_rate',
          label: 'Show Rate',
          operator: 'below',
          threshold: 0.75,
          current_value: showRate,
          closer_name: closer.name,
        });
      }
      if (closer.shows >= 3 && num(closer.close_rate) < 0.15) {
        alerts.push({
          metric: 'close_rate',
          label: 'Close Rate',
          operator: 'below',
          threshold: 0.15,
          current_value: num(closer.close_rate),
          closer_name: closer.name,
        });
      }
    }
  }
  return alerts;
}

// ── Daily Onboarding Data Fetcher ──────────────────────────

/**
 * Fetches single-day onboarding data for a specific closer.
 * Returns data in the dailyOnboardingTestData shape.
 *
 * @param {string} clientId - Client ID
 * @param {string} closerId - Closer ID
 * @param {string|null} dateStr - Date string (YYYY-MM-DD), defaults to today
 * @returns {Object} Daily onboarding data
 */
async function fetchDailyOnboardingData(clientId, closerId, dateStr = null) {
  const today = dateStr || fmtDate(new Date());

  logger.info('EmailDataFetcher: Fetching daily onboarding data', { clientId, closerId, date: today });

  // Fetch client + closer + settings in parallel
  const [clientRows, closerRows] = await Promise.all([
    bq.query(
      `SELECT company_name, primary_contact_email, settings_json, timezone
       FROM ${bq.table('Clients')}
       WHERE client_id = @clientId`,
      { clientId }
    ),
    bq.query(
      `SELECT closer_id, name, timezone, created_at, hire_date
       FROM ${bq.table('Closers')}
       WHERE closer_id = @closerId AND client_id = @clientId`,
      { clientId, closerId }
    ),
  ]);

  const client = clientRows[0];
  if (!client) throw new Error(`Client not found: ${clientId}`);
  const closer = closerRows[0];
  if (!closer) throw new Error(`Closer not found: ${closerId} for client ${clientId}`);

  const settings = typeof client.settings_json === 'string'
    ? JSON.parse(client.settings_json || '{}')
    : (client.settings_json || {});

  // Find close watch config — duration_value = days remaining (decrements daily)
  const watches = settings.notifications?.close_watches || [];
  const watch = watches.find(w => w.closer_id === closerId);
  const daysRemaining = watch?.duration_value || 0;
  const closeWatchStartDate = watch?.close_watch_start_date || null;
  const todayDate = new Date(today);

  const VIEW = bq.table('v_calls_joined_flat_prefixed');

  // Calculate the lookback period for team averages
  // Use elapsed + remaining days as the total window, fallback to 30
  const elapsed = closeWatchStartDate
    ? Math.max(0, Math.ceil((todayDate - new Date(closeWatchStartDate)) / (1000 * 60 * 60 * 24)))
    : 0;
  const lookbackDays = (elapsed + daysRemaining) || 30;
  const periodStart = new Date(todayDate);
  periodStart.setDate(periodStart.getDate() - lookbackDays);
  const periodStartStr = fmtDate(periodStart);
  const periodLabel = `Last ${lookbackDays} Days`;

  // Run all queries in parallel
  const [closerMetrics, teamMetrics, closerScript, teamScript, violations, objections] = await Promise.all([
    // Closer's single-day metrics
    bq.query(`
      SELECT
        COUNT(*) as calls_booked,
        COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END) as calls_showed,
        COUNT(CASE WHEN calls_call_outcome IN ('Closed - Won', 'Deposit') THEN 1 END) as calls_closed,
        SUM(CASE WHEN calls_call_outcome IN ('Closed - Won', 'Deposit') THEN CAST(calls_cash_collected AS FLOAT64) ELSE 0 END) as cash_collected,
        SUM(CASE WHEN calls_call_outcome IN ('Closed - Won', 'Deposit') THEN CAST(calls_revenue_generated AS FLOAT64) ELSE 0 END) as revenue_generated,
        SAFE_DIVIDE(COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END), COUNT(*)) as show_rate,
        SAFE_DIVIDE(
          COUNT(CASE WHEN calls_call_outcome IN ('Closed - Won', 'Deposit') THEN 1 END),
          COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END)
        ) as close_rate
      FROM ${VIEW}
      WHERE clients_client_id = @clientId
        AND closers_closer_id = @closerId
        AND DATE(calls_appointment_date) = DATE(@today)
    `, { clientId, closerId, today }),

    // Team averages over full onboarding period (excluding this closer)
    bq.query(`
      SELECT
        SAFE_DIVIDE(COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END), COUNT(*)) as show_rate,
        SAFE_DIVIDE(
          COUNT(CASE WHEN calls_call_outcome IN ('Closed - Won', 'Deposit') THEN 1 END),
          COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END)
        ) as close_rate,
        SAFE_DIVIDE(
          SUM(CASE WHEN calls_call_outcome IN ('Closed - Won', 'Deposit') THEN CAST(calls_revenue_generated AS FLOAT64) ELSE 0 END),
          NULLIF(COUNT(CASE WHEN calls_call_outcome IN ('Closed - Won', 'Deposit') THEN 1 END), 0)
        ) as avg_deal_size,
        SAFE_DIVIDE(
          SUM(CASE WHEN calls_call_outcome IN ('Closed - Won', 'Deposit') THEN CAST(calls_cash_collected AS FLOAT64) ELSE 0 END),
          NULLIF(COUNT(CASE WHEN calls_call_outcome IN ('Closed - Won', 'Deposit') THEN 1 END), 0)
        ) as avg_cash_per_deal,
        SUM(CASE WHEN calls_call_outcome IN ('Closed - Won', 'Deposit') THEN CAST(calls_cash_collected AS FLOAT64) ELSE 0 END) as cash_collected,
        SUM(CASE WHEN calls_call_outcome IN ('Closed - Won', 'Deposit') THEN CAST(calls_revenue_generated AS FLOAT64) ELSE 0 END) as revenue_generated
      FROM ${VIEW}
      WHERE clients_client_id = @clientId
        AND closers_closer_id != @closerId
        AND DATE(calls_appointment_date) BETWEEN DATE(@periodStart) AND DATE(@today)
    `, { clientId, closerId, today, periodStart: periodStartStr }),

    // Closer's script adherence score (today)
    bq.query(`
      SELECT AVG(CAST(calls_script_adherence_score AS FLOAT64)) as score
      FROM ${VIEW}
      WHERE clients_client_id = @clientId
        AND closers_closer_id = @closerId
        AND DATE(calls_appointment_date) = DATE(@today)
        AND calls_attendance = 'Show'
        AND calls_script_adherence_score IS NOT NULL
    `, { clientId, closerId, today }),

    // Team's script adherence avg (full period)
    bq.query(`
      SELECT AVG(CAST(calls_script_adherence_score AS FLOAT64)) as score
      FROM ${VIEW}
      WHERE clients_client_id = @clientId
        AND closers_closer_id != @closerId
        AND DATE(calls_appointment_date) BETWEEN DATE(@periodStart) AND DATE(@today)
        AND calls_attendance = 'Show'
        AND calls_script_adherence_score IS NOT NULL
    `, { clientId, closerId, today, periodStart: periodStartStr }),

    // Violations for this closer today
    bq.query(`
      SELECT
        cl.name AS closer_name,
        JSON_VALUE(flag, '$.category') AS risk_category,
        JSON_VALUE(flag, '$.phrase') AS phrase,
        JSON_VALUE(flag, '$.why_flagged') AS why_flagged,
        JSON_VALUE(flag, '$.severity') AS severity
      FROM ${bq.table('Calls')} c
      CROSS JOIN UNNEST(JSON_EXTRACT_ARRAY(c.compliance_flags, '$.flags')) AS flag
      JOIN ${bq.table('Closers')} cl ON c.closer_id = cl.closer_id
      WHERE c.client_id = @clientId
        AND c.closer_id = @closerId
        AND DATE(c.appointment_date) = DATE(@today)
        AND c.attendance = 'Show'
        AND c.compliance_flags IS NOT NULL
        AND JSON_VALUE(c.compliance_flags, '$.has_ftc_warning') = 'true'
      ORDER BY c.appointment_date DESC
      LIMIT 10
    `, { clientId, closerId, today }),

    // Objections for this closer today
    bq.query(`
      SELECT
        o.objection_type,
        COUNT(*) AS count,
        COUNTIF(o.resolved = TRUE) AS resolved_count,
        SAFE_DIVIDE(COUNTIF(o.resolved = TRUE), COUNT(*)) AS resolution_rate
      FROM ${bq.table('Objections')} o
      JOIN ${bq.table('Calls')} c ON o.call_id = c.call_id
      WHERE o.client_id = @clientId
        AND c.closer_id = @closerId
        AND DATE(c.appointment_date) = DATE(@today)
      GROUP BY o.objection_type
      ORDER BY count DESC
      LIMIT 6
    `, { clientId, closerId, today }),
  ]);

  const cm = closerMetrics[0] || {};
  const tm = teamMetrics[0] || {};

  // Check if client has KPI targets configured
  const kpiTargets = settings.kpi_targets;
  const hasKpi = kpiTargets && (kpiTargets.show_rate || kpiTargets.close_rate);

  const closerScriptScore = closerScript[0]?.score;
  const teamScriptScore = teamScript[0]?.score;

  const targets = hasKpi ? {
    source: 'kpi',
    period_label: 'KPI Targets',
    show_rate: num(kpiTargets.show_rate),
    close_rate: num(kpiTargets.close_rate),
    avg_deal_size: num(kpiTargets.avg_deal_size),
    avg_cash_per_deal: num(kpiTargets.avg_cash_per_deal),
    cash_collected: num(kpiTargets.cash_collected),
    revenue_generated: num(kpiTargets.revenue_generated),
  } : {
    source: 'team_avg',
    period_label: periodLabel,
    show_rate: num(tm.show_rate),
    close_rate: num(tm.close_rate),
    avg_deal_size: num(tm.avg_deal_size),
    avg_cash_per_deal: num(tm.avg_cash_per_deal),
    cash_collected: num(tm.cash_collected),
    revenue_generated: num(tm.revenue_generated),
  };

  const data = {
    report_type: 'daily_onboarding',
    report_date: today,
    company_name: client.company_name,
    closer: {
      closer_id: closer.closer_id,
      name: closer.name,
      timezone: closer.timezone || client.timezone || 'America/New_York',
    },
    days_remaining: daysRemaining,
    close_watch_start_date: closeWatchStartDate,
    calls_booked: num(cm.calls_booked),
    calls_showed: num(cm.calls_showed),
    calls_closed: num(cm.calls_closed),
    cash_collected: num(cm.cash_collected),
    revenue_generated: num(cm.revenue_generated),
    show_rate: num(cm.show_rate),
    close_rate: num(cm.close_rate),
    script_adherence: {
      score: closerScriptScore != null ? num(closerScriptScore) : null,
      team_avg: teamScriptScore != null ? num(teamScriptScore) : null,
    },
    targets,
    violations: violations.map(v => ({
      closer_name: v.closer_name,
      risk_category: v.risk_category,
      phrase: v.phrase,
      why_flagged: v.why_flagged,
      severity: v.severity || 'medium',
    })),
    objections: objections.map(o => ({
      objection_type: o.objection_type,
      count: num(o.count),
      resolved_count: num(o.resolved_count),
      resolution_rate: num(o.resolution_rate),
    })),
  };

  logger.info('EmailDataFetcher: Daily onboarding data fetched', {
    clientId, closerId, date: today,
    callsBooked: data.calls_booked, daysRemaining,
  });

  return data;
}

module.exports = { fetchEmailData, fetchDailyOnboardingData, getWeeklyRanges, getMonthlyRanges };
