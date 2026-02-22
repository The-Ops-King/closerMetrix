/**
 * SALES CYCLE PAGE — 2-Section Layout (Call Outcomes Style)
 *
 * Each section follows: colored SectionHeader → scorecard grid → 2-col chart grid.
 *
 * Sections:
 *   1. Overview         — cyan   — 6 scorecards (1/2/3+ call counts & pcts)
 *   2. Key Metrics      — green  — avg/median stacked pairs + big calls-per-deal
 *   3. Calls to Close   — cyan   — pie + bucketed bar + stacked by-closer
 *   4. Days to Close    — amber  — pie + bucketed bar + stacked by-closer
 *
 * Two distinct "calls to close" metrics:
 *   Avg Calls to Close    = per-prospect average (from v_close_cycle_stats_dated)
 *   Calls Needed per Deal  = total calls held / total closed deals
 *
 * Per-closer bar chart shows locked/blurred state for Basic tier.
 *
 * Data: GET /api/dashboard/sales-cycle
 */

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { COLORS } from '../../theme/constants';
import { useMetrics } from '../../hooks/useMetrics';
import { useAuth } from '../../context/AuthContext';
import { meetsMinTier } from '../../utils/tierConfig';
import { DUMMY_SALES_CYCLE } from '../../utils/dummyData';
import SectionHeader from '../../components/SectionHeader';
import Scorecard from '../../components/scorecards/Scorecard';
import ChartWrapper from '../../components/charts/ChartWrapper';
import TronBarChart from '../../components/charts/TronBarChart';
import TronPieChart from '../../components/charts/TronPieChart';


