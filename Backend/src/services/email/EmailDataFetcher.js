/**
 * EMAIL DATA FETCHER
 *
 * Queries BigQuery for real data to populate email reports.
 * Returns data in the exact same shape as testData.js so the
 * EmailTemplateEngine works identically with real or test data.
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
 * Weekly = last Monday-Sunday vs the Monday-Sunday before that.
 * If today is Monday, "last week" is the week that just ended (yesterday was Sunday).
 */
function getWeeklyRanges(now = new Date()) {
  const d = new Date(now);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon
  // Most recent Monday: go back to start of this week, then back 7 more days
  const currentEnd = new Date(d);
  // Set to last Sunday (end of previous week)
  currentEnd.setUTCDate(d.getUTCDate() - (day === 0 ? 0 : day));
  currentEnd.setUTCHours(23, 59, 59, 999);

  const currentStart = new Date(currentEnd);
  currentStart.setUTCDate(currentEnd.getUTCDate() - 6);
  currentStart.setUTCHours(0, 0, 0, 0);

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
  // Previous month
  const currentEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)); // last day of prev month
  const currentStart = new Date(Date.UTC(currentEnd.getUTCFullYear(), currentEnd.getUTCMonth(), 1));

  // Month before that
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
  const [
    overviewCurrent, overviewPrev,
    financialCurrent, financialPrev,
    attendanceCurrent, attendancePrev,
    outcomesCurrent, outcomesPrev,
    salesCycleCurrent, salesCyclePrev,
    objectionsCurrent, objectionsPrev,
    objTopCurrent,
    marketCurrent, marketPrev,
    painsCurrent, goalsCurrent,
    violationsCurrent, violationsPrev,
    leaderboard,
  ] = await Promise.all([
    // Overview
    queryOverview(clientId, current.start, current.end),
    queryOverview(clientId, prev.start, prev.end),
    // Financial
    queryFinancial(clientId, current.start, current.end),
    queryFinancial(clientId, prev.start, prev.end),
    // Attendance
    queryAttendance(clientId, current.start, current.end),
    queryAttendance(clientId, prev.start, prev.end),
    // Call Outcomes
    queryCallOutcomes(clientId, current.start, current.end),
    queryCallOutcomes(clientId, prev.start, prev.end),
    // Sales Cycle
    querySalesCycle(clientId, current.start, current.end),
    querySalesCycle(clientId, prev.start, prev.end),
    // Objections
    queryObjectionsSummary(clientId, current.start, current.end),
    queryObjectionsSummary(clientId, prev.start, prev.end),
    queryTopObjections(clientId, current.start, current.end),
    // Market Insight
    queryMarketInsight(clientId, current.start, current.end),
    queryMarketInsight(clientId, prev.start, prev.end),
    queryTopPains(clientId, current.start, current.end),
    queryTopGoals(clientId, current.start, current.end),
    // Violations
    queryViolations(clientId, current.start, current.end),
    queryViolationsSummary(clientId, prev.start, prev.end),
    // Leaderboard
    queryCloserLeaderboard(clientId, current.start, current.end),
  ]);

  // Assemble data in testData.js shape
  const data = {
    company_name: client.company_name,
    report_type: reportType,
    report_period: { label: current.label, start: current.start, end: current.end },
    prev_period: { label: prev.label, start: prev.start, end: prev.end },

    overview: {
      total_calls: overviewCurrent.total_calls || 0,
      shows: overviewCurrent.shows || 0,
      closes: overviewCurrent.closes || 0,
      show_rate: safeRate(overviewCurrent.shows, overviewCurrent.total_calls),
      close_rate: safeRate(overviewCurrent.closes, overviewCurrent.shows),
      revenue: overviewCurrent.revenue || 0,
      cash_collected: overviewCurrent.cash_collected || 0,
      prev: {
        total_calls: overviewPrev.total_calls || 0,
        shows: overviewPrev.shows || 0,
        closes: overviewPrev.closes || 0,
        show_rate: safeRate(overviewPrev.shows, overviewPrev.total_calls),
        close_rate: safeRate(overviewPrev.closes, overviewPrev.shows),
        revenue: overviewPrev.revenue || 0,
        cash_collected: overviewPrev.cash_collected || 0,
      },
    },

    financial: {
      revenue: financialCurrent.revenue || 0,
      cash_collected: financialCurrent.cash_collected || 0,
      avg_deal_size: financialCurrent.avg_deal_size || 0,
      deals_closed: financialCurrent.deals_closed || 0,
      deposits: financialCurrent.deposits || 0,
      deposit_total: financialCurrent.deposit_total || 0,
      prev: {
        revenue: financialPrev.revenue || 0,
        cash_collected: financialPrev.cash_collected || 0,
        avg_deal_size: financialPrev.avg_deal_size || 0,
        deals_closed: financialPrev.deals_closed || 0,
        deposits: financialPrev.deposits || 0,
        deposit_total: financialPrev.deposit_total || 0,
      },
    },

    attendance: {
      total_booked: attendanceCurrent.total_booked || 0,
      shows: attendanceCurrent.shows || 0,
      ghosted: attendanceCurrent.ghosted || 0,
      canceled: attendanceCurrent.canceled || 0,
      rescheduled: attendanceCurrent.rescheduled || 0,
      show_rate: safeRate(attendanceCurrent.shows, attendanceCurrent.total_booked),
      ghost_rate: safeRate(attendanceCurrent.ghosted, attendanceCurrent.total_booked),
      cancel_rate: safeRate(attendanceCurrent.canceled, attendanceCurrent.total_booked),
      prev: {
        total_booked: attendancePrev.total_booked || 0,
        shows: attendancePrev.shows || 0,
        ghosted: attendancePrev.ghosted || 0,
        canceled: attendancePrev.canceled || 0,
        rescheduled: attendancePrev.rescheduled || 0,
        show_rate: safeRate(attendancePrev.shows, attendancePrev.total_booked),
        ghost_rate: safeRate(attendancePrev.ghosted, attendancePrev.total_booked),
        cancel_rate: safeRate(attendancePrev.canceled, attendancePrev.total_booked),
      },
    },

    callOutcomes: {
      closed_won: outcomesCurrent.closed_won || 0,
      deposit: outcomesCurrent.deposit || 0,
      follow_up: outcomesCurrent.follow_up || 0,
      lost: outcomesCurrent.lost || 0,
      disqualified: outcomesCurrent.disqualified || 0,
      not_pitched: outcomesCurrent.not_pitched || 0,
      prev: {
        closed_won: outcomesPrev.closed_won || 0,
        deposit: outcomesPrev.deposit || 0,
        follow_up: outcomesPrev.follow_up || 0,
        lost: outcomesPrev.lost || 0,
        disqualified: outcomesPrev.disqualified || 0,
        not_pitched: outcomesPrev.not_pitched || 0,
      },
    },

    salesCycle: {
      avg_days_to_close: salesCycleCurrent.avg_days_to_close || 0,
      one_call_close_rate: salesCycleCurrent.one_call_close_rate || 0,
      avg_follow_ups_before_close: salesCycleCurrent.avg_follow_ups || 0,
      longest_cycle_days: salesCycleCurrent.longest_cycle || 0,
      shortest_cycle_days: salesCycleCurrent.shortest_cycle || 0,
      prev: {
        avg_days_to_close: salesCyclePrev.avg_days_to_close || 0,
        one_call_close_rate: salesCyclePrev.one_call_close_rate || 0,
        avg_follow_ups_before_close: salesCyclePrev.avg_follow_ups || 0,
        longest_cycle_days: salesCyclePrev.longest_cycle || 0,
        shortest_cycle_days: salesCyclePrev.shortest_cycle || 0,
      },
    },

    objections: {
      total: objectionsCurrent.total || 0,
      resolved: objectionsCurrent.resolved || 0,
      overall_resolution_rate: safeRate(objectionsCurrent.resolved, objectionsCurrent.total),
      top: objTopCurrent,
      prev: {
        total: objectionsPrev.total || 0,
        resolved: objectionsPrev.resolved || 0,
        overall_resolution_rate: safeRate(objectionsPrev.resolved, objectionsPrev.total),
      },
    },

    marketInsight: {
      hot_leads: marketCurrent.hot_leads || 0,
      warm_leads: marketCurrent.warm_leads || 0,
      cold_leads: marketCurrent.cold_leads || 0,
      avg_prospect_fit: marketCurrent.avg_prospect_fit || 0,
      top_pains: painsCurrent,
      top_goals: goalsCurrent,
      prev: {
        hot_leads: marketPrev.hot_leads || 0,
        warm_leads: marketPrev.warm_leads || 0,
        cold_leads: marketPrev.cold_leads || 0,
        avg_prospect_fit: marketPrev.avg_prospect_fit || 0,
      },
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
        flagged_calls: violationsPrev.flagged_calls || 0,
        total_flags: violationsPrev.total_flags || 0,
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

function dateFilter(startCol = 'appointment_date') {
  return `CAST(${startCol} AS DATE) BETWEEN @startDate AND @endDate`;
}

async function queryOverview(clientId, startDate, endDate) {
  const rows = await bq.query(`
    SELECT
      COUNT(*) AS total_calls,
      COUNTIF(attendance = 'Show') AS shows,
      COUNTIF(call_outcome = 'Closed - Won') AS closes,
      COALESCE(SUM(revenue_generated), 0) AS revenue,
      COALESCE(SUM(cash_collected), 0) AS cash_collected
    FROM ${bq.table('Calls')}
    WHERE client_id = @clientId AND ${dateFilter()}
  `, { clientId, startDate, endDate });
  return rows[0] || {};
}

async function queryFinancial(clientId, startDate, endDate) {
  const rows = await bq.query(`
    SELECT
      COALESCE(SUM(revenue_generated), 0) AS revenue,
      COALESCE(SUM(cash_collected), 0) AS cash_collected,
      CASE WHEN COUNTIF(call_outcome = 'Closed - Won') > 0
        THEN SUM(CASE WHEN call_outcome = 'Closed - Won' THEN revenue_generated ELSE 0 END) / COUNTIF(call_outcome = 'Closed - Won')
        ELSE 0 END AS avg_deal_size,
      COUNTIF(call_outcome = 'Closed - Won') AS deals_closed,
      COUNTIF(call_outcome = 'Deposit') AS deposits,
      COALESCE(SUM(CASE WHEN call_outcome = 'Deposit' THEN cash_collected ELSE 0 END), 0) AS deposit_total
    FROM ${bq.table('Calls')}
    WHERE client_id = @clientId AND ${dateFilter()} AND attendance = 'Show'
  `, { clientId, startDate, endDate });
  return rows[0] || {};
}

async function queryAttendance(clientId, startDate, endDate) {
  const rows = await bq.query(`
    SELECT
      COUNT(*) AS total_booked,
      COUNTIF(attendance = 'Show') AS shows,
      COUNTIF(attendance = 'Ghosted - No Show') AS ghosted,
      COUNTIF(attendance = 'Canceled') AS canceled,
      COUNTIF(attendance = 'Rescheduled') AS rescheduled
    FROM ${bq.table('Calls')}
    WHERE client_id = @clientId AND ${dateFilter()}
  `, { clientId, startDate, endDate });
  return rows[0] || {};
}

async function queryCallOutcomes(clientId, startDate, endDate) {
  const rows = await bq.query(`
    SELECT
      COUNTIF(call_outcome = 'Closed - Won') AS closed_won,
      COUNTIF(call_outcome = 'Deposit') AS deposit,
      COUNTIF(call_outcome = 'Follow Up') AS follow_up,
      COUNTIF(call_outcome = 'Lost') AS lost,
      COUNTIF(call_outcome = 'Disqualified') AS disqualified,
      COUNTIF(call_outcome = 'Not Pitched') AS not_pitched
    FROM ${bq.table('Calls')}
    WHERE client_id = @clientId AND ${dateFilter()} AND attendance = 'Show'
  `, { clientId, startDate, endDate });
  return rows[0] || {};
}

async function querySalesCycle(clientId, startDate, endDate) {
  const rows = await bq.query(`
    SELECT
      AVG(DATE_DIFF(CAST(date_closed AS DATE), CAST(appointment_date AS DATE), DAY)) AS avg_days_to_close,
      SAFE_DIVIDE(
        COUNTIF(DATE_DIFF(CAST(date_closed AS DATE), CAST(appointment_date AS DATE), DAY) = 0),
        COUNT(*)
      ) AS one_call_close_rate,
      AVG(follow_up_count) AS avg_follow_ups,
      MAX(DATE_DIFF(CAST(date_closed AS DATE), CAST(appointment_date AS DATE), DAY)) AS longest_cycle,
      MIN(DATE_DIFF(CAST(date_closed AS DATE), CAST(appointment_date AS DATE), DAY)) AS shortest_cycle
    FROM (
      SELECT
        c.date_closed,
        c.appointment_date,
        (SELECT COUNT(*) FROM ${bq.table('Calls')} c2
         WHERE c2.prospect_email = c.prospect_email
           AND c2.client_id = c.client_id
           AND c2.attendance = 'Show'
           AND CAST(c2.appointment_date AS DATE) < CAST(c.appointment_date AS DATE)
        ) AS follow_up_count
      FROM ${bq.table('Calls')} c
      WHERE c.client_id = @clientId
        AND ${dateFilter('c.appointment_date')}
        AND c.call_outcome = 'Closed - Won'
        AND c.date_closed IS NOT NULL
    )
  `, { clientId, startDate, endDate });
  return rows[0] || {};
}

async function queryObjectionsSummary(clientId, startDate, endDate) {
  const rows = await bq.query(`
    SELECT
      COUNT(*) AS total,
      COUNTIF(resolved = TRUE) AS resolved
    FROM ${bq.table('Objections')} o
    JOIN ${bq.table('Calls')} c ON o.call_id = c.call_id
    WHERE o.client_id = @clientId AND ${dateFilter('c.appointment_date')}
  `, { clientId, startDate, endDate });
  return rows[0] || {};
}

async function queryTopObjections(clientId, startDate, endDate) {
  const rows = await bq.query(`
    SELECT
      o.objection_type AS type,
      COUNT(*) AS count,
      COUNTIF(o.resolved = TRUE) AS resolved,
      SAFE_DIVIDE(COUNTIF(o.resolved = TRUE), COUNT(*)) AS res_rate
    FROM ${bq.table('Objections')} o
    JOIN ${bq.table('Calls')} c ON o.call_id = c.call_id
    WHERE o.client_id = @clientId AND ${dateFilter('c.appointment_date')}
    GROUP BY o.objection_type
    ORDER BY count DESC
    LIMIT 6
  `, { clientId, startDate, endDate });
  return rows;
}

async function queryMarketInsight(clientId, startDate, endDate) {
  const rows = await bq.query(`
    SELECT
      COUNTIF(prospect_temperature = 'Hot') AS hot_leads,
      COUNTIF(prospect_temperature = 'Warm') AS warm_leads,
      COUNTIF(prospect_temperature = 'Cold') AS cold_leads,
      AVG(prospect_fit_score) AS avg_prospect_fit
    FROM ${bq.table('Calls')}
    WHERE client_id = @clientId AND ${dateFilter()} AND attendance = 'Show'
  `, { clientId, startDate, endDate });
  return rows[0] || {};
}

async function queryTopPains(clientId, startDate, endDate) {
  // Pains are stored as free text per call. Extract the most common ones.
  const rows = await bq.query(`
    SELECT pains
    FROM ${bq.table('Calls')}
    WHERE client_id = @clientId AND ${dateFilter()}
      AND attendance = 'Show' AND pains IS NOT NULL AND pains != ''
    ORDER BY appointment_date DESC
    LIMIT 20
  `, { clientId, startDate, endDate });
  // Return unique pain strings (first 4)
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

async function queryTopGoals(clientId, startDate, endDate) {
  const rows = await bq.query(`
    SELECT goals
    FROM ${bq.table('Calls')}
    WHERE client_id = @clientId AND ${dateFilter()}
      AND attendance = 'Show' AND goals IS NOT NULL AND goals != ''
    ORDER BY appointment_date DESC
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

async function queryViolations(clientId, startDate, endDate) {
  // Violations come from AI risk flags stored in key_moments or a dedicated field.
  // For now, query calls with risk-flagged key_moments.
  const rows = await bq.query(`
    SELECT
      cl.name AS closer_name,
      CAST(c.appointment_date AS DATE) AS call_date,
      JSON_VALUE(km, '$.label') AS risk_category,
      JSON_VALUE(km, '$.description') AS phrase,
      JSON_VALUE(km, '$.severity') AS severity,
      1 AS flag_count
    FROM ${bq.table('Calls')} c
    CROSS JOIN UNNEST(JSON_QUERY_ARRAY(c.key_moments)) AS km
    JOIN ${bq.table('Closers')} cl ON c.closer_id = cl.closer_id
    WHERE c.client_id = @clientId
      AND ${dateFilter('c.appointment_date')}
      AND JSON_VALUE(km, '$.type') = 'risk'
    ORDER BY c.appointment_date DESC
    LIMIT 10
  `, { clientId, startDate, endDate });
  return rows;
}

async function queryViolationsSummary(clientId, startDate, endDate) {
  const rows = await bq.query(`
    SELECT
      COUNT(DISTINCT c.call_id) AS flagged_calls,
      COUNT(*) AS total_flags
    FROM ${bq.table('Calls')} c
    CROSS JOIN UNNEST(JSON_QUERY_ARRAY(c.key_moments)) AS km
    WHERE c.client_id = @clientId
      AND ${dateFilter('c.appointment_date')}
      AND JSON_VALUE(km, '$.type') = 'risk'
  `, { clientId, startDate, endDate });
  return rows[0] || {};
}

async function queryCloserLeaderboard(clientId, startDate, endDate) {
  const rows = await bq.query(`
    SELECT
      cl.name,
      COUNT(*) AS calls,
      COUNTIF(c.attendance = 'Show') AS shows,
      COUNTIF(c.call_outcome = 'Closed - Won') AS closes,
      SAFE_DIVIDE(COUNTIF(c.call_outcome = 'Closed - Won'), COUNTIF(c.attendance = 'Show')) AS close_rate,
      COALESCE(SUM(c.revenue_generated), 0) AS revenue,
      COALESCE(SUM(c.cash_collected), 0) AS cash_collected
    FROM ${bq.table('Calls')} c
    JOIN ${bq.table('Closers')} cl ON c.closer_id = cl.closer_id
    WHERE c.client_id = @clientId AND ${dateFilter('c.appointment_date')}
    GROUP BY cl.name
    ORDER BY cash_collected DESC
  `, { clientId, startDate, endDate });
  return rows;
}

// ── Utilities ─────────────────────────────────────────────

function safeRate(numerator, denominator) {
  if (!denominator || denominator === 0) return 0;
  return (numerator || 0) / denominator;
}

/**
 * Computes threshold-based alerts from leaderboard data.
 * Flags closers with show_rate < 75% or close_rate < 15%.
 */
function computeAlerts(leaderboard) {
  const alerts = [];
  for (const closer of leaderboard) {
    if (closer.calls >= 3) { // Only alert if enough data
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
      if (closer.shows >= 3 && closer.close_rate < 0.15) {
        alerts.push({
          metric: 'close_rate',
          label: 'Close Rate',
          operator: 'below',
          threshold: 0.15,
          current_value: closer.close_rate,
          closer_name: closer.name,
        });
      }
    }
  }
  return alerts;
}

module.exports = { fetchEmailData, getWeeklyRanges, getMonthlyRanges };
