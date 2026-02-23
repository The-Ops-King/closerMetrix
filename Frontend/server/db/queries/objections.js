/**
 * OBJECTIONS PAGE QUERIES -- Insight+ Only
 *
 * Objection intelligence: counts, resolution rates, per-type breakdowns,
 * per-closer breakdowns, and drill-down table data.
 *
 * Primary data sources:
 *   v_objections_joined -- Objection-level drill-downs (one row per objection)
 *   v_calls_with_objection_counts -- Call-level objection stats (obj_count, resolved, etc.)
 *   v_calls_with_objections_filterable -- For "% of calls with objections" metric
 *
 * Sections:
 *   summary -- 9 scorecards: calls held, objections faced, resolution rate, etc.
 *
 * Charts:
 *   objectionsByType -- Stacked bar: Resolved vs Unresolved by objection type
 *   objectionTrends -- Line: Top 3 objection types over time
 *   unresolvedByType -- Pie/Donut: Unresolved objections by type
 *   resolutionByCloser -- Bar: Resolution rate per closer
 *
 * Tables:
 *   byType -- Objection Type Summary: Type, Total, Resolved, Resolution Rate
 *   byCloser -- Resolved by Closer: Closer, Total, Resolved, Resolution Rate
 */

const bq = require('../BigQueryClient');
const logger = require('../../utils/logger');
const { computeGranularity } = require('./demoTimeSeries');

/**
 * Fetch all objection intelligence data for a client.
 *
 * @param {string} clientId - Client ID for data isolation
 * @param {object} filters - { dateStart, dateEnd, closerId, objectionType }
 * @param {string} tier - Client's plan tier
 * @returns {Promise<object>} { sections, charts, tables }
 */
async function getObjectionsData(clientId, filters = {}, tier = 'insight') {
  if (!bq.isAvailable() || clientId.startsWith('demo_')) {
    logger.debug('Returning demo objections data');
    return getDemoData(tier, filters);
  }

  try {
    return await queryBigQuery(clientId, filters, tier);
  } catch (err) {
    logger.error('Objections BQ query failed, falling back to demo', {
      error: err.message,
      clientId,
    });
    return getDemoData(tier, filters);
  }
}

/**
 * Run real BigQuery queries for objection data.
 * Runs 3 queries in parallel: scorecard, by-type breakdown, per-closer + time-series.
 */
