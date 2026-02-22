/**
 * USE METRICS HOOK
 *
 * TanStack Query wrapper for fetching dashboard data from the API.
 * Combines the current filter state (from FilterContext) with auth
 * credentials (from AuthContext) to make authenticated, filtered
 * API calls to /api/dashboard/{section}.
 *
 * Supports two auth modes:
 *   1. Client mode: sends X-Client-Token header
 *   2. Admin view mode: sends X-Admin-Key + X-View-Client-Id headers
 *      (when admin is viewing a specific client's dashboard)
 *
 * Usage:
 *   const { data, isLoading, error, refetch } = useMetrics('overview');
 *   const { data } = useMetrics('objections', { enabled: hasObjectionAccess });
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useFilters } from '../context/FilterContext';
import { useAuth } from '../context/AuthContext';
import { apiGet } from '../utils/api';

/**
 * Fetch dashboard data for a specific section with current filters applied.
 *
 * @param {string} section - Dashboard section name ('overview', 'financial', etc.)
 * @param {object} [options] - Additional options
 * @param {boolean} [options.enabled=true] - Whether the query should run
 * @returns {object} TanStack Query result (data, isLoading, error, refetch)
 */
export function useMetrics(section, options = {}) {
  const { queryParams } = useFilters();
  const { token, isAuthenticated, mode, adminViewClientId } = useAuth();

  // Determine if the query should be enabled
  const callerEnabled = options.enabled !== undefined ? Boolean(options.enabled) : true;
  const authReady = Boolean(
    isAuthenticated || (token && token.startsWith('demo'))
  );
  // In admin view mode, we also need the adminViewClientId to be set
  const adminViewReady = mode === 'admin' ? Boolean(adminViewClientId) : true;
  const enabled = callerEnabled && authReady && adminViewReady;

  return useQuery({
    /**
     * Query key includes section, filters, AND adminViewClientId.
     * This ensures admin viewing different clients gets separate cache entries.
     */
    queryKey: ['dashboard', section, queryParams, adminViewClientId || null],

    queryFn: async () => {
      // Build auth options based on current mode
      const authOptions = {};

      if (mode === 'admin' && adminViewClientId) {
        // Admin viewing a client's dashboard — use admin key + view client ID.
        // The admin key is pulled from sessionStorage by apiRequest automatically.
        authOptions.viewClientId = adminViewClientId;
      } else if (token) {
        // Normal client mode — use client token
        authOptions.token = token;
      }

      const response = await apiGet(
        `/dashboard/${section}`,
        queryParams,
        authOptions
      );

      // The API wraps everything in { success, data, meta }
      // We return the inner `data` which contains { sections, charts, tables }
      return response.data;
    },

    enabled,

    // Keep previous data visible while refetching with new filters.
    // Prevents the flash-to-empty-state when switching date ranges or closers.
    placeholderData: keepPreviousData,

    // Keep stale data visible while refetching in the background.
    staleTime: 5 * 60 * 1000,

    // Don't retry too aggressively
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });
}
