/**
 * USE INSIGHT HOOK — AI Per-Page Insight Cards
 *
 * Two modes:
 *   1. Daily (default): GETs the pre-generated daily insight from InsightLog.
 *      Instant on page load — no AI wait.
 *   2. On-demand: POSTs with current filter data for a fresh AI analysis.
 *      Triggered by the "Analyze with current filters" button.
 *
 * Module-level cache survives component remounts (tab switches).
 *
 * Usage:
 *   const { text, generatedAt, isLoading, generateWithFilters } = useInsight('financial', data);
 *
 *   // For pages with client-side computed metrics (e.g. Projections):
 *   const { ... } = useInsight('projections', data, computedDisplayMetrics);
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost } from '../utils/api';

// ── Module-level client cache ────────────────────────────────────────
// Survives component unmount/remount (tab switches).
// Daily insights: keyed by section
// On-demand insights: keyed by section:fingerprint
const dailyCache = new Map();
const onDemandCache = new Map();

// ── Rate limiting: 10 on-demand analyses per hour (across all sections) ──
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function getRateLimitState() {
  try {
    const raw = localStorage.getItem('insight_rate_limit');
    if (!raw) return { timestamps: [] };
    const state = JSON.parse(raw);
    const cutoff = Date.now() - RATE_WINDOW_MS;
    state.timestamps = (state.timestamps || []).filter(t => t > cutoff);
    return state;
  } catch { return { timestamps: [] }; }
}

function recordUsage() {
  const state = getRateLimitState();
  state.timestamps.push(Date.now());
  localStorage.setItem('insight_rate_limit', JSON.stringify(state));
}

function getRemainingAnalyses() {
  return RATE_LIMIT - getRateLimitState().timestamps.length;
}

// ── Value formatters — turn raw values into display strings ──────────

function formatValue(value, format) {
  if (value === null || value === undefined || value === '-') return '-';
  if (typeof value === 'string') return value;
  if (!isFinite(value)) return '-';

  switch (format) {
    case 'percent':
      return (value * 100).toFixed(1) + '%';
    case 'currency':
      return '$' + Math.round(value).toLocaleString('en-US');
    case 'score':
    case 'decimal':
      return value.toFixed(1);
    case 'number':
    default:
      return typeof value === 'number' ? Math.round(value).toLocaleString('en-US') : String(value);
  }
}

/**
 * Extract pre-formatted, display-ready metrics from the full page data.
 * Sends "Show Rate: 73.0%" instead of raw { showRate: 0.73 }.
 * The AI receives exactly what's on screen — no math required.
 *
 * Returns null if data isn't ready yet.
 */
function extractMetrics(data) {
  if (!data) return null;

  const apiData = data?.data || data;
  const sections = apiData?.sections;
  const tables = apiData?.tables;
  const meta = apiData?.meta;

  if (!sections) return null;

  const metrics = {};

  // Include date range if available
  if (meta?.dateRange) {
    metrics.dateRange = `${meta.dateRange.start || ''} to ${meta.dateRange.end || ''}`;
  }

  // Format all section metrics as "Label: formatted value" for the AI.
  // Each metric object has { label, value, format, glowColor }.
  // We group by section name so the AI sees logical groupings.
  for (const [sectionKey, sectionMetrics] of Object.entries(sections)) {
    if (typeof sectionMetrics === 'object' && sectionMetrics !== null) {
      const formatted = {};
      for (const [metricKey, metric] of Object.entries(sectionMetrics)) {
        if (metric && typeof metric === 'object' && 'value' in metric) {
          const label = metric.label || metricKey;
          formatted[label] = formatValue(metric.value, metric.format);
        }
      }
      if (Object.keys(formatted).length > 0) {
        metrics[sectionKey] = formatted;
      }
    }
  }

  // Include per-closer table data if present (compact form with formatted values)
  if (tables) {
    for (const [tableKey, table] of Object.entries(tables)) {
      if (table?.rows && Array.isArray(table.rows) && table.rows.length > 0) {
        // Use column definitions if available to format values
        const columns = table.columns || [];
        const colFormatMap = {};
        for (const col of columns) {
          if (col.key && col.format) colFormatMap[col.key] = col.format;
        }

        metrics[tableKey] = table.rows.slice(0, 10).map(row => {
          const compact = {};
          for (const [k, v] of Object.entries(row)) {
            if (v === null || v === undefined) continue;
            if (typeof v === 'number') {
              // Format using column format if known, otherwise keep raw
              compact[k] = colFormatMap[k] ? formatValue(v, colFormatMap[k]) : v;
            } else if (typeof v === 'string' && v.length < 50) {
              compact[k] = v;
            }
          }
          return compact;
        });
      }
    }
  }

  return metrics;
}

/**
 * Stable fingerprint of extracted metrics.
 */
function fingerprint(metrics) {
  if (!metrics) return '';
  try {
    return JSON.stringify(metrics);
  } catch {
    return '';
  }
}

/**
 * Fetch AI insight for a specific dashboard section.
 *
 * @param {string} section - Section name ('overview', 'financial', etc.)
 * @param {object|null} pageData - Computed page data from useMetrics
 * @param {object|null} [displayMetrics] - Optional pre-computed display metrics from the page.
 *   When provided, these are merged into (and override) the auto-extracted metrics.
 *   Use this for pages that compute metrics client-side (e.g. Projections).
 * @returns {{ text: string|null, generatedAt: string|null, isLoading: boolean, isOnDemandLoading: boolean, error: Error|null, generateWithFilters: () => void }}
 */
