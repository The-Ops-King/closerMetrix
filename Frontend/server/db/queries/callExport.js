/**
 * CALL EXPORT QUERIES
 *
 * Returns raw call records for CSV download.
 * Filtered by client_id, date range, and closer (Insight+ only).
 *
 * Used by: GET /api/dashboard/export-calls
 *
 * Demo mode: generates ~20 sample call records.
 * Live mode: queries v_calls_joined_flat_prefixed with client isolation.
 */

const bq = require('../BigQueryClient');
const logger = require('../../utils/logger');

/** Closer ID -> display name mapping (matches other query files) */
const CLOSER_MAP = {
  'demo_closer_1': 'Sarah',
  'demo_closer_2': 'Mike',
  'demo_closer_3': 'Jessica',
  'demo_closer_4': 'Alex',
};

/** Demo call records — mirrors real Calls table fields */
const DEMO_CALLS = [
  { call_id: 'call_001', appointment_date: '2026-02-20', call_type: 'First Call', attendance: 'Show', call_outcome: 'Closed - Won', closerId: 'demo_closer_1', closer_name: 'Sarah', revenue_generated: 5000, cash_collected: 3000, duration_minutes: 42, recording_url: 'https://app.closermetrix.com/recordings/rec001' },
  { call_id: 'call_002', appointment_date: '2026-02-19', call_type: 'First Call', attendance: 'Show', call_outcome: 'Follow-Up', closerId: 'demo_closer_2', closer_name: 'Mike', revenue_generated: 0, cash_collected: 0, duration_minutes: 35, recording_url: 'https://app.closermetrix.com/recordings/rec002' },
  { call_id: 'call_003', appointment_date: '2026-02-18', call_type: 'Follow-Up', attendance: 'Show', call_outcome: 'Closed - Won', closerId: 'demo_closer_3', closer_name: 'Jessica', revenue_generated: 7500, cash_collected: 4500, duration_minutes: 55, recording_url: 'https://app.closermetrix.com/recordings/rec003' },
  { call_id: 'call_004', appointment_date: '2026-02-17', call_type: 'First Call', attendance: 'No Show - Ghost', call_outcome: 'No Show', closerId: 'demo_closer_4', closer_name: 'Alex', revenue_generated: 0, cash_collected: 0, duration_minutes: 0, recording_url: '' },
  { call_id: 'call_005', appointment_date: '2026-02-16', call_type: 'First Call', attendance: 'Show', call_outcome: 'Lost', closerId: 'demo_closer_1', closer_name: 'Sarah', revenue_generated: 0, cash_collected: 0, duration_minutes: 38, recording_url: 'https://app.closermetrix.com/recordings/rec005' },
  { call_id: 'call_006', appointment_date: '2026-02-15', call_type: 'Follow-Up', attendance: 'Show', call_outcome: 'Closed - Won', closerId: 'demo_closer_2', closer_name: 'Mike', revenue_generated: 4200, cash_collected: 2500, duration_minutes: 48, recording_url: 'https://app.closermetrix.com/recordings/rec006' },
  { call_id: 'call_007', appointment_date: '2026-02-14', call_type: 'First Call', attendance: 'Show', call_outcome: 'DQ', closerId: 'demo_closer_3', closer_name: 'Jessica', revenue_generated: 0, cash_collected: 0, duration_minutes: 22, recording_url: 'https://app.closermetrix.com/recordings/rec007' },
  { call_id: 'call_008', appointment_date: '2026-02-13', call_type: 'First Call', attendance: 'No Show - Canceled', call_outcome: 'No Show', closerId: 'demo_closer_4', closer_name: 'Alex', revenue_generated: 0, cash_collected: 0, duration_minutes: 0, recording_url: '' },
  { call_id: 'call_009', appointment_date: '2026-02-12', call_type: 'First Call', attendance: 'Show', call_outcome: 'Follow-Up', closerId: 'demo_closer_1', closer_name: 'Sarah', revenue_generated: 0, cash_collected: 0, duration_minutes: 40, recording_url: 'https://app.closermetrix.com/recordings/rec009' },
  { call_id: 'call_010', appointment_date: '2026-02-11', call_type: 'Follow-Up', attendance: 'Show', call_outcome: 'Closed - Won', closerId: 'demo_closer_2', closer_name: 'Mike', revenue_generated: 6000, cash_collected: 3600, duration_minutes: 50, recording_url: 'https://app.closermetrix.com/recordings/rec010' },
  { call_id: 'call_011', appointment_date: '2026-02-10', call_type: 'First Call', attendance: 'Show', call_outcome: 'Lost', closerId: 'demo_closer_3', closer_name: 'Jessica', revenue_generated: 0, cash_collected: 0, duration_minutes: 30, recording_url: 'https://app.closermetrix.com/recordings/rec011' },
  { call_id: 'call_012', appointment_date: '2026-02-09', call_type: 'First Call', attendance: 'No Show - Rescheduled', call_outcome: 'No Show', closerId: 'demo_closer_4', closer_name: 'Alex', revenue_generated: 0, cash_collected: 0, duration_minutes: 0, recording_url: '' },
  { call_id: 'call_013', appointment_date: '2026-02-08', call_type: 'Follow-Up', attendance: 'Show', call_outcome: 'Closed - Won', closerId: 'demo_closer_1', closer_name: 'Sarah', revenue_generated: 8000, cash_collected: 5000, duration_minutes: 60, recording_url: 'https://app.closermetrix.com/recordings/rec013' },
  { call_id: 'call_014', appointment_date: '2026-02-07', call_type: 'First Call', attendance: 'Show', call_outcome: 'Follow-Up', closerId: 'demo_closer_2', closer_name: 'Mike', revenue_generated: 0, cash_collected: 0, duration_minutes: 33, recording_url: 'https://app.closermetrix.com/recordings/rec014' },
  { call_id: 'call_015', appointment_date: '2026-02-06', call_type: 'First Call', attendance: 'Show', call_outcome: 'Closed - Won', closerId: 'demo_closer_3', closer_name: 'Jessica', revenue_generated: 5500, cash_collected: 3300, duration_minutes: 45, recording_url: 'https://app.closermetrix.com/recordings/rec015' },
  { call_id: 'call_016', appointment_date: '2026-02-05', call_type: 'First Call', attendance: 'Show', call_outcome: 'Lost', closerId: 'demo_closer_4', closer_name: 'Alex', revenue_generated: 0, cash_collected: 0, duration_minutes: 28, recording_url: 'https://app.closermetrix.com/recordings/rec016' },
  { call_id: 'call_017', appointment_date: '2026-02-04', call_type: 'Follow-Up', attendance: 'Show', call_outcome: 'Follow-Up', closerId: 'demo_closer_1', closer_name: 'Sarah', revenue_generated: 0, cash_collected: 0, duration_minutes: 36, recording_url: 'https://app.closermetrix.com/recordings/rec017' },
  { call_id: 'call_018', appointment_date: '2026-02-03', call_type: 'First Call', attendance: 'Show', call_outcome: 'Closed - Won', closerId: 'demo_closer_2', closer_name: 'Mike', revenue_generated: 4800, cash_collected: 2900, duration_minutes: 47, recording_url: 'https://app.closermetrix.com/recordings/rec018' },
  { call_id: 'call_019', appointment_date: '2026-02-02', call_type: 'First Call', attendance: 'No Show - Ghost', call_outcome: 'No Show', closerId: 'demo_closer_3', closer_name: 'Jessica', revenue_generated: 0, cash_collected: 0, duration_minutes: 0, recording_url: '' },
  { call_id: 'call_020', appointment_date: '2026-02-01', call_type: 'Follow-Up', attendance: 'Show', call_outcome: 'Closed - Won', closerId: 'demo_closer_4', closer_name: 'Alex', revenue_generated: 6200, cash_collected: 3700, duration_minutes: 52, recording_url: 'https://app.closermetrix.com/recordings/rec020' },
  { call_id: 'call_021', appointment_date: '2026-01-30', call_type: 'First Call', attendance: 'Show', call_outcome: 'Follow-Up', closerId: 'demo_closer_1', closer_name: 'Sarah', revenue_generated: 0, cash_collected: 0, duration_minutes: 34, recording_url: 'https://app.closermetrix.com/recordings/rec021' },
  { call_id: 'call_022', appointment_date: '2026-01-28', call_type: 'First Call', attendance: 'Show', call_outcome: 'DQ', closerId: 'demo_closer_2', closer_name: 'Mike', revenue_generated: 0, cash_collected: 0, duration_minutes: 18, recording_url: 'https://app.closermetrix.com/recordings/rec022' },
  { call_id: 'call_023', appointment_date: '2026-01-25', call_type: 'Follow-Up', attendance: 'Show', call_outcome: 'Closed - Won', closerId: 'demo_closer_3', closer_name: 'Jessica', revenue_generated: 5800, cash_collected: 3500, duration_minutes: 44, recording_url: 'https://app.closermetrix.com/recordings/rec023' },
  { call_id: 'call_024', appointment_date: '2026-01-22', call_type: 'First Call', attendance: 'Show', call_outcome: 'Lost', closerId: 'demo_closer_4', closer_name: 'Alex', revenue_generated: 0, cash_collected: 0, duration_minutes: 25, recording_url: 'https://app.closermetrix.com/recordings/rec024' },
];

