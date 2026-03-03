/**
 * FINANCIAL PAGE — INSIGHT+ ONLY
 *
 * Revenue, cash collection, deal size, per-closer financial breakdowns.
 * Deep dive into the revenue metrics summarized on Overview.
 *
 * Layout — compact paired sections:
 *   Row 1: Revenue + Cash (stacked 2x1) | Rev & Cash dual-line chart
 *   Row 2: Rev/Call + Cash/Call (stacked 2x1) | Per-call dual-line chart
 *   Row 3: % Collected + Avg Deal Size (side-by-side pair)
 *   Row 4+: Per-closer charts in 2-col grid, shorter (Insight+ only)
 *
 * Color scheme (all from COLORS.neon in constants.js):
 *   green  — Revenue (scorecard, chart series, deal revenue)
 *   teal   — Cash (scorecard, chart series, cash/deal)
 *   purple — Revenue / Call (scorecard, chart series, % collected)
 *   blue   — Cash / Call (scorecard, chart series)
 *   amber  — % PIFs
 *   red    — Refunds
 *
 * Data: GET /api/dashboard/financial
 * Shows loading shimmer / empty states when API data is not yet available.
 */

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { COLORS } from '../../theme/constants';
import { useMetrics } from '../../hooks/useMetrics';
import { useInsight } from '../../hooks/useInsight';
import InsightCard from '../../components/InsightCard';
import { useAuth } from '../../context/AuthContext';
import { useKpiTargets } from '../../hooks/useKpiTargets';
import { meetsMinTier } from '../../utils/tierConfig';
import { DUMMY_FINANCIAL } from '../../utils/dummyData';
import Scorecard from '../../components/scorecards/Scorecard';
import ChartWrapper from '../../components/charts/ChartWrapper';
import TronLineChart from '../../components/charts/TronLineChart';
import TronBarChart from '../../components/charts/TronBarChart';
import TronPieChart from '../../components/charts/TronPieChart';


// ─────────────────────────────────────────────────────────────
// METRIC LABELS — Label/format lookup for scorecard display.
// When API data hasn't loaded yet, these provide the label and
// format so the loading shimmer shows the correct card title.
// Values are NEVER shown from this object — only label + format.
// ─────────────────────────────────────────────────────────────

const METRIC_LABELS = {
  // Row 1: Revenue & Cash
  revenue:          { label: 'Revenue Generated',      format: 'currency' },
  cashCollected:    { label: 'Cash Collected',         format: 'currency' },
  // Row 2: Per-call
  revenuePerCall:   { label: 'Revenue / Call Held',    format: 'currency' },
  cashPerCall:      { label: 'Cash / Call Held',       format: 'currency' },
  // Row 3: Deal economics
  collectedPct:     { label: '% Collected',            format: 'percent' },
  avgDealRevenue:   { label: 'Avg Revenue Per Deal',    format: 'currency' },
  avgCashPerDeal:   { label: 'Avg Cash Per Deal',      format: 'currency' },
  // Row 4: Payment & refund
  pifPct:           { label: '% PIFs',                 format: 'percent' },
  refundCount:      { label: '# of Refunds',           format: 'number' },
  refundAmount:     { label: '$ of Refunds',           format: 'currency' },
};


// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Safely extract a metric from the API response.
 * If API metric is unavailable, returns null value (triggers loading shimmer).
 * Label/format come from METRIC_LABELS lookup — no demo values are ever shown.
 */
function getMetric(apiMetrics, key, glowColor) {
  const m = apiMetrics?.[key];
  if (!m) {
    const meta = METRIC_LABELS[key];
    return { label: meta?.label || key, format: meta?.format || 'number', value: null, glowColor };
  }
  return { ...m, glowColor };
}

/**
 * Get chart data array from API response.
 * Returns empty array when data is missing — NEVER returns demo/fake data.
 * Empty array triggers ChartWrapper's empty state.
 */
function getChart(apiCharts, key) {
  const raw = apiCharts?.[key];
  // API envelope: { type, data: [...] } — extract inner array
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.data)) {
    return raw.data;
  }
  // Raw array
  if (Array.isArray(raw)) return raw;
  // No data available
  return [];
}


// ─────────────────────────────────────────────────────────────
// FINANCIAL PAGE COMPONENT
// ─────────────────────────────────────────────────────────────

