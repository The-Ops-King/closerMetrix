/**
 * ATTENDANCE PAGE QUERIES -- Insight+ Only
 *
 * Scorecard grid: 4 metric columns × 3 rows + 2 standalone
 *   Columns: Unique Prospects, Total Calls, First Calls, Follow Up
 *   Rows:    Scheduled, Held, Show Rate
 *   Extras:  Active Follow Up, Not Yet Held
 *
 * Charts (all tiers with attendance access):
 *   1. Scheduled vs Held (line — counts over time)
 *   2. First Call / Follow Up Show Rate (line)
 *   3. Attendance Breakdown (donut)
 *   4. First Held / Follow Up Held (stacked bar over time)
 *
 * Charts (Insight+ only — per-closer breakdowns):
 *   5. Show Rate per Closer (horizontal bar)
 *   6. Attendance per Closer (stacked bar)
 *
 * Data: GET /api/dashboard/attendance
 */

const bq = require('../BigQueryClient');
const logger = require('../../utils/logger');
const { generateTimeSeries } = require('./demoTimeSeries');
const { NEON_HEX } = require('../../../shared/chartMappings');

/**
 * Fetch all attendance data for a client.
 *
 * @param {string} clientId - Client ID for data isolation
 * @param {object} filters - { dateStart, dateEnd, closerId }
 * @param {string} tier - Client's plan tier
 * @returns {Promise<object>} { sections, charts }
 */
async function getAttendanceData(clientId, filters = {}, tier = 'insight') {
  if (!bq.isAvailable() || clientId.startsWith('demo_')) {
    logger.debug('Returning demo attendance data');
    return getDemoData(tier, filters);
  }

  try {
    return await queryBigQuery(clientId, filters, tier);
  } catch (err) {
    logger.error('Attendance BQ query failed, falling back to demo', {
      error: err.message,
      clientId,
    });
    return getDemoData(tier, filters);
  }
}

/**
 * Run real BigQuery queries for attendance data.
 * Runs 3 queries in parallel: scorecard, time-series, per-closer.
 */
