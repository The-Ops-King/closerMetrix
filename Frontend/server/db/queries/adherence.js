/**
 * SCRIPT ADHERENCE PAGE QUERIES -- Executive Only
 *
 * Script & process quality intelligence: overall adherence scores,
 * per-section breakdowns (Intro, Pain, Goal, Transition, Pitch,
 * Close, Objections), per-closer comparisons, and trends.
 *
 * Primary data sources:
 *   v_calls_joined_flat_prefixed -- Call-level data with script adherence scores
 *   Calls table -- Direct access for section-level score columns
 *
 * Sections:
 *   overall -- 2 scorecards: overall script adherence, objection handling quality
 *   bySection -- 8 scorecards: one per script section (Intro through Objections)
 *
 * Charts:
 *   radarData -- Radar: Script adherence by section (team avg + top performer)
 *   adherenceByCloser -- Bar: Overall adherence score per closer
 *   objHandlingByCloser -- Bar: Objection handling score per closer
 *   adherenceOverTime -- Line: Adherence trends over time (overall, close, objections)
 */

const bq = require('../BigQueryClient');
const logger = require('../../utils/logger');
const { generateTimeSeries } = require('./demoTimeSeries');
const { SCRIPT_SECTIONS } = require('../../../shared/categoryValues');

/**
 * Fetch all script adherence data for a client.
 *
 * @param {string} clientId - Client ID for data isolation
 * @param {object} filters - { dateStart, dateEnd, closerId }
 * @param {string} tier - Client's plan tier (must be 'executive')
 * @returns {Promise<object>} { sections, charts }
 */
async function getAdherenceData(clientId, filters = {}, tier = 'executive') {
  if (!bq.isAvailable() || clientId.startsWith('demo_')) {
    logger.debug('Returning demo adherence data');
    return getDemoData(tier, filters);
  }

  try {
    return await queryBigQuery(clientId, filters, tier);
  } catch (err) {
    logger.error('Adherence BQ query failed, falling back to demo', {
      error: err.message,
      clientId,
    });
    return getDemoData(tier, filters);
  }
}

/**
 * Run real BigQuery queries for script adherence data.
 * Runs 3 queries in parallel: scorecard, per-closer, time-series.
 *
 * All 8 radar axes now have distinct score columns in the view:
 *   Intro → intro_score
 *   Pain → pain_score
 *   Discovery → discovery_score
 *   Goal → goal_score
 *   Transition → transition_score
 *   Pitch → pitch_score
 *   Close → close_attempt_score
 *   Objections → objection_handling_score
 */
