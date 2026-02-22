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

/**
 * Fetch all attendance data for a client.
 *
 * @param {string} clientId - Client ID for data isolation
 * @param {object} filters - { dateStart, dateEnd, closerId }
 * @param {string} tier - Client's plan tier
 * @returns {Promise<object>} { sections, charts }
 */
async function getAttendanceData(clientId, filters = {}, tier = 'insight') {
  if (!bq.isAvailable()) {
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
 * Placeholder -- will be filled with actual SQL when BQ credentials are available.
 */
async function queryBigQuery(clientId, filters, tier) {
  // TODO: Real BQ queries when credentials available
  return getDemoData(tier, filters);
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
          { label: 'Show', value: 2516, color: '#6BCF7F' },
          { label: 'Ghosted', value: 1037, color: '#FFD93D' },
          { label: 'Rescheduled', value: 31, color: '#FF8C00' },
          { label: 'Overbooked', value: 120, color: '#B84DFF' },
          { label: 'Not Pitched', value: 80, color: '#FF4D6D' },
        ],
      },

      // ── Chart 4: Not Taken Breakdown (stacked bar over time) ──
      notTakenBreakdown: {
        type: 'bar',
        label: 'Not Taken Breakdown',
        series: [
          { key: 'ghosted', label: '# Ghosted', color: 'amber' },
          { key: 'cancelled', label: 'Canceled', color: 'red' },
          { key: 'rescheduled', label: 'Rescheduled', color: '#FF8C00' },
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
          { label: 'Ghosted - No Show', value: 1037, color: '#FFD93D' },
          { label: 'Not Pitched',       value: 80,   color: '#FF4D6D' },
          { label: 'Overbooked',        value: 60,   color: '#B84DFF' },
          { label: 'Rescheduled',       value: 31,   color: '#FF8C00' },
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
        { key: 'rescheduled', label: 'Rescheduled', color: '#FF8C00' },
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
