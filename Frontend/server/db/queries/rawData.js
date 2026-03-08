/**
 * RAW DATA QUERIES — Full Dataset for Client-Side Filtering
 *
 * Returns ALL call records, objections, and close cycle data for a client
 * in a single request. No date or closer filtering — the frontend handles
 * all filtering client-side for instant responsiveness.
 *
 * This endpoint powers the new raw data views where the frontend needs
 * the complete dataset to do its own slicing/dicing without round-trips.
 *
 * Data sources:
 *   v_calls_joined_flat_prefixed — All calls with closer + client data
 *   v_objections_joined — All objections with call/closer/client data
 *   v_close_cycle_stats_dated — Close cycle metrics per prospect
 *
 * Used by: GET /api/dashboard/raw-data
 *
 * Return shape: { calls: [...], objections: [...], closeCycles: [...] }
 */

const bq = require('../BigQueryClient');
const logger = require('../../utils/logger');
const { normalizeObjectionType } = require('../../../shared/categoryValues');

/**
 * Extract YYYY-MM-DD from any date-like value.
 * Handles BigQuery TIMESTAMP objects ({ value: '...' }), Date instances, and strings.
 */
function toDateStr(val) {
  if (!val) return '';
  // BigQuery TIMESTAMP returns { value: '2026-02-16T15:00:00.000000Z' }
  if (typeof val === 'object' && val !== null && val.value) {
    return String(val.value).split('T')[0];
  }
  if (val instanceof Date) return val.toISOString().split('T')[0];
  const str = String(val);
  if (str.includes('T')) return str.split('T')[0];
  // BigQuery may also return '2026-02-16 15:00:00 UTC'
  if (str.includes(' ')) return str.split(' ')[0];
  return str.length > 10 ? str.substring(0, 10) : str;
}

/**
 * Fetch all raw data for a client — calls, objections, and close cycles.
 * No filtering applied; the frontend does all filtering.
 *
 * For demo clients (clientId starts with 'demo_'), returns hardcoded demo data.
 * Falls back to demo data if BigQuery query fails.
 *
 * @param {string} clientId - Client ID for data isolation
 * @returns {Promise<{ calls: Array, objections: Array, closeCycles: Array }>}
 */
async function getRawData(clientId) {
  if (!bq.isAvailable() || clientId.startsWith('demo_')) {
    logger.debug('Returning demo raw data', { clientId });
    return getDemoData();
  }

  try {
    return await queryBigQuery(clientId);
  } catch (err) {
    logger.error('Raw data BQ query failed, falling back to demo', { error: err.message, clientId });
    return getDemoData();
  }
}

/**
 * Run 3 parallel BigQuery queries to fetch the complete dataset for a client.
 * Each query catches its own errors so one failure doesn't crash the others.
 *
 * @param {string} clientId - Client ID for data isolation
 * @returns {Promise<{ calls: Array, objections: Array, closeCycles: Array }>}
 */