export function useInsight(section, pageData, displayMetrics) {
  const { token, mode, adminViewClientId } = useAuth();
  const [text, setText] = useState(null);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOnDemandLoading, setIsOnDemandLoading] = useState(false);
  const [error, setError] = useState(null);
  const [remainingAnalyses, setRemainingAnalyses] = useState(() => getRemainingAnalyses());

  // Track whether we've fetched the daily insight for this section
  const fetchedSectionRef = useRef('');
  // Track whether the daily GET returned empty (no pre-generated insight)
  const dailyEmptyRef = useRef(false);
  // Track the fingerprint we last auto-generated for (prevents duplicate auto-POSTs)
  const autoGeneratedFpRef = useRef('');

  // Extract metrics for on-demand generation.
  // Merge in displayMetrics if provided (page-computed values override auto-extracted).
  const metrics = useMemo(() => {
    const base = extractMetrics(pageData);
    if (!base && !displayMetrics) return null;
    if (!displayMetrics) return base;
    if (!base) return displayMetrics;
    return { ...base, ...displayMetrics };
  }, [pageData, displayMetrics]);

  // Build auth options
  const authOptions = useMemo(() => {
    if (mode === 'admin') {
      return { viewClientId: adminViewClientId };
    }
    return { token };
  }, [mode, adminViewClientId, token]);

  // ── Fetch daily pre-generated insight ──────────────────────────────
  useEffect(() => {
    if (!section) return;

    // Already fetched for this section
    if (fetchedSectionRef.current === section) return;

    // Check cache first
    const cached = dailyCache.get(section);
    if (cached) {
      setText(cached.text);
      setGeneratedAt(cached.generatedAt);
      fetchedSectionRef.current = section;
      return;
    }

    let cancelled = false;

    async function fetchDailyInsight() {
      setIsLoading(true);
      setError(null);

      try {
        const res = await apiGet(
          '/dashboard/insights',
          { section },
          authOptions
        );

        if (!cancelled && res?.success && res?.data?.text) {
          const { text: insightText, generatedAt: at } = res.data;
          setText(insightText);
          setGeneratedAt(at);
          fetchedSectionRef.current = section;
          dailyCache.set(section, { text: insightText, generatedAt: at });
        } else if (!cancelled && res?.success && !res?.data?.text) {
          // No daily insight available yet — mark empty so auto-fallback triggers
          fetchedSectionRef.current = section;
          dailyEmptyRef.current = true;
        }
      } catch (err) {
        if (!cancelled) {
          // Daily insight not available — mark empty so auto-fallback triggers
          dailyEmptyRef.current = true;
          fetchedSectionRef.current = section;
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchDailyInsight();
    return () => { cancelled = true; };
  }, [section, authOptions]);

  // ── Auto-fallback: POST on-demand when daily is empty ───────────────
  // If the daily GET returned no text (InsightLog table empty or not created),
  // automatically trigger the on-demand POST once metrics are available.
  // This preserves the original behavior until the daily job starts populating data.
  const fp = useMemo(() => fingerprint(metrics), [metrics]);

  useEffect(() => {
    if (!dailyEmptyRef.current) return;     // Daily had data — no fallback needed
    if (!metrics || !section || !fp) return; // No data yet
    if (text) return;                        // Already have text (from cache or prior fetch)
    if (isLoading || isOnDemandLoading) return; // Already fetching
    if (autoGeneratedFpRef.current === fp) return; // Already auto-generated for this data

    // Check on-demand cache first
    const cacheKey = `${section}:${fp}`;
    const cached = onDemandCache.get(cacheKey);
    if (cached) {
      setText(cached);
      autoGeneratedFpRef.current = fp;
      return;
    }

    let cancelled = false;
    autoGeneratedFpRef.current = fp;

    async function autoGenerate() {
      setIsLoading(true);
      setError(null);

      try {
        const res = await apiPost(
          '/dashboard/insights',
          { section, metrics },
          authOptions
        );

        if (!cancelled && res?.success && res?.data?.text) {
          const insightText = res.data.text;
          setText(insightText);
          onDemandCache.set(cacheKey, insightText);
        }
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    autoGenerate();
    return () => { cancelled = true; };
  }, [section, fp, metrics, text, isLoading, isOnDemandLoading, authOptions]);

  // ── On-demand generation (button click) ────────────────────────────
  // Always forces a fresh AI call — never returns cached data.
  // The whole point of clicking the button is to get a NEW analysis.
  const generateWithFilters = useCallback(async () => {
    if (!metrics || !section) return;
    if (getRemainingAnalyses() <= 0) return;

    setIsOnDemandLoading(true);
    setError(null);

    try {
      recordUsage();
      setRemainingAnalyses(getRemainingAnalyses());

      const res = await apiPost(
        '/dashboard/insights',
        { section, metrics, force: true },
        authOptions
      );

      if (res?.success && res?.data?.text) {
        const insightText = res.data.text;
        setText(insightText);
        setGeneratedAt(null); // On-demand — no stored timestamp
        // Update cache so auto-fallback doesn't overwrite
        const fp = fingerprint(metrics);
        const cacheKey = `${section}:${fp}`;
        onDemandCache.set(cacheKey, insightText);
      }
    } catch (err) {
      setError(err);
    } finally {
      setIsOnDemandLoading(false);
    }
  }, [section, metrics, authOptions]);

  return { text, generatedAt, isLoading, isOnDemandLoading, error, generateWithFilters, remainingAnalyses };
}