async function queryBigQuery(clientId, filters, tier) {
  const { runParallel, num, rate } = require('./helpers');

  const objView = bq.table('v_objections_joined');
  const callsObjView = bq.table('v_calls_with_objections_filterable');
  const callsObjCountView = bq.table('v_calls_with_objection_counts');

  const effectiveCloserId = tier === 'basic' ? null : filters.closerId;
  const closerFilter = effectiveCloserId ? 'AND calls_closer_id = @closerId' : '';
  const objCloserFilter = effectiveCloserId ? 'AND obj_closer_id = @closerId' : '';

  const typeFilter = filters.objectionType
    ? `AND obj_objection_type IN UNNEST(@objTypes)`
    : '';

  const params = { clientId, dateStart: filters.dateStart, dateEnd: filters.dateEnd };
  if (effectiveCloserId) params.closerId = effectiveCloserId;
  if (filters.objectionType) params.objTypes = filters.objectionType.split(',').map(s => s.trim());

  const dateWhere = `AND DATE(calls_appointment_date) BETWEEN DATE(@dateStart) AND DATE(@dateEnd)`;

  // 1) Scorecard: aggregate counts from calls_with_objection_counts + filterable view
  const scorecardSql = `WITH calls_base AS (
      SELECT *
      FROM ${callsObjCountView}
      WHERE calls_client_id = @clientId ${dateWhere} ${closerFilter}
    )
    SELECT
      COUNT(*) as calls_held,
      SUM(CAST(obj_count AS INT64)) as objections_faced,
      COUNT(CASE WHEN has_objections = true THEN 1 END) as calls_with_obj,
      SUM(CAST(obj_resolved_count AS INT64)) as resolved,
      SUM(CAST(obj_not_resolved_count AS INT64)) as unresolved,
      COUNT(CASE WHEN has_objections = false AND calls_call_outcome = 'Closed - Won' THEN 1 END) as objectionless_closes,
      COUNT(CASE WHEN has_objections = true AND calls_call_outcome = 'Closed - Won' THEN 1 END) as closed_with_obj,
      COUNT(CASE WHEN has_objections = true AND calls_call_outcome = 'Lost' THEN 1 END) as lost_to_obj
    FROM calls_base
    WHERE calls_attendance = 'Show'`;

  // 2) By-type breakdown from objections_joined
  const byTypeSql = `SELECT
      obj_objection_type as type,
      COUNT(*) as total,
      COUNT(CASE WHEN obj_resolved = true THEN 1 END) as resolved,
      SAFE_DIVIDE(COUNT(CASE WHEN obj_resolved = true THEN 1 END), COUNT(*)) as res_rate
    FROM ${objView}
    WHERE obj_client_id = @clientId ${dateWhere} ${objCloserFilter} ${typeFilter}
    GROUP BY obj_objection_type
    ORDER BY total DESC`;

  // 3) By-closer breakdown
  const byCloserSql = `SELECT
      closers_name as closer,
      COUNT(*) as total,
      COUNT(CASE WHEN obj_resolved = true THEN 1 END) as resolved,
      SAFE_DIVIDE(COUNT(CASE WHEN obj_resolved = true THEN 1 END), COUNT(*)) as res_rate
    FROM ${objView}
    WHERE obj_client_id = @clientId ${dateWhere} ${objCloserFilter} ${typeFilter}
    GROUP BY closers_name
    ORDER BY res_rate DESC`;

  // 4) Time-series: objection trends by week
  const tsSql = `SELECT
      DATE_TRUNC(DATE(calls_appointment_date), WEEK) as bucket,
      obj_objection_type as type,
      COUNT(*) as cnt
    FROM ${objView}
    WHERE obj_client_id = @clientId ${dateWhere} ${objCloserFilter} ${typeFilter}
    GROUP BY bucket, type
    ORDER BY bucket`;

  const [scRows, typeRows, closerRows, tsRows] = await runParallel([
    bq.runQuery(scorecardSql, params),
    bq.runQuery(byTypeSql, params),
    bq.runQuery(byCloserSql, params),
    bq.runQuery(tsSql, params),
  ]);

  const sc = (scRows && scRows[0]) || {};
  const types = typeRows || [];
  const closers = closerRows || [];
  const trendRows = tsRows || [];

  const callsHeld = num(sc.calls_held);
  const objFaced = num(sc.objections_faced);
  const callsWithObj = num(sc.calls_with_obj);
  const resolved = num(sc.resolved);
  const totalObj = resolved + num(sc.unresolved);

  // Build trend data — top 3 types over time
  const typeTotals = {};
  trendRows.forEach(r => {
    typeTotals[r.type] = (typeTotals[r.type] || 0) + num(r.cnt);
  });
  const top3Types = Object.entries(typeTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type]) => type);

  const bucketMap = {};
  trendRows.forEach(r => {
    const date = r.bucket ? (r.bucket.value || r.bucket) : r.bucket;
    if (!bucketMap[date]) bucketMap[date] = { date };
    const key = r.type.replace(/[^a-zA-Z]/g, '');
    bucketMap[date][key] = num(r.cnt);
  });
  const trendData = Object.values(bucketMap).sort((a, b) => a.date.localeCompare(b.date));
  const trendSeries = top3Types.map(type => ({
    key: type.replace(/[^a-zA-Z]/g, ''),
    label: type,
    color: TREND_COLORS[type] || 'cyan',
  }));

  // Stacked bar: resolved vs unresolved by type
  const byTypeData = types.map(r => ({
    date: r.type,
    resolved: num(r.resolved),
    unresolved: num(r.total) - num(r.resolved),
  }));

  // Unresolved pie
  const unresolvedPie = types
    .map(r => ({
      label: r.type,
      value: num(r.total) - num(r.resolved),
      color: TYPE_COLORS[r.type] || 'muted',
    }))
    .filter(d => d.value > 0);

  // Resolution by closer bar
  const closerBarData = closers.map(r => ({
    date: r.closer,
    resRate: rate(r.res_rate),
  }));

  return {
    sections: {
      summary: {
        callsHeld: { value: callsHeld, label: 'Calls Held', format: 'number', glowColor: 'blue' },
        objectionsFaced: { value: objFaced, label: 'Objections Faced', format: 'number', glowColor: 'teal' },
        callsWithObjections: { value: callsHeld > 0 ? callsWithObj / callsHeld : 0, label: '% Calls w/ Objections', format: 'percent', glowColor: 'amber' },
        avgObjectionsPerCall: { value: callsWithObj > 0 ? objFaced / callsWithObj : 0, label: 'Avg Objections / Call', format: 'decimal', glowColor: 'amber' },
        resolvedObjections: { value: resolved, label: 'Resolved', format: 'number', glowColor: 'green' },
        resolutionRate: { value: totalObj > 0 ? resolved / totalObj : 0, label: 'Resolution Rate', format: 'percent', glowColor: 'purple' },
        objectionlessCloses: { value: num(sc.objectionless_closes), label: 'Objectionless Closes', format: 'number', glowColor: 'green' },
        closedWithObjections: { value: num(sc.closed_with_obj), label: 'Closed w/ Objections', format: 'number', glowColor: 'green' },
        lostToObjections: { value: num(sc.lost_to_obj), label: 'Lost to Objections', format: 'number', glowColor: 'red' },
      },
    },
    charts: {
      objectionsByType: {
        type: 'bar', label: 'Objections by Type (Resolved vs Unresolved)',
        series: [
          { key: 'resolved', label: 'Resolved', color: 'green' },
          { key: 'unresolved', label: 'Unresolved', color: 'red' },
        ],
        data: byTypeData,
      },
      objectionTrends: {
        type: 'line', label: 'Top 3 Objections Over Time',
        series: trendSeries,
        data: trendData,
      },
      unresolvedByType: {
        type: 'pie', label: 'Unresolved Objections by Type',
        data: unresolvedPie,
      },
      resolutionByCloser: {
        type: 'bar', label: 'Resolution Rate by Closer',
        series: [{ key: 'resRate', label: 'Resolution Rate', color: 'green' }],
        data: closerBarData,
      },
    },
    tables: {
      byType: {
        columns: ['Type', 'Total', 'Resolved', 'Resolution Rate'],
        rows: types.map(r => ({
          type: r.type,
          total: num(r.total),
          resolved: num(r.resolved),
          resRate: rate(r.res_rate),
        })),
      },
      byCloser: {
        columns: ['Closer', 'Objections', 'Resolved', 'Resolution Rate'],
        rows: closers.map(r => ({
          closer: r.closer,
          total: num(r.total),
          resolved: num(r.resolved),
          resRate: rate(r.res_rate),
        })),
      },
    },
  };
}

