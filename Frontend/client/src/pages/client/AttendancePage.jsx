/**
 * ATTENDANCE PAGE
 *
 * Visible to all tiers — lower tiers see blurred content with upgrade prompt.
 *
 * Scorecard layout: 4 column groups + 2 standalone
 *   Columns: Unique Prospects | Total Calls | First Calls | Follow Up
 *   Each column shows: Scheduled, Held, Show Rate (stacked vertically)
 *   Standalone: Active Follow Up, Not Yet Held
 *
 * Charts:
 *   1. Scheduled vs Held (line — counts over time)
 *   2. First Call / Follow Up Show Rate (line)
 *   3. Attendance Breakdown (donut)
 *   4. First Held / Follow Up Held (stacked bar over time)
 *   5. Show Rate per Closer (horizontal bar)
 *   6. Attendance per Closer (stacked bar)
 *
 * Data: GET /api/dashboard/attendance
 */

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { COLORS, LAYOUT } from '../../theme/constants';
import { useMetrics } from '../../hooks/useMetrics';
import { useAuth } from '../../context/AuthContext';
import { meetsMinTier } from '../../utils/tierConfig';
import { DUMMY_ATTENDANCE } from '../../utils/dummyData';
import ChartWrapper from '../../components/charts/ChartWrapper';
import TronLineChart from '../../components/charts/TronLineChart';
import TronBarChart from '../../components/charts/TronBarChart';
import TronPieChart from '../../components/charts/TronPieChart';
import SectionHeader from '../../components/SectionHeader';
import Scorecard from '../../components/scorecards/Scorecard';


/**
 * A single column group: header label + 3 stacked scorecards (Scheduled, Held, Show Rate).
 * Each column represents one metric category (Unique Prospects, Total Calls, etc.)
 */
function MetricColumn({ title, columnData, color }) {
  if (!columnData) return null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Column header */}
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

      {/* Scheduled */}
      <Scorecard
        label={columnData.scheduled?.label || 'Scheduled'}
        value={columnData.scheduled?.value}
        format={columnData.scheduled?.format || 'number'}
        glowColor={color}
      />

      {/* Held */}
      <Scorecard
        label={columnData.held?.label || 'Held'}
        value={columnData.held?.value}
        format={columnData.held?.format || 'number'}
        glowColor={color}
      />

      {/* Show Rate */}
      <Scorecard
        label={columnData.showRate?.label || 'Show Rate'}
        value={columnData.showRate?.value}
        format={columnData.showRate?.format || 'percent'}
        glowColor={color}
      />
    </Box>
  );
}