async function queryBigQuery(clientId) {
  const { num } = require('./helpers');
  const params = { clientId };

  const callsView = bq.table('v_calls_joined_flat_prefixed');
  const objectionsView = bq.table('v_objections_joined');
  const closeCycleView = bq.table('v_close_cycle_stats_dated');

  // 1) All calls — no date or closer filter, just client isolation
  const callsSql = `
    SELECT
      calls_call_id,
      calls_appointment_date,
      calls_call_type,
      calls_attendance,
      calls_call_outcome,
      calls_revenue_generated,
      calls_cash_collected,
      calls_closer_id,
      closers_name,
      calls_duration_minutes,
      calls_overall_call_score,
      calls_script_adherence_score,
      calls_discovery_score,
      calls_pitch_score,
      calls_close_attempt_score,
      calls_objection_handling_score,
      calls_prospect_fit_score,
      calls_intro_score,
      calls_pain_score,
      calls_goal_score,
      calls_transition_score,
      calls_key_moments,
      calls_compliance_flags,
      calls_payment_plan,
      calls_recording_url,
      calls_transcript_link,
      calls_lost_reason,
      calls_product_purchased,
      calls_prospect_email,
      calls_prospect_name,
      calls_call_source
    FROM ${callsView}
    WHERE clients_client_id = @clientId
    ORDER BY calls_appointment_date DESC`;

  // 2) All objections — no date or closer filter
  const objectionsSql = `
    SELECT
      obj_objection_id,
      obj_call_id,
      obj_objection_type,
      obj_objection_text,
      obj_resolved,
      obj_resolution_method,
      obj_timestamp_seconds,
      calls_appointment_date,
      calls_closer_id,
      closers_name,
      calls_call_outcome,
      calls_attendance
    FROM ${objectionsView}
    WHERE obj_client_id = @clientId
    ORDER BY calls_appointment_date DESC`;

  // 3) Close cycle stats — no date filter
  const closersTable = bq.table('Closers');
  const closeCycleSql = `
    SELECT
      cc.prospect_email,
      cc.client_id,
      cc.closer_id,
      cl.name AS closer_name,
      cc.close_date,
      cc.days_to_close,
      cc.calls_to_close
    FROM ${closeCycleView} cc
    LEFT JOIN ${closersTable} cl ON cc.closer_id = cl.closer_id
    WHERE cc.client_id = @clientId`;

  // 4) Client record — goals for GoalsPacing on Projections page
  const clientsTable = bq.table('Clients');
  const clientSql = `
    SELECT
      monthly_goal,
      quarterly_goal,
      yearly_goal
    FROM ${clientsTable}
    WHERE client_id = @clientId
    LIMIT 1`;

  // 5) Pains/goals text — from Calls table directly (not in the view)
  //    Used by Market Insight page to show "voice of the market" themes
  const callsTable = bq.table('Calls');
  const painsGoalsSql = `
    SELECT call_id, pains, goals
    FROM ${callsTable}
    WHERE client_id = @clientId
      AND (pains IS NOT NULL OR goals IS NOT NULL)`;

  // Run all 5 in parallel, catching individual failures
  const [callsResult, objectionsResult, closeCycleResult, clientResult, painsGoalsResult] = await Promise.all([
    bq.runQuery(callsSql, params).catch(err => {
      logger.warn('Raw data: calls query failed', { error: err.message, clientId });
      return null;
    }),
    bq.runQuery(objectionsSql, params).catch(err => {
      logger.warn('Raw data: objections query failed', { error: err.message, clientId });
      return null;
    }),
    bq.runQuery(closeCycleSql, params).catch(err => {
      logger.warn('Raw data: close cycle query failed', { error: err.message, clientId });
      return null;
    }),
    bq.runQuery(clientSql, params).catch(err => {
      logger.warn('Raw data: client query failed', { error: err.message, clientId });
      return null;
    }),
    bq.runQuery(painsGoalsSql, params).catch(err => {
      logger.warn('Raw data: pains/goals query failed', { error: err.message, clientId });
      return null;
    }),
  ]);

  // Parse calls into clean array
  const calls = (callsResult || []).map(row => {
    // Parse appointment_date to clean YYYY-MM-DD string.
    // Handles BigQuery TIMESTAMP objects ({ value: '...' }), Date objects, and plain strings.
    const appointmentDate = toDateStr(row.calls_appointment_date);

    return {
      callId: row.calls_call_id,
      appointmentDate,
      callType: row.calls_call_type || '',
      attendance: row.calls_attendance || '',
      callOutcome: row.calls_call_outcome || '',
      revenueGenerated: num(row.calls_revenue_generated),
      cashCollected: num(row.calls_cash_collected),
      closerId: row.calls_closer_id || '',
      closerName: row.closers_name || '',
      durationMinutes: num(row.calls_duration_minutes),
      overallCallScore: num(row.calls_overall_call_score),
      scriptAdherenceScore: num(row.calls_script_adherence_score),
      discoveryScore: num(row.calls_discovery_score),
      pitchScore: num(row.calls_pitch_score),
      closeAttemptScore: num(row.calls_close_attempt_score),
      objectionHandlingScore: num(row.calls_objection_handling_score),
      prospectFitScore: num(row.calls_prospect_fit_score),
      introScore: num(row.calls_intro_score),
      painScore: num(row.calls_pain_score),
      goalScore: num(row.calls_goal_score),
      transitionScore: num(row.calls_transition_score),
      keyMoments: row.calls_key_moments || '',
      complianceFlags: row.calls_compliance_flags ? (typeof row.calls_compliance_flags === 'string' ? JSON.parse(row.calls_compliance_flags) : row.calls_compliance_flags) : [],
      paymentPlan: row.calls_payment_plan || '',
      recordingUrl: row.calls_recording_url || '',
      transcriptLink: row.calls_transcript_link || '',
      lostReason: row.calls_lost_reason || '',
      productPurchased: row.calls_product_purchased || '',
      prospectEmail: row.calls_prospect_email || '',
      prospectName: row.calls_prospect_name || '',
      callSource: row.calls_call_source || '',
    };
  });

  // Merge pains/goals text into calls by callId
  if (painsGoalsResult) {
    const pgMap = {};
    for (const row of painsGoalsResult) {
      pgMap[row.call_id] = { pains: row.pains || '', goals: row.goals || '' };
    }
    for (const call of calls) {
      const pg = pgMap[call.callId];
      if (pg) {
        call.pains = pg.pains;
        call.goals = pg.goals;
      }
    }
  }

  // Parse objections into clean array
  const objections = (objectionsResult || []).map(row => {
    const appointmentDate = toDateStr(row.calls_appointment_date);

    return {
      objectionId: row.obj_objection_id || '',
      callId: row.obj_call_id || '',
      objectionType: normalizeObjectionType(row.obj_objection_type || ''),
      objectionText: row.obj_objection_text || '',
      resolved: !!row.obj_resolved,
      resolutionMethod: row.obj_resolution_method || '',
      timestampSeconds: num(row.obj_timestamp_seconds),
      appointmentDate,
      closerId: row.calls_closer_id || '',
      closerName: row.closers_name || '',
      callOutcome: row.calls_call_outcome || '',
      attendance: row.calls_attendance || '',
    };
  });

  // Parse close cycles into clean array
  const closeCycles = (closeCycleResult || []).map(row => ({
    prospectEmail: row.prospect_email || '',
    clientId: row.client_id || '',
    closerId: row.closer_id || '',
    closerName: row.closer_name || '',
    closeDate: toDateStr(row.close_date) || '',
    daysToClose: num(row.days_to_close),
    callsToClose: num(row.calls_to_close),
  }));

  // Parse client record for goals
  const clientRow = (clientResult || [])[0] || {};
  const client = {
    monthlyGoal: num(clientRow.monthly_goal),
    quarterlyGoal: num(clientRow.quarterly_goal),
    yearlyGoal: num(clientRow.yearly_goal),
  };

  return { calls, objections, closeCycles, client };
}


