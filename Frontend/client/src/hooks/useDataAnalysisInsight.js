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
 * Compute a compact period summary from rawData for a given date range.
 * Used to give AI historical context (previous period, last 90 days).
 * No extra BQ queries — rawData has ALL calls, we just filter by date.
 */
function computePeriodSummary(rawData, dateStart, dateEnd) {
  if (!rawData?.calls?.length) return null;

  const f = {
    dateStart, dateEnd,
    closerId: null,
    granularity: 'weekly',
    objectionType: null,
    riskCategory: null,
  };

  const overview = computePageData('overview', rawData, f);
  const scoreboard = computePageData('closer-scoreboard', rawData, f);

  if (!overview) return null;

  // Extract key metrics for compact summary
  const get = (section, key) => {
    const s = overview?.sections?.[section];
    return s?.[key]?.value ?? null;
  };

  const summary = {
    dateRange: `${dateStart} to ${dateEnd}`,
    closeRate: get('atAGlance', 'closeRate') ?? get('atAGlance', 'showCloseRate'),
    showRate: get('atAGlance', 'showRate'),
    revenue: get('atAGlance', 'revenue') ?? get('atAGlance', 'revenueGenerated'),
    cash: get('atAGlance', 'cash') ?? get('atAGlance', 'cashCollected'),
    callsHeld: get('atAGlance', 'held') ?? get('atAGlance', 'appointmentsHeld'),
    dealsClosed: get('atAGlance', 'closed') ?? get('atAGlance', 'closedDeals'),
  };

  // Per-closer compact summaries
  if (scoreboard?.closerStats?.length > 0) {
    summary.closers = scoreboard.closerStats.map(c => ({
      name: c.name,
      closeRate: c.closeRate,
      revenue: c.revenue,
      showRate: c.showRate,
    }));
  }

  return summary;
}

