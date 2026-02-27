/**
 * TIER CONFIG — Frontend tier logic.
 *
 * Maps tier names to the pages and nav items visible in the sidebar.
 * This is the COSMETIC layer — the API enforces tiers server-side too.
 */

import { TIER_RANK } from '../../../shared/tierDefinitions';

/**
 * Navigation items split into two sidebar sections.
 * "Everyday" = high-frequency pages, "Deep Dive" = detailed analysis.
 */
export const NAV_EVERYDAY = [
  { key: 'overview', label: 'Overview', icon: 'dashboard', path: '', minTier: 'basic' },
  { key: 'projections', label: 'Projections', icon: 'analytics', path: '/projections', minTier: 'insight' },
  { key: 'marketInsight', label: 'Market Insight', icon: 'campaign', path: '/market-insight', minTier: 'insight' },
  { key: 'dataAnalysis', label: 'Data Analysis', icon: 'query_stats', path: '/data-analysis', minTier: 'basic' },
];

export const NAV_DEEP_DIVE = [
  { key: 'financial', label: 'Financial', icon: 'attach_money', path: '/financial', minTier: 'basic' },
  { key: 'attendance', label: 'Attendance', icon: 'event_available', path: '/attendance', minTier: 'basic' },
  { key: 'callOutcomes', label: 'Call Outcomes', icon: 'call_end', path: '/call-outcomes', minTier: 'basic' },
  { key: 'salesCycle', label: 'Sales Cycle', icon: 'loop', path: '/sales-cycle', minTier: 'basic' },
  { key: 'objections', label: 'Objections', icon: 'record_voice_over', path: '/objections', minTier: 'insight' },
  { key: 'closerScoreboard', label: 'Closer Scoreboard', icon: 'emoji_events', path: '/closer-scoreboard', minTier: 'insight' },
  { key: 'violations', label: 'Violations', icon: 'gpp_bad', path: '/violations', minTier: 'executive' },
  { key: 'adherence', label: 'Adherence', icon: 'fact_check', path: '/adherence', minTier: 'executive' },
];

/** Combined list for backward compat (TopBar routes, etc.) */
export const NAV_ITEMS = [...NAV_EVERYDAY, ...NAV_DEEP_DIVE];

/**
 * Settings nav item — rendered separately at sidebar bottom with gear icon.
 * Available to all tiers (section-level gating happens inside SettingsPage).
 */
export const SETTINGS_NAV_ITEM = {
  key: 'settings', label: 'Settings', icon: 'settings', path: '/settings', minTier: 'basic',
};

/**
 * Filter nav items to only show pages accessible at the given tier.
 * @param {string} tier - 'basic' | 'insight' | 'executive'
 * @returns {Array} Filtered nav items
 */
export function getNavItemsForTier(tier) {
  const rank = TIER_RANK[(tier || '').toLowerCase()] ?? 0;
  return NAV_ITEMS.filter((item) => TIER_RANK[item.minTier] <= rank);
}

/**
 * Check if a tier meets the minimum requirement.
 * @param {string} currentTier - The user's tier
 * @param {string} requiredTier - The minimum tier needed
 * @returns {boolean}
 */
export function meetsMinTier(currentTier, requiredTier) {
  return (TIER_RANK[(currentTier || '').toLowerCase()] ?? 0) >= (TIER_RANK[requiredTier] ?? 0);
}
