/**
 * TIER DEFINITIONS — Single source of truth for what each plan tier can access.
 * Used by BOTH the Express API (for enforcement) and the React client (for UI hiding).
 *
 * Three tiers: basic, insight, executive
 * Each tier includes everything from the tier below it.
 */

const TIERS = {
  basic: {
    label: 'Basic',
    color: '#3B82F6',
    pages: ['overview', 'financial', 'attendance', 'callOutcomes', 'salesCycle'],
    filters: ['dateRange'],
    features: {
      closerFilter: false,
      objections: false,
      projections: false,
      violations: false,
      adherence: false,
      secViolationDetails: false,
    },
  },
  insight: {
    label: 'Insight',
    color: '#F59E0B',
    pages: ['overview', 'financial', 'attendance', 'callOutcomes', 'salesCycle', 'objections', 'projections'],
    filters: ['dateRange', 'closer', 'objectionType', 'granularity'],
    features: {
      closerFilter: true,
      objections: true,
      projections: true,
      violations: false,
      adherence: false,
      secViolationDetails: false,
    },
  },
  executive: {
    label: 'Executive',
    color: '#EF4444',
    pages: ['overview', 'financial', 'attendance', 'callOutcomes', 'salesCycle', 'objections', 'projections', 'violations', 'adherence'],
    filters: ['dateRange', 'closer', 'objectionType', 'granularity', 'riskCategory'],
    features: {
      closerFilter: true,
      objections: true,
      projections: true,
      violations: true,
      adherence: true,
      secViolationDetails: true,
    },
  },
};

/**
 * Check if a tier has access to a specific page.
 * @param {string} tier - 'basic' | 'insight' | 'executive'
 * @param {string} page - Page key (e.g. 'overview', 'objections')
 * @returns {boolean}
 */
const tierHasPage = (tier, page) => {
  const tierDef = TIERS[tier];
  if (!tierDef) return false;
  return tierDef.pages.includes(page);
};

/**
 * Check if a tier has access to a specific feature.
 * @param {string} tier - 'basic' | 'insight' | 'executive'
 * @param {string} feature - Feature key (e.g. 'closerFilter', 'objections')
 * @returns {boolean}
 */
const tierHasFeature = (tier, feature) => {
  const tierDef = TIERS[tier];
  if (!tierDef) return false;
  return !!tierDef.features[feature];
};

// Derived constants — single source of truth for tier ordering and labels.
const TIER_LIST = ['basic', 'insight', 'executive'];
const TIER_RANK = { basic: 0, insight: 1, executive: 2 };
const TIER_LABELS = { basic: 'Basic', insight: 'Insight', executive: 'Executive' };

// CommonJS export for server, also works with ES module bundlers
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TIERS, tierHasPage, tierHasFeature, TIER_LIST, TIER_RANK, TIER_LABELS };
}

export { TIERS, tierHasPage, tierHasFeature, TIER_LIST, TIER_RANK, TIER_LABELS };