// ================================================================
// DEMO DATA — Realistic sample data for development and demos
// ================================================================

/** Closer ID -> display name mapping (matches other query files) */
const CLOSER_MAP = {
  'demo_closer_1': 'Sarah',
  'demo_closer_2': 'Mike',
  'demo_closer_3': 'Jessica',
  'demo_closer_4': 'Alex',
};
const CLOSER_IDS = Object.keys(CLOSER_MAP);

/**
 * Simple seeded random to produce consistent demo data across requests.
 * Uses a linear congruential generator seeded from the index.
 *
 * @param {number} seed - Integer seed value
 * @returns {number} Pseudo-random float between 0 and 1
 */
function seededRandom(seed) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

/**
 * Pick a random item from an array using a seeded random value.
 *
 * @param {Array} arr - Array to pick from
 * @param {number} seed - Integer seed
 * @returns {*} A randomly selected element
 */
function pick(arr, seed) {
  return arr[Math.floor(seededRandom(seed) * arr.length)];
}

/**
 * Generate a seeded random integer in [min, max] range.
 *
 * @param {number} min - Minimum value (inclusive)
 * @param {number} max - Maximum value (inclusive)
 * @param {number} seed - Integer seed
 * @returns {number} Random integer
 */
function randInt(min, max, seed) {
  return min + Math.floor(seededRandom(seed) * (max - min + 1));
}

/**
 * Generate ~50 realistic demo call records spanning the last 3 months.
 * Produces consistent data (seeded random) so results don't change per request.
 *
 * Distribution:
 *   call_type:  65% First Call, 35% Follow-Up
 *   attendance: 70% Show, 10% Ghost, 10% Canceled, 10% Rescheduled
 *   outcomes (for Shows): 25% Closed-Won, 30% Follow-Up, 20% Lost,
 *                          10% DQ, 10% Deposit, 5% Not Pitched
 *   revenue (for closes): $3000-$8000, cash = ~60% of revenue
 *   AI scores: overall 5-9, adherence 5-9, discovery 4-9, pitch 5-9,
 *              close attempt 4-9, objection handling 4-9
 *
 * @returns {Array<object>} Array of normalized call records
 */
