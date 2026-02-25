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
const { OUTCOMES, ATTENDANCE, CALL_TYPES } = require('../../../shared/callValues');
const { OUTCOME_COLORS, LOST_REASON_COLORS } = require('../../../shared/categoryValues');
const { OUTCOME_CHART_CONFIG, LOST_REASON_CHART_CONFIG, NEON_HEX } = require('../../../shared/chartMappings');

/**
 * Fetch all call outcomes data for a client.
 *
 * @param {string} clientId - Client ID for data isolation
 * @param {object} filters - { dateStart, dateEnd, closerId }
 * @param {string} tier - Client's plan tier
 * @returns {Promise<object>} { sections, charts }
 */
async function getCallOutcomesData(clientId, filters = {}, tier = 'insight') {
  if (!bq.isAvailable() || clientId.startsWith('demo_')) {
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
 * Runs 3 queries in parallel: scorecard, time-series, per-closer.
 */
async function queryBigQuery(clientId, filters, tier) {
  const { buildQueryContext, timeBucket, runParallel, num, rate, VIEW } = require('./helpers');
  const { params, where } = buildQueryContext(clientId, filters, tier);
  const tb = timeBucket();
  const isInsightPlus = tier === 'insight' || tier === 'executive';

  // 1) Scorecard: all outcome counts and rates
  const scorecardSql = `SELECT
      -- Health at a glance
      COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END) as held,
      COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END) as closes,
      COUNT(CASE WHEN calls_call_outcome = 'Deposit' THEN 1 END) as deposits,
      COUNT(CASE WHEN calls_call_outcome = 'Follow Up' OR calls_call_outcome = 'Follow-Up' THEN 1 END) as follow_ups,
      COUNT(CASE WHEN calls_call_outcome = 'Lost' THEN 1 END) as lost,
      COUNT(CASE WHEN calls_call_outcome = 'Disqualified' THEN 1 END) as dq,
      COUNT(CASE WHEN calls_call_outcome = 'Not Pitched' THEN 1 END) as not_pitched,
      -- First call breakdowns
      COUNT(CASE WHEN calls_call_type = 'First Call' AND calls_call_outcome = 'Closed - Won' THEN 1 END) as first_closes,
      COUNT(CASE WHEN calls_call_type = 'First Call' AND calls_attendance = 'Show' THEN 1 END) as first_held,
      COUNT(CASE WHEN calls_call_type = 'First Call' THEN 1 END) as first_scheduled,
      COUNT(CASE WHEN calls_call_type = 'First Call' AND calls_call_outcome = 'Lost' THEN 1 END) as first_lost,
      COUNT(CASE WHEN calls_call_type = 'First Call' AND calls_call_outcome = 'Disqualified' THEN 1 END) as first_dq,
      -- Follow-up breakdowns
      COUNT(CASE WHEN calls_call_type = 'Follow Up' AND calls_call_outcome = 'Closed - Won' THEN 1 END) as followup_closes,
      COUNT(CASE WHEN calls_call_type = 'Follow Up' AND calls_attendance = 'Show' THEN 1 END) as followup_held,
      COUNT(CASE WHEN calls_call_type = 'Follow Up' THEN 1 END) as followup_scheduled,
      COUNT(CASE WHEN calls_call_type = 'Follow Up' AND calls_call_outcome = 'Lost' THEN 1 END) as followup_lost,
      -- Close rates
      SAFE_DIVIDE(COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END),
                  COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END)) as close_rate,
      SAFE_DIVIDE(COUNT(CASE WHEN calls_call_type = 'First Call' AND calls_call_outcome = 'Closed - Won' THEN 1 END),
                  COUNT(CASE WHEN calls_call_type = 'First Call' AND calls_attendance = 'Show' THEN 1 END)) as first_close_rate,
      SAFE_DIVIDE(COUNT(CASE WHEN calls_call_type = 'Follow Up' AND calls_call_outcome = 'Closed - Won' THEN 1 END),
                  COUNT(CASE WHEN calls_call_type = 'Follow Up' AND calls_attendance = 'Show' THEN 1 END)) as followup_close_rate,
      -- Deposit close rate
      SAFE_DIVIDE(COUNT(CASE WHEN calls_call_outcome = 'Deposit' THEN 1 END),
                  COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END)) as deposit_rate,
      -- Lost reason breakdown
      COUNT(CASE WHEN calls_call_outcome = 'Lost' AND calls_lost_reason = "Can't Afford" THEN 1 END) as lost_cant_afford,
      COUNT(CASE WHEN calls_call_outcome = 'Lost' AND calls_lost_reason = 'Closer Error' THEN 1 END) as lost_closer_error,
      COUNT(CASE WHEN calls_call_outcome = 'Lost' AND calls_lost_reason = 'Not Interested' THEN 1 END) as lost_not_interested,
      COUNT(CASE WHEN calls_call_outcome = 'Lost' AND calls_lost_reason = 'Timing' THEN 1 END) as lost_timing,
      COUNT(CASE WHEN calls_call_outcome = 'Lost' AND (calls_lost_reason IS NULL OR calls_lost_reason NOT IN ("Can't Afford", 'Closer Error', 'Not Interested', 'Timing')) THEN 1 END) as lost_other
    FROM ${VIEW} ${where}`;

  // 2) Time-series: outcomes over time
  const tsSql = `SELECT
      ${tb} as bucket,
      COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END) as closed,
      COUNT(CASE WHEN calls_call_outcome = 'Deposit' THEN 1 END) as deposit,
      COUNT(CASE WHEN calls_call_outcome = 'Follow Up' OR calls_call_outcome = 'Follow-Up' THEN 1 END) as followUp,
      COUNT(CASE WHEN calls_call_outcome = 'Lost' THEN 1 END) as lost,
      COUNT(CASE WHEN calls_call_outcome = 'Disqualified' THEN 1 END) as disqualified,
      COUNT(CASE WHEN calls_call_outcome = 'Not Pitched' THEN 1 END) as notPitched,
      -- Close rates over time
      COUNT(CASE WHEN calls_call_type = 'First Call' AND calls_call_outcome = 'Closed - Won' THEN 1 END) as first_call_closes,
      COUNT(CASE WHEN calls_call_type = 'Follow Up' AND calls_call_outcome = 'Closed - Won' THEN 1 END) as followup_closes,
      SAFE_DIVIDE(COUNT(CASE WHEN calls_call_type = 'First Call' AND calls_call_outcome = 'Closed - Won' THEN 1 END),
                  COUNT(CASE WHEN calls_call_type = 'First Call' AND calls_attendance = 'Show' THEN 1 END)) as firstCallRate,
      SAFE_DIVIDE(COUNT(CASE WHEN calls_call_type = 'Follow Up' AND calls_call_outcome = 'Closed - Won' THEN 1 END),
                  COUNT(CASE WHEN calls_call_type = 'Follow Up' AND calls_attendance = 'Show' THEN 1 END)) as followUpRate
    FROM ${VIEW} ${where}
    GROUP BY bucket ORDER BY bucket`;

  // 3) Per-closer outcome breakdown
  const closerSql = isInsightPlus ? `SELECT
      closers_name as closer_name,
      COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END) as closed,
      COUNT(CASE WHEN calls_call_outcome = 'Deposit' THEN 1 END) as deposit,
      COUNT(CASE WHEN calls_call_outcome = 'Follow Up' OR calls_call_outcome = 'Follow-Up' THEN 1 END) as followUp,
      COUNT(CASE WHEN calls_call_outcome = 'Lost' THEN 1 END) as lost,
      COUNT(CASE WHEN calls_call_outcome = 'Disqualified' THEN 1 END) as disqualified,
      COUNT(CASE WHEN calls_call_outcome = 'Not Pitched' THEN 1 END) as notPitched,
      COUNT(CASE WHEN calls_call_type = 'First Call' AND calls_call_outcome = 'Closed - Won' THEN 1 END) as firstCall,
      COUNT(CASE WHEN calls_call_type = 'Follow Up' AND calls_call_outcome = 'Closed - Won' THEN 1 END) as followUpClose,
      SAFE_DIVIDE(COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END),
                  COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END)) as close_rate,
      SAFE_DIVIDE(COUNT(CASE WHEN calls_call_outcome = 'Lost' THEN 1 END),
                  COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END)) as lost_rate,
      SAFE_DIVIDE(COUNT(CASE WHEN calls_call_outcome = 'Disqualified' THEN 1 END),
                  COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END)) as dq_rate,
      SAFE_DIVIDE(COUNT(CASE WHEN calls_call_outcome = 'Not Pitched' THEN 1 END),
                  COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END)) as not_pitched_rate
    FROM ${VIEW} ${where}
    GROUP BY closers_name ORDER BY closed DESC` : null;

  const queries = [
    bq.runQuery(scorecardSql, params),
    bq.runQuery(tsSql, params),
  ];
  if (closerSql) queries.push(bq.runQuery(closerSql, params));

  const results = await runParallel(queries);
  const sc = (results[0] && results[0][0]) || {};
  const ts = results[1] || [];
  const cl = results[2] || [];

  const held = num(sc.held);
  const closes = num(sc.closes);
  const deposits = num(sc.deposits);
  const followUps = num(sc.follow_ups);
  const lost = num(sc.lost);
  const dq = num(sc.dq);
  const notPitched = num(sc.not_pitched);
  const total = held;

  const timeData = ts.map(r => ({
    date: r.bucket ? r.bucket.value : r.bucket,
    closed: num(r.closed), deposit: num(r.deposit), followUp: num(r.followUp),
    lost: num(r.lost), disqualified: num(r.disqualified), notPitched: num(r.notPitched),
    firstCall: num(r.first_call_closes), followUpClose: num(r.followup_closes),
    firstCallRate: rate(r.firstCallRate), followUpRate: rate(r.followUpRate),
  }));

  const result = {
    sections: {
      health: {
        closes: {
          count: { value: closes },
          pctOfTotal: { value: total > 0 ? closes / total : 0 },
          closeRate: { value: rate(sc.close_rate) },
        },
        deposits: {
          count: { value: deposits },
          pctOfTotal: { value: total > 0 ? deposits / total : 0 },
          closeRate: { value: rate(sc.deposit_rate) },
        },
        followUps: {
          count: { value: followUps },
          pctOfTotal: { value: total > 0 ? followUps / total : 0 },
        },
        lost: {
          count: { value: lost },
          pctOfTotal: { value: total > 0 ? lost / total : 0 },
        },
        disqualified: {
          count: { value: dq },
          pctOfTotal: { value: total > 0 ? dq / total : 0 },
        },
        notPitched: {
          count: { value: notPitched },
          pctOfTotal: { value: total > 0 ? notPitched / total : 0 },
        },
      },
      closedWon: {
        firstCallCloses: { value: num(sc.first_closes) },
        firstCallCloseRate: { value: rate(sc.first_close_rate) },
        followUpCloses: { value: num(sc.followup_closes) },
        followUpCloseRate: { value: rate(sc.followup_close_rate) },
      },
      lost: {
        firstCallLost: { value: num(sc.first_lost) },
        firstCallLostRate: { value: num(sc.first_held) > 0 ? num(sc.first_lost) / num(sc.first_held) : 0 },
        followUpLost: { value: num(sc.followup_lost) },
        followUpLostRate: { value: num(sc.followup_held) > 0 ? num(sc.followup_lost) / num(sc.followup_held) : 0 },
      },
      disqualified: {
        firstCallDQ: { value: num(sc.first_dq) },
        firstCallDQRate: { value: num(sc.first_held) > 0 ? num(sc.first_dq) / num(sc.first_held) : 0 },
      },
      notPitched: {
        notPitched: { value: notPitched },
        notPitchedRate: { value: total > 0 ? notPitched / total : 0 },
      },
    },
    charts: {
      outcomeBreakdown: {
        type: 'pie', label: 'Call Outcomes Distribution',
        data: [
          { label: 'Closed - Won', value: closes, color: NEON_HEX.green },
          { label: 'Deposit', value: deposits, color: NEON_HEX.amber },
          { label: 'Follow Up', value: followUps, color: NEON_HEX.purple },
          { label: 'Lost', value: lost, color: NEON_HEX.red },
          { label: 'Disqualified', value: dq, color: NEON_HEX.muted },
          { label: 'Not Pitched', value: notPitched, color: NEON_HEX.blue },
        ].filter(d => d.value > 0),
      },
      outcomesOverTime: {
        type: 'line', label: 'Outcomes Over Time',
        series: [
          { key: 'closed', label: 'Closed', color: 'green' },
          { key: 'deposit', label: 'Deposit', color: 'amber' },
          { key: 'followUp', label: 'Follow Up', color: 'purple' },
          { key: 'lost', label: 'Lost', color: 'red' },
          { key: 'disqualified', label: 'Disqualified', color: 'muted' },
          { key: 'notPitched', label: 'Not Pitched', color: 'blue' },
        ],
        data: timeData,
      },
      closesOverTime: {
        type: 'bar', label: 'Closes Over Time',
        series: [
          { key: 'firstCall', label: 'First Call Closes', color: 'green' },
          { key: 'followUpClose', label: 'Follow-Up Closes', color: 'purple' },
        ],
        data: timeData,
      },
      closeRateOverTime: {
        type: 'line', label: 'Close Rate Over Time',
        series: [
          { key: 'firstCallRate', label: 'First Call Close %', color: 'green' },
          { key: 'followUpRate', label: 'Follow-Up Close %', color: 'purple' },
        ],
        data: timeData,
      },
      lostReasons: {
        type: 'pie', label: 'Lost Reasons',
        data: [
          { label: "Can't Afford", value: num(sc.lost_cant_afford), color: NEON_HEX.amber },
          { label: 'Closer Error', value: num(sc.lost_closer_error), color: NEON_HEX.red },
          { label: 'Not Interested', value: num(sc.lost_not_interested), color: NEON_HEX.cyan },
          { label: 'Timing', value: num(sc.lost_timing), color: NEON_HEX.purple },
          { label: 'Other', value: num(sc.lost_other), color: NEON_HEX.muted },
        ].filter(d => d.value > 0),
      },
    },
  };

  // Per-closer charts (Insight+ only)
  if (isInsightPlus && cl.length > 0) {
    result.charts.outcomeByCloser = {
      type: 'bar', label: 'Call Outcome by Closer',
      series: [
        { key: 'closed', label: 'Closed', color: 'green' },
        { key: 'deposit', label: 'Deposit', color: 'amber' },
        { key: 'followUp', label: 'Follow Up', color: 'purple' },
        { key: 'lost', label: 'Lost', color: 'red' },
        { key: 'disqualified', label: 'Disqualified', color: 'muted' },
        { key: 'notPitched', label: 'Not Pitched', color: 'blue' },
      ],
      data: cl.map(r => ({
        label: r.closer_name,
        closed: num(r.closed), deposit: num(r.deposit), followUp: num(r.followUp),
        lost: num(r.lost), disqualified: num(r.disqualified), notPitched: num(r.notPitched),
      })),
    };
    result.charts.closesByCloser = {
      type: 'bar', label: 'Closes by Closer',
      series: [
        { key: 'firstCall', label: 'First Call', color: 'green' },
        { key: 'followUp', label: 'Follow-Up', color: 'purple' },
      ],
      data: cl.map(r => ({
        label: r.closer_name, firstCall: num(r.firstCall), followUp: num(r.followUpClose),
      })).sort((a, b) => (b.firstCall + b.followUp) - (a.firstCall + a.followUp)),
    };
    result.charts.lostRateByCloser = {
      type: 'bar', label: 'Lost Rate by Closer',
      series: [{ key: 'lostRate', label: 'Lost Rate', color: 'red' }],
      data: cl.map(r => ({ label: r.closer_name, lostRate: rate(r.lost_rate) }))
        .sort((a, b) => a.lostRate - b.lostRate),
    };
    result.charts.dqByCloser = {
      type: 'bar', label: 'DQ Rate by Closer',
      series: [{ key: 'dqRate', label: 'DQ Rate', color: 'muted' }],
      data: cl.map(r => ({ label: r.closer_name, dqRate: rate(r.dq_rate) }))
        .sort((a, b) => b.dqRate - a.dqRate),
    };
    result.charts.notPitchedByCloser = {
      type: 'bar', label: 'Not Pitched by Closer',
      series: [{ key: 'notPitchedRate', label: 'Not Pitched Rate', color: 'blue' }],
      data: cl.map(r => ({ label: r.closer_name, notPitchedRate: rate(r.not_pitched_rate) }))
        .sort((a, b) => b.notPitchedRate - a.notPitchedRate),
    };
  }

  return result;
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
          { label: 'Closed - Won', value: 414,  color: NEON_HEX.green },
          { label: 'Deposit',      value: 91,   color: NEON_HEX.amber },
          { label: 'Follow Up',    value: 829,  color: NEON_HEX.purple },
          { label: 'Lost',         value: 1197, color: NEON_HEX.red },
          { label: 'Disqualified', value: 108,  color: NEON_HEX.muted },
          { label: 'Not Pitched',  value: 92,   color: NEON_HEX.blue },
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
          { label: 'Closed',     value: 54, color: NEON_HEX.green },
          { label: 'Still Open', value: 14, color: NEON_HEX.amber },
          { label: 'Lost',       value: 23, color: NEON_HEX.red },
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
          { label: 'Closed',        value: 62,  color: NEON_HEX.green },
          { label: 'Still Open',    value: 87,  color: NEON_HEX.purple },
          { label: 'Lost',          value: 215, color: NEON_HEX.red },
          { label: 'No Show',       value: 109, color: NEON_HEX.muted },
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
          { label: "Can't Afford",   value: 493, color: NEON_HEX.amber },
          { label: 'Closer Error',   value: 491, color: NEON_HEX.red },
          { label: 'Not Interested', value: 57,  color: NEON_HEX.cyan },
          { label: 'Timing',         value: 108, color: NEON_HEX.purple },
          { label: 'Other',          value: 48,  color: NEON_HEX.muted },
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
