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
 * Shows loading shimmer / empty states when API data is not yet available.
 */

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { COLORS, LAYOUT } from '../../theme/constants';
import { useAuth } from '../../context/AuthContext';
import { useMetrics } from '../../hooks/useMetrics';
import { useKpiTargets } from '../../hooks/useKpiTargets';
import { useInsight } from '../../hooks/useInsight';
import InsightCard from '../../components/InsightCard';
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
// METRIC LABELS — Label/format lookup for scorecard display.
// When API data hasn't loaded yet, these provide the label and
// format so the loading shimmer shows the correct card title.
// Values are NEVER shown from this object — only label + format.
// ─────────────────────────────────────────────────────────────

const METRIC_LABELS = {
  // Section 1: Revenue & Deals (left scorecards)
  revenue:          { label: 'Revenue Generated',       format: 'currency' },
  cashCollected:    { label: 'Cash Collected',          format: 'currency' },
  cashPerCall:      { label: 'Cash / Call Held',        format: 'currency' },
  avgDealSize:      { label: 'Average Deal Size',       format: 'currency' },

  // Section 2: Deals Closed (right scorecards)
  closedDeals:        { label: 'Closed Deals',            format: 'number' },
  potentialViolations:{ label: 'Potential Violations',    format: 'number' },
  oneCallClosePct:    { label: '1 Call Close %',          format: 'percent' },
  callsPerDeal:       { label: 'Calls Required per Deal', format: 'decimal' },

  // Section 3: Prospects & Show Rate (left scorecards)
  prospectsBooked: { label: 'Unique Prospects Scheduled', format: 'number' },
  prospectsHeld:   { label: 'Unique Appointments Held',   format: 'number' },
  showRate:        { label: 'Show Rate',                  format: 'percent' },

  // Section 4: Close Rates & Calls Lost (left scorecards)
  closeRate:           { label: 'Show \u2192 Close Rate',      format: 'percent' },
  scheduledCloseRate:  { label: 'Scheduled \u2192 Close Rate', format: 'percent' },
  callsLost:           { label: 'Calls Lost',                  format: 'number' },
  lostPct:             { label: 'Lost %',                      format: 'percent' },

  // Section 5: Bottom scorecards (right column)
  avgCallDuration: { label: 'Average Call Duration', format: 'duration' },
  activeFollowUp:  { label: 'Active Follow Up',     format: 'number' },
  disqualified:    { label: '# Disqualified',       format: 'number' },
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
  const kpi = useKpiTargets();
  const { text: insightText, generatedAt: insightGeneratedAt, isLoading: insightLoading, isOnDemandLoading, generateWithFilters, remainingAnalyses } = useInsight('overview', data);


  // Extract API data
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
            Failed to load overview data
          </Typography>
          <Typography sx={{ color: COLORS.text.muted, fontSize: '0.85rem' }}>
            {error.message || 'Please try again later.'}
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
            <Scorecard {...getMetric(metrics, 'revenue', OV.blue)} kpiTarget={kpi.revenue_per_month != null ? { value: kpi.revenue_per_month, format: 'currency' } : null} />
            <Scorecard {...getMetric(metrics, 'cashCollected', OV.teal)} kpiTarget={kpi.cash_collected_per_month != null ? { value: kpi.cash_collected_per_month, format: 'currency' } : null} />
            <Scorecard {...getMetric(metrics, 'cashPerCall', OV.purple)} />
            <Scorecard {...getMetric(metrics, 'avgDealSize', OV.purple)} kpiTarget={kpi.avg_deal_size != null ? { value: kpi.avg_deal_size, format: 'currency' } : null} />
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
              <Scorecard {...getMetric(metrics, 'showRate', OV.yellow)} kpiTarget={kpi.show_rate != null ? { value: kpi.show_rate, format: 'percent' } : null} />
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
              referenceLines={[
                kpi.show_rate != null && { value: kpi.show_rate, label: 'Target', color: 'amber' },
              ].filter(Boolean)}
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
            <Scorecard {...getMetric(metrics, 'closeRate', OV.purple)} kpiTarget={kpi.close_rate != null ? { value: kpi.close_rate, format: 'percent' } : null} />
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
              referenceLines={[
                kpi.close_rate != null && { value: kpi.close_rate, label: 'Target', color: 'amber' },
              ].filter(Boolean)}
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