async function queryBigQuery(clientId, filters, tier) {
  const { buildQueryContext, timeBucket, runParallel, num, rate, VIEW } = require('./helpers');
  const { params, where } = buildQueryContext(clientId, filters, tier);
  const tb = timeBucket();

  // Only include calls that have scores (attendance = Show and score is not null)
  const scoreWhere = `${where} AND calls_attendance = 'Show' AND calls_overall_call_score IS NOT NULL`;

  // 1) Scorecard: average of each score column
  const scorecardSql = `SELECT
      AVG(CAST(calls_script_adherence_score AS FLOAT64)) as script_adherence,
      AVG(CAST(calls_objection_handling_score AS FLOAT64)) as obj_handling,
      AVG(CAST(calls_intro_score AS FLOAT64)) as intro,
      AVG(CAST(calls_pain_score AS FLOAT64)) as pain,
      AVG(CAST(calls_discovery_score AS FLOAT64)) as discovery,
      AVG(CAST(calls_goal_score AS FLOAT64)) as goal,
      AVG(CAST(calls_transition_score AS FLOAT64)) as transition,
      AVG(CAST(calls_pitch_score AS FLOAT64)) as pitch,
      AVG(CAST(calls_close_attempt_score AS FLOAT64)) as close_attempt
    FROM ${VIEW} ${scoreWhere}`;

  // 2) Per-closer: average scores for bars + radar data
  const closerSql = `SELECT
      closers_name as closer_name,
      calls_closer_id as closer_id,
      AVG(CAST(calls_script_adherence_score AS FLOAT64)) as script_adherence,
      AVG(CAST(calls_objection_handling_score AS FLOAT64)) as obj_handling,
      AVG(CAST(calls_intro_score AS FLOAT64)) as intro,
      AVG(CAST(calls_pain_score AS FLOAT64)) as pain,
      AVG(CAST(calls_discovery_score AS FLOAT64)) as discovery,
      AVG(CAST(calls_goal_score AS FLOAT64)) as goal,
      AVG(CAST(calls_transition_score AS FLOAT64)) as transition,
      AVG(CAST(calls_pitch_score AS FLOAT64)) as pitch,
      AVG(CAST(calls_close_attempt_score AS FLOAT64)) as close_attempt
    FROM ${VIEW} ${scoreWhere}
    GROUP BY closers_name, calls_closer_id
    ORDER BY script_adherence DESC`;

  // 3) Time-series: weekly averages
  const tsSql = `SELECT
      ${tb} as bucket,
      AVG(CAST(calls_script_adherence_score AS FLOAT64)) as overall,
      AVG(CAST(calls_close_attempt_score AS FLOAT64)) as close_score,
      AVG(CAST(calls_objection_handling_score AS FLOAT64)) as obj_score
    FROM ${VIEW} ${scoreWhere}
    GROUP BY bucket ORDER BY bucket`;

  const [scRows, clRows, tsRows] = await runParallel([
    bq.runQuery(scorecardSql, params),
    bq.runQuery(closerSql, params),
    bq.runQuery(tsSql, params),
  ]);

  const sc = (scRows && scRows[0]) || {};
  const cl = clRows || [];
  const ts = tsRows || [];

  // Build radar data per closer — 8 axes matching SCRIPT_SECTIONS
  const radarByCloser = cl.map(r => ({
    label: r.closer_name,
    closerId: r.closer_id,
    values: [
      num(r.intro),        // Intro
      num(r.pain),         // Pain
      num(r.discovery),    // Discovery
      num(r.goal),         // Goal
      num(r.transition),   // Transition
      num(r.pitch),        // Pitch
      num(r.close_attempt),// Close
      num(r.obj_handling), // Objections
    ],
  }));

  const timeData = ts.map(r => ({
    date: r.bucket ? r.bucket.value : r.bucket,
    overall: num(r.overall),
    close: num(r.close_score),
    objections: num(r.obj_score),
  }));

  return {
    sections: {
      overall: {
        overallScore: { value: num(sc.script_adherence), label: 'Script Adherence Score', format: 'score' },
        objectionHandling: { value: num(sc.obj_handling), label: 'Objection Handling Quality', format: 'score' },
      },
      bySection: {
        intro: { value: num(sc.intro), label: 'Intro', format: 'score' },
        pain: { value: num(sc.pain), label: 'Pain', format: 'score' },
        discovery: { value: num(sc.discovery), label: 'Discovery', format: 'score' },
        goal: { value: num(sc.goal), label: 'Goal', format: 'score' },
        transition: { value: num(sc.transition), label: 'Transition', format: 'score' },
        pitch: { value: num(sc.pitch), label: 'Pitch', format: 'score' },
        close: { value: num(sc.close_attempt), label: 'Close', format: 'score' },
        objections: { value: num(sc.obj_handling), label: 'Objections', format: 'score' },
      },
    },
    charts: {
      radarData: {
        type: 'radar',
        label: 'Script Adherence by Section',
        axes: SCRIPT_SECTIONS.map(s => s.label),
        byCloser: radarByCloser,
      },
      adherenceByCloser: {
        type: 'bar', label: 'Overall Adherence by Closer',
        series: [{ key: 'score', label: 'Adherence Score', color: 'purple' }],
        data: cl.map(r => ({ date: r.closer_name, score: num(r.script_adherence) })),
      },
      objHandlingByCloser: {
        type: 'bar', label: 'Objection Handling by Closer',
        series: [{ key: 'score', label: 'Obj. Handling Score', color: 'cyan' }],
        data: cl.map(r => ({ date: r.closer_name, score: num(r.obj_handling) })),
      },
      adherenceOverTime: {
        type: 'line', label: 'Script Adherence Over Time',
        series: [
          { key: 'overall', label: 'Overall', color: 'purple' },
          { key: 'close', label: 'Close Section', color: 'red' },
          { key: 'objections', label: 'Objection Handling', color: 'cyan' },
        ],
        data: timeData,
      },
    },
  };
}

