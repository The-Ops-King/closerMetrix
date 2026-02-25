/**
 * CATEGORY VALUES — Objection types, risk categories, script sections.
 *
 * These are the domain-specific groupings used by filter dropdowns,
 * chart series, and table breakdowns. All values match what the AI
 * pipeline writes into BigQuery.
 *
 * Used by: ObjectionTypeFilter, RiskCategoryFilter, ObjectionDetailTable,
 *          RiskReviewTable, objections.js, violations.js, adherence.js,
 *          computePageData.js
 */

// ─────────────────────────────────────────────────────────────
// OBJECTION TYPES — obj.objection_type / obj_objection_type
// ─────────────────────────────────────────────────────────────

/**
 * Short list for the sidebar filter dropdown (ObjectionTypeFilter).
 * These are the 7 most common types that appear as filter chips.
 */
const OBJECTION_TYPES_FILTER = [
  'Financial',
  'Think About It',
  'Spouse/Partner',
  'Timing',
  'Already Tried',
  'Not Interested',
  'Other',
];

/**
 * Full list of all objection types for the detail table dropdown
 * (ObjectionDetailTable). Includes less common types that appear
 * in the raw data but aren't useful as top-level filters.
 */
const OBJECTION_TYPES_ALL = [
  'Financial',
  'Spouse/Partner',
  'Think About It',
  'Timing',
  'Trust/Credibility',
  'Already Tried',
  'DIY',
  'Not Ready',
  'Competitor',
  'Authority',
  'Value',
  'Commitment',
  'Program Not a Fit',
  'Other',
];

/**
 * Color assigned to each objection type.
 * Used by pie charts (unresolved by type) and trend line series.
 * Values are color NAME strings resolved via COLOR_MAP on the frontend.
 */
const OBJECTION_TYPE_COLORS = {
  'Financial': 'cyan',
  'Think About It': 'amber',
  'Spouse/Partner': 'blue',
  'Timing': 'green',
  'Already Tried': 'red',
  'Not Interested': 'purple',
  'Other': 'muted',
};

// ─────────────────────────────────────────────────────────────
// RISK CATEGORIES — key_moments[].category values
// ─────────────────────────────────────────────────────────────

/** The 4 compliance risk categories from the AI pipeline */
const RISK_CATEGORIES = ['Claims', 'Guarantees', 'Earnings', 'Pressure'];

/**
 * Display labels for risk categories.
 * Some categories have expanded labels on the UI.
 */
const RISK_CATEGORY_LABELS = {
  Claims: 'Claims',
  Guarantees: 'Guarantees',
  Earnings: 'Earnings / Income',
  Pressure: 'Pressure / Urgency',
};

/**
 * Color assigned to each risk category.
 * Values are color NAME strings.
 */
const RISK_CATEGORY_COLORS = {
  Claims: 'red',
  Guarantees: 'amber',
  Earnings: 'cyan',
  Pressure: 'purple',
};

// ─────────────────────────────────────────────────────────────
// LOST REASON COLORS — for pie charts and per-closer breakdowns
// ─────────────────────────────────────────────────────────────

const LOST_REASON_COLORS = {
  "Can't Afford": 'amber',
  'Closer Error': 'red',
  'Not Interested': 'cyan',
  'Timing': 'purple',
  'Other': 'muted',
};

// ─────────────────────────────────────────────────────────────
// CALL OUTCOME COLORS — consistent colors across all chart types
// ─────────────────────────────────────────────────────────────

/**
 * Color name assigned to each call outcome.
 * Used in: outcome pie charts, outcome stacked bars, per-closer breakdowns.
 * Must match COLORS.neon keys on the frontend.
 */
const OUTCOME_COLORS = {
  'Closed - Won': 'green',
  'Deposit': 'amber',
  'Follow Up': 'purple',
  'Follow-Up': 'purple',
  'Lost': 'red',
  'Disqualified': 'muted',
  'DQ': 'muted',
  'Not Pitched': 'blue',
};

// ─────────────────────────────────────────────────────────────
// SCRIPT ADHERENCE SECTIONS — radar chart axes + score fields
// ─────────────────────────────────────────────────────────────

/**
 * Script sections for the adherence radar chart.
 * Each entry maps a section label to the BigQuery score column it reads from.
 * All 8 axes now have distinct score fields from the AI pipeline.
 */
const SCRIPT_SECTIONS = [
  { key: 'intro',      label: 'Intro',      scoreField: 'introScore' },
  { key: 'pain',       label: 'Pain',       scoreField: 'painScore' },
  { key: 'goal',       label: 'Goal',       scoreField: 'goalScore' },
  { key: 'transition', label: 'Transition', scoreField: 'transitionScore' },
  { key: 'pitch',      label: 'Pitch',      scoreField: 'pitchAdherenceScore' },
  { key: 'close',      label: 'Close',      scoreField: 'closeAdherenceScore' },
  { key: 'objections', label: 'Objections', scoreField: 'objectionAdherenceScore' },
];

// ─────────────────────────────────────────────────────────────
// SALES CYCLE DISTRIBUTIONS — bucket labels for pie/bar charts
// ─────────────────────────────────────────────────────────────

const CALLS_TO_CLOSE_BUCKETS = [
  { label: '1 Call', min: 1, max: 1, color: 'green' },
  { label: '2 Calls', min: 2, max: 2, color: 'cyan' },
  { label: '3+ Calls', min: 3, max: Infinity, color: 'amber' },
];

const DAYS_TO_CLOSE_BUCKETS = [
  { label: 'Same Day', min: 0, max: 0, color: 'green' },
  { label: '1-3 Days', min: 1, max: 3, color: 'cyan' },
  { label: '4-7 Days', min: 4, max: 7, color: 'amber' },
  { label: '8-14 Days', min: 8, max: 14, color: 'purple' },
  { label: '15+ Days', min: 15, max: Infinity, color: 'red' },
];

// ─────────────────────────────────────────────────────────────
// EXPORTS — CommonJS + ESM hybrid
// ─────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    OBJECTION_TYPES_FILTER,
    OBJECTION_TYPES_ALL,
    OBJECTION_TYPE_COLORS,
    RISK_CATEGORIES,
    RISK_CATEGORY_LABELS,
    RISK_CATEGORY_COLORS,
    LOST_REASON_COLORS,
    OUTCOME_COLORS,
    SCRIPT_SECTIONS,
    CALLS_TO_CLOSE_BUCKETS,
    DAYS_TO_CLOSE_BUCKETS,
  };
}

export {
  OBJECTION_TYPES_FILTER,
  OBJECTION_TYPES_ALL,
  OBJECTION_TYPE_COLORS,
  RISK_CATEGORIES,
  RISK_CATEGORY_LABELS,
  RISK_CATEGORY_COLORS,
  LOST_REASON_COLORS,
  OUTCOME_COLORS,
  SCRIPT_SECTIONS,
  CALLS_TO_CLOSE_BUCKETS,
  DAYS_TO_CLOSE_BUCKETS,
};
