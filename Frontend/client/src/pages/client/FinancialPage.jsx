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
 * Falls back to demo data when API data is not yet available.
 */

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { COLORS } from '../../theme/constants';
import { useMetrics } from '../../hooks/useMetrics';
import { useAuth } from '../../context/AuthContext';
import { meetsMinTier } from '../../utils/tierConfig';
import { DUMMY_FINANCIAL } from '../../utils/dummyData';
import Scorecard from '../../components/scorecards/Scorecard';
import ChartWrapper from '../../components/charts/ChartWrapper';
import TronLineChart from '../../components/charts/TronLineChart';
import TronBarChart from '../../components/charts/TronBarChart';
import TronPieChart from '../../components/charts/TronPieChart';


// ─────────────────────────────────────────────────────────────
// DEMO DATA — Used when API data is not yet available.
// Replaced by live API data when the backend returns real metrics.
// ─────────────────────────────────────────────────────────────

const DEMO_METRICS = {
  // Row 1: Revenue & Cash
  revenue:          { value: 115000, label: 'Revenue Generated',      format: 'currency', delta: 18.5, deltaLabel: 'vs prev period' },
  cashCollected:    { value: 69000,  label: 'Cash Collected',         format: 'currency', delta: 12.3, deltaLabel: 'vs prev period' },
  // Row 2: Per-call
  revenuePerCall:   { value: 701,    label: 'Revenue / Call',         format: 'currency', delta: 5.2,  deltaLabel: 'vs prev period' },
  cashPerCall:      { value: 663,    label: 'Cash / Call',            format: 'currency', delta: 4.8,  deltaLabel: 'vs prev period' },
  // Row 3: Deal economics
  collectedPct:     { value: 0.60,   label: '% Collected',            format: 'percent',  delta: 3.1,  deltaLabel: 'vs prev period' },
  avgDealRevenue:   { value: 5000,   label: 'Avg Revenue Per Deal',    format: 'currency', delta: 2.1,  deltaLabel: 'vs prev period' },
  avgCashPerDeal:   { value: 3000,   label: 'Avg Cash Per Deal',      format: 'currency', delta: 1.8,  deltaLabel: 'vs prev period' },
  // Row 4: Payment & refund
  pifPct:           { value: 0.34,   label: '% PIFs',                 format: 'percent',  delta: 2.5,  deltaLabel: 'vs prev period' },
  refundCount:      { value: 3,      label: '# of Refunds',           format: 'number',   delta: -1,   deltaLabel: 'vs prev period', desiredDirection: 'down' },
  refundAmount:     { value: 8500,   label: '$ of Refunds',           format: 'currency', delta: -12.4, deltaLabel: 'vs prev period', desiredDirection: 'down' },
};


/**
 * Generate weekly time-series demo data for charts.
 * Creates 12 weeks of plausible data.
 */
function generateDemoChartData() {
  const weeks = [];
  const base = new Date('2025-11-18');
  for (let i = 0; i < 12; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i * 7);
    weeks.push(d.toISOString().split('T')[0]);
  }

  const revenueOverTime = weeks.map((date) => ({
    date,
    revenue: 12000 + Math.round(Math.random() * 6000),
    cash: 7000 + Math.round(Math.random() * 4000),
  }));

  const perCallOverTime = weeks.map((date) => ({
    date,
    revPerCall: 650 + Math.round(Math.random() * 200),
    cashPerCall: 400 + Math.round(Math.random() * 150),
  }));

  const closers = ['Sarah', 'Mike', 'Jessica', 'Alex'];
  const closerRevenue = [38000, 32000, 28000, 17000];
  const closerCash = [22800, 19200, 16800, 10200];

  const revenueByCloserPie = closers.map((label, i) => ({
    label,
    value: closerRevenue[i],
    color: COLORS.chart[i],
  }));

  // Cash is a portion of revenue — split into cash + uncollected so bar total = revenue
  const revenueByCloserBar = closers.map((name, i) => ({
    date: name,
    cash: closerCash[i],
    uncollected: closerRevenue[i] - closerCash[i],
  }));

  const perCallByCloser = closers.map((name, i) => ({
    date: name,
    revPerCall: 600 + Math.round(Math.random() * 300),
    cashPerCall: 350 + Math.round(Math.random() * 200),
  }));

  // Cash is a portion of revenue — split into cash + uncollected so bar total = avg revenue
  const avgRevPerDeal = [5800, 5200, 4600, 4100];
  const avgCashPerDeal = [3480, 3120, 2760, 2460];
  const avgPerDealByCloser = closers.map((name, i) => ({
    date: name,
    avgCash: avgCashPerDeal[i],
    avgUncollected: avgRevPerDeal[i] - avgCashPerDeal[i],
  }));

  const paymentPlanBreakdown = [
    { label: 'PIF',         value: 8,  color: COLORS.neon.green },
    { label: '2-Pay',       value: 6,  color: COLORS.neon.cyan },
    { label: '3-Pay',       value: 5,  color: COLORS.neon.purple },
    { label: 'Custom Plan', value: 4,  color: COLORS.neon.amber },
  ];

  return {
    revenueOverTime,
    perCallOverTime,
    revenueByCloserPie,
    revenueByCloserBar,
    perCallByCloser,
    avgPerDealByCloser,
    paymentPlanBreakdown,
  };
}

const DEMO_CHARTS = generateDemoChartData();


// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Safely extract a metric from the API response.
 * Falls back to demo data when the API metric is not available.
 * Decorates with the glow color for the Scorecard component.
 */
function getMetric(apiMetrics, key, glowColor) {
  const m = apiMetrics?.[key] || DEMO_METRICS[key];
  if (!m) return { label: key, value: null, glowColor };
  return { ...m, glowColor };
}

/**
 * Get chart data array from API response, falling back to demo data.
 *
 * The API wraps chart data in an envelope: { type, label, series, data: [...] }
 * This helper extracts the inner .data array.
 */
function getChart(apiCharts, key) {
  const raw = apiCharts?.[key];
  // API envelope: { type, data: [...] } — extract inner array
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.data)) {
    return raw.data.length > 0 ? raw.data : (DEMO_CHARTS[key] || []);
  }
  // Raw array
  if (Array.isArray(raw) && raw.length > 0) return raw;
  // Fallback to demo
  return DEMO_CHARTS[key] || [];
}


// ─────────────────────────────────────────────────────────────
// FINANCIAL PAGE COMPONENT
// ─────────────────────────────────────────────────────────────

export default function FinancialPage() {
  const { data, isLoading, error } = useMetrics('financial');
  const { tier } = useAuth();
  const closerLocked = !meetsMinTier(tier, 'insight');

  // Extract API data with demo fallbacks
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
            {error.message || 'Showing demo data. Please try again later.'}
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
            <Scorecard {...getMetric(metrics, 'revenue', COLORS.neon.green)} />
            <Scorecard {...getMetric(metrics, 'cashCollected', COLORS.neon.teal)} />
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
                { key: 'revPerCall', label: 'Revenue / Call', color: COLORS.neon.purple },
                { key: 'cashPerCall', label: 'Cash / Call', color: COLORS.neon.blue },
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
          <Scorecard {...getMetric(metrics, 'avgDealRevenue', COLORS.neon.green)} />
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