function generateDemoCalls() {
  const calls = [];
  const now = new Date('2026-02-22');
  const numCalls = 50;

  // Lost reasons for variety
  const lostReasons = ["Can't Afford", 'Closer Error', 'Not Interested', 'Timing', 'Other'];

  // Pool of prospect emails — some prospects will appear on multiple calls
  // to enable deposit lifecycle tracking (Deposit → Closed-Won/Lost/Still Open)
  const PROSPECT_EMAILS = [
    'john.smith@example.com',      // 0
    'jane.doe@example.com',        // 1
    'bob.wilson@example.com',      // 2
    'alice.johnson@example.com',   // 3
    'charlie.brown@example.com',   // 4
    'diana.prince@example.com',    // 5
    'edward.norton@example.com',   // 6
    'fiona.apple@example.com',     // 7
    'greg.house@example.com',      // 8
    'helen.troy@example.com',      // 9
    'ivan.drago@example.com',      // 10
    'julia.roberts@example.com',   // 11
    'kevin.hart@example.com',      // 12
    'lisa.simpson@example.com',    // 13
    'mark.twain@example.com',      // 14
  ];

  for (let i = 0; i < numCalls; i++) {
    // Spread calls over the last ~90 days
    const daysAgo = Math.floor((i / numCalls) * 90);
    const callDate = new Date(now);
    callDate.setDate(callDate.getDate() - daysAgo);
    const appointmentDate = callDate.toISOString().split('T')[0];

    // Assign closer (rotate through 4 closers)
    const closerId = CLOSER_IDS[i % 4];
    const closerName = CLOSER_MAP[closerId];

    // Call type: 65% First Call, 35% Follow-Up
    const callType = seededRandom(i * 7 + 1) < 0.65 ? 'First Call' : 'Follow-Up';

    // Attendance: 70% Show, 10% Ghost, 10% Canceled, 10% Rescheduled
    const attendanceRoll = seededRandom(i * 7 + 2);
    let attendance;
    if (attendanceRoll < 0.70) {
      attendance = 'Show';
    } else if (attendanceRoll < 0.80) {
      attendance = 'No Show - Ghost';
    } else if (attendanceRoll < 0.90) {
      attendance = 'No Show - Canceled';
    } else {
      attendance = 'No Show - Rescheduled';
    }

    // For non-shows, outcome is effectively No Show with no scores
    let callOutcome = '';
    let revenueGenerated = 0;
    let cashCollected = 0;
    let durationMinutes = 0;
    let overallCallScore = 0;
    let scriptAdherenceScore = 0;
    let discoveryScore = 0;
    let pitchScore = 0;
    let closeAttemptScore = 0;
    let objectionHandlingScore = 0;
    let prospectFitScore = 0;
    let introScore = 0;
    let painScore = 0;
    let goalScore = 0;
    let transitionScore = 0;
    let complianceFlags = [];
    let lostReason = '';
    let paymentPlan = '';

    if (attendance === 'Show') {
      // Outcome distribution for shows:
      // 25% Closed-Won, 30% Follow-Up, 20% Lost, 10% DQ, 10% Deposit, 5% Not Pitched
      const outcomeRoll = seededRandom(i * 7 + 3);
      if (outcomeRoll < 0.25) {
        callOutcome = 'Closed - Won';
        revenueGenerated = randInt(3000, 8000, i * 7 + 4);
        // Round revenue to nearest 100
        revenueGenerated = Math.round(revenueGenerated / 100) * 100;
        // Cash is approximately 60% of revenue
        cashCollected = Math.round(revenueGenerated * (0.55 + seededRandom(i * 7 + 5) * 0.10));
        cashCollected = Math.round(cashCollected / 100) * 100;
      } else if (outcomeRoll < 0.55) {
        callOutcome = 'Follow-Up';
      } else if (outcomeRoll < 0.75) {
        callOutcome = 'Lost';
        lostReason = pick(lostReasons, i * 7 + 6);
      } else if (outcomeRoll < 0.85) {
        callOutcome = 'DQ';
      } else if (outcomeRoll < 0.95) {
        callOutcome = 'Deposit';
        revenueGenerated = randInt(3000, 7000, i * 7 + 4);
        revenueGenerated = Math.round(revenueGenerated / 100) * 100;
        // Deposits collect less cash upfront (~30-40%)
        cashCollected = Math.round(revenueGenerated * (0.30 + seededRandom(i * 7 + 5) * 0.10));
        cashCollected = Math.round(cashCollected / 100) * 100;
      } else {
        callOutcome = 'Not Pitched';
      }

      // Duration: 15-65 minutes for shows
      durationMinutes = randInt(15, 65, i * 7 + 7);

      // AI scores for shows (varying quality)
      overallCallScore = randInt(5, 9, i * 7 + 8);
      scriptAdherenceScore = randInt(5, 9, i * 7 + 9);
      discoveryScore = randInt(4, 9, i * 7 + 10);
      pitchScore = randInt(5, 9, i * 7 + 11);
      closeAttemptScore = randInt(4, 9, i * 7 + 12);
      objectionHandlingScore = randInt(4, 9, i * 7 + 13);
      prospectFitScore = randInt(4, 9, i * 7 + 14);
      introScore = randInt(4, 9, i * 7 + 15);
      painScore = randInt(4, 9, i * 7 + 16);
      goalScore = randInt(4, 9, i * 7 + 17);
      transitionScore = randInt(4, 9, i * 7 + 18);

      // Compliance flags — add to ~20% of show calls
      if (seededRandom(i * 7 + 19) < 0.20) {
        const flagCategories = ['Claims', 'Guarantees', 'Earnings', 'Pressure'];
        const flagCat = pick(flagCategories, i * 7 + 20);
        complianceFlags = [{
          category: flagCat,
          exact_phrase: `Demo ${flagCat.toLowerCase()} flag — example phrase`,
          timestamp: `00:${String(randInt(5, 45, i * 7 + 21)).padStart(2, '0')}:00`,
          risk_level: pick(['high', 'medium', 'low'], i * 7 + 22),
          explanation: `This is a demo ${flagCat.toLowerCase()} compliance flag for testing.`,
        }];
      }

      // Payment plan (for revenue deals)
      if (callOutcome === 'Closed - Won') {
        const planRoll = seededRandom(i * 7 + 18);
        paymentPlan = planRoll < 0.40 ? 'Full' : planRoll < 0.70 ? 'Deposit' : planRoll < 0.90 ? 'Payment Plan' : '';
      } else if (callOutcome === 'Deposit') {
        paymentPlan = 'Deposit';
      }
    } else {
      // No-shows get no outcome, duration, or scores
      callOutcome = 'No Show';
    }

    // Assign prospect email — reuse emails for some prospects so they have
    // multiple calls (needed for deposit lifecycle: Deposit → Closed-Won/Lost)
    // Most calls get unique-ish prospects; some share to create multi-call patterns
    const prospectEmail = PROSPECT_EMAILS[i % PROSPECT_EMAILS.length];

    calls.push({
      callId: `demo_call_${String(i + 1).padStart(3, '0')}`,
      appointmentDate,
      callType,
      attendance,
      callOutcome,
      revenueGenerated,
      cashCollected,
      closerId,
      closerName,
      durationMinutes,
      overallCallScore,
      scriptAdherenceScore,
      discoveryScore,
      pitchScore,
      closeAttemptScore,
      objectionHandlingScore,
      prospectFitScore,
      introScore,
      painScore,
      goalScore,
      transitionScore,
      keyMoments: attendance === 'Show' ? 'Demo key moments summary' : '',
      complianceFlags,
      paymentPlan,
      recordingUrl: attendance === 'Show' ? `https://app.closermetrix.com/recordings/demo_rec_${String(i + 1).padStart(3, '0')}` : '',
      transcriptLink: attendance === 'Show' ? `https://app.closermetrix.com/transcripts/demo_tr_${String(i + 1).padStart(3, '0')}` : '',
      lostReason,
      prospectEmail,
    });
  }

  return calls;
}

