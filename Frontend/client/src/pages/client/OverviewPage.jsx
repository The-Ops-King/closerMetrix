/**
 * OVERVIEW PAGE — ALL TIERS
 *
 * The "At a Glance" summary dashboard every client sees.
 * Layout based on the Figma "Sales Team Dashboard" design.
 *
 * Uses a staggered 12-column grid with alternating scorecard/chart placement
 * across 5 sections:
 *
 *   Section 1: Revenue & Deals    — Scorecards (5/12 LEFT)  + Revenue/Cash Area Chart (7/12 RIGHT)
 *   Section 2: Deals Closed       — Bar Chart (7/12 LEFT)   + Scorecards (5/12 RIGHT)
 *   Section 3: Prospects & Show   — Scorecards (5/12 LEFT)  + Show Rate Line (7/12 RIGHT)
 *   Section 4: Close Rates & Lost — Scorecards (5/12 LEFT)  + Close Rate Line (7/12 RIGHT)
 *   Section 5: Funnel & Outcomes  — Funnel (4/12) + Donut (4/12) + Scorecards (4/12)
 *
 * Tier behavior:
 *   - Basic: Date range filter only, no closer filter. Violations count visible but locked.
 *   - Insight+: Date range + closer filter, all metrics visible.
 *   - All tiers: "Potential Violations" count shows for everyone; details locked behind Executive.
 *
 * Data: GET /api/dashboard/overview (via useMetrics hook)
 * Falls back to demo data when API data is not yet available.
 */

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { COLORS, LAYOUT } from '../../theme/constants';
import { useAuth } from '../../context/AuthContext';
import { useMetrics } from '../../hooks/useMetrics';
import Scorecard from '../../components/scorecards/Scorecard';
import ChartWrapper from '../../components/charts/ChartWrapper';
import TronLineChart from '../../components/charts/TronLineChart';
import TronBarChart from '../../components/charts/TronBarChart';
import TronPieChart from '../../components/charts/TronPieChart';
import TronFunnelChart from '../../components/charts/TronFunnelChart';


// Shorthand aliases for COLORS.neon — keeps JSX concise
const OV = {
  green:  COLORS.neon.green,
  cyan:   COLORS.neon.cyan,
  blue:   COLORS.neon.blue,
  yellow: COLORS.neon.amber,
  red:    COLORS.neon.red,
  purple: COLORS.neon.purple,
  teal:   COLORS.neon.teal,
  white:  COLORS.text.primary,
};


// ─────────────────────────────────────────────────────────────
// DEMO DATA — Used when API data is not yet available.
// Matches the Figma design values exactly so the layout looks
// correct during development. Replaced by live API data when
// the backend returns real metrics.
// ─────────────────────────────────────────────────────────────