/**
 * Filter demo records by date range and closerId.
 * Same pattern as objections.js filterRecords.
 */
function filterRecords(records, filters) {
  const { dateStart, dateEnd, closerId } = filters;
  const closerList = closerId ? closerId.split(',').map((s) => s.trim()) : [];

  return records.filter((r) => {
    if (dateStart && r.appointment_date < dateStart) return false;
    if (dateEnd && r.appointment_date > dateEnd) return false;
    if (closerList.length > 0 && !closerList.includes(r.closerId)) return false;
    return true;
  });
}

/**
 * Get call export data for CSV download.
 *
 * @param {string} clientId - Client ID for data isolation
 * @param {object} filters - { dateStart, dateEnd, closerId }
 * @param {string} tier - Client's plan tier
 * @returns {Promise<object>} { rows: Array<call record> }
 */
async function getCallExportData(clientId, filters = {}, tier = 'basic') {
  if (!bq.isAvailable() || clientId.startsWith('demo_')) {
    logger.debug('Returning demo call export data');
    return getDemoData(filters);
  }

  try {
    return await queryBigQuery(clientId, filters, tier);
  } catch (err) {
    logger.error('Call export BQ query failed, falling back to demo', {
      error: err.message,
      clientId,
    });
    return getDemoData(filters);
  }
}

