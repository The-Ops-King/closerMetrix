/**
 * FILTER CONTEXT
 *
 * Global filter state shared across all dashboard pages.
 * When any filter changes, all visible charts and scorecards refetch via TanStack Query.
 *
 * Filters:
 *   dateRange: { start: string, end: string } — ISO date strings, defaults to "This Month"
 *   closerId: string | null — null = all closers (Basic tier always null)
 *   objectionType: string[] | null — multi-select, null = all types
 *   granularity: 'daily' | 'weekly' | 'monthly' — for time-series chart bucketing
 *   riskCategory: string | null — Executive only
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import dayjs from 'dayjs';

const FilterContext = createContext(null);

/**
 * Get the default date range: "This Month" (start of current month to today).
 * Matches the default selection in DateRangeFilter.
 */
function getDefaultDateRange() {
  return {
    start: dayjs().startOf('month').format('YYYY-MM-DD'),
    end: dayjs().format('YYYY-MM-DD'),
  };
}

export function FilterProvider({ children }) {
  const [dateRange, setDateRange] = useState(getDefaultDateRange);
  const [closerId, setCloserId] = useState(null);
  const [objectionType, setObjectionType] = useState(null);
  const [granularity, setGranularity] = useState('weekly');
  const [riskCategory, setRiskCategory] = useState(null);

  /**
   * Reset all filters to defaults.
   */
  const resetFilters = useCallback(() => {
    setDateRange(getDefaultDateRange());
    setCloserId(null);
    setObjectionType(null);
    setGranularity('weekly');
    setRiskCategory(null);
  }, []);

  /**
   * Build query params object from current filters.
   * Used by useMetrics hook to construct API requests.
   */
  const queryParams = useMemo(() => {
    const params = {
      dateStart: dateRange.start,
      dateEnd: dateRange.end,
    };
    if (closerId) params.closerId = closerId;
    if (objectionType && objectionType.length > 0) {
      params.objectionType = objectionType.join(',');
    }
    if (granularity) params.granularity = granularity;
    if (riskCategory) params.riskCategory = riskCategory;
    return params;
  }, [dateRange, closerId, objectionType, granularity, riskCategory]);

  const value = {
    dateRange,
    setDateRange,
    closerId,
    setCloserId,
    objectionType,
    setObjectionType,
    granularity,
    setGranularity,
    riskCategory,
    setRiskCategory,
    resetFilters,
    queryParams,
  };

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

/**
 * Hook to access filter state and setters.
 * @returns {object} Filter context value
 */
export function useFilters() {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error('useFilters must be used within a FilterProvider');
  }
  return context;
}
