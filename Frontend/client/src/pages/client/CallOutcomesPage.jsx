/**
 * CALL OUTCOMES PAGE — 7-Section Layout
 *
 * Each section follows: colored SectionHeader → scorecard grid (with deltas) → 2-col chart grid.
 *
 * Sections:
 *   1. Health at a Glance  — cyan    — 8 scorecards, 2 charts
 *   2. Closed - Won        — green   — 4 scorecards, 3 charts
 *   3. Deposits             — amber   — 4 scorecards, 3 charts
 *   4. Follow Up            — purple  — 4 scorecards, 3 charts
 *   5. Lost                 — red     — 4 scorecards, 4 charts
 *   6. Disqualified         — muted   — 2 scorecards, 2 charts
 *   7. Not Pitched          — magenta — 2 scorecards, 2 charts
 *
 * Per-closer charts show locked/blurred state for Basic tier.
 *
 * Data: GET /api/dashboard/call-outcomes
 */

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { COLORS } from '../../theme/constants';
import { useMetrics } from '../../hooks/useMetrics';
import { useAuth } from '../../context/AuthContext';
import { meetsMinTier } from '../../utils/tierConfig';
import { DUMMY_CALL_OUTCOMES } from '../../utils/dummyData';
import SectionHeader from '../../components/SectionHeader';
import Scorecard from '../../components/scorecards/Scorecard';
import ChartWrapper from '../../components/charts/ChartWrapper';
import TronLineChart from '../../components/charts/TronLineChart';
import TronBarChart from '../../components/charts/TronBarChart';
import TronPieChart from '../../components/charts/TronPieChart';


/**
 * HealthColumn — stacked column for the Health at a Glance section.
 * Shows: Total (count), % of Total, and optionally Close Rate.
 */
function HealthColumn({ title, color, col, hasCloseRate = false, desiredDirection = 'up' }) {
  if (!col) return null;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <Typography
        sx={{
          color: COLORS.text.secondary,
          fontSize: '0.75rem',
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          textAlign: 'center',
          pb: 0.5,
        }}
      >
        {title}
      </Typography>
      <Scorecard label="Total" value={col.count?.value} format="number"
        delta={col.count?.delta} deltaLabel="vs prev period"
        desiredDirection={desiredDirection} glowColor={color} />
      <Scorecard label="% of Total" value={col.pctOfTotal?.value} format="percent"
        glowColor={color} />
      {hasCloseRate && (
        <Scorecard label="Close Rate" value={col.closeRate?.value} format="percent"
          delta={col.closeRate?.delta} deltaLabel="vs prev period"
          glowColor={color} />
      )}
    </Box>
  );
}

