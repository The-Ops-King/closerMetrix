/**
 * SCRIPT ADHERENCE PAGE QUERIES -- Executive Only
 *
 * Script & process quality intelligence: overall adherence scores,
 * per-section breakdowns (Intro, Pain, Discovery, Goal, Transition,
 * Pitch, Close, Objections), per-closer comparisons, and trends.
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

/**
 * Fetch all script adherence data for a client.
 *
 * @param {string} clientId - Client ID for data isolation
 * @param {object} filters - { dateStart, dateEnd, closerId }
 * @param {string} tier - Client's plan tier (must be 'executive')
 * @returns {Promise<object>} { sections, charts }
 */
async function getAdherenceData(clientId, filters = {}, tier = 'executive') {
  if (!bq.isAvailable()) {
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
 * Placeholder -- will be filled with actual SQL when BQ credentials are available.
 *
 * Expected queries:
 *   1. AVG of each section score across all calls in period (overall + per-section)
 *   2. Per-closer average scores for leaderboard bars
 *   3. Weekly bucketed averages for trend lines
 *   4. Top performer identification (max overall score)
 */
async function queryBigQuery(clientId, filters, tier) {
  // TODO: Real BQ queries when credentials available
  return getDemoData();
}

// ================================================================
// DEMO DATA -- Realistic sample data for development and demos
// ================================================================

function getDemoData(tier = 'executive', filters = {}) {
  return {
    sections: {
      overall: {
        overallScore: { value: 7.2, label: 'Overall Script Adherence', format: 'score' },
        objectionHandling: { value: 6.8, label: 'Objection Handling Quality', format: 'score' },
      },
      bySection: {
        intro: { value: 8.1, label: 'Intro & Rapport', format: 'score' },
        pain: { value: 7.4, label: 'Current Situation / Pain', format: 'score' },
        discovery: { value: 6.9, label: 'Discovery', format: 'score' },
        goal: { value: 7.6, label: 'Desired Situation / Goal', format: 'score' },
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
        axes: ['Intro', 'Pain', 'Discovery', 'Goal', 'Transition', 'Pitch', 'Close', 'Objections'],
        data: [
          { label: 'Team Average', values: [8.1, 7.4, 6.9, 7.6, 7.8, 6.5, 5.8, 6.2], color: '#4DD4E8' },
          { label: 'Top Performer', values: [9.2, 8.8, 8.5, 9.0, 8.9, 8.2, 7.8, 8.0], color: '#6BCF7F' },
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