// ================================================================
// DEMO DATA -- Filter-aware sample data for development and demos
// ================================================================

/** Color assigned to each objection type (used by pie chart) */
const TYPE_COLORS = {
  'Financial': 'cyan',
  'Think About It': 'amber',
  'Spouse/Partner': 'blue',
  'Timing': 'green',
  'Already Tried': 'red',
  'Not Interested': 'purple',
  'Other': 'muted',
};

/** Closer ID → display name mapping (matches tokenManager demo closers) */
const CLOSER_MAP = {
  'demo_closer_1': 'Sarah',
  'demo_closer_2': 'Mike',
  'demo_closer_3': 'Jessica',
  'demo_closer_4': 'Alex',
};
const NAME_TO_ID = Object.fromEntries(Object.entries(CLOSER_MAP).map(([id, name]) => [name, id]));

/** Master list of objection records — all charts/scorecards are computed from this.
 *  Each record has both closerId (for API filtering) and closer (display name). */
const ALL_RECORDS = [
  { objectionType: 'Financial', resolved: true, closerId: 'demo_closer_1', closer: 'Sarah', callOutcome: 'Closed - Won', appointmentDate: '2026-02-18', recordingUrl: 'https://app.closermetrix.com/recordings/rec001' },
  { objectionType: 'Think About It', resolved: false, closerId: 'demo_closer_2', closer: 'Mike', callOutcome: 'Follow-Up', appointmentDate: '2026-02-17', recordingUrl: 'https://app.closermetrix.com/recordings/rec002' },
  { objectionType: 'Spouse/Partner', resolved: true, closerId: 'demo_closer_3', closer: 'Jessica', callOutcome: 'Closed - Won', appointmentDate: '2026-02-16', recordingUrl: 'https://app.closermetrix.com/recordings/rec003' },
  { objectionType: 'Timing', resolved: false, closerId: 'demo_closer_4', closer: 'Alex', callOutcome: 'Lost', appointmentDate: '2026-02-15', recordingUrl: 'https://app.closermetrix.com/recordings/rec004' },
  { objectionType: 'Financial', resolved: true, closerId: 'demo_closer_1', closer: 'Sarah', callOutcome: 'Closed - Won', appointmentDate: '2026-02-14', recordingUrl: 'https://app.closermetrix.com/recordings/rec005' },
  { objectionType: 'Already Tried', resolved: true, closerId: 'demo_closer_2', closer: 'Mike', callOutcome: 'Closed - Won', appointmentDate: '2026-02-13', recordingUrl: 'https://app.closermetrix.com/recordings/rec006' },
  { objectionType: 'Not Interested', resolved: false, closerId: 'demo_closer_3', closer: 'Jessica', callOutcome: 'DQ', appointmentDate: '2026-02-12', recordingUrl: 'https://app.closermetrix.com/recordings/rec007' },
  { objectionType: 'Other', resolved: true, closerId: 'demo_closer_4', closer: 'Alex', callOutcome: 'Follow-Up', appointmentDate: '2026-02-11', recordingUrl: 'https://app.closermetrix.com/recordings/rec008' },
  { objectionType: 'Financial', resolved: false, closerId: 'demo_closer_2', closer: 'Mike', callOutcome: 'Lost', appointmentDate: '2026-02-10', recordingUrl: 'https://app.closermetrix.com/recordings/rec009' },
  { objectionType: 'Think About It', resolved: true, closerId: 'demo_closer_1', closer: 'Sarah', callOutcome: 'Closed - Won', appointmentDate: '2026-02-09', recordingUrl: 'https://app.closermetrix.com/recordings/rec010' },
  { objectionType: 'Spouse/Partner', resolved: false, closerId: 'demo_closer_4', closer: 'Alex', callOutcome: 'Follow-Up', appointmentDate: '2026-02-07', recordingUrl: 'https://app.closermetrix.com/recordings/rec011' },
  { objectionType: 'Timing', resolved: true, closerId: 'demo_closer_3', closer: 'Jessica', callOutcome: 'Closed - Won', appointmentDate: '2026-02-05', recordingUrl: 'https://app.closermetrix.com/recordings/rec012' },
  { objectionType: 'Already Tried', resolved: false, closerId: 'demo_closer_1', closer: 'Sarah', callOutcome: 'Lost', appointmentDate: '2026-02-03', recordingUrl: 'https://app.closermetrix.com/recordings/rec013' },
  { objectionType: 'Not Interested', resolved: true, closerId: 'demo_closer_2', closer: 'Mike', callOutcome: 'Follow-Up', appointmentDate: '2026-01-30', recordingUrl: 'https://app.closermetrix.com/recordings/rec014' },
  { objectionType: 'Financial', resolved: true, closerId: 'demo_closer_3', closer: 'Jessica', callOutcome: 'Closed - Won', appointmentDate: '2026-01-27', recordingUrl: 'https://app.closermetrix.com/recordings/rec015' },
  { objectionType: 'Think About It', resolved: false, closerId: 'demo_closer_4', closer: 'Alex', callOutcome: 'Lost', appointmentDate: '2026-01-25', recordingUrl: 'https://app.closermetrix.com/recordings/rec016' },
  { objectionType: 'Financial', resolved: true, closerId: 'demo_closer_1', closer: 'Sarah', callOutcome: 'Closed - Won', appointmentDate: '2026-01-23', recordingUrl: 'https://app.closermetrix.com/recordings/rec017' },
  { objectionType: 'Spouse/Partner', resolved: true, closerId: 'demo_closer_2', closer: 'Mike', callOutcome: 'Closed - Won', appointmentDate: '2026-01-21', recordingUrl: 'https://app.closermetrix.com/recordings/rec018' },
  { objectionType: 'Timing', resolved: false, closerId: 'demo_closer_3', closer: 'Jessica', callOutcome: 'Follow-Up', appointmentDate: '2026-01-19', recordingUrl: 'https://app.closermetrix.com/recordings/rec019' },
  { objectionType: 'Already Tried', resolved: true, closerId: 'demo_closer_4', closer: 'Alex', callOutcome: 'Closed - Won', appointmentDate: '2026-01-17', recordingUrl: 'https://app.closermetrix.com/recordings/rec020' },
  { objectionType: 'Financial', resolved: false, closerId: 'demo_closer_1', closer: 'Sarah', callOutcome: 'Follow-Up', appointmentDate: '2026-01-15', recordingUrl: 'https://app.closermetrix.com/recordings/rec021' },
  { objectionType: 'Not Interested', resolved: false, closerId: 'demo_closer_2', closer: 'Mike', callOutcome: 'Lost', appointmentDate: '2026-01-13', recordingUrl: 'https://app.closermetrix.com/recordings/rec022' },
  { objectionType: 'Other', resolved: true, closerId: 'demo_closer_3', closer: 'Jessica', callOutcome: 'Closed - Won', appointmentDate: '2026-01-11', recordingUrl: 'https://app.closermetrix.com/recordings/rec023' },
  { objectionType: 'Think About It', resolved: true, closerId: 'demo_closer_4', closer: 'Alex', callOutcome: 'Closed - Won', appointmentDate: '2026-01-09', recordingUrl: 'https://app.closermetrix.com/recordings/rec024' },
  { objectionType: 'Financial', resolved: true, closerId: 'demo_closer_2', closer: 'Mike', callOutcome: 'Closed - Won', appointmentDate: '2026-01-07', recordingUrl: 'https://app.closermetrix.com/recordings/rec025' },
  { objectionType: 'Spouse/Partner', resolved: false, closerId: 'demo_closer_1', closer: 'Sarah', callOutcome: 'Lost', appointmentDate: '2026-01-05', recordingUrl: 'https://app.closermetrix.com/recordings/rec026' },
  { objectionType: 'Timing', resolved: true, closerId: 'demo_closer_3', closer: 'Jessica', callOutcome: 'Closed - Won', appointmentDate: '2026-01-03', recordingUrl: 'https://app.closermetrix.com/recordings/rec027' },
  { objectionType: 'Already Tried', resolved: false, closerId: 'demo_closer_4', closer: 'Alex', callOutcome: 'DQ', appointmentDate: '2026-01-01', recordingUrl: 'https://app.closermetrix.com/recordings/rec028' },
];

