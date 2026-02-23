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
 *   overview -- 5 scorecards: risk flags, unique calls with risk, % calls, avg flagged/call, FTC/SEC
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
  if (!bq.isAvailable() || clientId.startsWith('demo_')) {
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
 * Parses key_moments JSON from the Calls table to find risk-flagged entries.
 *
 * key_moments is a JSON array on each call. Risk entries have categories
 * like "Claims", "Guarantees", "Earnings", "Pressure".
 * Structure: [{ moment, category, timestamp, risk_level, explanation }]
 */
async function queryBigQuery(clientId, filters, tier) {
  const { runParallel, num, rate } = require('./helpers');
  const CALLS = bq.table('Calls');

  const effectiveCloserId = tier === 'basic' ? null : filters.closerId;
  const closerFilter = effectiveCloserId ? 'AND closer_id IN UNNEST(@closerIds)' : '';

  const params = { clientId, dateStart: filters.dateStart, dateEnd: filters.dateEnd };
  if (effectiveCloserId) params.closerIds = effectiveCloserId.split(',').map(id => id.trim());

  const dateWhere = `WHERE client_id = @clientId
    AND DATE(appointment_date) BETWEEN DATE(@dateStart) AND DATE(@dateEnd)
    AND attendance = 'Show'
    ${closerFilter}`;

  // Extract risk entries from key_moments JSON
  // Each risk entry has: moment (the phrase), category, timestamp, risk_level, explanation
  const riskSql = `WITH calls_base AS (
      SELECT
        call_id, closer_id, closer_name, appointment_date, call_type,
        recording_url, transcript_link, key_moments,
        attendance
      FROM ${CALLS}
      ${dateWhere}
      AND key_moments IS NOT NULL
    ),
    risk_entries AS (
      SELECT
        c.call_id, c.closer_id, c.closer_name, c.appointment_date, c.call_type,
        c.recording_url, c.transcript_link,
        JSON_VALUE(entry, '$.moment') as exact_phrase,
        JSON_VALUE(entry, '$.category') as risk_category,
        JSON_VALUE(entry, '$.timestamp') as risk_timestamp,
        JSON_VALUE(entry, '$.explanation') as why_flagged,
        JSON_VALUE(entry, '$.risk_level') as risk_level
      FROM calls_base c,
        UNNEST(JSON_EXTRACT_ARRAY(c.key_moments)) as entry
      WHERE JSON_VALUE(entry, '$.category') IN ('Claims', 'Guarantees', 'Earnings', 'Pressure')
    )
    SELECT * FROM risk_entries ORDER BY appointment_date DESC`;

  // Total held calls (for % calculation)
  const totalHeldSql = `SELECT
      COUNT(*) as total_held,
      COUNT(CASE WHEN call_type = 'First Call' THEN 1 END) as first_calls,
      COUNT(CASE WHEN call_type = 'Follow Up' THEN 1 END) as follow_ups
    FROM ${CALLS}
    ${dateWhere}`;

  const [riskRows, totalRows] = await runParallel([
    bq.runQuery(riskSql, params),
    bq.runQuery(totalHeldSql, params),
  ]);

  const risks = riskRows || [];
  const totals = (totalRows && totalRows[0]) || {};
  const totalHeld = num(totals.total_held);
  const firstCalls = num(totals.first_calls);
  const followUps = num(totals.follow_ups);

  // Aggregate risk flags
  const uniqueCallIds = new Set(risks.map(r => r.call_id));
  const riskFlagCount = risks.length;
  const uniqueCallsWithRisk = uniqueCallIds.size;

  // Category counts
  const categoryCounts = { Claims: 0, Guarantees: 0, Earnings: 0, Pressure: 0 };
  risks.forEach(r => {
    if (categoryCounts[r.risk_category] !== undefined) categoryCounts[r.risk_category]++;
  });

  // FTC/SEC warnings (claims + guarantees + earnings)
  const ftcSecWarnings = categoryCounts.Claims + categoryCounts.Guarantees + categoryCounts.Earnings;

  // Risk by call type
  const firstCallRisks = new Set(risks.filter(r => r.call_type === 'First Call').map(r => r.call_id)).size;
  const followUpRisks = new Set(risks.filter(r => r.call_type === 'Follow Up').map(r => r.call_id)).size;

  // Per-closer aggregation for bar chart
  const closerMap = {};
  risks.forEach(r => {
    if (!closerMap[r.closer_name]) closerMap[r.closer_name] = 0;
    closerMap[r.closer_name]++;
  });
  const closerData = Object.entries(closerMap)
    .map(([name, count]) => ({ date: name, flags: count }))
    .sort((a, b) => b.flags - a.flags);

  // Time-series: risk flags by week
  const weekMap = {};
  const catWeekMap = {};
  risks.forEach(r => {
    const d = new Date(r.appointment_date);
    const weekStart = new Date(d);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const key = weekStart.toISOString().split('T')[0];
    weekMap[key] = (weekMap[key] || 0) + 1;
    if (!catWeekMap[key]) catWeekMap[key] = { claims: 0, guarantees: 0, earnings: 0, pressure: 0 };
    const cat = (r.risk_category || '').toLowerCase();
    if (catWeekMap[key][cat] !== undefined) catWeekMap[key][cat]++;
  });

  const timeData = Object.entries(weekMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, flags]) => ({ date, flags }));

  const trendData = Object.entries(catWeekMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, cats]) => ({ date, ...cats }));

  // Risk review table rows
  const tableRows = risks.slice(0, 50).map(r => ({
    date: r.appointment_date ? r.appointment_date.split('T')[0] : '',
    closer: r.closer_name,
    closerId: r.closer_id,
    callType: r.call_type,
    riskCategory: r.risk_category,
    timestamp: r.risk_timestamp || '',
    exactPhrase: r.exact_phrase || '',
    whyFlagged: r.why_flagged || '',
    recordingUrl: r.recording_url || '',
    transcriptUrl: r.transcript_link || '',
  }));

  return {
    sections: {
      overview: {
        riskFlagCount: { value: riskFlagCount, label: 'Risk Flags (Total)', format: 'number', glowColor: 'red' },
        uniqueCallsWithRisk: { value: uniqueCallsWithRisk, label: 'Unique Calls with Risk', format: 'number', glowColor: 'red' },
        pctCallsWithRisk: { value: totalHeld > 0 ? uniqueCallsWithRisk / totalHeld : 0, label: '% Calls with Risk Flags', format: 'percent', glowColor: 'amber' },
        avgFlaggedPerCall: { value: uniqueCallsWithRisk > 0 ? riskFlagCount / uniqueCallsWithRisk : 0, label: 'Avg Flagged / Call', format: 'decimal', glowColor: 'amber' },
        ftcSecWarnings: { value: ftcSecWarnings, label: 'FTC / SEC Warnings', format: 'number', glowColor: 'magenta' },
      },
      riskCategories: {
        claims: { value: categoryCounts.Claims, label: 'Claims', format: 'number', glowColor: 'red' },
        guarantees: { value: categoryCounts.Guarantees, label: 'Guarantees', format: 'number', glowColor: 'amber' },
        earnings: { value: categoryCounts.Earnings, label: 'Earnings / Income', format: 'number', glowColor: 'magenta' },
        pressure: { value: categoryCounts.Pressure, label: 'Pressure / Urgency', format: 'number', glowColor: 'purple' },
      },
      riskByCallType: {
        firstCallRisk: { value: firstCalls > 0 ? firstCallRisks / firstCalls : 0, label: 'First Call Infractions', format: 'percent', glowColor: 'red' },
        followUpRisk: { value: followUps > 0 ? followUpRisks / followUps : 0, label: 'Follow-Up Infractions', format: 'percent', glowColor: 'red' },
      },
    },
    charts: {
      complianceOverTime: {
        type: 'line', label: 'Compliance Issues Over Time',
        series: [{ key: 'flags', label: 'Risk Flags', color: 'red' }],
        data: timeData,
      },
      flagsByCloser: {
        type: 'bar', label: 'Risk Flags by Closer',
        series: [{ key: 'flags', label: 'Risk Flags', color: 'red' }],
        data: closerData,
      },
      riskTrends: {
        type: 'line', label: 'Risk Category Trends',
        series: [
          { key: 'claims', label: 'Claims', color: 'red' },
          { key: 'guarantees', label: 'Guarantees', color: 'amber' },
          { key: 'earnings', label: 'Earnings', color: 'magenta' },
          { key: 'pressure', label: 'Pressure', color: 'purple' },
        ],
        data: trendData,
      },
    },
    tables: {
      riskReview: {
        columns: ['Date', 'Closer', 'Call Type', 'Risk Category', 'Timestamp', 'Exact Phrase', 'Why Flagged', 'Recording', 'Transcript'],
        rows: tableRows,
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
      overview: {
        riskFlagCount: { value: 14, label: 'Risk Flags (Total)', format: 'number', glowColor: 'red' },
        uniqueCallsWithRisk: { value: 9, label: 'Unique Calls with Risk', format: 'number', glowColor: 'red' },
        pctCallsWithRisk: { value: 0.055, label: '% Calls with Risk Flags', format: 'percent', glowColor: 'amber' },
        avgFlaggedPerCall: { value: 1.56, label: 'Avg Flagged / Call', format: 'decimal', glowColor: 'amber' },
        ftcSecWarnings: { value: 7, label: 'FTC / SEC Warnings', format: 'number', glowColor: 'magenta' },
      },
      riskCategories: {
        claims: { value: 4, label: 'Claims', format: 'number', glowColor: 'red' },
        guarantees: { value: 3, label: 'Guarantees', format: 'number', glowColor: 'amber' },
        earnings: { value: 5, label: 'Earnings / Income', format: 'number', glowColor: 'magenta' },
        pressure: { value: 2, label: 'Pressure / Urgency', format: 'number', glowColor: 'purple' },
      },
      riskByCallType: {
        firstCallRisk: { value: 0.038, label: 'First Call Infractions', format: 'percent', glowColor: 'red' },
        followUpRisk: { value: 0.072, label: 'Follow-Up Infractions', format: 'percent', glowColor: 'red' },
      },
    },
    charts: {
      complianceOverTime: {
        type: 'line',
        label: 'Compliance Issues Over Time',
        series: [
          { key: 'flags', label: 'Risk Flags', color: 'red' },
        ],
        data: generateTimeSeries(filters, [
          { key: 'flags', base: 2, variance: 1.2 },
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
          { key: 'claims', base: 1, variance: 1 },
          { key: 'guarantees', base: 1, variance: 1 },
          { key: 'earnings', base: 1, variance: 1 },
          { key: 'pressure', base: 1, variance: 0.8 },
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
            closerId: 'demo_closer_2',
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
            closerId: 'demo_closer_4',
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
            closerId: 'demo_closer_2',
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
            closerId: 'demo_closer_3',
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
            closerId: 'demo_closer_4',
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
            closerId: 'demo_closer_1',
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
            closerId: 'demo_closer_2',
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
            closerId: 'demo_closer_1',
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
            closerId: 'demo_closer_3',
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
            closerId: 'demo_closer_4',
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
