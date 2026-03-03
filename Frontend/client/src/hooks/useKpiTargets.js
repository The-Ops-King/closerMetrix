/**
 * useKpiTargets — Access KPI target values from AuthContext.
 *
 * Returns the 5 KPI target fields set in Settings > KPI Targets:
 *   show_rate, close_rate, revenue_per_month, cash_collected_per_month, avg_deal_size
 *
 * Returns empty object if no targets are set or client is on basic tier.
 * Used by chart components to render dashed target reference lines.
 */

import { useAuth } from '../context/AuthContext';

export function useKpiTargets() {
  const { kpiTargets, tier } = useAuth();

  // Basic tier doesn't have KPI targets feature
  if (tier === 'basic' || !kpiTargets) {
    return {};
  }

  return kpiTargets;
}