async function queryBigQuery(clientId, filters, tier) {
  const { buildQueryContext, timeBucket, runParallel, num, rate, VIEW } = require('./helpers');
  const { params, where } = buildQueryContext(clientId, filters, tier);
  const tb = timeBucket();
  const isInsightPlus = tier === 'insight' || tier === 'executive';

  // 1) Scorecard aggregation — all attendance metrics in one pass
  const scorecardSql = `SELECT
      -- Unique prospects (first calls only)
      COUNT(CASE WHEN calls_call_type = 'First Call' THEN 1 END) as prospect_scheduled,
      COUNT(CASE WHEN calls_call_type = 'First Call' AND calls_attendance = 'Show' THEN 1 END) as prospect_held,
      -- Total calls
      COUNT(*) as total_scheduled,
      COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END) as total_held,
      -- First calls
      COUNT(CASE WHEN calls_call_type = 'First Call' THEN 1 END) as first_scheduled,
      COUNT(CASE WHEN calls_call_type = 'First Call' AND calls_attendance = 'Show' THEN 1 END) as first_held,
      -- Follow ups
      COUNT(CASE WHEN calls_call_type = 'Follow Up' THEN 1 END) as followup_scheduled,
      COUNT(CASE WHEN calls_call_type = 'Follow Up' AND calls_attendance = 'Show' THEN 1 END) as followup_held,
      -- Show rates
      SAFE_DIVIDE(COUNT(CASE WHEN calls_call_type = 'First Call' AND calls_attendance = 'Show' THEN 1 END),
                  COUNT(CASE WHEN calls_call_type = 'First Call' THEN 1 END)) as prospect_show_rate,
      SAFE_DIVIDE(COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END), COUNT(*)) as total_show_rate,
      SAFE_DIVIDE(COUNT(CASE WHEN calls_call_type = 'First Call' AND calls_attendance = 'Show' THEN 1 END),
                  COUNT(CASE WHEN calls_call_type = 'First Call' THEN 1 END)) as first_show_rate,
      SAFE_DIVIDE(COUNT(CASE WHEN calls_call_type = 'Follow Up' AND calls_attendance = 'Show' THEN 1 END),
                  COUNT(CASE WHEN calls_call_type = 'Follow Up' THEN 1 END)) as followup_show_rate,
      -- Not taken breakdown
      COUNT(CASE WHEN calls_attendance != 'Show' THEN 1 END) as not_taken,
      COUNT(CASE WHEN calls_attendance = 'Ghosted' THEN 1 END) as ghosted,
      COUNT(CASE WHEN calls_attendance = 'Canceled' THEN 1 END) as cancelled,
      COUNT(CASE WHEN calls_attendance = 'Rescheduled' THEN 1 END) as rescheduled,
      COUNT(CASE WHEN calls_attendance = 'Not Pitched' THEN 1 END) as not_pitched,
      COUNT(CASE WHEN calls_attendance = 'Overbooked' THEN 1 END) as overbooked,
      -- Active follow-ups (follow-up scheduled, not yet held, outcome is null or pending)
      COUNT(CASE WHEN calls_call_type = 'Follow Up' AND calls_attendance IS NULL THEN 1 END) as active_followup,
      COUNT(CASE WHEN calls_attendance IS NULL THEN 1 END) as not_yet_held,
      -- Lost revenue inputs
      SAFE_DIVIDE(COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END),
                  COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END)) as show_close_rate,
      SAFE_DIVIDE(
        SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_revenue_generated AS FLOAT64) ELSE 0 END),
        COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END)
      ) as avg_deal_size
    FROM ${VIEW} ${where}`;

  // 2) Time-series: scheduled vs held, first/followup show rates
  const tsSql = `SELECT
      ${tb} as bucket,
      COUNT(*) as scheduled,
      COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END) as held,
      COUNT(CASE WHEN calls_attendance = 'Ghosted' THEN 1 END) as ghosted,
      COUNT(CASE WHEN calls_attendance = 'Canceled' THEN 1 END) as cancelled,
      COUNT(CASE WHEN calls_attendance = 'Rescheduled' THEN 1 END) as rescheduled,
      SAFE_DIVIDE(COUNT(CASE WHEN calls_call_type = 'First Call' AND calls_attendance = 'Show' THEN 1 END),
                  COUNT(CASE WHEN calls_call_type = 'First Call' THEN 1 END)) as first_call_rate,
      SAFE_DIVIDE(COUNT(CASE WHEN calls_call_type = 'Follow Up' AND calls_attendance = 'Show' THEN 1 END),
                  COUNT(CASE WHEN calls_call_type = 'Follow Up' THEN 1 END)) as followup_rate,
      COUNT(CASE WHEN calls_call_type = 'First Call' AND calls_attendance = 'Show' THEN 1 END) as first_held,
      COUNT(CASE WHEN calls_call_type = 'Follow Up' AND calls_attendance = 'Show' THEN 1 END) as followup_held
    FROM ${VIEW} ${where}
    GROUP BY bucket ORDER BY bucket`;

  // 3) Per-closer (insight+ only)
  const closerSql = isInsightPlus ? `SELECT
      closers_name as closer_name,
      COUNT(*) as total,
      COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END) as show_count,
      COUNT(CASE WHEN calls_attendance = 'Ghosted' THEN 1 END) as ghosted,
      COUNT(CASE WHEN calls_attendance = 'Canceled' THEN 1 END) as cancelled,
      COUNT(CASE WHEN calls_attendance = 'Rescheduled' THEN 1 END) as rescheduled,
      COUNT(CASE WHEN calls_attendance = 'Not Pitched' THEN 1 END) as not_pitched,
      SAFE_DIVIDE(COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END), COUNT(*)) as show_pct
    FROM ${VIEW} ${where}
    GROUP BY closers_name ORDER BY show_pct DESC` : null;

  const queries = [
    bq.runQuery(scorecardSql, params),
    bq.runQuery(tsSql, params),
  ];
  if (closerSql) queries.push(bq.runQuery(closerSql, params));

  const results = await runParallel(queries);
  const sc = (results[0] && results[0][0]) || {};
  const ts = results[1] || [];
  const cl = results[2] || [];

  const notTaken = num(sc.not_taken);
  const ghosted = num(sc.ghosted);
  const cancelled = num(sc.cancelled);
  const rescheduled = num(sc.rescheduled);
  const notTakenCount = notTaken;
  const totalScheduled = num(sc.total_scheduled);
  const showCloseRate = rate(sc.show_close_rate);
  const avgDealSize = num(sc.avg_deal_size);

  const timeData = ts.map(r => ({
    date: r.bucket ? r.bucket.value : r.bucket,
    scheduled: num(r.scheduled),
    held: num(r.held),
    ghosted: num(r.ghosted),
    cancelled: num(r.cancelled),
    rescheduled: num(r.rescheduled),
    firstCallRate: rate(r.first_call_rate),
    followUpRate: rate(r.followup_rate),
    firstHeld: num(r.first_held),
    followUpHeld: num(r.followup_held),
  }));

  const result = {
    sections: {
      uniqueProspects: {
        scheduled: { value: num(sc.prospect_scheduled), label: 'Scheduled', format: 'number' },
        held: { value: num(sc.prospect_held), label: 'Held', format: 'number' },
        showRate: { value: rate(sc.prospect_show_rate), label: 'Show Rate', format: 'percent' },
      },
      totalCalls: {
        scheduled: { value: totalScheduled, label: 'Scheduled', format: 'number' },
        held: { value: num(sc.total_held), label: 'Held', format: 'number' },
        showRate: { value: rate(sc.total_show_rate), label: 'Show Rate', format: 'percent' },
      },
      firstCalls: {
        scheduled: { value: num(sc.first_scheduled), label: 'Scheduled', format: 'number' },
        held: { value: num(sc.first_held), label: 'Held', format: 'number' },
        showRate: { value: rate(sc.first_show_rate), label: 'Show Rate', format: 'percent' },
      },
      followUpCalls: {
        scheduled: { value: num(sc.followup_scheduled), label: 'Scheduled', format: 'number' },
        held: { value: num(sc.followup_held), label: 'Held', format: 'number' },
        showRate: { value: rate(sc.followup_show_rate), label: 'Show Rate', format: 'percent' },
      },
      activeFollowUp: { value: num(sc.active_followup), label: 'Active Follow Up', format: 'number' },
      notYetHeld: { value: num(sc.not_yet_held), label: 'Not Yet Held', format: 'number' },
      callsNotTaken: {
        notTaken: { value: notTakenCount, label: 'Not Taken', format: 'number' },
        notTakenPct: { value: totalScheduled > 0 ? notTakenCount / totalScheduled : 0, label: '% Not Taken', format: 'percent' },
        ghosted: { value: ghosted, label: '# Ghosted', format: 'number' },
        ghostedPct: { value: notTakenCount > 0 ? ghosted / notTakenCount : 0, label: '% Ghosted', format: 'percent' },
        cancelled: { value: cancelled, label: '# Canceled', format: 'number' },
        cancelledPct: { value: notTakenCount > 0 ? cancelled / notTakenCount : 0, label: '% Canceled', format: 'percent' },
        rescheduled: { value: rescheduled, label: '# Rescheduled', format: 'number' },
        rescheduledPct: { value: notTakenCount > 0 ? rescheduled / notTakenCount : 0, label: '% Rescheduled', format: 'percent' },
      },
      lostRevenue: {
        notTaken: { value: notTakenCount, label: 'Not Taken', format: 'number' },
        showCloseRate: { value: showCloseRate, label: 'Show > Close Rate', format: 'percent' },
        avgDealSize: { value: avgDealSize, label: 'Average Deal Size', format: 'currency' },
        lostPotential: { value: Math.round(notTakenCount * showCloseRate * avgDealSize), label: 'Lost Potential Revenue', format: 'currency' },
      },
    },
    charts: {
      scheduledVsHeld: {
        type: 'line', label: 'Scheduled vs Held',
        series: [
          { key: 'scheduled', label: 'Scheduled', color: 'amber' },
          { key: 'held', label: 'Held', color: 'red' },
        ],
        data: timeData,
      },
      firstFollowUpShowRate: {
        type: 'line', label: 'First Call / Follow Up Show Rate',
        series: [
          { key: 'firstCallRate', label: 'First Call Show Rate', color: 'green' },
          { key: 'followUpRate', label: 'Follow Up Show Rate', color: 'purple' },
        ],
        data: timeData,
      },
      attendanceBreakdown: {
        type: 'pie', label: 'Attendance Breakdown',
        data: [
          { label: 'Show', value: num(sc.total_held), color: 'green' },
          { label: 'Ghosted', value: ghosted, color: 'amber' },
          { label: 'Rescheduled', value: rescheduled, color: 'purple' },
          { label: 'Overbooked', value: num(sc.overbooked), color: 'blue' },
          { label: 'Not Pitched', value: num(sc.not_pitched), color: 'red' },
        ].filter(d => d.value > 0),
      },
      notTakenBreakdown: {
        type: 'bar', label: 'Not Taken Breakdown',
        series: [
          { key: 'ghosted', label: '# Ghosted', color: 'amber' },
          { key: 'cancelled', label: 'Canceled', color: 'red' },
          { key: 'rescheduled', label: 'Rescheduled', color: 'purple' },
        ],
        data: timeData,
      },
      notTakenReason: {
        type: 'pie', label: 'Not Taken Reason',
        data: [
          { label: 'Ghosted - No Show', value: ghosted, color: 'amber' },
          { label: 'Not Pitched', value: num(sc.not_pitched), color: 'red' },
          { label: 'Overbooked', value: num(sc.overbooked), color: 'purple' },
          { label: 'Rescheduled', value: rescheduled, color: 'blue' },
        ].filter(d => d.value > 0),
      },
      firstFollowUpsHeld: {
        type: 'bar', label: 'First / Follow Ups Held',
        series: [
          { key: 'firstHeld', label: 'First Calls Held', color: 'green' },
          { key: 'followUpHeld', label: 'Follow Ups Held', color: 'purple' },
        ],
        data: timeData,
      },
    },
  };

  // Per-closer charts (Insight+ only)
  if (isInsightPlus && cl.length > 0) {
    result.charts.showRatePerCloser = {
      type: 'bar', label: 'Show Rate per Closer',
      series: [{ key: 'showPct', label: 'Show %', color: 'cyan' }],
      data: cl.map(r => ({ label: r.closer_name, showPct: rate(r.show_pct) })),
    };
    result.charts.attendancePerCloser = {
      type: 'bar', label: 'Attendance per Closer',
      series: [
        { key: 'show', label: 'Show', color: 'green' },
        { key: 'ghosted', label: 'Ghosted', color: 'amber' },
        { key: 'cancelled', label: 'Cancelled', color: 'red' },
        { key: 'rescheduled', label: 'Rescheduled', color: 'purple' },
        { key: 'notPitched', label: 'Not Pitched', color: 'magenta' },
      ],
      data: cl.map(r => ({
        label: r.closer_name,
        show: num(r.show_count),
        ghosted: num(r.ghosted),
        cancelled: num(r.cancelled),
        rescheduled: num(r.rescheduled),
        notPitched: num(r.not_pitched),
      })).sort((a, b) => (b.show + b.ghosted + b.cancelled) - (a.show + a.ghosted + a.cancelled)),
    };
  }

  return result;
}

