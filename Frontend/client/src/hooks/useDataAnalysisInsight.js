/**
 * USE DATA ANALYSIS INSIGHT HOOK
 *
 * Fires tabs in parallel on first page visit — only the tabs the user's
 * tier can access (basic = overview only, insight+ = all 4).
 * Checks if today's AI insight exists in BigQuery (GET), and if not,
 * gathers all metrics from DataContext, formats them as CSV-style
 * tables, and POSTs to trigger Sonnet generation.
 *
 * Once generated, insights are cached for the day (BigQuery InsightLog).
 * Module-level Map cache prevents re-fetching within the same session.
 *
 * Usage:
 *   const { tabs, isLoading, anyLoading } = useDataAnalysisAllTabs();
 *   // tabs.overview = { data, generatedAt, error }
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useFilters } from '../context/FilterContext';
import { apiGet, apiPost } from '../utils/api';
import { computePageData } from '../utils/computePageData';

// Module-level cache — survives component remounts (tab switches)
const tabCache = new Map();

const ALL_TABS = ['overview', 'team', 'individual', 'compare'];
const BASIC_TABS = ['overview']; // Basic tier only gets overview — don't waste AI calls

/**
 * Compute all metrics needed for data analysis AI prompts.
 * Pulls from multiple computePageData sections to give AI full context.
 */
function gatherMetrics(rawData, filters, kpiTargets, scriptTemplate) {
  if (!rawData || !rawData.calls || rawData.calls.length === 0) return null;

  const f = {
    dateStart: filters.dateStart,
    dateEnd: filters.dateEnd,
    closerId: null, // Always compute team-wide for data analysis
    granularity: 'weekly',
    objectionType: null,
    riskCategory: null,
  };

  // Compute multiple sections to give AI comprehensive data
  const overview = computePageData('overview', rawData, f);
  const financial = computePageData('financial', rawData, f);
  const attendance = computePageData('attendance', rawData, f);
  const callOutcomes = computePageData('call-outcomes', rawData, f);
  const salesCycle = computePageData('sales-cycle', rawData, f);
  const objections = computePageData('objections', rawData, f);
  const violations = computePageData('violations', rawData, f);
  const adherence = computePageData('adherence', rawData, f);
  const scoreboard = computePageData('closer-scoreboard', rawData, f);

  if (!overview) return null;

  // Extract team-level metrics from each section
  const teamMetrics = {};
  const extractSection = (data, prefix) => {
    if (!data?.sections) return;
    for (const [sectionKey, sectionMetrics] of Object.entries(data.sections)) {
      if (typeof sectionMetrics === 'object' && sectionMetrics !== null) {
        for (const [metricKey, metric] of Object.entries(sectionMetrics)) {
          if (metric && typeof metric === 'object' && 'value' in metric) {
            teamMetrics[`${prefix}_${metricKey}`] = {
              value: metric.value,
              label: metric.label || metricKey,
            };
          }
        }
      }
    }
  };

  extractSection(overview, 'overview');
  extractSection(financial, 'financial');
  extractSection(attendance, 'attendance');
  extractSection(callOutcomes, 'outcomes');
  extractSection(salesCycle, 'cycle');
  extractSection(objections, 'objections');
  extractSection(violations, 'violations');
  extractSection(adherence, 'adherence');

  // Build per-closer table from scoreboard
  const closerData = [];
  if (scoreboard && !scoreboard.isEmpty && scoreboard.tables?.comparison?.rows) {
    for (const row of scoreboard.tables.comparison.rows) {
      if (row.type === 'group') continue;
      closerData.push(row);
    }
  }

  // Also pull the closer stats directly if available
  const closerStats = scoreboard?.closerStats || [];

  // Format date range
  const dateRange = filters.dateStart && filters.dateEnd
    ? `${filters.dateStart} to ${filters.dateEnd}`
    : 'all available data';

  return {
    dateRange,
    teamMetrics,
    closerStats,
    closerData,
    kpiTargets: kpiTargets || null,
    scriptTemplate: scriptTemplate || null,
  };
}

/**
 * Format metrics into a readable string for the AI prompt.
 * Uses CSV-style tables to minimize AI math.
 */