export default function FinancialPage() {
  const { data, isLoading, error } = useMetrics('financial');
  const { text: insightText, generatedAt: insightGeneratedAt, isLoading: insightLoading, isOnDemandLoading, generateWithFilters, remainingAnalyses } = useInsight('financial', data);
  const { tier } = useAuth();
  const kpi = useKpiTargets();
  const closerLocked = !meetsMinTier(tier, 'insight');

  // Extract API data
  const apiData = data?.data || data;
  const metrics = apiData?.sections?.revenue;
  const charts = apiData?.charts;
  const hasApiData = !!apiData;

  return (
    <Box>
      {/* Page header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ color: COLORS.text.primary, fontWeight: 700 }}>
          Financial
        </Typography>
        <Typography sx={{ color: COLORS.text.muted, fontSize: '0.9rem', mt: 0.5 }}>
          Revenue, cash collection, and deal economics
        </Typography>
      </Box>

      <InsightCard text={insightText} isLoading={insightLoading} generatedAt={insightGeneratedAt} isOnDemandLoading={isOnDemandLoading} onAnalyze={generateWithFilters} remainingAnalyses={remainingAnalyses} />

      {/* Error state — only show if no data at all */}
      {error && !data && (
        <Box
          sx={{
            textAlign: 'center',
            py: 8,
            backgroundColor: 'rgba(255, 51, 102, 0.05)',
            borderRadius: 2,
            border: '1px solid rgba(255, 51, 102, 0.2)',
            mb: 3,
          }}
        >
          <Typography sx={{ color: COLORS.neon.red, mb: 1 }}>
            Failed to load financial data
          </Typography>
          <Typography sx={{ color: COLORS.text.muted, fontSize: '0.85rem' }}>
            {error.message || 'Please try again later.'}
          </Typography>
        </Box>
      )}

      {/* ═══════════════════════════════════════════════════════════
          DASHBOARD GRID — Compact paired layout
          Blurred for tiers below Insight
          ═══════════════════════════════════════════════════════════ */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>

        {/* ─────────────────────────────────────────────────────────
            ROW 1: Total Revenue & Cash
            Left: Revenue + Cash scorecards stacked
            Middle: Total Cash & Revenue Over Time (line)
            Right: Total Cash & Revenue per Closer (stacked bar)
            ───────────────────────────────────────────────────────── */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '2fr 5fr 5fr' },
            gap: 1.5,
          }}
        >
          {/* Left: 2 scorecards stacked */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Scorecard {...getMetric(metrics, 'revenue', COLORS.neon.green)} kpiTarget={kpi.revenue_per_month != null ? { value: kpi.revenue_per_month, format: 'currency' } : null} />
            <Scorecard {...getMetric(metrics, 'cashCollected', COLORS.neon.teal)} kpiTarget={kpi.cash_collected_per_month != null ? { value: kpi.cash_collected_per_month, format: 'currency' } : null} />
          </Box>

          {/* Middle: Total Cash & Revenue Over Time */}
          <ChartWrapper
            title="Total Cash & Revenue Over Time"
            accentColor={COLORS.neon.green}
            loading={isLoading && !hasApiData}
            isEmpty={false}
            height={240}
          >
            <TronLineChart
              data={getChart(charts, 'revenueOverTime')}
              series={[
                { key: 'revenue', label: 'Revenue Generated', color: COLORS.neon.green },
                { key: 'cash', label: 'Cash Collected', color: COLORS.neon.teal },
              ]}
              height={240}
              yAxisFormat="currency"
              showArea={true}
            />
          </ChartWrapper>

          {/* Right: Total Cash & Revenue per Closer */}
          <ChartWrapper
            title="Total Cash & Revenue per Closer"
            accentColor={COLORS.neon.green}
            loading={isLoading && !hasApiData}
            isEmpty={false}
            height={240}
            locked={closerLocked}
          >
            <TronBarChart
              data={closerLocked ? DUMMY_FINANCIAL.revenueByCloserBar : getChart(charts, 'revenueByCloserBar')}
              series={[
                { key: 'cash', label: 'Cash Collected', color: COLORS.neon.teal },
                { key: 'uncollected', label: 'Uncollected', color: COLORS.neon.green },
              ]}
              height={240}
              stacked={true}
              yAxisFormat="currency"
              stackTotalLabel="Total Revenue"
            />
          </ChartWrapper>
        </Box>


        {/* ─────────────────────────────────────────────────────────
            ROW 2: Per-Call & Per-Deal Averages
            Left: Avg Cash & Revenue per Closer (stacked bar)
            Middle: Cash & Revenue per Call Over Time (line)
            Right: Rev/Call + Cash/Call scorecards stacked
            ───────────────────────────────────────────────────────── */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '5fr 5fr 2fr' },
            gap: 1.5,
          }}
        >
          {/* Left: Avg Cash & Revenue per Closer */}
          <ChartWrapper
            title="Avg Cash & Revenue per Closer"
            accentColor={COLORS.neon.purple}
            loading={isLoading && !hasApiData}
            isEmpty={false}
            height={240}
            locked={closerLocked}
          >
            <TronBarChart
              data={closerLocked ? DUMMY_FINANCIAL.avgPerDealByCloser : getChart(charts, 'avgPerDealByCloser')}
              series={[
                { key: 'avgCash', label: 'Avg Cash', color: COLORS.neon.blue },
                { key: 'avgUncollected', label: 'Avg Uncollected', color: COLORS.neon.purple },
              ]}
              height={240}
              stacked={true}
              yAxisFormat="currency"
              stackTotalLabel="Total Revenue"
            />
          </ChartWrapper>

          {/* Middle: Per-Call Over Time */}
          <ChartWrapper
            title="Cash & Revenue per Call Over Time"
            accentColor={COLORS.neon.purple}
            loading={isLoading && !hasApiData}
            isEmpty={false}
            height={240}
          >
            <TronLineChart
              data={getChart(charts, 'perCallOverTime')}
              series={[
                { key: 'revPerCall', label: 'Revenue / Call Held', color: COLORS.neon.purple },
                { key: 'cashPerCall', label: 'Cash / Call Held', color: COLORS.neon.blue },
              ]}
              height={240}
              yAxisFormat="currency"
              showArea={true}
            />
          </ChartWrapper>

          {/* Right: 2 scorecards stacked */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Scorecard {...getMetric(metrics, 'revenuePerCall', COLORS.neon.purple)} />
            <Scorecard {...getMetric(metrics, 'cashPerCall', COLORS.neon.blue)} />
          </Box>
        </Box>


        {/* ─────────────────────────────────────────────────────────
            ROW 3: Deal Economics & Payments — 3x2 grid
            Col 1: Avg Rev/Deal, Avg Cash/Deal
            Col 2: % Collected, % PIFs
            Col 3: # Refunds, $ Refunds
            ───────────────────────────────────────────────────────── */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr' },
            gap: 1.5,
          }}
        >
          <Scorecard {...getMetric(metrics, 'avgDealRevenue', COLORS.neon.green)} kpiTarget={kpi.avg_deal_size != null ? { value: kpi.avg_deal_size, format: 'currency' } : null} />
          <Scorecard {...getMetric(metrics, 'collectedPct', COLORS.neon.purple)} />
          <Scorecard {...getMetric(metrics, 'refundCount', COLORS.neon.red)} />
          <Scorecard {...getMetric(metrics, 'avgCashPerDeal', COLORS.neon.teal)} />
          <Scorecard {...getMetric(metrics, 'pifPct', COLORS.neon.amber)} />
          <Scorecard {...getMetric(metrics, 'refundAmount', COLORS.neon.red)} />
        </Box>


        {/* ═══ Revenue by Closer + Payment Plan Breakdown ═══ */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
            gap: 1.5,
          }}
        >
          <ChartWrapper
            title="% of Revenue by Closer"
            accentColor={COLORS.neon.green}
            loading={isLoading && !hasApiData}
            isEmpty={false}
            height={240}
            locked={closerLocked}
          >
            <TronPieChart
              data={closerLocked ? DUMMY_FINANCIAL.revenueByCloserPie : getChart(charts, 'revenueByCloserPie')}
              innerRadius={50}
              height={240}
              legendPosition="left"
            />
          </ChartWrapper>

          <ChartWrapper
            title="Payment Plan Breakdown"
            accentColor={COLORS.neon.amber}
            loading={isLoading && !hasApiData}
            isEmpty={false}
            height={240}
          >
            <TronPieChart
              data={getChart(charts, 'paymentPlanBreakdown')}
              innerRadius={50}
              height={240}
              legendPosition="right"
            />
          </ChartWrapper>
        </Box>


        {/* ─── Footer ─── */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            pt: 3,
            pb: 2,
            borderTop: `1px solid ${COLORS.border.subtle}`,
          }}
        >
          <Typography sx={{ color: COLORS.text.muted, fontSize: '0.8rem' }}>
            Last updated: {new Date().toLocaleString()}
          </Typography>
          <Typography sx={{ color: COLORS.text.muted, fontSize: '0.8rem' }}>
            Data refreshes every 5 minutes
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
