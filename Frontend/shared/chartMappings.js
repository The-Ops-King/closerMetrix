/**
 * CHART MAPPINGS — Color/label/key assignments for chart series.
 *
 * Centralizes the repeated chart series arrays that appear in both
 * computePageData.js (client-side) and the server query files.
 * Each config entry maps a BigQuery value → { label, color, key }
 * used by pie charts, stacked bars, and line chart legends.
 *
 * This file is SELF-CONTAINED (no cross-imports from other shared/ files)
 * to work with the CommonJS+ESM hybrid export pattern in Node 22.
 * The string values here MUST stay in sync with callValues.js and
 * categoryValues.js — if a BigQuery value changes, update both files.
 *
 * When a new outcome or category is added, update these configs
 * and all charts automatically pick up the new series.
 */

// ─────────────────────────────────────────────────────────────
// OUTCOME CHART SERIES — pie charts, stacked bars, line series
// ─────────────────────────────────────────────────────────────

/**
 * Standard outcome breakdown used by:
 *   - Overview outcomeBreakdown pie
 *   - Call Outcomes outcomeBreakdown pie
 *   - Per-closer outcome stacked bar
 *   - Outcomes over time line chart
 *
 * Order determines visual stacking and legend order.
 */
const OUTCOME_CHART_CONFIG = [
  { value: 'Closed - Won',  label: 'Closed',       color: 'green',  key: 'closed' },
  { value: 'Deposit',       label: 'Deposit',      color: 'amber',  key: 'deposit' },
  { value: 'Follow Up',     label: 'Follow-Up',    color: 'purple', key: 'followUp' },
  { value: 'Lost',          label: 'Lost',         color: 'red',    key: 'lost' },
  { value: 'Disqualified',  label: 'DQ',           color: 'muted',  key: 'disqualified' },
  { value: 'Not Pitched',   label: 'Not Pitched',  color: 'blue',   key: 'notPitched' },
];

// ─────────────────────────────────────────────────────────────
// ATTENDANCE CHART SERIES — attendance pie, not-taken breakdown
// ─────────────────────────────────────────────────────────────

/** Attendance breakdown pie chart series */
const ATTENDANCE_CHART_CONFIG = [
  { value: 'Show',        label: 'Show',        color: 'green' },
  { value: 'Ghosted',     label: 'Ghosted',     color: 'amber' },
  { value: 'Rescheduled', label: 'Rescheduled', color: 'purple' },
  { value: 'Overbooked',  label: 'Overbooked',  color: 'blue' },
  { value: 'Not Pitched', label: 'Not Pitched', color: 'red' },
];

/** Not-taken breakdown bar chart series (subset of attendance) */
const NOT_TAKEN_CHART_CONFIG = [
  { key: 'ghosted',     label: '# Ghosted',    color: 'amber' },
  { key: 'canceled',    label: 'Canceled',      color: 'red' },
  { key: 'rescheduled', label: 'Rescheduled',   color: 'purple' },
];

// ─────────────────────────────────────────────────────────────
// SALES CYCLE CHART SERIES
// ─────────────────────────────────────────────────────────────

/** Calls-to-close distribution pie/bar */
const CALLS_TO_CLOSE_CHART_CONFIG = [
  { label: '1 Call',   key: 'oneCall',    color: 'green' },
  { label: '2 Calls',  key: 'twoCalls',   color: 'cyan' },
  { label: '3+ Calls', key: 'threePlus',  color: 'amber' },
];

/** Days-to-close distribution pie/bar */
const DAYS_TO_CLOSE_CHART_CONFIG = [
  { label: 'Same Day', key: 'sameDay',       color: 'green' },
  { label: '1-3 Days', key: 'oneToThree',    color: 'cyan' },
  { label: '4-7 Days', key: 'fourToSeven',   color: 'amber' },
  { label: '8-14 Days', key: 'eightToFourteen', color: 'purple' },
  { label: '15+ Days', key: 'fifteenPlus',   color: 'red' },
];

// ─────────────────────────────────────────────────────────────
// RISK TREND CHART SERIES — violations page risk category lines
// ─────────────────────────────────────────────────────────────

/** Risk category trend line series */
const RISK_TREND_CHART_CONFIG = [
  { key: 'claims',     label: 'Claims',     color: 'red' },
  { key: 'guarantees', label: 'Guarantees', color: 'amber' },
  { key: 'earnings',   label: 'Earnings',   color: 'cyan' },
  { key: 'pressure',   label: 'Pressure',   color: 'purple' },
];

// ─────────────────────────────────────────────────────────────
// LOST REASON CHART SERIES — server-side pie charts
// ─────────────────────────────────────────────────────────────

/**
 * Lost reason chart config for server-side query files.
 * Note: On the client side, lost reasons are dynamic (built from data).
 * This config is used by callOutcomes.js demo data and BQ query results.
 */
const LOST_REASON_CHART_CONFIG = [
  { value: "Can't Afford",   label: "Can't Afford",   color: 'amber' },
  { value: 'Closer Error',   label: 'Closer Error',   color: 'red' },
  { value: 'Not Interested', label: 'Not Interested', color: 'cyan' },
  { value: 'Timing',         label: 'Timing',         color: 'purple' },
  { value: 'Other',          label: 'Other',          color: 'muted' },
];

// ─────────────────────────────────────────────────────────────
// NEON HEX VALUES — for server-side code that needs raw hex
// ─────────────────────────────────────────────────────────────

/**
 * Mirror of client/src/theme/constants.js COLORS.neon.
 * Server-side query files that build pie chart data with hex colors
 * should use this instead of defining their own local NEON objects.
 *
 * IMPORTANT: Frontend code should use COLORS.neon.* from theme/constants.js,
 * NOT these values. This is only for server-side query files.
 */
const NEON_HEX = {
  cyan:    '#4DD4E8',
  green:   '#6BCF7F',
  amber:   '#FFD93D',
  red:     '#FF4D6D',
  purple:  '#B84DFF',
  blue:    '#4D7CFF',
  magenta: '#ff00e5',
  teal:    '#06b6d4',
  muted:   '#64748b',
};

// ─────────────────────────────────────────────────────────────
// EXPORTS — CommonJS + ESM hybrid
// ─────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    OUTCOME_CHART_CONFIG,
    ATTENDANCE_CHART_CONFIG,
    NOT_TAKEN_CHART_CONFIG,
    CALLS_TO_CLOSE_CHART_CONFIG,
    DAYS_TO_CLOSE_CHART_CONFIG,
    RISK_TREND_CHART_CONFIG,
    LOST_REASON_CHART_CONFIG,
    NEON_HEX,
  };
}

export {
  OUTCOME_CHART_CONFIG,
  ATTENDANCE_CHART_CONFIG,
  NOT_TAKEN_CHART_CONFIG,
  CALLS_TO_CLOSE_CHART_CONFIG,
  DAYS_TO_CLOSE_CHART_CONFIG,
  RISK_TREND_CHART_CONFIG,
  LOST_REASON_CHART_CONFIG,
  NEON_HEX,
};