function formatMetricsForAI(gathered) {
  if (!gathered) return '';

  const lines = [];
  lines.push(`Date Range: ${gathered.dateRange}`);
  lines.push('');

  // Team metrics as labeled values
  lines.push('=== TEAM METRICS ===');
  for (const [key, { value, label }] of Object.entries(gathered.teamMetrics)) {
    if (value == null) continue;
    let display = value;
    if (typeof value === 'number') {
      if (value > 0 && value < 1 && key.includes('Rate') || key.includes('rate') || key.includes('pct') || key.includes('Pct')) {
        display = `${(value * 100).toFixed(1)}%`;
      } else if (typeof value === 'number' && value > 1000) {
        display = `$${value.toLocaleString()}`;
      } else {
        display = value.toFixed ? value.toFixed(2) : value;
      }
    }
    lines.push(`${label}: ${display}`);
  }

  // Per-closer stats table — includes all cross-metric fields so AI can
  // spot mismatches (e.g. high adherence + low close rate → script problem)
  if (gathered.closerStats && gathered.closerStats.length > 0) {
    lines.push('');
    lines.push('=== PER-CLOSER STATS ===');
    lines.push('Name | Close Rate | Revenue | Cash | Show Rate | Deals Closed | Avg Deal Size | Obj Resolution | Obj Handling | Call Quality | Script Adherence | Discovery Score | Pitch Score | Close Attempt Score | Avg Duration (min) | Days to Close | Calls to Close | Held Count');
    for (const c of gathered.closerStats) {
      lines.push(
        `${c.name} | ${(c.closeRate * 100).toFixed(1)}% | $${c.revenue?.toLocaleString() || 0} | $${c.cash?.toLocaleString() || 0} | ${(c.showRate * 100).toFixed(1)}% | ${c.dealsClosed} | $${c.avgDealSize?.toLocaleString() || 0} | ${(c.objResRate * 100).toFixed(1)}% | ${c.objHandling}/10 | ${c.callQuality}/10 | ${c.scriptAdherence}/10 | ${c.discoveryScore}/10 | ${c.pitchScore}/10 | ${c.closeAttemptScore}/10 | ${c.avgDuration} | ${c.daysToClose} | ${c.callsToClose} | ${c.heldCount}`
      );
    }
  }

  // KPI targets comparison
  if (gathered.kpiTargets) {
    const t = gathered.kpiTargets;
    lines.push('');
    lines.push('=== CLIENT KPI TARGETS ===');
    if (t.showRateTarget != null) lines.push(`Show Rate Target: ${(t.showRateTarget * 100).toFixed(0)}%`);
    if (t.closeRateTarget != null) lines.push(`Close Rate Target: ${(t.closeRateTarget * 100).toFixed(0)}%`);
    if (t.monthlyRevenueTarget != null) lines.push(`Monthly Revenue Target: $${t.monthlyRevenueTarget.toLocaleString()}`);
    if (t.monthlyCashTarget != null) lines.push(`Monthly Cash Target: $${t.monthlyCashTarget.toLocaleString()}`);
    if (t.avgDealSizeTarget != null) lines.push(`Avg Deal Size Target: $${t.avgDealSizeTarget.toLocaleString()}`);
  }

  // Script template context
  if (gathered.scriptTemplate) {
    lines.push('');
    lines.push('=== CLIENT SCRIPT TEMPLATE ===');
    lines.push(gathered.scriptTemplate);
  }

  return lines.join('\n');
}

/**
 * Build team average object from closerStats for the compare tab.
 */
