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
// OBJECTION TYPE ALIASES — normalize near-duplicate AI labels
// ─────────────────────────────────────────────────────────────

/**
 * The AI pipeline sometimes produces similar-but-different labels
 * for the same concept. This map merges them into a canonical name.
 * Key = AI-produced label (exact match), Value = canonical label.
 *
 * Also handles legacy types that exist in BQ data but are not in
 * the canonical 14-type list (e.g., 'Closer Declined' → 'Other').
 */
const OBJECTION_TYPE_ALIASES = {
  'Skepticism': 'Trust/Credibility',
  'Closer Declined': 'Other',
  'Fear of Failure': 'Not Ready',
  'Past Bad Experience': 'Already Tried',
  'Self-Doubt': 'Not Ready',
  'Needs More Info': 'Value',
  'Already Have Solution': 'DIY',
  'Not Interested': 'Other',
};

/**
 * Map from snake_case keys to display labels.
 * Built from OBJECTION_TYPES_ALL cross-referenced with the key format
 * that ResponseParser stores in BigQuery (e.g., 'financial' → 'Financial').
 */
const OBJECTION_KEY_TO_LABEL = {
  'financial': 'Financial',
  'spouse': 'Spouse/Partner',
  'think_about': 'Think About It',
  'timing': 'Timing',
  'trust': 'Trust/Credibility',
  'already_tried': 'Already Tried',
  'diy': 'DIY',
  'not_ready': 'Not Ready',
  'competitor': 'Competitor',
  'authority': 'Authority',
  'value': 'Value',
  'commitment': 'Commitment',
  'program_fit': 'Program Not a Fit',
  'other': 'Other',
};

/**
 * Normalize an objection type string using the alias map and key→label map.
 * Handles: alias names, snake_case keys from BQ, and already-correct labels.
 * Returns the canonical display label.
 */
function normalizeObjectionType(type) {
  if (!type) return 'Other';
  // First check alias map
  const aliased = OBJECTION_TYPE_ALIASES[type] || type;
  // Then check if it's a snake_case key from BQ
  if (OBJECTION_KEY_TO_LABEL[aliased]) return OBJECTION_KEY_TO_LABEL[aliased];
  // Check lowercase version too (e.g., 'Financial' won't match but 'financial' will)
  if (OBJECTION_KEY_TO_LABEL[aliased.toLowerCase()]) return OBJECTION_KEY_TO_LABEL[aliased.toLowerCase()];
  // Already a display label or unknown — return as-is
  return aliased;
}

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
  { key: 'discovery',  label: 'Discovery',  scoreField: 'discoveryScore' },
  { key: 'transition', label: 'Transition', scoreField: 'transitionScore' },
  { key: 'pitch',      label: 'Pitch',      scoreField: 'pitchScore' },
  { key: 'close',      label: 'Close',      scoreField: 'closeAttemptScore' },
  { key: 'objections', label: 'Objections', scoreField: 'objectionHandlingScore' },
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
    OBJECTION_TYPE_ALIASES,
    OBJECTION_KEY_TO_LABEL,
    normalizeObjectionType,
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
  OBJECTION_TYPE_ALIASES,
  OBJECTION_KEY_TO_LABEL,
  normalizeObjectionType,
  RISK_CATEGORIES,
  RISK_CATEGORY_LABELS,
  RISK_CATEGORY_COLORS,
  LOST_REASON_COLORS,
  OUTCOME_COLORS,
  SCRIPT_SECTIONS,
  CALLS_TO_CLOSE_BUCKETS,
  DAYS_TO_CLOSE_BUCKETS,
};
