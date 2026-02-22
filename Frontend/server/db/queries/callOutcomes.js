/**
 * CALL OUTCOMES PAGE QUERIES — 7-Section Layout
 *
 * Sections:
 *   1. Health at a Glance — overall outcome scorecards + distribution
 *   2. Closed - Won — first-call vs follow-up close breakdown
 *   3. Deposits — deposit pipeline and conversion
 *   4. Follow Up — follow-up volume and show rates
 *   5. Lost — lost breakdown by call type + reasons
 *   6. Disqualified — DQ counts and rates
 *   7. Not Pitched — not-pitched counts and rates
 *
 * Each section returns scorecards (with delta + deltaLabel) and charts.
 * Per-closer charts are omitted for Basic tier.
 *
 * Data: GET /api/dashboard/call-outcomes
 */

const bq = require('../BigQueryClient');
const logger = require('../../utils/logger');
const { generateTimeSeries } = require('./demoTimeSeries');

// Mirror client/src/theme/constants.js COLORS.neon — single source for pie chart hex values
const NEON = {
  cyan:    '#4DD4E8',
  green:   '#6BCF7F',
  amber:   '#FFD93D',
  red:     '#FF4D6D',
  purple:  '#B84DFF',
  blue:    '#4D7CFF',
  muted:   '#64748b',
};

/**
 * Fetch all call outcomes data for a client.
 *
 * @param {string} clientId - Client ID for data isolation
 * @param {object} filters - { dateStart, dateEnd, closerId }
 * @param {string} tier - Client's plan tier
 * @returns {Promise<object>} { sections, charts }
 */
async function getCallOutcomesData(clientId, filters = {}, tier = 'insight') {
  if (!bq.isAvailable()) {
    logger.debug('Returning demo call outcomes data');
    return getDemoData(tier, filters);
  }

  try {
    return await queryBigQuery(clientId, filters, tier);
  } catch (err) {
    logger.error('Call outcomes BQ query failed, falling back to demo', {
      error: err.message,
      clientId,
    });
    return getDemoData(tier, filters);
  }
}

/**
 * Run real BigQuery queries for call outcomes data.
 * Placeholder — will be filled with actual SQL when BQ credentials are available.
 */
async function queryBigQuery(clientId, filters, tier) {
  // TODO: Real BQ queries when credentials available
  return getDemoData(tier, filters);
}

// ================================================================
// DEMO DATA — Realistic sample data for development and demos
// ================================================================