function buildTeamAvg(closerStats) {
  if (!closerStats || closerStats.length === 0) return {};
  const avg = (key) => closerStats.reduce((s, c) => s + (c[key] || 0), 0) / closerStats.length;
  return {
    name: 'Team Average',
    closeRate: avg('closeRate'),
    revenue: Math.round(avg('revenue')),
    cash: Math.round(avg('cash')),
    showRate: avg('showRate'),
    dealsClosed: Math.round(avg('dealsClosed')),
    avgDealSize: Math.round(avg('avgDealSize')),
    objResRate: avg('objResRate'),
    objHandling: Number(avg('objHandling').toFixed(1)),
    callQuality: Number(avg('callQuality').toFixed(1)),
    scriptAdherence: Number(avg('scriptAdherence').toFixed(1)),
    discoveryScore: Number(avg('discoveryScore').toFixed(1)),
    pitchScore: Number(avg('pitchScore').toFixed(1)),
    closeAttemptScore: Number(avg('closeAttemptScore').toFixed(1)),
    avgDuration: Number(avg('avgDuration').toFixed(1)),
    daysToClose: Number(avg('daysToClose').toFixed(1)),
    callsToClose: Number(avg('callsToClose').toFixed(1)),
    heldCount: Math.round(avg('heldCount')),
  };
}

/**
 * Fetch or generate AI insight for a single tab.
 * Returns { data, generatedAt } or throws.
 */
async function fetchTabInsight(tab, gathered, authOptions) {
  // Step 1: GET — check if today's insight exists
  const getRes = await apiGet(
    '/dashboard/data-analysis-insights',
    { tab, _t: Date.now() },
    authOptions
  );

  if (getRes?.success && getRes?.data) {
    const { generatedAt, ...rest } = getRes.data;
    // For compare, verify we have comparisons for ALL closers (not just some)
    if (tab === 'compare') {
      const expectedCount = gathered?.closerStats?.length || 0;
      const actualCount = rest.comparisons?.length || 0;
      if (actualCount < expectedCount) {
        // Missing comparisons for some closers — fall through to POST to fill gaps
      } else if (actualCount === 0) {
        // No comparisons at all — fall through to POST
      } else {
        return { data: rest, generatedAt: generatedAt || null };
      }
    } else {
      return { data: rest, generatedAt: generatedAt || null };
    }
  }

  // Step 2: No cached insight — we need metrics to POST
  if (!gathered) {
    return { data: null, generatedAt: null };
  }

  const metricsText = formatMetricsForAI(gathered);
  const dateRange = gathered.dateRange;

  // Build the POST body
  const body = { tab, metrics: metricsText, dateRange };

  // For compare tab, send closer list + team avg
  if (tab === 'compare' && gathered.closerStats) {
    body.closers = gathered.closerStats.map(c => ({
      closerId: c.closerId || c.name,
      name: c.name,
      closeRate: c.closeRate,
      revenue: c.revenue,
      cash: c.cash,
      showRate: c.showRate,
      avgDealSize: c.avgDealSize,
      objResRate: c.objResRate,
      objHandling: c.objHandling,
      callQuality: c.callQuality,
      scriptAdherence: c.scriptAdherence,
      discoveryScore: c.discoveryScore,
      pitchScore: c.pitchScore,
      closeAttemptScore: c.closeAttemptScore,
      avgDuration: c.avgDuration,
      daysToClose: c.daysToClose,
      callsToClose: c.callsToClose,
      heldCount: c.heldCount,
      dealsClosed: c.dealsClosed,
    }));
    // Send team average as a separate field so backend can use it
    body.teamAvg = buildTeamAvg(gathered.closerStats);
  }

  const postRes = await apiPost(
    '/dashboard/data-analysis-insights',
    body,
    authOptions
  );

  if (postRes?.success && postRes?.data) {
    const { generatedAt: at, ...rest } = postRes.data;
    return { data: rest, generatedAt: at || null };
  }

  return { data: null, generatedAt: null };
}

/**
 * Hook: fetch or generate AI insights for ALL Data Analysis tabs in parallel.
 *
 * Returns per-tab data plus loading state.
 */