const DEMO_METRICS = {
  // Section 1: Revenue & Deals (left scorecards)
  revenue:          { value: 2681500,  label: 'Revenue Generated',       format: 'currency', delta: 18.5, deltaLabel: 'vs prev period' },
  cashCollected:    { value: 1366302,  label: 'Cash Collected',          format: 'currency', delta: 12.3, deltaLabel: 'vs prev period' },
  cashPerCall:      { value: 572,      label: 'Cash / Call Held',        format: 'currency', delta: 8.9,  deltaLabel: 'vs prev period' },
  avgDealSize:      { value: 6572,     label: 'Average Deal Size',       format: 'currency', delta: 5.4,  deltaLabel: 'vs prev period' },

  // Section 2: Deals Closed (right scorecards)
  closedDeals:        { value: 408,    label: 'Closed Deals',            format: 'number',  delta: 15.7,  deltaLabel: 'vs prev period' },
  potentialViolations:{ value: 0,      label: 'Potential Violations',    format: 'number',  delta: 0,     deltaLabel: 'vs prev period' },
  oneCallClosePct:    { value: 0.924,  label: '1 Call Close %',          format: 'percent', delta: 4.2,   deltaLabel: 'vs prev period' },
  callsPerDeal:       { value: 9.2,    label: 'Calls Required per Deal', format: 'decimal', delta: -1.5,  deltaLabel: 'vs prev period', desiredDirection: 'down' },

  // Section 3: Prospects & Show Rate (left scorecards)
  prospectsBooked: { value: 3357, label: 'Unique Prospects Scheduled', format: 'number',  delta: 12.5, deltaLabel: 'vs prev period' },
  prospectsHeld:   { value: 2491, label: 'Unique Appointments Held',   format: 'number',  delta: 8.3,  deltaLabel: 'vs prev period' },
  showRate:        { value: 0.694,label: 'Show Rate',                  format: 'percent', delta: 5.1,  deltaLabel: 'vs prev period' },

  // Section 4: Close Rates & Calls Lost (left scorecards)
  closeRate:           { value: 0.16,  label: 'Show \u2192 Close Rate',      format: 'percent', delta: 3.2,  deltaLabel: 'vs prev period' },
  scheduledCloseRate:  { value: 0.109, label: 'Scheduled \u2192 Close Rate', format: 'percent', delta: 2.1,  deltaLabel: 'vs prev period' },
  callsLost:           { value: 1179,  label: 'Calls Lost',                  format: 'number',  delta: -4.2, deltaLabel: 'vs prev period', desiredDirection: 'down' },
  lostPct:             { value: 0.473, label: 'Lost %',                      format: 'percent', delta: -2.1, deltaLabel: 'vs prev period', desiredDirection: 'down' },

  // Section 5: Bottom scorecards (right column)
  avgCallDuration: { value: 18.7,  label: 'Average Call Duration', format: 'duration', delta: 3.2,  deltaLabel: 'vs prev period' },
  activeFollowUp:  { value: 92,    label: 'Active Follow Up',     format: 'number',  delta: 6.8,  deltaLabel: 'vs prev period', desiredDirection: 'down' },
  disqualified:    { value: 127,   label: '# Disqualified',       format: 'number',  delta: 12.3, deltaLabel: 'vs prev period', desiredDirection: 'down' },
};


/**
 * Generate weekly time-series demo data for charts.
 * Creates 12 weeks of plausible data for each chart type.
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
    revenue: 180000 + Math.round(Math.random() * 80000),
    cash: 80000 + Math.round(Math.random() * 50000),
  }));

  const closesOverTime = weeks.map((date) => ({
    date,
    closes: 1 + Math.floor(Math.random() * 5),
  }));

  const showCloseRateOverTime = weeks.map((date) => ({
    date,
    showRate: 0.68 + Math.random() * 0.06,
    closeRate: 0.12 + Math.random() * 0.06,
  }));

  const callFunnel = [
    { stage: 'Booked',    count: 3357, color: OV.cyan },
    { stage: 'Held',      count: 2491, color: OV.blue },
    { stage: 'Qualified', count: 2381, color: OV.purple },
    { stage: 'Closed',    count: 408,  color: OV.green },
  ];

  const outcomeBreakdown = [
    { label: 'Closed - Won', value: 408,  color: OV.green },
    { label: 'Deposit',      value: 125,  color: OV.cyan },
    { label: 'Follow Up',    value: 358,  color: OV.purple },
    { label: 'Lost',         value: 1179, color: '#5a5a5a' },
    { label: 'Not Pitched',  value: 421,  color: OV.red },
  ];

  return {
    revenueOverTime,
    closesOverTime,
    showCloseRateOverTime,
    callFunnel,
    outcomeBreakdown,
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
 * This helper extracts the inner .data array. If the API returns a raw array
 * (or doesn't have chart data), falls back to demo data.
 */
function getChart(apiCharts, key) {
  const raw = apiCharts?.[key];
  // API envelope: { type, data: [...] } — extract inner array
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.data)) {
    return raw.data.length > 0 ? raw.data : (DEMO_CHARTS[key] || []);
  }
  // Raw array (shouldn't happen but handle it)
  if (Array.isArray(raw) && raw.length > 0) return raw;
  // Fallback to demo
  return DEMO_CHARTS[key] || [];
}