function getDemoData(tier = 'insight', filters = {}) {
  const closerNames = ['Ross Gheller', 'Monica Gheller', 'Joey Tribianni', 'Chandler Bing', 'Phoebe Buffay', 'Tyler Ray'];
  const isInsightPlus = tier === 'insight' || tier === 'executive';

  const result = {
    sections: {
      // ── Section 1: Health at a Glance ──
      // 6 outcome columns, each with count + pctOfTotal + closeRate (where applicable)
      // Total outcome calls = 414 + 91 + 829 + 1197 + 108 + 92 = 2731
      health: {
        closes: {
          count:      { value: 414,   delta: 8.2,  deltaLabel: 'vs prev period' },
          pctOfTotal: { value: 0.152 },
          closeRate:  { value: 0.164, delta: 3.1,  deltaLabel: 'vs prev period' },
        },
        deposits: {
          count:      { value: 91,    delta: 5.5,  deltaLabel: 'vs prev period' },
          pctOfTotal: { value: 0.033 },
          closeRate:  { value: 0.154, delta: -2.3, deltaLabel: 'vs prev period' },
        },
        followUps: {
          count:      { value: 829,   delta: 12.0, deltaLabel: 'vs prev period' },
          pctOfTotal: { value: 0.304 },
          closeRate:  { value: 0.119, delta: 1.8,  deltaLabel: 'vs prev period' },
        },
        lost: {
          count:      { value: 1197,  delta: -1.5, deltaLabel: 'vs prev period' },
          pctOfTotal: { value: 0.438 },
        },
        disqualified: {
          count:      { value: 108,   delta: -4.1, deltaLabel: 'vs prev period' },
          pctOfTotal: { value: 0.040 },
        },
        notPitched: {
          count:      { value: 92,    delta: -6.3, deltaLabel: 'vs prev period' },
          pctOfTotal: { value: 0.034 },
        },
      },

      // ── Section 2: Closed - Won ──
      closedWon: {
        firstCallCloses:    { value: 352,   delta: 6.8,  deltaLabel: 'vs prev period' },
        firstCallCloseRate: { value: 0.161, delta: 2.4,  deltaLabel: 'vs prev period' },
        followUpCloses:     { value: 62,    delta: 14.2, deltaLabel: 'vs prev period' },
        followUpCloseRate:  { value: 0.171, delta: 4.5,  deltaLabel: 'vs prev period' },
      },

      // ── Section 3: Deposits ──
      deposits: {
        depositsTaken:      { value: 91,    delta: 5.5,  deltaLabel: 'vs prev period' },
        depositClosedPct:   { value: 0.154, delta: -2.3, deltaLabel: 'vs prev period' },
        depositsLost:       { value: 23,    delta: -8.1, deltaLabel: 'vs prev period' },
        depositsStillOpen:  { value: 14,    delta: 3.2,  deltaLabel: 'vs prev period' },
      },

      // ── Section 4: Follow Up ──
      followUp: {
        scheduled:       { value: 360,   delta: 12.0, deltaLabel: 'vs prev period' },
        held:            { value: 251,   delta: 9.3,  deltaLabel: 'vs prev period' },
        showRate:        { value: 0.697, delta: -1.2, deltaLabel: 'vs prev period' },
        stillInFollowUp: { value: 87,    delta: 6.4,  deltaLabel: 'vs prev period' },
      },

      // ── Section 5: Lost ──
      lost: {
        firstCallLost:     { value: 982,   delta: -2.1, deltaLabel: 'vs prev period' },
        firstCallLostRate: { value: 0.450, delta: -3.5, deltaLabel: 'vs prev period' },
        followUpLost:      { value: 215,   delta: 1.8,  deltaLabel: 'vs prev period' },
        followUpLostRate:  { value: 0.597, delta: 2.2,  deltaLabel: 'vs prev period' },
      },

      // ── Section 6: Disqualified ──
      disqualified: {
        firstCallDQ:     { value: 108,   delta: -4.1, deltaLabel: 'vs prev period' },
        firstCallDQRate: { value: 0.043, delta: -1.9, deltaLabel: 'vs prev period' },
      },

      // ── Section 7: Not Pitched ──
      notPitched: {
        notPitched:     { value: 92,    delta: -6.3, deltaLabel: 'vs prev period' },
        notPitchedRate: { value: 0.036, delta: -2.8, deltaLabel: 'vs prev period' },
      },
    },

    charts: {
      // ── Section 1: Health ──
      outcomeBreakdown: {
        type: 'pie',
        label: 'Call Outcomes Distribution',
        data: [
          { label: 'Closed - Won', value: 414,  color: NEON.green },
          { label: 'Deposit',      value: 91,   color: NEON.amber },
          { label: 'Follow Up',    value: 829,  color: NEON.purple },
          { label: 'Lost',         value: 1197, color: NEON.red },
          { label: 'Disqualified', value: 108,  color: NEON.muted },
          { label: 'Not Pitched',  value: 92,   color: NEON.blue },
        ],
      },

      outcomesOverTime: {
        type: 'line',
        label: 'Outcomes Over Time',
        series: [
          { key: 'closed',       label: 'Closed',       color: 'green' },
          { key: 'deposit',      label: 'Deposit',       color: 'amber' },
          { key: 'followUp',     label: 'Follow Up',     color: 'purple' },
          { key: 'lost',         label: 'Lost',          color: 'red' },
          { key: 'disqualified', label: 'Disqualified',  color: 'muted' },
          { key: 'notPitched',   label: 'Not Pitched',   color: 'blue' },
        ],
        data: generateTimeSeries(filters, [
          { key: 'closed',       base: 8,  variance: 4 },
          { key: 'deposit',      base: 2,  variance: 2 },
          { key: 'followUp',     base: 16, variance: 6 },
          { key: 'lost',         base: 22, variance: 8 },
          { key: 'disqualified', base: 2,  variance: 2 },
          { key: 'notPitched',   base: 2,  variance: 2 },
        ]),
      },

      outcomeByCloser: {
        type: 'bar',
        label: 'Call Outcome by Closer',
        series: [
          { key: 'closed',       label: 'Closed',       color: 'green' },
          { key: 'deposit',      label: 'Deposit',      color: 'amber' },
          { key: 'followUp',     label: 'Follow Up',    color: 'purple' },
          { key: 'lost',         label: 'Lost',         color: 'red' },
          { key: 'disqualified', label: 'Disqualified', color: 'muted' },
          { key: 'notPitched',   label: 'Not Pitched',  color: 'blue' },
        ],
        data: closerNames.map((name) => ({
          label: name,
          closed: 40 + Math.floor(Math.random() * 40),
          deposit: 8 + Math.floor(Math.random() * 12),
          followUp: 80 + Math.floor(Math.random() * 80),
          lost: 120 + Math.floor(Math.random() * 80),
          disqualified: 8 + Math.floor(Math.random() * 15),
          notPitched: 5 + Math.floor(Math.random() * 15),
        })).sort((a, b) => {
          const totalA = a.closed + a.deposit + a.followUp + a.lost + a.disqualified + a.notPitched;
          const totalB = b.closed + b.deposit + b.followUp + b.lost + b.disqualified + b.notPitched;
          return totalB - totalA;
        }),
      },

      // ── Section 2: Closed - Won ──
      closesOverTime: {
        type: 'bar',
        label: 'Closes Over Time',
        series: [
          { key: 'firstCall', label: 'First Call Closes',  color: 'green' },
          { key: 'followUp',  label: 'Follow-Up Closes',   color: 'purple' },
        ],
        data: generateTimeSeries(filters, [
          { key: 'firstCall', base: 7,  variance: 4 },
          { key: 'followUp',  base: 1,  variance: 1 },
        ]),
      },

      closeRateOverTime: {
        type: 'line',
        label: 'Close Rate Over Time',
        series: [
          { key: 'firstCallRate', label: 'First Call Close %', color: 'green' },
          { key: 'followUpRate',  label: 'Follow-Up Close %',  color: 'purple' },
        ],
        data: generateTimeSeries(filters, [
          { key: 'firstCallRate', base: 0.161, variance: 0.05 },
          { key: 'followUpRate',  base: 0.171, variance: 0.06 },
        ]),
      },

      closesByCloser: {
        type: 'bar',
        label: 'Closes by Closer',
        series: [
          { key: 'firstCall', label: 'First Call', color: 'green' },
          { key: 'followUp',  label: 'Follow-Up',  color: 'purple' },
        ],
        data: closerNames.map((name) => ({
          label: name,
          firstCall: 40 + Math.floor(Math.random() * 30),
          followUp: 5 + Math.floor(Math.random() * 12),
        })).sort((a, b) => (b.firstCall + b.followUp) - (a.firstCall + a.followUp)),
      },

      // Deals closed per closer by product — stacked horizontal bar
      // Series ordered by avg revenue per product (lowest avg revenue first / closest to left axis)
      closesByProduct: {
        type: 'bar',
        label: 'Deals Closed by Product',
        series: [
          { key: 'productA', label: 'Product A', color: 'green' },   // avg ~$3,000
          { key: 'productB', label: 'Product B', color: 'cyan' },    // avg ~$5,000
          { key: 'productC', label: 'Product C', color: 'amber' },   // avg ~$7,500
          { key: 'productD', label: 'Product D', color: 'purple' },  // avg ~$10,000
        ],
        data: closerNames.map((name) => ({
          label: name,
          productA: 8 + Math.floor(Math.random() * 12),
          productB: 5 + Math.floor(Math.random() * 10),
          productC: 3 + Math.floor(Math.random() * 8),
          productD: 1 + Math.floor(Math.random() * 5),
        })).sort((a, b) => {
          const totalA = a.productA + a.productB + a.productC + a.productD;
          const totalB = b.productA + b.productB + b.productC + b.productD;
          return totalB - totalA;
        }),
      },

      // ── Section 3: Deposits ──
      depositOutcomes: {
        type: 'pie',
        label: 'Deposit Outcomes',
        data: [
          { label: 'Closed',     value: 54, color: NEON.green },
          { label: 'Still Open', value: 14, color: NEON.amber },
          { label: 'Lost',       value: 23, color: NEON.red },
        ],
      },

      depositCloseByCloser: {
        type: 'bar',
        label: 'Deposit Close Rate by Closer',
        series: [{ key: 'depositCloseRate', label: 'Deposit Close %', color: 'amber' }],
        data: closerNames.map((name) => ({
          label: name,
          depositCloseRate: 0.10 + Math.random() * 0.20,
        })).sort((a, b) => b.depositCloseRate - a.depositCloseRate),
      },

      // ── Section 4: Follow Up ──
      followUpVolume: {
        type: 'line',
        label: 'Follow-Up Volume Over Time',
        series: [
          { key: 'scheduled', label: 'Scheduled', color: 'purple' },
          { key: 'held',      label: 'Held',      color: 'cyan' },
        ],
        data: generateTimeSeries(filters, [
          { key: 'scheduled', base: 7, variance: 3 },
          { key: 'held',      base: 5, variance: 3 },
        ]),
      },

      followUpOutcomes: {
        type: 'pie',
        label: 'Follow-Up Outcomes',
        data: [
          { label: 'Closed',        value: 62,  color: NEON.green },
          { label: 'Still Open',    value: 87,  color: NEON.purple },
          { label: 'Lost',          value: 215, color: NEON.red },
          { label: 'No Show',       value: 109, color: NEON.muted },
        ],
      },

      followUpOutcomeByCloser: {
        type: 'bar',
        label: 'Follow-Up Outcome by Closer',
        series: [
          { key: 'closed',    label: 'Closed',     color: 'green' },
          { key: 'stillOpen', label: 'Still Open',  color: 'purple' },
          { key: 'lost',      label: 'Lost',        color: 'red' },
          { key: 'noShow',    label: 'No Show',     color: 'cyan' },
        ],
        data: closerNames.map((name) => ({
          label: name,
          closed: 5 + Math.floor(Math.random() * 12),
          stillOpen: 8 + Math.floor(Math.random() * 15),
          lost: 20 + Math.floor(Math.random() * 25),
          noShow: 10 + Math.floor(Math.random() * 15),
        })).sort((a, b) => (b.closed + b.stillOpen + b.lost + b.noShow) - (a.closed + a.stillOpen + a.lost + a.noShow)),
      },

      // ── Section 5: Lost ──
      lostOverTime: {
        type: 'line',
        label: 'Lost Calls Over Time',
        series: [
          { key: 'firstCall', label: 'First Call Lost', color: 'red' },
          { key: 'followUp',  label: 'Follow-Up Lost',  color: 'amber' },
        ],
        data: generateTimeSeries(filters, [
          { key: 'firstCall', base: 18, variance: 8 },
          { key: 'followUp',  base: 4,  variance: 3 },
        ]),
      },

      lostReasons: {
        type: 'pie',
        label: 'Lost Reasons',
        data: [
          { label: "Can't Afford",   value: 493, color: NEON.amber },
          { label: 'Closer Error',   value: 491, color: NEON.red },
          { label: 'Not Interested', value: 57,  color: NEON.cyan },
          { label: 'Timing',         value: 108, color: NEON.purple },
          { label: 'Other',          value: 48,  color: NEON.muted },
        ],
      },

      lostRateByCloser: {
        type: 'bar',
        label: 'Lost Rate by Closer',
        series: [
          { key: 'firstCallLostRate', label: 'First Call Lost %', color: 'red' },
          { key: 'followUpLostRate',  label: 'Follow-Up Lost %',  color: 'amber' },
        ],
        data: closerNames.map((name) => ({
          label: name,
          firstCallLostRate: 0.30 + Math.random() * 0.25,
          followUpLostRate: 0.40 + Math.random() * 0.25,
        })).sort((a, b) => (a.firstCallLostRate + a.followUpLostRate) - (b.firstCallLostRate + b.followUpLostRate)),
      },

      lostReasonsByCloser: {
        type: 'bar',
        label: 'Lost Reasons by Closer',
        series: [
          { key: 'cantAfford',    label: "Can't Afford",   color: 'amber' },
          { key: 'closerError',   label: 'Closer Error',   color: 'red' },
          { key: 'notInterested', label: 'Not Interested',  color: 'cyan' },
          { key: 'other',         label: 'Other',           color: 'purple' },
        ],
        data: closerNames.map((name) => ({
          label: name,
          cantAfford: 30 + Math.floor(Math.random() * 60),
          closerError: 25 + Math.floor(Math.random() * 55),
          notInterested: 3 + Math.floor(Math.random() * 12),
          other: 2 + Math.floor(Math.random() * 10),
        })).sort((a, b) => (a.cantAfford + a.closerError + a.notInterested + a.other) - (b.cantAfford + b.closerError + b.notInterested + b.other)),
      },

      // ── Section 6: Disqualified ──
      dqOverTime: {
        type: 'line',
        label: 'DQ Over Time',
        series: [
          { key: 'dqCount', label: 'Disqualified', color: 'muted' },
        ],
        data: generateTimeSeries(filters, [
          { key: 'dqCount', base: 2, variance: 2 },
        ]),
      },

      dqByCloser: {
        type: 'bar',
        label: 'DQ Rate by Closer',
        series: [{ key: 'dqRate', label: 'DQ Rate', color: 'muted' }],
        data: closerNames.map((name) => ({
          label: name,
          dqRate: 0.02 + Math.random() * 0.06,
        })).sort((a, b) => b.dqRate - a.dqRate),
      },

      // ── Section 7: Not Pitched ──
      notPitchedOverTime: {
        type: 'line',
        label: 'Not Pitched Over Time',
        series: [
          { key: 'notPitched', label: 'Not Pitched', color: 'blue' },
        ],
        data: generateTimeSeries(filters, [
          { key: 'notPitched', base: 2, variance: 2 },
        ]),
      },

      notPitchedByCloser: {
        type: 'bar',
        label: 'Not Pitched by Closer',
        series: [{ key: 'notPitchedRate', label: 'Not Pitched Rate', color: 'blue' }],
        data: closerNames.map((name) => ({
          label: name,
          notPitchedRate: 0.01 + Math.random() * 0.06,
        })).sort((a, b) => b.notPitchedRate - a.notPitchedRate),
      },
    },
  };

  // ── Per-closer charts (Insight+ only) ──
  if (!isInsightPlus) {
    delete result.charts.outcomeByCloser;
    delete result.charts.closesByCloser;
    delete result.charts.closesByProduct;
    delete result.charts.depositCloseByCloser;
    delete result.charts.followUpOutcomeByCloser;
    delete result.charts.lostRateByCloser;
    delete result.charts.lostReasonsByCloser;
    delete result.charts.dqByCloser;
    delete result.charts.notPitchedByCloser;
  }

  return result;
}

module.exports = { getCallOutcomesData };