export function useDataAnalysisAllTabs() {
  const { token, mode, adminViewClientId, kpiTargets, tier } = useAuth();
  const { rawData } = useData();
  const { queryParams } = useFilters();

  // Only fetch tabs the user's tier can access — basic only gets overview
  const tabsToFetch = useMemo(() => tier === 'basic' ? BASIC_TABS : ALL_TABS, [tier]);

  // Fetch script template from settings (optional context for AI prompts)
  const [scriptTemplate, setScriptTemplate] = useState(null);
  const scriptFetchedRef = useRef(false);

  const [tabs, setTabs] = useState({
    overview: { data: null, generatedAt: null, error: null },
    team: { data: null, generatedAt: null, error: null },
    individual: { data: null, generatedAt: null, error: null },
    compare: { data: null, generatedAt: null, error: null },
  });
  const [isLoading, setIsLoading] = useState(false);

  // Track whether we've started fetching
  const fetchedRef = useRef(false);

  // Auth options for API calls
  const authOptions = useMemo(() => {
    if (mode === 'admin') return { viewClientId: adminViewClientId };
    return { token };
  }, [mode, adminViewClientId, token]);

  // Fetch script template on mount (optional — silently fails)
  useEffect(() => {
    if (scriptFetchedRef.current) return;
    scriptFetchedRef.current = true;

    apiGet('/dashboard/settings', {}, authOptions)
      .then(res => {
        if (res?.success && res?.data?.script_template) {
          setScriptTemplate(res.data.script_template);
        }
      })
      .catch(() => {}); // Silently fail — script context is optional
  }, [authOptions]);

  // Compute filter params for metric gathering
  const filters = useMemo(() => ({
    dateStart: queryParams.dateStart,
    dateEnd: queryParams.dateEnd,
  }), [queryParams.dateStart, queryParams.dateEnd]);

  // Gather all metrics from raw data
  const gathered = useMemo(() => gatherMetrics(rawData, filters, kpiTargets, scriptTemplate), [rawData, filters, kpiTargets, scriptTemplate]);

  const fetchAll = useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    // Check if all accessible tabs are cached
    const allCached = tabsToFetch.every(t => tabCache.has(t));
    if (allCached) {
      const cached = {};
      for (const t of tabsToFetch) {
        cached[t] = { ...tabCache.get(t), error: null };
      }
      setTabs(prev => ({ ...prev, ...cached }));
      return;
    }

    setIsLoading(true);

    // Fire only the tabs this tier can access — don't waste AI calls
    const results = await Promise.allSettled(
      tabsToFetch.map(async (tab) => {
        // Check module cache first
        const cached = tabCache.get(tab);
        if (cached) return { tab, ...cached };

        const result = await fetchTabInsight(tab, gathered, authOptions);
        // Cache result
        if (result.data) {
          tabCache.set(tab, { data: result.data, generatedAt: result.generatedAt });
        }
        return { tab, ...result };
      })
    );

    // Process results
    const newTabs = {};
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { tab, data, generatedAt } = result.value;
        newTabs[tab] = { data, generatedAt, error: null };
      } else {
        // Find which tab failed (from the rejection)
        console.error('[useDataAnalysisAllTabs] Tab failed:', result.reason);
      }
    }

    // Merge with defaults for any missing tabs
    setTabs(prev => ({
      overview: newTabs.overview || prev.overview,
      team: newTabs.team || prev.team,
      individual: newTabs.individual || prev.individual,
      compare: newTabs.compare || prev.compare,
    }));
    setIsLoading(false);
  }, [gathered, authOptions, tabsToFetch]);

  // Trigger fetch when gathered data becomes available
  useEffect(() => {
    if (fetchedRef.current) return;

    // Check all accessible tabs cached
    const allCached = tabsToFetch.every(t => tabCache.has(t));
    if (allCached) {
      const cached = {};
      for (const t of tabsToFetch) {
        cached[t] = { ...tabCache.get(t), error: null };
      }
      setTabs(prev => ({ ...prev, ...cached }));
      return;
    }

    // Need gathered data to POST if cache miss
    if (!gathered && !allCached) return;

    fetchAll();
  }, [gathered, fetchAll, tabsToFetch]);

  // Compute loading state per tab
  const anyLoading = isLoading;

  return { tabs, isLoading: anyLoading };
}

// Keep the single-tab hook for backward compat but it now reads from cache
export function useDataAnalysisInsight(tab) {
  const cached = tabCache.get(tab);
  return {
    data: cached?.data || null,
    isLoading: false,
    generatedAt: cached?.generatedAt || null,
    error: null,
  };
}
