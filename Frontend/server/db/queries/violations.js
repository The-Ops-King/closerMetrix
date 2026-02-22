/**
 * VIOLATIONS / COMPLIANCE PAGE QUERIES -- Executive Only
 *
 * Compliance & risk intelligence: risk flag counts, FTC/SEC warnings,
 * risk category breakdowns, per-closer flags, and the detailed risk
 * review table with exact phrases, timestamps, and recording links.
 *
 * Primary data sources:
 *   v_calls_joined_flat_prefixed -- Call-level data with compliance fields
 *   Calls table -- Direct access for compliance-specific columns
 *
 * Sections:
 *   overview -- 5 scorecards: risk flags, unique calls with risk, % calls, trend, FTC/SEC
 *   riskCategories -- 4 scorecards: claims, guarantees, earnings, pressure
 *   riskByCallType -- 2 scorecards: first call vs follow-up infraction rates
 *
 * Charts:
 *   complianceOverTime -- Line: Risk flags + FTC/SEC warnings over time
 *   flagsByCloser -- Bar: Risk flags per closer
 *   riskTrends -- Line: Risk category trends (claims, guarantees, earnings, pressure)
 *
 * Tables:
 *   riskReview -- THE money feature: date, closer, call type, risk category,
 *                 timestamp, exact phrase, why flagged, recording link, transcript link
 */

const bq = require('../BigQueryClient');
const logger = require('../../utils/logger');
const { generateTimeSeries } = require('./demoTimeSeries');

/**
 * Fetch all violations/compliance data for a client.
 *
 * @param {string} clientId - Client ID for data isolation
 * @param {object} filters - { dateStart, dateEnd, closerId }
 * @param {string} tier - Client's plan tier (must be 'executive')
 * @returns {Promise<object>} { sections, charts, tables }
 */
async function getViolationsData(clientId, filters = {}, tier = 'executive') {
  if (!bq.isAvailable()) {
    logger.debug('Returning demo violations data');
    return getDemoData(tier, filters);
  }

  try {
    return await queryBigQuery(clientId, filters, tier);
  } catch (err) {
    logger.error('Violations BQ query failed, falling back to demo', {
      error: err.message,
      clientId,
    });
    return getDemoData(tier, filters);
  }
}