/** Top-3 color assignments keyed by objection type */
const TREND_COLORS = {
  'Financial': 'cyan',
  'Think About It': 'amber',
  'Spouse/Partner': 'blue',
  'Timing': 'green',
  'Already Tried': 'red',
  'Not Interested': 'purple',
  'Other': 'muted',
};

/**
 * Build a time-series from actual records, bucketed by granularity.
 * Returns { series, data } for the top 3 objection types in the filtered set.
 */
function buildTrendFromRecords(rows, filters) {
  if (rows.length === 0) return { series: [], data: [] };

  // Find top 3 types by count
  const typeCounts = {};
  rows.forEach((r) => { typeCounts[r.objectionType] = (typeCounts[r.objectionType] || 0) + 1; });
  const top3 = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type]) => type);

  // Determine date range and bucket size
  const dates = rows.map((r) => r.appointmentDate).sort();
  const dateStart = filters.dateStart || dates[0];
  const dateEnd = filters.dateEnd || dates[dates.length - 1];
  const { intervalDays } = computeGranularity(dateStart, dateEnd);

  // Build buckets
  const start = new Date(dateStart);
  const end = new Date(dateEnd);
  const buckets = [];
  const current = new Date(start);
  while (current <= end) {
    buckets.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + intervalDays);
  }

  // Make stable keys from type names (camelCase-ish)
  const keyOf = (type) => type.replace(/[^a-zA-Z]/g, '').charAt(0).toLowerCase() + type.replace(/[^a-zA-Z]/g, '').slice(1);

  // Count per bucket per type
  const data = buckets.map((bucketDate, idx) => {
    const bucketEnd = idx < buckets.length - 1 ? buckets[idx + 1] : '9999-12-31';
    const point = { date: bucketDate };
    top3.forEach((type) => {
      point[keyOf(type)] = rows.filter(
        (r) => r.objectionType === type && r.appointmentDate >= bucketDate && r.appointmentDate < bucketEnd
      ).length;
    });
    return point;
  });

  const series = top3.map((type) => ({
    key: keyOf(type),
    label: type,
    color: TREND_COLORS[type] || 'cyan',
  }));

  return { series, data };
}