// ================================================================
// DEMO DATA -- Realistic sample data for development and demos
// ================================================================

function getDemoData(tier = 'executive', filters = {}) {
  return {
    sections: {
      overall: {
        overallScore: { value: 7.2, label: 'Script Adherence Score', format: 'score' },
        objectionHandling: { value: 6.8, label: 'Objection Handling Quality', format: 'score' },
      },
      bySection: {
        intro: { value: 8.1, label: 'Intro', format: 'score' },
        pain: { value: 7.4, label: 'Pain', format: 'score' },
        discovery: { value: 7.0, label: 'Discovery', format: 'score' },
        goal: { value: 7.6, label: 'Goal', format: 'score' },
        transition: { value: 7.8, label: 'Transition', format: 'score' },
        pitch: { value: 6.5, label: 'Pitch', format: 'score' },
        close: { value: 5.8, label: 'Close', format: 'score' },
        objections: { value: 6.2, label: 'Objections', format: 'score' },
      },
    },
    charts: {
      radarData: {
        type: 'radar',
        label: 'Script Adherence by Section',
        axes: SCRIPT_SECTIONS.map(s => s.label),
        byCloser: [
          { label: 'Sarah', closerId: 'demo_closer_1', values: [9.2, 8.5, 8.8, 8.9, 9.0, 8.2, 7.8, 8.0] },
          { label: 'Mike', closerId: 'demo_closer_2', values: [7.4, 6.2, 6.8, 7.0, 7.2, 5.8, 4.9, 5.5] },
          { label: 'Jessica', closerId: 'demo_closer_3', values: [8.0, 7.1, 7.5, 7.8, 7.9, 6.8, 6.0, 6.5] },
          { label: 'Alex', closerId: 'demo_closer_4', values: [7.8, 6.0, 6.5, 6.6, 7.2, 5.2, 4.5, 5.0] },
        ],
      },
      adherenceByCloser: {
        type: 'bar',
        label: 'Overall Adherence by Closer',
        series: [{ key: 'score', label: 'Adherence Score', color: 'purple' }],
        data: [
          { date: 'Sarah', score: 8.4 },
          { date: 'Mike', score: 6.9 },
          { date: 'Jessica', score: 7.5 },
          { date: 'Alex', score: 6.1 },
        ],
      },
      objHandlingByCloser: {
        type: 'bar',
        label: 'Objection Handling by Closer',
        series: [{ key: 'score', label: 'Obj. Handling Score', color: 'cyan' }],
        data: [
          { date: 'Sarah', score: 7.8 },
          { date: 'Mike', score: 6.5 },
          { date: 'Jessica', score: 7.1 },
          { date: 'Alex', score: 5.9 },
        ],
      },
      adherenceOverTime: {
        type: 'line',
        label: 'Script Adherence Over Time',
        series: [
          { key: 'overall', label: 'Overall', color: 'purple' },
          { key: 'close', label: 'Close Section', color: 'red' },
          { key: 'objections', label: 'Objection Handling', color: 'cyan' },
        ],
        data: generateTimeSeries(filters, [
          { key: 'overall', base: 7.0, variance: 0.5 },
          { key: 'close', base: 5.6, variance: 0.6 },
          { key: 'objections', base: 6.0, variance: 0.5 },
        ]),
      },
    },
  };
}

module.exports = { getAdherenceData };