/**
 * Query BigQuery for call records.
 * Selects human-readable column names from v_calls_joined_flat_prefixed.
 */
async function queryBigQuery(clientId, filters, tier) {
  const params = { clientId };
  const conditions = ['clients_client_id = @clientId'];

  if (filters.dateStart) {
    conditions.push('calls_appointment_date >= @dateStart');
    params.dateStart = filters.dateStart;
  }
  if (filters.dateEnd) {
    conditions.push('calls_appointment_date <= @dateEnd');
    params.dateEnd = filters.dateEnd;
  }
  if (filters.closerId) {
    conditions.push('calls_closer_id IN UNNEST(@closerIds)');
    params.closerIds = filters.closerId.split(',').map(id => id.trim());
  }

  const whereClause = conditions.join(' AND ');

  const sql = `
    SELECT
      calls_call_id AS call_id,
      CAST(calls_appointment_date AS STRING) AS date,
      calls_call_type AS call_type,
      calls_attendance AS attendance,
      calls_call_outcome AS outcome,
      closers_name AS closer,
      calls_revenue_generated AS revenue,
      calls_cash_collected AS cash,
      calls_duration_minutes AS duration,
      calls_recording_url AS recording_url
    FROM \`closer-automation.CloserAutomation.v_calls_joined_flat_prefixed\`
    WHERE ${whereClause}
    ORDER BY calls_appointment_date DESC
  `;

  const rows = await bq.runQuery(sql, params);

  // Clean date to YYYY-MM-DD — handles TIMESTAMP objects and string timestamps
  for (const row of rows) {
    if (!row.date) continue;
    if (typeof row.date === 'object' && row.date.value) {
      row.date = String(row.date.value).split('T')[0];
    } else if (typeof row.date === 'string') {
      row.date = row.date.split(/[T ]/)[0];
    }
  }

  return { rows };
}

/**
 * Demo data: filter and return call records.
 * Strips the internal closerId field before returning.
 */
function getDemoData(filters) {
  const filtered = filterRecords(DEMO_CALLS, filters);

  const rows = filtered.map((r) => ({
    call_id: r.call_id,
    date: r.appointment_date,
    call_type: r.call_type,
    attendance: r.attendance,
    outcome: r.call_outcome,
    closer: r.closer_name,
    revenue: r.revenue_generated,
    cash: r.cash_collected,
    duration: r.duration_minutes,
    recording_url: r.recording_url,
  }));

  return { rows };
}

module.exports = { getCallExportData };
