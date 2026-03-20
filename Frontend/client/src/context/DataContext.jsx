/**
 * DATA CONTEXT — Client-Side Raw Data Cache
 *
 * Fetches ALL raw call data from BigQuery once on authentication,
 * then stores it in memory. All dashboard pages compute their metrics
 * client-side from this cached data, so filter changes (date range,
 * closer, granularity) are instant — no server round-trips.
 *
 * Data fetched once:
 *   - calls: All call records for the client
 *   - objections: All objection records
 *   - closeCycles: Close cycle stats per prospect
 *   - closers: All closers with status (Active/Inactive)
 *
 * Provides:
 *   rawData: { calls, objections, closeCycles } | null
 *   isDataLoading: boolean
 *   dataError: string | null
 *   refetchData: () => void — manually re-fetch (e.g., after data changes)
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const { isAuthenticated, token, mode, adminViewClientId } = useAuth();
  const [rawData, setRawData] = useState(null);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [dataError, setDataError] = useState(null);

  // Track what we've fetched to avoid duplicate requests
  const fetchedForRef = useRef(null);

  /**
   * Fetch all raw data from the API.
   * Uses the same auth headers as other API calls.
   */
  const fetchRawData = useCallback(async () => {
    setIsDataLoading(true);
    setDataError(null);

    try {
      const headers = { 'Content-Type': 'application/json' };

      if (mode === 'admin' && adminViewClientId) {
        // Admin viewing a client — use admin key + view client ID
        const adminKey = sessionStorage.getItem('adminApiKey');
        if (adminKey) headers['X-Admin-Key'] = adminKey;
        headers['X-View-Client-Id'] = adminViewClientId;
      } else if (token) {
        // Normal client mode — use client token
        headers['X-Client-Token'] = token;
      } else {
        // Fallback: check for admin key in sessionStorage
        const adminKey = sessionStorage.getItem('adminApiKey');
        if (adminKey) headers['X-Admin-Key'] = adminKey;
      }

      const res = await fetch('/api/dashboard/raw-data', { headers });

      if (!res.ok) {
        throw new Error(`Failed to load data: ${res.status}`);
      }

      const json = await res.json();

      if (json.success && json.data) {
        setRawData(json.data);
      } else {
        throw new Error(json.error || 'Invalid response');
      }
    } catch (err) {
      console.error('[DataContext] Failed to fetch raw data:', err);
      setDataError(err.message);
    } finally {
      setIsDataLoading(false);
    }
  }, [token, mode, adminViewClientId]);

  /**
   * Auto-fetch when authenticated.
   * Re-fetch when the viewed client changes (admin view mode).
   */
  useEffect(() => {
    if (!isAuthenticated) {
      setRawData(null);
      fetchedForRef.current = null;
      return;
    }

    // Build a cache key from auth state
    const cacheKey = mode === 'admin'
      ? `admin:${adminViewClientId || 'none'}`
      : `client:${token}`;

    // Only fetch if we haven't fetched for this exact state
    if (fetchedForRef.current !== cacheKey) {
      fetchedForRef.current = cacheKey;
      fetchRawData();
    }
  }, [isAuthenticated, token, mode, adminViewClientId, fetchRawData]);

  const value = {
    rawData,
    isDataLoading,
    dataError,
    refetchData: fetchRawData,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

/**
 * Hook to access the raw data cache.
 * @returns {{ rawData, isDataLoading, dataError, refetchData }}
 */
export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