export default function SalesCyclePage() {
  const { data, isLoading, error } = useMetrics('sales-cycle');
  const { tier } = useAuth();
  const closerLocked = !meetsMinTier(tier, 'insight');

  const sections = data?.sections || {};
  const charts = data?.charts || {};

  return (
    <Box>
      {/* Page header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ color: COLORS.text.primary, fontWeight: 700 }}>
          Sales Cycle
        </Typography>
        <Typography sx={{ color: COLORS.text.muted, fontSize: '0.9rem', mt: 0.5 }}>
          Time and calls to close analysis
        </Typography>
      </Box>

      {/* Loading state */}
      {isLoading && !data && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography sx={{ color: COLORS.text.muted }}>Loading sales cycle data...</Typography>
        </Box>
      )}

      {/* Error state */}
      {error && !data && (
        <Box
          sx={{
            textAlign: 'center', py: 8,
            backgroundColor: 'rgba(255, 51, 102, 0.05)',
            borderRadius: 2,
            border: '1px solid rgba(255, 51, 102, 0.2)',
          }}
        >
          <Typography sx={{ color: COLORS.neon.red, mb: 1 }}>
            Failed to load sales cycle data
          </Typography>
          <Typography sx={{ color: COLORS.text.muted, fontSize: '0.85rem' }}>
            {error.message || 'Please try again later.'}
          </Typography>
        </Box>
      )}

      {/* Dashboard content */}
      {data && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>

          {/* ═══════════════════════════════════════════════════════
              SECTION 1: Overview — 6 scorecards (counts + pcts)
              ═══════════════════════════════════════════════════════ */}
          <Box>
            <SectionHeader title="Overview" color={COLORS.neon.cyan} />

            {/* 3 columns × 2 rows: counts then percentages
                Col colors: 1-Call = green, 2-Call = blue, 3+ = amber */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)' }, gap: 1.5, my: 2 }}>
              {/* Row 1: Counts */}
              <Scorecard label="1-Call Closes" value={sections.callsToClose?.oneCallCloses?.value} format="number"
                delta={sections.callsToClose?.oneCallCloses?.delta} deltaLabel="vs prev period"
                glowColor={COLORS.neon.green} />
              <Scorecard label="2-Call Closes" value={sections.callsToClose?.twoCallCloses?.value} format="number"
                delta={sections.callsToClose?.twoCallCloses?.delta} deltaLabel="vs prev period"
                glowColor={COLORS.neon.blue} />
              <Scorecard label="3+ Call Closes" value={sections.callsToClose?.threeCallCloses?.value} format="number"
                delta={sections.callsToClose?.threeCallCloses?.delta} deltaLabel="vs prev period"
                glowColor={COLORS.neon.amber} />

              {/* Row 2: Percentages */}
              <Scorecard label="1-Call Close %" value={sections.callsToClose?.oneCallClosePct?.value} format="percent"
                delta={sections.callsToClose?.oneCallClosePct?.delta} deltaLabel="vs prev period"
                glowColor={COLORS.neon.green} />
              <Scorecard label="2-Call Close %" value={sections.callsToClose?.twoCallClosePct?.value} format="percent"
                delta={sections.callsToClose?.twoCallClosePct?.delta} deltaLabel="vs prev period"
                glowColor={COLORS.neon.blue} />
              <Scorecard label="3+ Call Close %" value={sections.callsToClose?.threeCallClosePct?.value} format="percent"
                delta={sections.callsToClose?.threeCallClosePct?.delta} deltaLabel="vs prev period"
                glowColor={COLORS.neon.amber} />
            </Box>
          </Box>


          {/* ═══════════════════════════════════════════════════════
              SECTION 2: Key Metrics — stacked avg/median + big calls-per-deal
              Layout: [Avg Calls / Median Calls] [Avg Days / Median Days] [Calls per Deal (big)]
              ═══════════════════════════════════════════════════════ */}
          <Box>
            <SectionHeader title="Key Metrics" color={COLORS.neon.green} />

            <Box sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
              gridTemplateRows: { md: 'auto auto' },
              gap: 1.5,
              my: 2,
            }}>
              {/* Col 1, Row 1: Avg Calls to Close */}
              <Scorecard label="Avg Calls to Close" value={sections.callsToClose?.avgCallsToClose?.value} format="decimal"
                delta={sections.callsToClose?.avgCallsToClose?.delta} deltaLabel="vs prev period"
                desiredDirection="down" glowColor={COLORS.neon.cyan} />
              {/* Col 2, Row 1: Avg Days to Close */}
              <Scorecard label="Avg Days to Close" value={sections.daysToClose?.avgDaysToClose?.value} format="decimal"
                delta={sections.daysToClose?.avgDaysToClose?.delta} deltaLabel="vs prev period"
                desiredDirection="down" glowColor={COLORS.neon.purple} />
              {/* Col 3, Row 1+2: Calls Scheduled per Close — spans both rows */}
              <Box sx={{ gridRow: { md: '1 / 3' }, gridColumn: { md: '3' } }}>
                <Scorecard label="Calls Scheduled per Close" value={sections.callsToClose?.callsNeededPerDeal?.value} format="decimal"
                  delta={sections.callsToClose?.callsNeededPerDeal?.delta} deltaLabel="vs prev period"
                  desiredDirection="down" glowColor={COLORS.neon.green} />
              </Box>
              {/* Col 1, Row 2: Median Calls to Close */}
              <Scorecard label="Median Calls to Close" value={sections.callsToClose?.medianCallsToClose?.value} format="decimal"
                delta={sections.callsToClose?.medianCallsToClose?.delta} deltaLabel="vs prev period"
                desiredDirection="down" glowColor={COLORS.neon.cyan} />
              {/* Col 2, Row 2: Median Days to Close */}
              <Scorecard label="Median Days to Close" value={sections.daysToClose?.medianDaysToClose?.value} format="decimal"
                delta={sections.daysToClose?.medianDaysToClose?.delta} deltaLabel="vs prev period"
                desiredDirection="down" glowColor={COLORS.neon.purple} />
            </Box>
          </Box>


          {/* ═══════════════════════════════════════════════════════
              SECTION 3: Calls to Close — 3 charts
              ═══════════════════════════════════════════════════════ */}
          <Box>
            <SectionHeader title="Calls to Close" color={COLORS.neon.cyan} />

            {/* Row 1: pie + bucketed bar */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: '16px', mt: 2 }}>
              <ChartWrapper title="1-Call vs Multi-Call Closes" accentColor={COLORS.neon.green}
                loading={isLoading} error={error?.message}
                isEmpty={!charts.salesCyclePie?.data?.length} height={300}>
                <TronPieChart data={charts.salesCyclePie?.data || []} height={300} innerRadius={55} />
              </ChartWrapper>

              <ChartWrapper title="# of Calls to Close" accentColor={COLORS.neon.cyan}
                loading={isLoading} error={error?.message}
                isEmpty={!charts.callsToCloseBar?.data?.length} height={300}>
                <TronBarChart
                  data={charts.callsToCloseBar?.data || []}
                  series={charts.callsToCloseBar?.series || []}
                  height={300} yAxisFormat="number" />
              </ChartWrapper>
            </Box>

            {/* Row 2: stacked by closer — locked for Basic */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: '16px', mt: '16px' }}>
              <ChartWrapper title="Calls to Close by Closer" accentColor={COLORS.neon.cyan}
                loading={!closerLocked && isLoading}
                error={!closerLocked ? error?.message : null}
                isEmpty={!closerLocked && !charts.callsToCloseByCloser?.data?.length}
                height={300} locked={closerLocked}>
                <TronBarChart
                  data={closerLocked ? DUMMY_SALES_CYCLE.callsToCloseByCloser.data : (charts.callsToCloseByCloser?.data || [])}
                  series={closerLocked ? DUMMY_SALES_CYCLE.callsToCloseByCloser.series : (charts.callsToCloseByCloser?.series || [])}
                  height={300} layout="horizontal" stacked={true} />
              </ChartWrapper>
            </Box>
          </Box>


          {/* ═══════════════════════════════════════════════════════
              SECTION 4: Days to Close — 3 charts
              ═══════════════════════════════════════════════════════ */}
          <Box>
            <SectionHeader title="Days to Close" color={COLORS.neon.amber} />

            {/* Row 1: pie + bucketed bar */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: '16px', mt: 2 }}>
              <ChartWrapper title="Days to Close Breakdown" accentColor={COLORS.neon.amber}
                loading={isLoading} error={error?.message}
                isEmpty={!charts.daysToClosePie?.data?.length} height={300}>
                <TronPieChart data={charts.daysToClosePie?.data || []} height={300} innerRadius={55} />
              </ChartWrapper>

              <ChartWrapper title="# of Days to Close" accentColor={COLORS.neon.amber}
                loading={isLoading} error={error?.message}
                isEmpty={!charts.daysToCloseBar?.data?.length} height={300}>
                <TronBarChart
                  data={charts.daysToCloseBar?.data || []}
                  series={charts.daysToCloseBar?.series || []}
                  height={300} yAxisFormat="number" />
              </ChartWrapper>
            </Box>

            {/* Row 2: stacked by closer — locked for Basic */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: '16px', mt: '16px' }}>
              <ChartWrapper title="Days to Close by Closer" accentColor={COLORS.neon.amber}
                loading={!closerLocked && isLoading}
                error={!closerLocked ? error?.message : null}
                isEmpty={!closerLocked && !charts.daysToCloseByCloser?.data?.length}
                height={300} locked={closerLocked}>
                <TronBarChart
                  data={closerLocked ? DUMMY_SALES_CYCLE.daysToCloseByCloser.data : (charts.daysToCloseByCloser?.data || [])}
                  series={closerLocked ? DUMMY_SALES_CYCLE.daysToCloseByCloser.series : (charts.daysToCloseByCloser?.series || [])}
                  height={300} layout="horizontal" stacked={true} />
              </ChartWrapper>
            </Box>
          </Box>


          {/* Footer */}
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
      )}
    </Box>
  );
}