export default function AttendancePage() {
  const { data, isLoading, error } = useMetrics('attendance');
  const { tier } = useAuth();
  const closerLocked = !meetsMinTier(tier, 'insight');

  const sections = data?.sections || {};
  const charts = data?.charts || {};

  return (
    <Box>
      {/* Page header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ color: COLORS.text.primary, fontWeight: 700 }}>
          Attendance
        </Typography>
        <Typography sx={{ color: COLORS.text.muted, fontSize: '0.9rem', mt: 0.5 }}>
          Volume, show rates, and attendance patterns
        </Typography>
      </Box>

      {/* Loading state */}
      {isLoading && !data && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography sx={{ color: COLORS.text.muted }}>Loading attendance data...</Typography>
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
            Failed to load attendance data
          </Typography>
          <Typography sx={{ color: COLORS.text.muted, fontSize: '0.85rem' }}>
            {error.message || 'Please try again later.'}
          </Typography>
        </Box>
      )}

      {/* Dashboard content */}
      {data && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

          {/* ═══════════════════════════════════════════════════════════
              VOLUME & ATTENDANCE SCORECARDS
              4 column groups (Unique Prospects, Total Calls, First Calls, Follow Up)
              Each column: Scheduled → Held → Show Rate
              Plus 2 standalone cards: Active Follow Up, Not Yet Held
              ═══════════════════════════════════════════════════════════ */}

          <Box>
            <Box sx={{ mb: 2 }}>
              <SectionHeader title="Volume & Attendance" color={COLORS.text.primary} />
            </Box>

            {/* 4 column groups + 2 standalone cards */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2, 1fr)',
                  md: 'repeat(3, 1fr)',
                  lg: 'repeat(6, 1fr)',
                },
                gap: '20px',
              }}
            >
              <MetricColumn
                title="Unique Prospects"
                columnData={sections.uniqueProspects}
                color={COLORS.neon.blue}
              />
              <MetricColumn
                title="Total Calls"
                columnData={sections.totalCalls}
                color={COLORS.neon.teal}
              />
              <MetricColumn
                title="First Calls"
                columnData={sections.firstCalls}
                color={COLORS.neon.green}
              />
              <MetricColumn
                title="Follow Up"
                columnData={sections.followUpCalls}
                color={COLORS.neon.purple}
              />

              {/* Standalone: Active Follow Up */}
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
                    visibility: 'hidden',
                  }}
                >
                  &nbsp;
                </Typography>
                <Scorecard
                  label={sections.activeFollowUp?.label || 'Active Follow Up'}
                  value={sections.activeFollowUp?.value}
                  format={sections.activeFollowUp?.format || 'number'}
                  glowColor={COLORS.neon.purple}
                />
              </Box>

              {/* Standalone: Not Yet Held */}
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
                    visibility: 'hidden',
                  }}
                >
                  &nbsp;
                </Typography>
                <Scorecard
                  label={sections.notYetHeld?.label || 'Not Yet Held'}
                  value={sections.notYetHeld?.value}
                  format={sections.notYetHeld?.format || 'number'}
                  glowColor={COLORS.neon.blue}
                />
              </Box>
            </Box>
          </Box>

          {/* ═══════════════════════════════════════════════════════════
              CHARTS — 2 rows × 3 columns
              Row 1: Scheduled vs Held | First/Follow Up Show Rate | Attendance Breakdown
              Row 2: First/Follow Ups Held | Show Rate per Closer | Attendance per Closer
              ═══════════════════════════════════════════════════════════ */}

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)' },
              gap: '16px',
            }}
          >
            {/* Row 1 */}

            {/* Chart 1: Scheduled vs Held */}
            <ChartWrapper
              title="Scheduled vs Held"
              accentColor={COLORS.neon.amber}
              loading={isLoading}
              error={error?.message}
              isEmpty={!charts.scheduledVsHeld?.data?.length}
              height={300}
            >
              <TronLineChart
                data={charts.scheduledVsHeld?.data || []}
                series={charts.scheduledVsHeld?.series || []}
                height={300}
                yAxisFormat="number"
              />
            </ChartWrapper>

            {/* Chart 2: First Call / Follow Up Show Rate */}
            <ChartWrapper
              title="First Call / Follow Up Show Rate"
              accentColor={COLORS.neon.green}
              loading={isLoading}
              error={error?.message}
              isEmpty={!charts.firstFollowUpShowRate?.data?.length}
              height={300}
            >
              <TronLineChart
                data={charts.firstFollowUpShowRate?.data || []}
                series={charts.firstFollowUpShowRate?.series || []}
                height={300}
                yAxisFormat="percent"
              />
            </ChartWrapper>

            {/* Chart 3: Attendance Breakdown (donut) */}
            <ChartWrapper
              title="Attendance Breakdown"
              accentColor={COLORS.neon.green}
              loading={isLoading}
              error={error?.message}
              isEmpty={!charts.attendanceBreakdown?.data?.length}
              height={300}
            >
              <TronPieChart
                data={charts.attendanceBreakdown?.data || []}
                height={300}
              />
            </ChartWrapper>

            {/* Row 2 */}

            {/* Chart 4: First / Follow Ups Held (stacked bar) */}
            <ChartWrapper
              title="First / Follow Ups Held"
              accentColor={COLORS.neon.green}
              loading={isLoading}
              error={error?.message}
              isEmpty={!charts.firstFollowUpsHeld?.data?.length}
              height={300}
            >
              <TronBarChart
                data={charts.firstFollowUpsHeld?.data || []}
                series={charts.firstFollowUpsHeld?.series || []}
                height={300}
                stacked={true}
                yAxisFormat="number"
                stackTotalLabel="Total Held"
              />
            </ChartWrapper>

            {/* Chart 5: Show Rate per Closer */}
            <ChartWrapper
              title="Show Rate per Closer"
              accentColor={COLORS.neon.cyan}
              loading={!closerLocked && isLoading}
              error={!closerLocked ? error?.message : null}
              isEmpty={!closerLocked && !charts.showRatePerCloser?.data?.length}
              height={300}
              locked={closerLocked}
            >
              <TronBarChart
                data={closerLocked ? DUMMY_ATTENDANCE.showRatePerCloser.data : (charts.showRatePerCloser?.data || [])}
                series={closerLocked ? DUMMY_ATTENDANCE.showRatePerCloser.series : (charts.showRatePerCloser?.series || [])}
                height={300}
                layout="horizontal"
                yAxisFormat="percent"
              />
            </ChartWrapper>

            {/* Chart 6: Attendance per Closer */}
            <ChartWrapper
              title="Attendance per Closer"
              accentColor={COLORS.neon.green}
              loading={!closerLocked && isLoading}
              error={!closerLocked ? error?.message : null}
              isEmpty={!closerLocked && !charts.attendancePerCloser?.data?.length}
              height={300}
              locked={closerLocked}
            >
              <TronBarChart
                data={closerLocked ? DUMMY_ATTENDANCE.attendancePerCloser.data : (charts.attendancePerCloser?.data || [])}
                series={closerLocked ? DUMMY_ATTENDANCE.attendancePerCloser.series : (charts.attendancePerCloser?.series || [])}
                height={300}
                stacked={true}
                yAxisFormat="number"
                stackTotalLabel="Total"
              />
            </ChartWrapper>
          </Box>

          {/* ═══════════════════════════════════════════════════════════
              CALLS NOT TAKEN — Scorecards + Charts + Lost Revenue
              ═══════════════════════════════════════════════════════════ */}

          <Box>
            <Box sx={{ mb: 2 }}>
              <SectionHeader title="Calls Not Taken" color={COLORS.text.primary} />
            </Box>

            {/* Row 1: 4 scorecards — Not Taken (white) | Ghosted (yellow) | Canceled (red) | Rescheduled (orange) */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
                gap: 1.5,
                mb: 1.5,
              }}
            >
              <Scorecard
                label={sections.callsNotTaken?.notTaken?.label || 'Not Taken'}
                value={sections.callsNotTaken?.notTaken?.value}
                format="number"
                glowColor={COLORS.text.primary}
              />
              <Scorecard
                label={sections.callsNotTaken?.ghosted?.label || '# Ghosted'}
                value={sections.callsNotTaken?.ghosted?.value}
                format="number"
                glowColor={COLORS.neon.amber}
              />
              <Scorecard
                label={sections.callsNotTaken?.cancelled?.label || '# Canceled'}
                value={sections.callsNotTaken?.cancelled?.value}
                format="number"
                glowColor={COLORS.neon.red}
              />
              <Scorecard
                label={sections.callsNotTaken?.rescheduled?.label || '# Rescheduled'}
                value={sections.callsNotTaken?.rescheduled?.value}
                format="number"
                glowColor={'#FF8C00'}
              />
            </Box>

            {/* Row 2: 4 percentage scorecards */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
                gap: 1.5,
                mb: 1.5,
              }}
            >
              <Scorecard
                label={sections.callsNotTaken?.notTakenPct?.label || '% Not Taken'}
                value={sections.callsNotTaken?.notTakenPct?.value}
                format="percent"
                glowColor={COLORS.text.primary}
              />
              <Scorecard
                label={sections.callsNotTaken?.ghostedPct?.label || '% Ghosted'}
                value={sections.callsNotTaken?.ghostedPct?.value}
                format="percent"
                glowColor={COLORS.neon.amber}
              />
              <Scorecard
                label={sections.callsNotTaken?.cancelledPct?.label || '% Canceled'}
                value={sections.callsNotTaken?.cancelledPct?.value}
                format="percent"
                glowColor={COLORS.neon.red}
              />
              <Scorecard
                label={sections.callsNotTaken?.rescheduledPct?.label || '% Rescheduled'}
                value={sections.callsNotTaken?.rescheduledPct?.value}
                format="percent"
                glowColor={'#FF8C00'}
              />
            </Box>

            {/* Charts row: Not Taken Breakdown (stacked bar) | Not Taken Reason (donut) */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                gap: 1.5,
                mb: 1.5,
              }}
            >
              <ChartWrapper
                title="Not Taken Breakdown"
                accentColor={COLORS.neon.amber}
                loading={isLoading}
                error={error?.message}
                isEmpty={!charts.notTakenBreakdown?.data?.length}
                height={300}
              >
                <TronBarChart
                  data={charts.notTakenBreakdown?.data || []}
                  series={charts.notTakenBreakdown?.series || []}
                  height={300}
                  stacked={true}
                  yAxisFormat="number"
                  stackTotalLabel="Total Not Taken"
                />
              </ChartWrapper>

              <ChartWrapper
                title="Not Taken Reason"
                accentColor={COLORS.neon.amber}
                loading={isLoading}
                error={error?.message}
                isEmpty={!charts.notTakenReason?.data?.length}
                height={300}
              >
                <TronPieChart
                  data={charts.notTakenReason?.data || []}
                  height={300}
                  innerRadius={55}
                />
              </ChartWrapper>
            </Box>

            {/* Lost Potential Revenue — calculation row */}
            {sections.lostRevenue && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: { xs: 1, md: 2 },
                  flexWrap: 'wrap',
                }}
              >
                <Box sx={{ flex: '1 1 0', minWidth: 140, maxWidth: 220 }}>
                  <Scorecard
                    label="Not Taken"
                    value={sections.lostRevenue.notTaken?.value}
                    format="number"
                    glowColor={COLORS.neon.red}
                  />
                </Box>
                <Typography sx={{ color: COLORS.text.muted, fontSize: '1.8rem', fontWeight: 700, lineHeight: 1, px: 0.5 }}>
                  ×
                </Typography>
                <Box sx={{ flex: '1 1 0', minWidth: 140, maxWidth: 220 }}>
                  <Scorecard
                    label="Show > Close Rate"
                    value={sections.lostRevenue.showCloseRate?.value}
                    format="percent"
                    glowColor={COLORS.neon.red}
                  />
                </Box>
                <Typography sx={{ color: COLORS.text.muted, fontSize: '1.8rem', fontWeight: 700, lineHeight: 1, px: 0.5 }}>
                  ×
                </Typography>
                <Box sx={{ flex: '1 1 0', minWidth: 140, maxWidth: 220 }}>
                  <Scorecard
                    label="Average Deal Size"
                    value={sections.lostRevenue.avgDealSize?.value}
                    format="currency"
                    glowColor={COLORS.neon.red}
                  />
                </Box>
                <Typography sx={{ color: COLORS.text.muted, fontSize: '1.8rem', fontWeight: 700, lineHeight: 1, px: 0.5 }}>
                  =
                </Typography>
                <Box sx={{ flex: '1 1 0', minWidth: 180, maxWidth: 260 }}>
                  <Scorecard
                    label="Lost Potential Revenue"
                    value={sections.lostRevenue.lostPotential?.value}
                    format="currency"
                    glowColor={COLORS.neon.red}
                  />
                </Box>
              </Box>
            )}
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