// ================================================================
// DEMO DATA -- Realistic sample data for development and demos
// ================================================================

function getDemoData(tier = 'insight', filters = {}) {
  const closerNames = ['Ross Gheller', 'Monica Gheller', 'Joey Tribianni', 'Chandler Bing', 'Phoebe Buffay', 'Tyler Ray'];

  const result = {
    sections: {
      // ── Scorecard grid: 4 columns × 3 rows ──
      // Each column is a metric category, each row is Scheduled/Held/Show Rate
      uniqueProspects: {
        scheduled: { value: 3407, label: 'Scheduled', format: 'number' },
        held: { value: 2355, label: 'Held', format: 'number' },
        showRate: { value: 0.691, label: 'Show Rate', format: 'percent' },
      },
      totalCalls: {
        scheduled: { value: 3785, label: 'Scheduled', format: 'number' },
        held: { value: 2516, label: 'Held', format: 'number' },
        showRate: { value: 0.665, label: 'Show Rate', format: 'percent' },
      },
      firstCalls: {
        scheduled: { value: 3261, label: 'Scheduled', format: 'number' },
        held: { value: 2169, label: 'Held', format: 'number' },
        showRate: { value: 0.665, label: 'Show Rate', format: 'percent' },
      },
      followUpCalls: {
        scheduled: { value: 360, label: 'Scheduled', format: 'number' },
        held: { value: 251, label: 'Held', format: 'number' },
        showRate: { value: 0.697, label: 'Show Rate', format: 'percent' },
      },
      // ── Standalone metrics ──
      activeFollowUp: { value: 88, label: 'Active Follow Up', format: 'number' },
      notYetHeld: { value: 0, label: 'Not Yet Held', format: 'number' },

      // ── Calls Not Taken section ──
      callsNotTaken: {
        notTaken:       { value: 1208, label: 'Not Taken',      format: 'number' },
        notTakenPct:    { value: 0.319, label: '% Not Taken',   format: 'percent' },
        ghosted:        { value: 1037, label: '# Ghosted',      format: 'number' },
        ghostedPct:     { value: 0.858, label: '% Ghosted',     format: 'percent' },
        cancelled:      { value: 140,  label: '# Canceled',     format: 'number' },
        cancelledPct:   { value: 0.116, label: '% Canceled',    format: 'percent' },
        rescheduled:    { value: 31,   label: '# Rescheduled',  format: 'number' },
        rescheduledPct: { value: 0.026, label: '% Rescheduled', format: 'percent' },
      },

      // ── Lost Revenue calculation inputs ──
      lostRevenue: {
        notTaken:     { value: 1208, label: 'Not Taken',          format: 'number' },
        showCloseRate:{ value: 0.16, label: 'Show > Close Rate',  format: 'percent' },
        avgDealSize:  { value: 6571, label: 'Average Deal Size',  format: 'currency' },
        lostPotential:{ value: 1269581, label: 'Lost Potential Revenue', format: 'currency' },
      },
    },

    charts: {
      // ── Chart 1: Scheduled vs Held (line — counts over time) ──
      scheduledVsHeld: {
        type: 'line',
        label: 'Scheduled vs Held',
        series: [
          { key: 'scheduled', label: 'Scheduled', color: 'amber' },
          { key: 'held', label: 'Held', color: 'red' },
        ],
        data: generateTimeSeries(filters, [
          { key: 'scheduled', base: 65, variance: 18 },
          { key: 'held', base: 40, variance: 12 },
        ]),
      },

      // ── Chart 2: First Call / Follow Up Show Rate (line) ──
      firstFollowUpShowRate: {
        type: 'line',
        label: 'First Call / Follow Up Show Rate',
        series: [
          { key: 'firstCallRate', label: 'First Call Show Rate', color: 'green' },
          { key: 'followUpRate', label: 'Follow Up Show Rate', color: 'purple' },
        ],
        data: generateTimeSeries(filters, [
          { key: 'firstCallRate', base: 0.665, variance: 0.12 },
          { key: 'followUpRate', base: 0.70, variance: 0.15 },
        ]),
      },

      // ── Chart 3: Attendance Breakdown (donut) ──
      attendanceBreakdown: {
        type: 'pie',
        label: 'Attendance Breakdown',
        data: [
          { label: 'Show', value: 2516, color: NEON_HEX.green },
          { label: 'Ghosted', value: 1037, color: NEON_HEX.amber },
          { label: 'Rescheduled', value: 31, color: NEON_HEX.purple },
          { label: 'Overbooked', value: 120, color: NEON_HEX.blue },
          { label: 'Not Pitched', value: 80, color: NEON_HEX.red },
        ],
      },

      // ── Chart 4: Not Taken Breakdown (stacked bar over time) ──
      notTakenBreakdown: {
        type: 'bar',
        label: 'Not Taken Breakdown',
        series: [
          { key: 'ghosted', label: '# Ghosted', color: 'amber' },
          { key: 'cancelled', label: 'Canceled', color: 'red' },
          { key: 'rescheduled', label: 'Rescheduled', color: NEON_HEX.purple },
        ],
        data: generateTimeSeries(filters, [
          { key: 'ghosted', base: 18, variance: 8 },
          { key: 'cancelled', base: 3, variance: 2 },
          { key: 'rescheduled', base: 1, variance: 1 },
        ]),
      },

      // ── Chart 5: Not Taken Reason (donut) ──
      notTakenReason: {
        type: 'pie',
        label: 'Not Taken Reason',
        data: [
          { label: 'Ghosted - No Show', value: 1037, color: NEON_HEX.amber },
          { label: 'Not Pitched',       value: 80,   color: NEON_HEX.red },
          { label: 'Overbooked',        value: 60,   color: NEON_HEX.purple },
          { label: 'Rescheduled',       value: 31,   color: NEON_HEX.blue },
        ],
      },

      // ── Chart 6: First Held / Follow Up Held (stacked bar over time) ──
      firstFollowUpsHeld: {
        type: 'bar',
        label: 'First / Follow Ups Held',
        series: [
          { key: 'firstHeld', label: 'First Calls Held', color: 'green' },
          { key: 'followUpHeld', label: 'Follow Ups Held', color: 'purple' },
        ],
        data: generateTimeSeries(filters, [
          { key: 'firstHeld', base: 35, variance: 12 },
          { key: 'followUpHeld', base: 5, variance: 3 },
        ]),
      },
    },
  };

  // ── Per-closer charts (Insight+ only) ──
  const isInsightPlus = tier === 'insight' || tier === 'executive';
  if (isInsightPlus) {
    // Chart 5: Show Rate per Closer (horizontal bar)
    result.charts.showRatePerCloser = {
      type: 'bar',
      label: 'Show Rate per Closer',
      series: [{ key: 'showPct', label: 'Show %', color: 'cyan' }],
      data: closerNames.map((name) => ({
        label: name,
        showPct: 0.45 + Math.random() * 0.25,
      })).sort((a, b) => b.showPct - a.showPct),
    };

    // Chart 6: Attendance per Closer (stacked bar)
    result.charts.attendancePerCloser = {
      type: 'bar',
      label: 'Attendance per Closer',
      series: [
        { key: 'show', label: 'Show', color: 'green' },
        { key: 'ghosted', label: 'Ghosted', color: 'amber' },
        { key: 'cancelled', label: 'Cancelled', color: 'red' },
        { key: 'rescheduled', label: 'Rescheduled', color: NEON_HEX.purple },
        { key: 'notPitched', label: 'Not Pitched', color: 'magenta' },
      ],
      data: closerNames.map((name) => {
        const total = 300 + Math.floor(Math.random() * 500);
        const show = Math.floor(total * (0.55 + Math.random() * 0.15));
        const ghosted = Math.floor(total * (0.15 + Math.random() * 0.10));
        const cancelled = Math.floor(total * (0.03 + Math.random() * 0.04));
        const rescheduled = Math.floor(total * (0.01 + Math.random() * 0.02));
        const notPitched = total - show - ghosted - cancelled - rescheduled;
        return { label: name, show, ghosted, cancelled, rescheduled, notPitched: Math.max(0, notPitched) };
      }).sort((a, b) => {
        const totalA = a.show + a.ghosted + a.cancelled + a.rescheduled + a.notPitched;
        const totalB = b.show + b.ghosted + b.cancelled + b.rescheduled + b.notPitched;
        return totalB - totalA;
      }),
    };
  }

  return result;
}

module.exports = { getAttendanceData };
