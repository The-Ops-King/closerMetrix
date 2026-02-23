/**
 * FILTER CONTEXT
 *
 * Global filter state shared across all dashboard pages.
 * When any filter changes, all visible charts and scorecards refetch via TanStack Query.
 *
 * Filters:
 *   dateRange: { start: string, end: string } — ISO date strings, defaults to "This Month"
 *   closerIds: string[] — empty = all closers (Basic tier always empty)
 *   objectionType: string[] | null — multi-select, null = all types
 *   granularity: 'daily' | 'weekly' | 'monthly' — for time-series chart bucketing
 *   riskCategory: string[] | null — Executive only, multi-select
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
  const [dateLabel, setDateLabel] = useState('This Month');
  const [closerIds, setCloserIds] = useState([]);
  const [objectionType, setObjectionType] = useState(null);
  const [granularity, setGranularity] = useState('auto');
  const [riskCategory, setRiskCategory] = useState(null);

  /**
   * Reset all filters to defaults.
   */
  const resetFilters = useCallback(() => {
    setDateRange(getDefaultDateRange());
    setDateLabel('This Month');
    setCloserIds([]);
    setObjectionType(null);
    setGranularity('auto');
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
    if (closerIds.length) params.closerId = closerIds.join(',');
    if (objectionType && objectionType.length > 0) {
      params.objectionType = objectionType.join(',');
    }
    if (granularity) params.granularity = granularity;
    if (riskCategory && riskCategory.length > 0) params.riskCategory = riskCategory.join(',');
    return params;
  }, [dateRange, closerIds, objectionType, granularity, riskCategory]);

  const value = {
    dateRange,
    setDateRange,
    dateLabel,
    setDateLabel,
    closerIds,
    setCloserIds,
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