/**
 * Compute all metrics needed for data analysis AI prompts.
 * Pulls from multiple computePageData sections to give AI full context.
 * Also computes previous period and last 90 days for trend detection.
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

  // ── Historical periods for trend detection ──
  let previousPeriod = null;
  let last90Days = null;

  if (filters.dateStart && filters.dateEnd) {
    const start = new Date(filters.dateStart);
    const end = new Date(filters.dateEnd);
    const periodMs = end.getTime() - start.getTime();
    const periodDays = Math.round(periodMs / (1000 * 60 * 60 * 24));

    // Previous same-length period
    const prevEnd = new Date(start.getTime() - (1000 * 60 * 60 * 24)); // day before current start
    const prevStart = new Date(prevEnd.getTime() - periodMs);
    previousPeriod = computePeriodSummary(
      rawData,
      prevStart.toISOString().split('T')[0],
      prevEnd.toISOString().split('T')[0]
    );

    // Last 90 days (only if current period is shorter)
    if (periodDays < 85) {
      const now = new Date();
      const ninetyAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      last90Days = computePeriodSummary(
        rawData,
        ninetyAgo.toISOString().split('T')[0],
        now.toISOString().split('T')[0]
      );
    }
  }

  // ── Extract raw pains/goals texts for backend clustering ──
  const rawPains = [];
  const rawGoals = [];
  for (const call of rawData.calls) {
    if (call.pains && typeof call.pains === 'string' && call.pains.trim()) {
      rawPains.push(call.pains.trim());
    }
    if (call.goals && typeof call.goals === 'string' && call.goals.trim()) {
      rawGoals.push(call.goals.trim());
    }
    // Cap at 500 each to keep payload reasonable
    if (rawPains.length >= 500 && rawGoals.length >= 500) break;
  }

  return {
    dateRange,
    teamMetrics,
    closerStats,
    closerData,
    kpiTargets: kpiTargets || null,
    scriptTemplate: scriptTemplate || null,
    previousPeriod,
    last90Days,
    rawPains: rawPains.slice(0, 500),
    rawGoals: rawGoals.slice(0, 500),
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
      if ((value > 0 && value < 1) && (key.includes('Rate') || key.includes('rate') || key.includes('pct') || key.includes('Pct'))) {
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
  // Previous period per-closer data is merged inline so AI doesn't have to
  // match names across distant sections (which causes hallucinated numbers).
  if (gathered.closerStats && gathered.closerStats.length > 0) {
    // Build lookup for previous period per-closer close rates
    const prevCloserMap = {};
    if (gathered.previousPeriod?.closers) {
      for (const pc of gathered.previousPeriod.closers) {
        prevCloserMap[pc.name] = pc;
      }
    }
    const hasPrev = Object.keys(prevCloserMap).length > 0;

    lines.push('');
    lines.push('=== PER-CLOSER STATS (CURRENT PERIOD) ===');
    lines.push('IMPORTANT: These are the EXACT numbers. When writing about any closer, copy these numbers directly. Do NOT calculate or estimate close rates — use the values in this table.');
    const header = 'Name | Close Rate | Revenue | Cash | Show Rate | Deals Closed | Avg Deal Size | Obj Resolution | Obj Handling | Call Quality | Script Adherence | Discovery Score | Pitch Score | Close Attempt Score | Avg Duration (min) | Days to Close | Calls to Close | Held Count'
      + (hasPrev ? ' | Prev Close Rate | Close Rate Change' : '');
    lines.push(header);
    for (const c of gathered.closerStats) {
      let row = `${c.name} | ${(c.closeRate * 100).toFixed(1)}% | $${c.revenue?.toLocaleString() || 0} | $${c.cash?.toLocaleString() || 0} | ${(c.showRate * 100).toFixed(1)}% | ${c.dealsClosed} | $${c.avgDealSize?.toLocaleString() || 0} | ${(c.objResRate * 100).toFixed(1)}% | ${c.objHandling}/10 | ${c.callQuality}/10 | ${c.scriptAdherence}/10 | ${c.discoveryScore}/10 | ${c.pitchScore}/10 | ${c.closeAttemptScore}/10 | ${c.avgDuration} | ${c.daysToClose} | ${c.callsToClose} | ${c.heldCount}`;
      if (hasPrev) {
        const prev = prevCloserMap[c.name];
        if (prev) {
          const prevCR = (prev.closeRate * 100).toFixed(1);
          const currCR = (c.closeRate * 100).toFixed(1);
          const delta = (c.closeRate * 100 - prev.closeRate * 100).toFixed(1);
          const direction = delta > 0 ? `+${delta}pp (IMPROVING)` : delta < 0 ? `${delta}pp (DECLINING)` : '0pp (STABLE)';
          row += ` | ${prevCR}% | ${direction}`;
        } else {
          row += ' | N/A | N/A';
        }
      }
      lines.push(row);
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

  // Previous period metrics for trend detection
  if (gathered.previousPeriod) {
    const pp = gathered.previousPeriod;
    lines.push('');
    lines.push(`=== PREVIOUS PERIOD METRICS (${pp.dateRange}) ===`);
    if (pp.closeRate != null) lines.push(`Close Rate: ${(pp.closeRate * 100).toFixed(1)}%`);
    if (pp.showRate != null) lines.push(`Show Rate: ${(pp.showRate * 100).toFixed(1)}%`);
    if (pp.revenue != null) lines.push(`Revenue: $${Number(pp.revenue).toLocaleString()}`);
    if (pp.cash != null) lines.push(`Cash: $${Number(pp.cash).toLocaleString()}`);
    if (pp.callsHeld != null) lines.push(`Calls Held: ${pp.callsHeld}`);
    if (pp.dealsClosed != null) lines.push(`Deals Closed: ${pp.dealsClosed}`);
    if (pp.closers?.length > 0) {
      lines.push('Per-Closer: ' + pp.closers.map(c => `${c.name}: ${(c.closeRate * 100).toFixed(1)}% close, $${c.revenue?.toLocaleString() || 0}`).join(' | '));
    }
  }

  // Last 90 days metrics for longer-term trends
  if (gathered.last90Days) {
    const l90 = gathered.last90Days;
    lines.push('');
    lines.push(`=== LAST 90 DAYS (${l90.dateRange}) ===`);
    if (l90.closeRate != null) lines.push(`Close Rate: ${(l90.closeRate * 100).toFixed(1)}%`);
    if (l90.showRate != null) lines.push(`Show Rate: ${(l90.showRate * 100).toFixed(1)}%`);
    if (l90.revenue != null) lines.push(`Revenue: $${Number(l90.revenue).toLocaleString()}`);
    if (l90.cash != null) lines.push(`Cash: $${Number(l90.cash).toLocaleString()}`);
    if (l90.callsHeld != null) lines.push(`Calls Held: ${l90.callsHeld}`);
    if (l90.dealsClosed != null) lines.push(`Deals Closed: ${l90.dealsClosed}`);
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

  // Track tabs that need POST generation (GET returned null)
  const needsPostRef = useRef(new Set());

  // Phase 1: GET-only fetch — fires immediately without waiting for gathered data.
  // Only checks BQ cache. Tabs that miss go into needsPostRef for Phase 2.
  const fetchCached = useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    // Check if all accessible tabs are in module cache
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

    // Fire GETs for all tabs in parallel — no metrics needed
    const results = await Promise.allSettled(
      tabsToFetch.map(async (tab) => {
        const cached = tabCache.get(tab);
        if (cached) return { tab, ...cached, fromCache: true };

        // GET only — check BQ for today's cached insight
        const getRes = await apiGet(
          '/dashboard/data-analysis-insights',
          { tab, _t: Date.now() },
          authOptions
        );

        if (getRes?.success && getRes?.data) {
          const { generatedAt, ...rest } = getRes.data;
          tabCache.set(tab, { data: rest, generatedAt: generatedAt || null });
          return { tab, data: rest, generatedAt: generatedAt || null, fromCache: true };
        }

        // Cache miss — needs POST generation
        return { tab, data: null, generatedAt: null, fromCache: false };
      })
    );

    const newTabs = {};
    const missingTabs = new Set();
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { tab, data, generatedAt, fromCache } = result.value;
        if (data) {
          newTabs[tab] = { data, generatedAt, error: null };
        } else {
          missingTabs.add(tab);
        }
      }
    }

    setTabs(prev => ({
      overview: newTabs.overview || prev.overview,
      team: newTabs.team || prev.team,
      individual: newTabs.individual || prev.individual,
      compare: newTabs.compare || prev.compare,
    }));

    if (missingTabs.size === 0) {
      setIsLoading(false);
    }
    needsPostRef.current = missingTabs;
  }, [authOptions, tabsToFetch]);

  // Phase 2: POST generation — only fires for tabs that missed in Phase 1.
  // Waits for gathered data since POST needs metrics.
  useEffect(() => {
    if (needsPostRef.current.size === 0) return;
    if (!gathered) return;

    const missingTabs = [...needsPostRef.current];
    needsPostRef.current = new Set(); // Clear to prevent re-fire

    async function generateMissing() {
      setIsLoading(true);

      const results = await Promise.allSettled(
        missingTabs.map(async (tab) => {
          const result = await fetchTabInsight(tab, gathered, authOptions);
          if (result.data) {
            tabCache.set(tab, { data: result.data, generatedAt: result.generatedAt });
          }
          return { tab, ...result };
        })
      );

      const newTabs = {};
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { tab, data, generatedAt } = result.value;
          newTabs[tab] = { data, generatedAt, error: null };
        } else {
          console.error('[useDataAnalysisAllTabs] Tab generation failed:', result.reason);
        }
      }

      setTabs(prev => ({
        overview: newTabs.overview || prev.overview,
        team: newTabs.team || prev.team,
        individual: newTabs.individual || prev.individual,
        compare: newTabs.compare || prev.compare,
      }));
      setIsLoading(false);
    }

    generateMissing();
  }, [gathered, authOptions]);

  // Trigger Phase 1 immediately on mount
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchCached();
  }, [fetchCached]);

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
