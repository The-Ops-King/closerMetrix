/**
 * CANONICAL CALL VALUES — BigQuery column values as constants.
 *
 * Every hardcoded string that matches a BigQuery column value lives here.
 * When a value changes in BigQuery (e.g. 'DQ' → 'Disqualified'), update
 * it ONCE here and all queries, predicates, and charts pick it up.
 *
 * Used by: computePageData.js (client), server query files, filter components.
 *
 * Naming convention:
 *   OUTCOMES.CLOSED_WON  → matches calls.call_outcome = 'Closed - Won'
 *   ATTENDANCE.SHOW       → matches calls.attendance = 'Show'
 *   CALL_TYPES.FIRST_CALL → matches calls.call_type = 'First Call'
 */

// ─────────────────────────────────────────────────────────────
// CALL OUTCOMES — calls.call_outcome / calls_call_outcome
// ─────────────────────────────────────────────────────────────

const OUTCOMES = {
  CLOSED_WON: 'Closed - Won',
  DEPOSIT: 'Deposit',
  FOLLOW_UP: 'Follow Up',
  FOLLOW_UP_ALT: 'Follow-Up',    // Legacy variant seen in some records
  LOST: 'Lost',
  DQ: 'DQ',
  DISQUALIFIED: 'Disqualified',  // Full-text variant of DQ
  NOT_PITCHED: 'Not Pitched',
};

/** Both follow-up outcome spellings — use with Array.includes() */
const FOLLOW_UP_OUTCOMES = [OUTCOMES.FOLLOW_UP, OUTCOMES.FOLLOW_UP_ALT];

/** Both DQ variants — use with Array.includes() */
const DQ_OUTCOMES = [OUTCOMES.DQ, OUTCOMES.DISQUALIFIED];

/** Outcomes that generate revenue (Closed + Deposit) */
const REVENUE_OUTCOMES = [OUTCOMES.CLOSED_WON, OUTCOMES.DEPOSIT];

/**
 * All possible call outcome values for dropdowns/filters.
 * Order matters: matches the visual priority in pie charts and tables.
 */
const ALL_CALL_OUTCOMES = [
  OUTCOMES.CLOSED_WON,
  OUTCOMES.DEPOSIT,
  OUTCOMES.FOLLOW_UP,
  OUTCOMES.LOST,
  OUTCOMES.NOT_PITCHED,
  OUTCOMES.DISQUALIFIED,
];

// ─────────────────────────────────────────────────────────────
// ATTENDANCE — calls.attendance / calls_attendance
// ─────────────────────────────────────────────────────────────

const ATTENDANCE = {
  SHOW: 'Show',
  GHOSTED: 'Ghosted',
  CANCELED: 'Canceled',
  RESCHEDULED: 'Rescheduled',
  NOT_PITCHED: 'Not Pitched',
  OVERBOOKED: 'Overbooked',
};

/**
 * Substrings that indicate a ghost/no-show.
 * Match with attendance.includes() — catches 'Ghosted', 'Ghosted - No Show',
 * 'No Show - Ghost', etc.
 */
const GHOST_SUBSTRINGS = ['Ghost', 'No Show'];

/** Substrings that indicate a cancellation */
const CANCEL_SUBSTRINGS = ['Cancel'];

/** Substrings that indicate a reschedule */
const RESCHEDULE_SUBSTRINGS = ['Rescheduled'];

// ─────────────────────────────────────────────────────────────
// CALL TYPES — calls.call_type / calls_call_type
// ─────────────────────────────────────────────────────────────

const CALL_TYPES = {
  FIRST_CALL: 'First Call',
  FOLLOW_UP: 'Follow Up',
};

// ─────────────────────────────────────────────────────────────
// KEY MOMENT TYPES — entries inside calls.key_moments JSON array
// ─────────────────────────────────────────────────────────────

/** Types of key_moments entries that count as compliance risk flags */
const KEY_MOMENT_RISK_TYPES = ['risk', 'violation', 'compliance'];

// ─────────────────────────────────────────────────────────────
// LOST REASONS — calls.lost_reason / calls_lost_reason
// ─────────────────────────────────────────────────────────────

const LOST_REASONS = ["Can't Afford", 'Closer Error', 'Not Interested', 'Timing', 'Other'];

// ─────────────────────────────────────────────────────────────
// EXPORTS — CommonJS + ESM hybrid (same pattern as metricKeys.js)
// ─────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    OUTCOMES,
    FOLLOW_UP_OUTCOMES,
    DQ_OUTCOMES,
    REVENUE_OUTCOMES,
    ALL_CALL_OUTCOMES,
    ATTENDANCE,
    GHOST_SUBSTRINGS,
    CANCEL_SUBSTRINGS,
    RESCHEDULE_SUBSTRINGS,
    CALL_TYPES,
    KEY_MOMENT_RISK_TYPES,
    LOST_REASONS,
  };
}

export {
  OUTCOMES,
  FOLLOW_UP_OUTCOMES,
  DQ_OUTCOMES,
  REVENUE_OUTCOMES,
  ALL_CALL_OUTCOMES,
  ATTENDANCE,
  GHOST_SUBSTRINGS,
  CANCEL_SUBSTRINGS,
  RESCHEDULE_SUBSTRINGS,
  CALL_TYPES,
  KEY_MOMENT_RISK_TYPES,
  LOST_REASONS,
};
