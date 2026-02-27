/**
 * USE METRICS HOOK — Client-Side Computation
 *
 * Computes dashboard metrics from cached raw data + current filters.
 * NO server round-trips when filters change — all computation happens
 * in the browser via useMemo. Filter changes are instant (~5ms).
 *
 * Data flow:
 *   1. DataContext fetches ALL raw data once on auth (single API call)
 *   2. This hook reads raw data from DataContext
 *   3. On each render, useMemo computes page-specific metrics from raw data + filters
 *   4. Returns the same { data, isLoading, error } shape pages expect
 *
 * Usage (unchanged from before):
 *   const { data, isLoading, error } = useMetrics('overview');
 *   const { data } = useMetrics('financial', { enabled: hasTierAccess });
 */

import { useMemo, useRef } from 'react';
import { useFilters } from '../context/FilterContext';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { computePageData } from '../utils/computePageData';

/**
 * Compute dashboard data for a specific section using client-side computation.
 *
 * @param {string} section - Dashboard section name ('overview', 'financial', etc.)
 * @param {object} [options] - Additional options
 * @param {boolean} [options.enabled=true] - Whether computation should run
 * @returns {object} { data, isLoading, error } — same shape as before
 */
export function useMetrics(section, options = {}) {
  const { queryParams } = useFilters();
  const { isAuthenticated, mode, adminViewClientId } = useAuth();
  const { rawData, isDataLoading, dataError, refetchData } = useData();

  // Determine if computation should run
  const callerEnabled = options.enabled !== undefined ? Boolean(options.enabled) : true;
  const authReady = Boolean(isAuthenticated);
  const adminViewReady = mode === 'admin' ? Boolean(adminViewClientId) : true;
  const enabled = callerEnabled && authReady && adminViewReady;

  // Cache the last valid computed data so pages don't flash blank during transitions
  const lastValidData = useRef(null);

  // Compute page data from raw data + current filters.
  // useMemo ensures this only re-runs when inputs actually change.
  const computedData = useMemo(() => {
    if (!enabled || !rawData) return null;

    const filters = {
      dateStart: queryParams.dateStart,
      dateEnd: queryParams.dateEnd,
      closerId: queryParams.closerId || null,
      granularity: queryParams.granularity || 'weekly',
      objectionType: queryParams.objectionType || null,
      riskCategory: queryParams.riskCategory || null,
    };

    return computePageData(section, rawData, filters);
  }, [
    enabled,
    rawData,
    section,
    queryParams.dateStart,
    queryParams.dateEnd,
    queryParams.closerId,
    queryParams.granularity,
    queryParams.objectionType,
    queryParams.riskCategory,
  ]);

  // Update the cached data whenever we get a fresh computation
  if (computedData !== null) {
    lastValidData.current = computedData;
  }

  // Use cached data as fallback when computedData is null during transitions
  const effectiveData = computedData ?? lastValidData.current;

  return {
    data: effectiveData,
    isLoading: (isDataLoading && !rawData) || (computedData === null && lastValidData.current !== null),
    error: dataError ? new Error(dataError) : null,
    // Compatibility: refetch triggers a fresh raw data load from DataContext
    refetch: refetchData,
  };
}