/**
 * Run real BigQuery queries for violations/compliance data.
 * Placeholder -- will be filled with actual SQL when BQ credentials are available.
 *
 * Expected queries:
 *   1. Aggregate risk flag counts by category from compliance fields in Calls table
 *   2. Per-closer risk flag breakdown
 *   3. Risk flags over time (weekly buckets)
 *   4. Detailed risk review rows with exact phrases and timestamps
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
      overview: {
        riskFlagCount: { value: 14, label: 'Risk Flags (Total)', format: 'number' },
        uniqueCallsWithRisk: { value: 9, label: 'Unique Calls with Risk', format: 'number' },
        pctCallsWithRisk: { value: 0.055, label: '% Calls with Risk Flags', format: 'percent' },
        riskTrend: { value: 'Decreasing', label: 'Risk Trend', format: 'text' },
        ftcSecWarnings: { value: 7, label: 'FTC / SEC Warnings', format: 'number' },
      },
      riskCategories: {
        claims: { value: 4, label: 'Claims', format: 'number' },
        guarantees: { value: 3, label: 'Guarantees', format: 'number' },
        earnings: { value: 5, label: 'Earnings / Income', format: 'number' },
        pressure: { value: 2, label: 'Pressure / Urgency', format: 'number' },
      },
      riskByCallType: {
        firstCallRisk: { value: 0.038, label: 'First Call Infractions', format: 'percent' },
        followUpRisk: { value: 0.072, label: 'Follow-Up Infractions', format: 'percent' },
      },
    },
    charts: {
      complianceOverTime: {
        type: 'line',
        label: 'Compliance Issues Over Time',
        series: [
          { key: 'flags', label: 'Risk Flags', color: 'red' },
          { key: 'warnings', label: 'FTC/SEC Warnings', color: 'amber' },
        ],
        data: generateTimeSeries(filters, [
          { key: 'flags', base: 2, variance: 1.2 },
          { key: 'warnings', base: 1, variance: 0.8 },
        ]),
      },
      flagsByCloser: {
        type: 'bar',
        label: 'Risk Flags by Closer',
        series: [{ key: 'flags', label: 'Risk Flags', color: 'red' }],
        data: [
          { date: 'Sarah', flags: 2 },
          { date: 'Mike', flags: 5 },
          { date: 'Jessica', flags: 3 },
          { date: 'Alex', flags: 4 },
        ],
      },
      riskTrends: {
        type: 'line',
        label: 'Risk Category Trends',
        series: [
          { key: 'claims', label: 'Claims', color: 'red' },
          { key: 'guarantees', label: 'Guarantees', color: 'amber' },
          { key: 'earnings', label: 'Earnings', color: 'magenta' },
          { key: 'pressure', label: 'Pressure', color: 'purple' },
        ],
        data: generateTimeSeries(filters, [
          { key: 'claims', base: 0.6, variance: 0.5 },
          { key: 'guarantees', base: 0.4, variance: 0.4 },
          { key: 'earnings', base: 0.7, variance: 0.5 },
          { key: 'pressure', base: 0.3, variance: 0.3 },
        ]),
      },
    },
    tables: {
      riskReview: {
        columns: ['Date', 'Closer', 'Call Type', 'Risk Category', 'Timestamp', 'Exact Phrase', 'Why Flagged', 'Recording', 'Transcript'],
        rows: [
          {
            date: '2026-02-15',
            closer: 'Mike',
            callType: 'First Call',
            riskCategory: 'Earnings',
            timestamp: '12:34',
            exactPhrase: 'You can easily make $50,000 in your first month with this system',
            whyFlagged: 'Specific income claim without disclaimer — potential SEC violation under Investment Advisers Act',
            recordingUrl: 'https://recordings.example.com/call-001?t=754',
            transcriptUrl: 'https://transcripts.example.com/call-001',
          },
          {
            date: '2026-02-14',
            closer: 'Alex',
            callType: 'Follow-Up',
            riskCategory: 'Guarantees',
            timestamp: '08:22',
            exactPhrase: "I guarantee you'll see results within 30 days or we'll refund everything",
            whyFlagged: 'Unconditional guarantee language — FTC requires clear conditions and disclosures',
            recordingUrl: 'https://recordings.example.com/call-002?t=502',
            transcriptUrl: 'https://transcripts.example.com/call-002',
          },
          {
            date: '2026-02-13',
            closer: 'Mike',
            callType: 'First Call',
            riskCategory: 'Claims',
            timestamp: '22:15',
            exactPhrase: 'Our clients typically double their revenue within 90 days',
            whyFlagged: 'Unsubstantiated performance claim — requires statistical evidence per FTC guidelines',
            recordingUrl: 'https://recordings.example.com/call-003?t=1335',
            transcriptUrl: 'https://transcripts.example.com/call-003',
          },
          {
            date: '2026-02-12',
            closer: 'Jessica',
            callType: 'First Call',
            riskCategory: 'Pressure',
            timestamp: '31:08',
            exactPhrase: "This offer expires tonight and I can't hold the spot after that",
            whyFlagged: 'False urgency/scarcity tactic — FTC considers this deceptive if not genuinely time-limited',
            recordingUrl: 'https://recordings.example.com/call-004?t=1868',
            transcriptUrl: 'https://transcripts.example.com/call-004',
          },
          {
            date: '2026-02-11',
            closer: 'Alex',
            callType: 'Follow-Up',
            riskCategory: 'Earnings',
            timestamp: '15:42',
            exactPhrase: "Most of our clients are making six figures within the first year",
            whyFlagged: 'Income claim with "most" qualifier — requires data substantiation per FTC Endorsement Guides',
            recordingUrl: 'https://recordings.example.com/call-005?t=942',
            transcriptUrl: 'https://transcripts.example.com/call-005',
          },
          {
            date: '2026-02-10',
            closer: 'Sarah',
            callType: 'First Call',
            riskCategory: 'Guarantees',
            timestamp: '18:55',
            exactPhrase: "There's literally zero risk — you can't lose",
            whyFlagged: '"Zero risk" language is considered misleading under consumer protection regulations',
            recordingUrl: 'https://recordings.example.com/call-006?t=1135',
            transcriptUrl: 'https://transcripts.example.com/call-006',
          },
          {
            date: '2026-02-09',
            closer: 'Mike',
            callType: 'First Call',
            riskCategory: 'Claims',
            timestamp: '25:30',
            exactPhrase: "We've never had a single client who didn't see ROI in the first quarter",
            whyFlagged: 'Absolute success claim — likely unsubstantiated, violates FTC truth-in-advertising standards',
            recordingUrl: 'https://recordings.example.com/call-007?t=1530',
            transcriptUrl: 'https://transcripts.example.com/call-007',
          },
          {
            date: '2026-02-08',
            closer: 'Sarah',
            callType: 'Follow-Up',
            riskCategory: 'Pressure',
            timestamp: '05:12',
            exactPhrase: "I have three other people interested in this last spot",
            whyFlagged: 'False scarcity claim — deceptive practice if fabricated, per FTC Act Section 5',
            recordingUrl: 'https://recordings.example.com/call-008?t=312',
            transcriptUrl: 'https://transcripts.example.com/call-008',
          },
          {
            date: '2026-02-07',
            closer: 'Jessica',
            callType: 'Follow-Up',
            riskCategory: 'Earnings',
            timestamp: '19:48',
            exactPhrase: "Our average client makes back their investment within the first two weeks",
            whyFlagged: 'Implied earnings claim with specific timeframe — requires income disclosure per FTC',
            recordingUrl: 'https://recordings.example.com/call-009?t=1188',
            transcriptUrl: 'https://transcripts.example.com/call-009',
          },
          {
            date: '2026-02-06',
            closer: 'Alex',
            callType: 'First Call',
            riskCategory: 'Claims',
            timestamp: '28:03',
            exactPhrase: "This is the exact same system that helped [Celebrity Name] scale to $10M",
            whyFlagged: 'Unauthorized celebrity endorsement claim — potential Lanham Act and FTC endorsement violation',
            recordingUrl: 'https://recordings.example.com/call-010?t=1683',
            transcriptUrl: 'https://transcripts.example.com/call-010',
          },
        ],
      },
    },
  };
}

module.exports = { getViolationsData };
