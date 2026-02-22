/**
 * ADHERENCE PAGE — EXECUTIVE ONLY
 *
 * Script adherence analysis: how closely closers follow the sales script,
 * scored by section (Intro, Pain, Discovery, Goal, Transition, Pitch, Close,
 * Objections). Features the radar chart — one of the most visually striking
 * Tron charts in the dashboard.
 *
 * Sections:
 *   1. Overall Scores — Script Adherence Score (1-10) + Objection Handling Quality
 *   2. Per-Section Scores — 8 scorecards (one per script section, scored 1-10)
 *   3. Radar Chart — Spider chart overlaying team average vs top performer
 *   4. Adherence by Closer — Bar chart: overall score per closer
 *   5. Objection Handling by Closer — Bar chart: handling score per closer
 *   6. Adherence Over Time — Line chart: trend over selected date range
 *
 * Data: GET /api/dashboard/adherence
 * Purple glow theme — matches the "AI insights" accent color.
 */

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { COLORS } from '../../theme/constants';
import { useMetrics } from '../../hooks/useMetrics';
import { useAuth } from '../../context/AuthContext';
import { meetsMinTier } from '../../utils/tierConfig';
import { DUMMY_ADHERENCE } from '../../utils/dummyData';
import ScorecardGrid from '../../components/scorecards/ScorecardGrid';
import ChartWrapper from '../../components/charts/ChartWrapper';
import TronLineChart from '../../components/charts/TronLineChart';
import TronBarChart from '../../components/charts/TronBarChart';
import TronRadarChart from '../../components/charts/TronRadarChart';
import TierGate from '../../components/TierGate';


export default function AdherencePage() {
  const { tier } = useAuth();
  const hasAccess = meetsMinTier(tier, 'executive');
  const { data, isLoading, error } = useMetrics('adherence', { enabled: hasAccess });

  // Fall back to dummy data when the user doesn't have access
  const displayData = hasAccess ? data : DUMMY_ADHERENCE;

  // Destructure API response sections — same envelope shape as all dashboard pages:
  // { sections: { overall, bySection }, charts: { radarData, adherenceByCloser, ... } }
  const sections = displayData?.sections || {};
  const charts = displayData?.charts || {};

  // Extract radar chart data for the TronRadarChart component.
  const radarData = charts.radarData;

  return (
    <Box>
      {/* Page header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ color: COLORS.text.primary, fontWeight: 700 }}>
          Script Adherence
        </Typography>
        <Typography sx={{ color: COLORS.text.muted, fontSize: '0.9rem', mt: 0.5 }}>
          Script adherence scores and closer benchmarks
        </Typography>
      </Box>

      {/* ── LOADING STATE ── */}
      {isLoading && !data && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography sx={{ color: COLORS.text.muted }}>Loading adherence data...</Typography>
        </Box>
      )}

      {/* ── ERROR STATE ── */}
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
            Failed to load adherence data
          </Typography>
          <Typography sx={{ color: COLORS.text.muted, fontSize: '0.85rem' }}>
            {error.message || 'Please try again later.'}
          </Typography>
        </Box>
      )}

      {/* ── DASHBOARD CONTENT ── */}
      {displayData && (
      <TierGate requiredTier="executive" label="script adherence analytics">
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>

          {/* Section 1: Overall Scores — Script Adherence + Objection Handling Quality */}
          <ScorecardGrid
            title="Overall Scores"
            metrics={sections.overall}
            glowColor={COLORS.neon.purple}
            columns={2}
          />

          {/* Section 2: Per-Section Scores — one scorecard per script section (8 total) */}
          <ScorecardGrid
            title="Score by Script Section"
            metrics={sections.bySection}
            glowColor={COLORS.neon.cyan}
            columns={4}
          />

          {/* Section 3: Radar Chart — Spider chart overlaying datasets */}
          <ChartWrapper
            title="Script Adherence by Section"
            accentColor={COLORS.neon.purple}
            loading={isLoading}
            error={error?.message}
            isEmpty={!radarData?.axes?.length || !radarData?.data?.length}
            height={400}
          >
            <TronRadarChart
              axes={radarData?.axes || []}
              datasets={radarData?.data || []}
              maxValue={10}
              height={400}
            />
          </ChartWrapper>

          {/* Section 4: Overall Adherence by Closer — Bar chart */}
          <ChartWrapper
            title="Overall Adherence by Closer"
            accentColor={COLORS.neon.cyan}
            loading={isLoading}
            error={error?.message}
            isEmpty={!charts.adherenceByCloser?.data?.length}
            height={280}
          >
            <TronBarChart
              data={charts.adherenceByCloser?.data || []}
              series={charts.adherenceByCloser?.series || []}
              height={280}
              yAxisFormat="number"
            />
          </ChartWrapper>

          {/* Section 5: Objection Handling by Closer — Bar chart */}
          <ChartWrapper
            title="Objection Handling Score by Closer"
            accentColor={COLORS.neon.amber}
            loading={isLoading}
            error={error?.message}
            isEmpty={!charts.objHandlingByCloser?.data?.length}
            height={280}
          >
            <TronBarChart
              data={charts.objHandlingByCloser?.data || []}
              series={charts.objHandlingByCloser?.series || []}
              height={280}
              yAxisFormat="number"
            />
          </ChartWrapper>

          {/* Section 6: Script Adherence Over Time — Line chart */}
          <ChartWrapper
            title="Script Adherence Over Time"
            accentColor={COLORS.neon.green}
            loading={isLoading}
            error={error?.message}
            isEmpty={!charts.adherenceOverTime?.data?.length}
            height={280}
          >
            <TronLineChart
              data={charts.adherenceOverTime?.data || []}
              series={charts.adherenceOverTime?.series || []}
              height={280}
              yAxisFormat="number"
              showArea={true}
            />
          </ChartWrapper>

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
      </TierGate>
      )}
    </Box>
  );
}