/**
 * Get chart series config from API response.
 * The API provides series definitions inside the chart envelope.
 * Returns null if not available (caller should use its own default).
 */
function getChartSeries(apiCharts, key) {
  const raw = apiCharts?.[key];
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.series)) {
    return raw.series;
  }
  return null;
}


// ─────────────────────────────────────────────────────────────
// OVERVIEW PAGE COMPONENT
// ─────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const { tier } = useAuth();
  const { data, isLoading, error } = useMetrics('overview');


  // Extract API data with demo fallbacks
  const apiData = data?.data || data; // Handle both { data: { sections, charts } } and { sections, charts }
  const metrics = apiData?.sections?.atAGlance;
  const charts = apiData?.charts;
  const hasApiData = !!apiData;

  return (
    <Box>
      {/* Page header */}
      <Box sx={{ mb: 3 }}>
        <Typography
          variant="h4"
          sx={{ color: COLORS.text.primary, fontWeight: 700 }}
        >
          At a Glance
        </Typography>
        <Typography sx={{ color: COLORS.text.muted, fontSize: '0.9rem', mt: 0.5 }}>
          Sales performance overview
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
            Failed to load overview data
          </Typography>
          <Typography sx={{ color: COLORS.text.muted, fontSize: '0.85rem' }}>
            {error.message || 'Showing demo data. Please try again later.'}
          </Typography>
        </Box>
      )}

      {/* ═══════════════════════════════════════════════════════════
          DASHBOARD GRID — 5 Staggered Sections
          ═══════════════════════════════════════════════════════════ */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>

        {/* ─────────────────────────────────────────────────────────
            SECTION 1: Revenue & Deals
            Left (5/12): 2x2 scorecards — Revenue, Cash, Cash/Call, Avg Deal Size
            Right (7/12): Dual area chart — Revenue & Cash over time
            ───────────────────────────────────────────────────────── */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '5fr 7fr' },
            gap: 1.5,
          }}
        >
          {/* Left: 2x2 Scorecards */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <Scorecard {...getMetric(metrics, 'revenue', OV.blue)} />
            <Scorecard {...getMetric(metrics, 'cashCollected', OV.teal)} />
            <Scorecard {...getMetric(metrics, 'cashPerCall', OV.purple)} />
            <Scorecard {...getMetric(metrics, 'avgDealSize', OV.purple)} />
          </Box>

          {/* Right: Revenue & Cash Collected Chart */}
          <ChartWrapper
            title="Revenue Generated & Cash Collected"
            accentColor={OV.blue}
            loading={isLoading && !hasApiData}
            isEmpty={false}
            height={280}
          >
            <TronLineChart
              data={getChart(charts, 'revenueOverTime')}
              series={[
                { key: 'revenue', label: 'Revenue Generated', color: OV.blue },
                { key: 'cash', label: 'Cash Collected', color: OV.cyan },
              ]}
              height={280}
              yAxisFormat="currency"
              showArea={true}
            />
          </ChartWrapper>
        </Box>


        {/* ─────────────────────────────────────────────────────────
            SECTION 2: Deals Closed
            Left (7/12): Bar chart — Deals closed per week
            Right (5/12): 2x2 scorecards — Closed, Violations, 1-Call Close, Calls/Deal
            ───────────────────────────────────────────────────────── */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '7fr 5fr' },
            gap: 1.5,
          }}
        >
          {/* Left: Deals Closed Bar Chart */}
          <ChartWrapper
            title="Deals Closed Over Time"
            accentColor={OV.green}
            loading={isLoading && !hasApiData}
            isEmpty={false}
            height={280}
          >
            <TronBarChart
              data={getChart(charts, 'closesOverTime')}
              series={[
                { key: 'closes', label: 'Deals Closed', color: OV.green },
              ]}
              height={280}
            />
          </ChartWrapper>

          {/* Right: 2x2 Scorecards */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <Scorecard {...getMetric(metrics, 'closedDeals', OV.green)} />
            <Scorecard {...getMetric(metrics, 'potentialViolations', OV.red)} />
            <Scorecard {...getMetric(metrics, 'oneCallClosePct', OV.blue)} />
            <Scorecard {...getMetric(metrics, 'callsPerDeal', OV.white)} />
          </Box>
        </Box>


        {/* ─────────────────────────────────────────────────────────
            SECTION 3: Unique Prospects & Show Rate
            Left (5/12): 2 scorecards top + 1 full-width bottom
            Right (7/12): Show rate area chart
            ───────────────────────────────────────────────────────── */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '5fr 7fr' },
            gap: 1.5,
          }}
        >
          {/* Left: 2 + 1 wide scorecard layout */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gridTemplateRows: '1fr 1fr',
              gap: 1.5,
            }}
          >
            <Scorecard {...getMetric(metrics, 'prospectsBooked', OV.blue)} />
            <Scorecard {...getMetric(metrics, 'prospectsHeld', OV.blue)} />
            <Box sx={{ gridColumn: '1 / -1' }}>
              <Scorecard {...getMetric(metrics, 'showRate', OV.yellow)} />
            </Box>
          </Box>

          {/* Right: Show Rate Over Time */}
          <ChartWrapper
            title="Show Rate Over Time"
            accentColor={OV.yellow}
            loading={isLoading && !hasApiData}
            isEmpty={false}
            height={280}
          >
            <TronLineChart
              data={getChart(charts, 'showCloseRateOverTime')}
              series={[{ key: 'showRate', label: 'Show Rate', color: OV.yellow }]}
              height={280}
              yAxisFormat="percent"
              showArea={true}
            />
          </ChartWrapper>
        </Box>


        {/* ─────────────────────────────────────────────────────────
            SECTION 4: Close Rates & Calls Lost
            Left (5/12): 2x2 scorecards — Close rates, Lost, Lost %
            Right (7/12): Close rate area chart
            ───────────────────────────────────────────────────────── */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '5fr 7fr' },
            gap: 1.5,
          }}
        >
          {/* Left: 2x2 Scorecards */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <Scorecard {...getMetric(metrics, 'closeRate', OV.purple)} />
            <Scorecard {...getMetric(metrics, 'scheduledCloseRate', OV.purple)} />
            <Scorecard {...getMetric(metrics, 'callsLost', OV.red)} />
            <Scorecard {...getMetric(metrics, 'lostPct', OV.red)} />
          </Box>

          {/* Right: Close Rate Over Time */}
          <ChartWrapper
            title="Close Rate Over Time"
            accentColor={OV.purple}
            loading={isLoading && !hasApiData}
            isEmpty={false}
            height={280}
          >
            <TronLineChart
              data={getChart(charts, 'showCloseRateOverTime')}
              series={[{ key: 'closeRate', label: 'Close Rate', color: OV.purple }]}
              height={280}
              yAxisFormat="percent"
              showArea={true}
            />
          </ChartWrapper>
        </Box>


        {/* ─────────────────────────────────────────────────────────
            SECTION 5: Funnel & Outcomes
            Left (4/12):   All Calls funnel
            Middle (4/12): Call Outcomes donut chart
            Right (4/12):  3 stacked scorecards
            ───────────────────────────────────────────────────────── */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' },
            gap: 1.5,
          }}
        >
          {/* Left: All Calls Funnel */}
          <TronFunnelChart
            data={getChart(charts, 'callFunnel')}
            title="All Calls"
          />

          {/* Middle: Call Outcomes Donut */}
          <ChartWrapper
            title="Call Outcomes"
            accentColor={OV.green}
            loading={isLoading && !hasApiData}
            isEmpty={false}
            height={350}
          >
            <TronPieChart
              data={getChart(charts, 'outcomeBreakdown')}
              height={350}
            />
          </ChartWrapper>

          {/* Right: 3 Stacked Scorecards */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ flex: 1 }}>
              <Scorecard {...getMetric(metrics, 'avgCallDuration', OV.yellow)} />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Scorecard {...getMetric(metrics, 'activeFollowUp', OV.purple)} />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Scorecard {...getMetric(metrics, 'disqualified', OV.red)} />
            </Box>
          </Box>
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