/**
 * Filter records by closerId (comma-separated names), objectionType (comma-separated), and date range.
 */
function filterRecords(records, filters) {
  const { dateStart, dateEnd, closerId, objectionType } = filters;
  const closerList = closerId ? closerId.split(',').map((s) => s.trim()) : [];
  const typeList = objectionType ? objectionType.split(',').map((s) => s.trim()) : [];

  return records.filter((r) => {
    if (dateStart && r.appointmentDate < dateStart) return false;
    if (dateEnd && r.appointmentDate > dateEnd) return false;
    if (closerList.length > 0 && !closerList.includes(r.closerId)) return false;
    if (typeList.length > 0 && !typeList.includes(r.objectionType)) return false;
    return true;
  });
}

function getDemoData(tier = 'insight', filters = {}) {
  const rows = filterRecords(ALL_RECORDS, filters);
  const total = rows.length;
  const resolved = rows.filter((r) => r.resolved).length;
  const unresolved = total - resolved;

  // Unique calls that had objections (approximate using unique dates as proxy)
  const uniqueCallDates = new Set(rows.map((r) => r.appointmentDate + r.closer));
  const callsWithObj = uniqueCallDates.size;
  // Simulate total calls held as ~1.6x calls with objections (not all calls have objections)
  const callsHeld = Math.max(total, Math.round(callsWithObj * 1.6));
  const objectionlessCloses = Math.max(0, Math.round(callsHeld * 0.12));

  const closedWithObj = rows.filter((r) => r.callOutcome === 'Closed - Won').length;
  const lostToObj = rows.filter((r) => r.callOutcome === 'Lost').length;

  // --- Build by-type aggregation ---
  const typeMap = {};
  rows.forEach((r) => {
    if (!typeMap[r.objectionType]) typeMap[r.objectionType] = { total: 0, resolved: 0 };
    typeMap[r.objectionType].total++;
    if (r.resolved) typeMap[r.objectionType].resolved++;
  });

  const byTypeRows = Object.entries(typeMap)
    .map(([type, d]) => ({ type, total: d.total, resolved: d.resolved, resRate: d.total > 0 ? d.resolved / d.total : 0 }))
    .sort((a, b) => b.total - a.total);

  // --- Build by-closer aggregation ---
  const closerMap = {};
  rows.forEach((r) => {
    if (!closerMap[r.closer]) closerMap[r.closer] = { total: 0, resolved: 0 };
    closerMap[r.closer].total++;
    if (r.resolved) closerMap[r.closer].resolved++;
  });

  const byCloserRows = Object.entries(closerMap)
    .map(([closer, d]) => ({ closer, total: d.total, resolved: d.resolved, resRate: d.total > 0 ? d.resolved / d.total : 0 }))
    .sort((a, b) => b.resRate - a.resRate);

  return {
    sections: {
      summary: {
        callsHeld: { value: callsHeld, label: 'Calls Held', format: 'number', glowColor: 'blue' },
        objectionsFaced: { value: total, label: 'Objections Faced', format: 'number', glowColor: 'teal' },
        callsWithObjections: { value: callsHeld > 0 ? callsWithObj / callsHeld : 0, label: '% Calls w/ Objections', format: 'percent', glowColor: 'amber' },
        avgObjectionsPerCall: { value: callsWithObj > 0 ? total / callsWithObj : 0, label: 'Avg Objections / Call', format: 'decimal', glowColor: 'amber' },
        resolvedObjections: { value: resolved, label: 'Resolved', format: 'number', glowColor: 'green' },
        resolutionRate: { value: total > 0 ? resolved / total : 0, label: 'Resolution Rate', format: 'percent', glowColor: 'purple' },
        objectionlessCloses: { value: objectionlessCloses, label: 'Objectionless Closes', format: 'number', glowColor: 'green' },
        closedWithObjections: { value: closedWithObj, label: 'Closed w/ Objections', format: 'number', glowColor: 'green' },
        lostToObjections: { value: lostToObj, label: 'Lost to Objections', format: 'number', glowColor: 'red' },
      },
    },
    charts: {
      objectionsByType: {
        type: 'bar',
        label: 'Objections by Type (Resolved vs Unresolved)',
        series: [
          { key: 'resolved', label: 'Resolved', color: 'green' },
          { key: 'unresolved', label: 'Unresolved', color: 'red' },
        ],
        data: byTypeRows.map((d) => ({
          date: d.type,
          resolved: d.resolved,
          unresolved: d.total - d.resolved,
        })),
      },
      objectionTrends: {
        type: 'line',
        label: 'Top 3 Objections Over Time',
        ...buildTrendFromRecords(rows, filters),
      },
      unresolvedByType: {
        type: 'pie',
        label: 'Unresolved Objections by Type',
        data: Object.entries(typeMap)
          .map(([type, d]) => ({
            label: type,
            value: d.total - d.resolved,
            color: TYPE_COLORS[type] || 'muted',
          }))
          .filter((d) => d.value > 0)
          .sort((a, b) => b.value - a.value),
      },
      resolutionByCloser: {
        type: 'bar',
        label: 'Resolution Rate by Closer',
        series: [{ key: 'resRate', label: 'Resolution Rate', color: 'green' }],
        data: byCloserRows.map((d) => ({ date: d.closer, resRate: d.resRate })),
      },
    },
    tables: {
      byType: {
        columns: ['Type', 'Total', 'Resolved', 'Resolution Rate'],
        rows: byTypeRows,
      },
      byCloser: {
        columns: ['Closer', 'Objections', 'Resolved', 'Resolution Rate'],
        rows: byCloserRows,
      },
      detail: {
        columns: ['Objection Type', 'Resolved', 'Closer', 'Call Outcome', 'Date', 'Recording'],
        rows,
      },
    },
  };
}

module.exports = { getObjectionsData };