export default function CallOutcomesPage() {
  const { data, isLoading, error } = useMetrics('call-outcomes');
  const { tier } = useAuth();
  const closerLocked = !meetsMinTier(tier, 'insight');

  const sections = data?.sections || {};
  const charts = data?.charts || {};

  return (
    <Box>
      {/* Page header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ color: COLORS.text.primary, fontWeight: 700 }}>
          Call Outcomes
        </Typography>
        <Typography sx={{ color: COLORS.text.muted, fontSize: '0.9rem', mt: 0.5 }}>
          Close rates, deposits, follow-ups, lost calls, and pipeline health
        </Typography>
      </Box>

      {/* Loading state */}
      {isLoading && !data && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography sx={{ color: COLORS.text.muted }}>Loading call outcomes data...</Typography>
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
            Failed to load call outcomes data
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
              SECTION 1: Health at a Glance
              ═══════════════════════════════════════════════════════ */}
          <Box>
            <SectionHeader title="Health at a Glance" color={COLORS.neon.cyan} />
            {/* 6 outcome columns — each with Total, % of Total, and Close Rate (where applicable) */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)', md: 'repeat(6, 1fr)' }, gap: '20px', my: 2 }}>
              <HealthColumn title="Closed" color={COLORS.neon.green} col={sections.health?.closes} hasCloseRate />
              <HealthColumn title="Deposits" color={COLORS.neon.amber} col={sections.health?.deposits} hasCloseRate />
              <HealthColumn title="Follow-Up" color={COLORS.neon.purple} col={sections.health?.followUps} hasCloseRate />
              <HealthColumn title="Lost" color={COLORS.neon.red} col={sections.health?.lost} desiredDirection="down" />
              <HealthColumn title="Disqualified" color={COLORS.text.muted} col={sections.health?.disqualified} desiredDirection="down" />
              <HealthColumn title="Not Pitched" color={COLORS.neon.blue} col={sections.health?.notPitched} desiredDirection="down" />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: '16px' }}>
              <ChartWrapper title="Call Outcomes Distribution" accentColor={COLORS.neon.cyan}
                loading={isLoading} error={error?.message} isEmpty={!charts.outcomeBreakdown?.data?.length} height={300}>
                <TronPieChart data={charts.outcomeBreakdown?.data || []} height={300} innerRadius={65} />
              </ChartWrapper>
              <ChartWrapper title="Call Outcome by Closer" accentColor={COLORS.neon.cyan}
                loading={!closerLocked && isLoading} error={!closerLocked ? error?.message : null}
                isEmpty={!closerLocked && !charts.outcomeByCloser?.data?.length}
                height={300} locked={closerLocked}>
                <TronBarChart
                  data={closerLocked ? DUMMY_CALL_OUTCOMES.outcomeByCloser.data : (charts.outcomeByCloser?.data || [])}
                  series={closerLocked ? DUMMY_CALL_OUTCOMES.outcomeByCloser.series : (charts.outcomeByCloser?.series || [])}
                  height={300} layout="horizontal" stacked={true} />
              </ChartWrapper>
            </Box>
            {/* Row 2: Outcomes Over Time + Deals Closed by Product */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: '16px', mt: '16px' }}>
              <ChartWrapper title="Outcomes Over Time" accentColor={COLORS.neon.cyan}
                loading={isLoading} error={error?.message} isEmpty={!charts.outcomesOverTime?.data?.length} height={300}>
                <TronLineChart data={charts.outcomesOverTime?.data || []} series={charts.outcomesOverTime?.series || []}
                  height={300} showArea={true} stacked={true} />
              </ChartWrapper>
              <ChartWrapper title="Deals Closed by Product" accentColor={COLORS.neon.green}
                loading={!closerLocked && isLoading} error={!closerLocked ? error?.message : null}
                isEmpty={!closerLocked && !charts.closesByProduct?.data?.length}
                height={300} locked={closerLocked}>
                <TronBarChart
                  data={closerLocked ? DUMMY_CALL_OUTCOMES.closesByProduct.data : (charts.closesByProduct?.data || [])}
                  series={closerLocked ? DUMMY_CALL_OUTCOMES.closesByProduct.series : (charts.closesByProduct?.series || [])}
                  height={300} layout="horizontal" stacked={true} />
              </ChartWrapper>
            </Box>
          </Box>


          {/* ═══════════════════════════════════════════════════════
              SECTION 2: Closed - Won
              ═══════════════════════════════════════════════════════ */}
          <Box>
            <SectionHeader title="Closed - Won" color={COLORS.neon.green} />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.5, my: 2 }}>
              <Scorecard label="First Call Closes" value={sections.closedWon?.firstCallCloses?.value} format="number"
                delta={sections.closedWon?.firstCallCloses?.delta} deltaLabel="vs prev period" glowColor={COLORS.neon.green} />
              <Scorecard label="First Call Close Rate" value={sections.closedWon?.firstCallCloseRate?.value} format="percent"
                delta={sections.closedWon?.firstCallCloseRate?.delta} deltaLabel="vs prev period" glowColor={COLORS.neon.green} />
              <Scorecard label="Follow-Up Closes" value={sections.closedWon?.followUpCloses?.value} format="number"
                delta={sections.closedWon?.followUpCloses?.delta} deltaLabel="vs prev period" glowColor={COLORS.neon.purple} />
              <Scorecard label="Follow-Up Close Rate" value={sections.closedWon?.followUpCloseRate?.value} format="percent"
                delta={sections.closedWon?.followUpCloseRate?.delta} deltaLabel="vs prev period" glowColor={COLORS.neon.purple} />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: '16px' }}>
              <ChartWrapper title="Closes Over Time" accentColor={COLORS.neon.green}
                loading={isLoading} error={error?.message} isEmpty={!charts.closesOverTime?.data?.length} height={300}>
                <TronBarChart data={charts.closesOverTime?.data || []} series={charts.closesOverTime?.series || []}
                  height={300} stacked={true} />
              </ChartWrapper>
              <ChartWrapper title="Close Rate Over Time" accentColor={COLORS.neon.green}
                loading={isLoading} error={error?.message} isEmpty={!charts.closeRateOverTime?.data?.length} height={300}>
                <TronLineChart data={charts.closeRateOverTime?.data || []} series={charts.closeRateOverTime?.series || []}
                  height={300} yAxisFormat="percent" />
              </ChartWrapper>
            </Box>
            {/* Closes by Closer — full width row, locked for Basic */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: '16px', mt: '16px' }}>
              <ChartWrapper title="Closes by Closer" accentColor={COLORS.neon.green}
                loading={!closerLocked && isLoading} error={!closerLocked ? error?.message : null}
                isEmpty={!closerLocked && !charts.closesByCloser?.data?.length}
                height={300} locked={closerLocked}>
                <TronBarChart
                  data={closerLocked ? DUMMY_CALL_OUTCOMES.closesByCloser.data : (charts.closesByCloser?.data || [])}
                  series={closerLocked ? DUMMY_CALL_OUTCOMES.closesByCloser.series : (charts.closesByCloser?.series || [])}
                  height={300} layout="horizontal" stacked={true} />
              </ChartWrapper>
            </Box>
          </Box>


          {/* ═══════════════════════════════════════════════════════
              SECTION 3: Deposits
              ═══════════════════════════════════════════════════════ */}
          <Box>
            <SectionHeader title="Deposits" color={COLORS.neon.amber} />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.5, my: 2 }}>
              <Scorecard label="Deposits Taken" value={sections.deposits?.depositsTaken?.value} format="number"
                delta={sections.deposits?.depositsTaken?.delta} deltaLabel="vs prev period" glowColor={COLORS.neon.amber} />
              <Scorecard label="Deposit → Closed %" value={sections.deposits?.depositClosedPct?.value} format="percent"
                delta={sections.deposits?.depositClosedPct?.delta} deltaLabel="vs prev period" glowColor={COLORS.neon.amber} />
              <Scorecard label="Deposits Lost" value={sections.deposits?.depositsLost?.value} format="number"
                delta={sections.deposits?.depositsLost?.delta} deltaLabel="vs prev period" desiredDirection="down" glowColor={COLORS.neon.amber} />
              <Scorecard label="Deposits Still Open" value={sections.deposits?.depositsStillOpen?.value} format="number"
                delta={sections.deposits?.depositsStillOpen?.delta} deltaLabel="vs prev period" glowColor={COLORS.neon.amber} />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: '16px' }}>
              <ChartWrapper title="Deposit Outcomes" accentColor={COLORS.neon.amber}
                loading={isLoading} error={error?.message} isEmpty={!charts.depositOutcomes?.data?.length} height={300}>
                <TronPieChart data={charts.depositOutcomes?.data || []} height={300} innerRadius={55} />
              </ChartWrapper>
              <ChartWrapper title="Deposit Close Rate by Closer" accentColor={COLORS.neon.amber}
                loading={!closerLocked && isLoading} error={!closerLocked ? error?.message : null}
                isEmpty={!closerLocked && !charts.depositCloseByCloser?.data?.length}
                height={300} locked={closerLocked}>
                <TronBarChart
                  data={closerLocked ? DUMMY_CALL_OUTCOMES.depositCloseByCloser.data : (charts.depositCloseByCloser?.data || [])}
                  series={closerLocked ? DUMMY_CALL_OUTCOMES.depositCloseByCloser.series : (charts.depositCloseByCloser?.series || [])}
                  height={300} layout="horizontal" yAxisFormat="percent" />
              </ChartWrapper>
            </Box>
          </Box>


          {/* ═══════════════════════════════════════════════════════
              SECTION 4: Follow Up
              ═══════════════════════════════════════════════════════ */}
          <Box>
            <SectionHeader title="Follow Up" color={COLORS.neon.purple} />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.5, my: 2 }}>
              <Scorecard label="Follow-Ups Scheduled" value={sections.followUp?.scheduled?.value} format="number"
                delta={sections.followUp?.scheduled?.delta} deltaLabel="vs prev period" glowColor={COLORS.neon.purple} />
              <Scorecard label="Follow-Ups Held" value={sections.followUp?.held?.value} format="number"
                delta={sections.followUp?.held?.delta} deltaLabel="vs prev period" glowColor={COLORS.neon.purple} />
              <Scorecard label="Follow-Up Show Rate" value={sections.followUp?.showRate?.value} format="percent"
                delta={sections.followUp?.showRate?.delta} deltaLabel="vs prev period" glowColor={COLORS.neon.purple} />
              <Scorecard label="Still in Follow-Up" value={sections.followUp?.stillInFollowUp?.value} format="number"
                delta={sections.followUp?.stillInFollowUp?.delta} deltaLabel="vs prev period" glowColor={COLORS.neon.purple} />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: '16px' }}>
              <ChartWrapper title="Follow-Up Volume Over Time" accentColor={COLORS.neon.purple}
                loading={isLoading} error={error?.message} isEmpty={!charts.followUpVolume?.data?.length} height={300}>
                <TronLineChart data={charts.followUpVolume?.data || []} series={charts.followUpVolume?.series || []}
                  height={300} showArea={true} stacked={true} />
              </ChartWrapper>
              <ChartWrapper title="Follow-Up Outcomes" accentColor={COLORS.neon.purple}
                loading={isLoading} error={error?.message} isEmpty={!charts.followUpOutcomes?.data?.length} height={300}>
                <TronPieChart data={charts.followUpOutcomes?.data || []} height={300} innerRadius={55} />
              </ChartWrapper>
            </Box>
            {/* Row 2: Follow-Up Outcome by Closer — locked for Basic */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: '16px', mt: '16px' }}>
              <ChartWrapper title="Follow-Up Outcome by Closer" accentColor={COLORS.neon.purple}
                loading={!closerLocked && isLoading} error={!closerLocked ? error?.message : null}
                isEmpty={!closerLocked && !charts.followUpOutcomeByCloser?.data?.length}
                height={300} locked={closerLocked}>
                <TronBarChart
                  data={closerLocked ? DUMMY_CALL_OUTCOMES.followUpOutcomeByCloser.data : (charts.followUpOutcomeByCloser?.data || [])}
                  series={closerLocked ? DUMMY_CALL_OUTCOMES.followUpOutcomeByCloser.series : (charts.followUpOutcomeByCloser?.series || [])}
                  height={300} layout="horizontal" stacked={true} />
              </ChartWrapper>
            </Box>
          </Box>


          {/* ═══════════════════════════════════════════════════════
              SECTION 5: Lost
              ═══════════════════════════════════════════════════════ */}
          <Box>
            <SectionHeader title="Lost" color={COLORS.neon.red} />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.5, my: 2 }}>
              <Scorecard label="First Call Lost" value={sections.lost?.firstCallLost?.value} format="number"
                delta={sections.lost?.firstCallLost?.delta} deltaLabel="vs prev period" desiredDirection="down" glowColor={COLORS.neon.red} />
              <Scorecard label="First Call Lost Rate" value={sections.lost?.firstCallLostRate?.value} format="percent"
                delta={sections.lost?.firstCallLostRate?.delta} deltaLabel="vs prev period" desiredDirection="down" glowColor={COLORS.neon.red} />
              <Scorecard label="Follow-Up Lost" value={sections.lost?.followUpLost?.value} format="number"
                delta={sections.lost?.followUpLost?.delta} deltaLabel="vs prev period" desiredDirection="down" glowColor={COLORS.neon.red} />
              <Scorecard label="Follow-Up Lost Rate" value={sections.lost?.followUpLostRate?.value} format="percent"
                delta={sections.lost?.followUpLostRate?.delta} deltaLabel="vs prev period" desiredDirection="down" glowColor={COLORS.neon.red} />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: '16px' }}>
              <ChartWrapper title="Lost Calls Over Time" accentColor={COLORS.neon.red}
                loading={isLoading} error={error?.message} isEmpty={!charts.lostOverTime?.data?.length} height={300}>
                <TronLineChart data={charts.lostOverTime?.data || []} series={charts.lostOverTime?.series || []}
                  height={300} showArea={true} stacked={true} />
              </ChartWrapper>
              <ChartWrapper title="Lost Reasons" accentColor={COLORS.neon.red}
                loading={isLoading} error={error?.message} isEmpty={!charts.lostReasons?.data?.length} height={300}>
                <TronPieChart data={charts.lostReasons?.data || []} height={300} innerRadius={55} />
              </ChartWrapper>
            </Box>
            {/* Per-closer lost charts — locked for Basic */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: '16px', mt: '16px' }}>
              <ChartWrapper title="Lost Rate by Closer" accentColor={COLORS.neon.red}
                loading={!closerLocked && isLoading} error={!closerLocked ? error?.message : null}
                isEmpty={!closerLocked && !charts.lostRateByCloser?.data?.length}
                height={300} locked={closerLocked}>
                <TronBarChart
                  data={closerLocked ? DUMMY_CALL_OUTCOMES.lostRateByCloser.data : (charts.lostRateByCloser?.data || [])}
                  series={closerLocked ? DUMMY_CALL_OUTCOMES.lostRateByCloser.series : (charts.lostRateByCloser?.series || [])}
                  height={300} layout="horizontal" stacked={true} yAxisFormat="percent" />
              </ChartWrapper>
              <ChartWrapper title="Lost Reasons by Closer" accentColor={COLORS.neon.red}
                loading={!closerLocked && isLoading} error={!closerLocked ? error?.message : null}
                isEmpty={!closerLocked && !charts.lostReasonsByCloser?.data?.length}
                height={300} locked={closerLocked}>
                <TronBarChart
                  data={closerLocked ? DUMMY_CALL_OUTCOMES.lostReasonsByCloser.data : (charts.lostReasonsByCloser?.data || [])}
                  series={closerLocked ? DUMMY_CALL_OUTCOMES.lostReasonsByCloser.series : (charts.lostReasonsByCloser?.series || [])}
                  height={300} layout="horizontal" stacked={true} />
              </ChartWrapper>
            </Box>
          </Box>


          {/* ═══════════════════════════════════════════════════════
              SECTION 6: Disqualified
              ═══════════════════════════════════════════════════════ */}
          <Box>
            <SectionHeader title="Disqualified" color={COLORS.text.muted} />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(2, 1fr)' }, gap: 1.5, my: 2 }}>
              <Scorecard label="First Call DQ" value={sections.disqualified?.firstCallDQ?.value} format="number"
                delta={sections.disqualified?.firstCallDQ?.delta} deltaLabel="vs prev period" desiredDirection="down" glowColor={COLORS.text.muted} />
              <Scorecard label="DQ Rate" value={sections.disqualified?.firstCallDQRate?.value} format="percent"
                delta={sections.disqualified?.firstCallDQRate?.delta} deltaLabel="vs prev period" desiredDirection="down" glowColor={COLORS.text.muted} />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: '16px' }}>
              <ChartWrapper title="DQ Over Time" accentColor={COLORS.text.muted}
                loading={isLoading} error={error?.message} isEmpty={!charts.dqOverTime?.data?.length} height={300}>
                <TronLineChart data={charts.dqOverTime?.data || []} series={charts.dqOverTime?.series || []}
                  height={300} />
              </ChartWrapper>
              <ChartWrapper title="DQ Rate by Closer" accentColor={COLORS.text.muted}
                loading={!closerLocked && isLoading} error={!closerLocked ? error?.message : null}
                isEmpty={!closerLocked && !charts.dqByCloser?.data?.length}
                height={300} locked={closerLocked}>
                <TronBarChart
                  data={closerLocked ? DUMMY_CALL_OUTCOMES.dqByCloser.data : (charts.dqByCloser?.data || [])}
                  series={closerLocked ? DUMMY_CALL_OUTCOMES.dqByCloser.series : (charts.dqByCloser?.series || [])}
                  height={300} layout="horizontal" yAxisFormat="percent" />
              </ChartWrapper>
            </Box>
          </Box>


          {/* ═══════════════════════════════════════════════════════
              SECTION 7: Not Pitched
              ═══════════════════════════════════════════════════════ */}
          <Box>
            <SectionHeader title="Not Pitched" color={COLORS.neon.blue} />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(2, 1fr)' }, gap: 1.5, my: 2 }}>
              <Scorecard label="Not Pitched" value={sections.notPitched?.notPitched?.value} format="number"
                delta={sections.notPitched?.notPitched?.delta} deltaLabel="vs prev period" desiredDirection="down" glowColor={COLORS.neon.blue} />
              <Scorecard label="Not Pitched Rate" value={sections.notPitched?.notPitchedRate?.value} format="percent"
                delta={sections.notPitched?.notPitchedRate?.delta} deltaLabel="vs prev period" desiredDirection="down" glowColor={COLORS.neon.blue} />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: '16px' }}>
              <ChartWrapper title="Not Pitched Over Time" accentColor={COLORS.neon.blue}
                loading={isLoading} error={error?.message} isEmpty={!charts.notPitchedOverTime?.data?.length} height={300}>
                <TronLineChart data={charts.notPitchedOverTime?.data || []} series={charts.notPitchedOverTime?.series || []}
                  height={300} />
              </ChartWrapper>
              <ChartWrapper title="Not Pitched by Closer" accentColor={COLORS.neon.blue}
                loading={!closerLocked && isLoading} error={!closerLocked ? error?.message : null}
                isEmpty={!closerLocked && !charts.notPitchedByCloser?.data?.length}
                height={300} locked={closerLocked}>
                <TronBarChart
                  data={closerLocked ? DUMMY_CALL_OUTCOMES.notPitchedByCloser.data : (charts.notPitchedByCloser?.data || [])}
                  series={closerLocked ? DUMMY_CALL_OUTCOMES.notPitchedByCloser.series : (charts.notPitchedByCloser?.series || [])}
                  height={300} layout="horizontal" yAxisFormat="percent" />
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