/**
 * Generate ~15 realistic demo objection records.
 * Linked to demo calls, with a mix of objection types and resolution outcomes.
 *
 * @returns {Array<object>} Array of normalized objection records
 */
function generateDemoObjections() {
  const objectionTypes = ['Financial', 'Think About It', 'Spouse/Partner', 'Timing', 'Already Tried', 'Not Interested', 'Other'];
  const resolutionMethods = ['Reframe', 'Empathy + Evidence', 'Isolate', 'Trial Close', 'Social Proof', 'Feel-Felt-Found'];
  const outcomes = ['Closed - Won', 'Follow-Up', 'Lost', 'DQ'];

  const objections = [];
  const numObjections = 15;

  for (let i = 0; i < numObjections; i++) {
    const daysAgo = Math.floor((i / numObjections) * 90);
    const objDate = new Date('2026-02-22');
    objDate.setDate(objDate.getDate() - daysAgo);
    const appointmentDate = objDate.toISOString().split('T')[0];

    const closerId = CLOSER_IDS[i % 4];
    const closerName = CLOSER_MAP[closerId];
    const objType = pick(objectionTypes, i * 5 + 1);
    const resolved = seededRandom(i * 5 + 2) < 0.6; // 60% resolved
    const callOutcome = pick(outcomes, i * 5 + 3);

    objections.push({
      objectionId: `demo_obj_${String(i + 1).padStart(3, '0')}`,
      callId: `demo_call_${String((i * 3) % 50 + 1).padStart(3, '0')}`,
      objectionType: objType,
      objectionText: `Demo ${objType.toLowerCase()} objection — prospect raised concern about ${objType.toLowerCase()}`,
      resolved,
      resolutionMethod: resolved ? pick(resolutionMethods, i * 5 + 4) : '',
      timestampSeconds: randInt(120, 2400, i * 5 + 5),
      appointmentDate,
      closerId,
      closerName,
      callOutcome,
      attendance: 'Show',
    });
  }

  return objections;
}

/**
 * Generate ~8 realistic demo close cycle records.
 * Each represents a prospect who closed, with varying days/calls to close.
 *
 * @returns {Array<object>} Array of normalized close cycle records
 */
function generateDemoCloseCycles() {
  const closeCycles = [];
  const prospects = [
    { email: 'john.smith@example.com', closerId: 'demo_closer_1', closerName: 'Sarah', daysAgo: 5, days: 0, calls: 1 },
    { email: 'jane.doe@example.com', closerId: 'demo_closer_2', closerName: 'Mike', daysAgo: 10, days: 3, calls: 2 },
    { email: 'bob.wilson@example.com', closerId: 'demo_closer_3', closerName: 'Jessica', daysAgo: 18, days: 7, calls: 2 },
    { email: 'alice.johnson@example.com', closerId: 'demo_closer_1', closerName: 'Sarah', daysAgo: 25, days: 14, calls: 3 },
    { email: 'charlie.brown@example.com', closerId: 'demo_closer_4', closerName: 'Alex', daysAgo: 35, days: 1, calls: 1 },
    { email: 'diana.prince@example.com', closerId: 'demo_closer_2', closerName: 'Mike', daysAgo: 48, days: 21, calls: 4 },
    { email: 'edward.norton@example.com', closerId: 'demo_closer_3', closerName: 'Jessica', daysAgo: 60, days: 5, calls: 2 },
    { email: 'fiona.apple@example.com', closerId: 'demo_closer_4', closerName: 'Alex', daysAgo: 75, days: 30, calls: 5 },
  ];

  for (const p of prospects) {
    const closeDate = new Date('2026-02-22');
    closeDate.setDate(closeDate.getDate() - p.daysAgo);

    closeCycles.push({
      prospectEmail: p.email,
      clientId: 'demo_client',
      closerId: p.closerId,
      closerName: p.closerName,
      closeDate: closeDate.toISOString().split('T')[0],
      daysToClose: p.days,
      callsToClose: p.calls,
    });
  }

  return closeCycles;
}

/**
 * Return complete demo dataset with calls, objections, and close cycles.
 * All demo data is seeded for consistency across requests.
 *
 * @returns {{ calls: Array, objections: Array, closeCycles: Array }}
 */
function getDemoData() {
  return {
    calls: generateDemoCalls(),
    objections: generateDemoObjections(),
    closeCycles: generateDemoCloseCycles(),
    client: { monthlyGoal: 50000, quarterlyGoal: 150000, yearlyGoal: 600000 },
  };
}

module.exports = { getRawData };
