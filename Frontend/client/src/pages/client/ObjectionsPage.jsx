/**
 * OBJECTIONS PAGE — INSIGHT+ ONLY
 *
 * Objection intelligence: counts, resolution rates, per-type and per-closer
 * breakdowns, plus drill-down table.
 *
 * Sections:
 *   1. Summary — 9 scorecards (calls held, objections faced, resolution rate, etc.)
 *   2. Objections by Type — Stacked bar (resolved vs unresolved)
 *   3. Objection Type Summary Table — ObjectionsTable component
 *   4. Objection Trends — Line chart (top 3 over time)
 *   5. Unresolved by Type — Pie chart
 *   6. Resolution Rate by Closer — Bar chart
 *
 * Data: GET /api/dashboard/objections
 */

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { COLORS } from '../../theme/constants';
import { useMetrics } from '../../hooks/useMetrics';
import { useAuth } from '../../context/AuthContext';
import { meetsMinTier } from '../../utils/tierConfig';
import { DUMMY_OBJECTIONS } from '../../utils/dummyData';
import ScorecardGrid from '../../components/scorecards/ScorecardGrid';
import ChartWrapper from '../../components/charts/ChartWrapper';
import TronLineChart from '../../components/charts/TronLineChart';
import TronBarChart from '../../components/charts/TronBarChart';
import TronPieChart from '../../components/charts/TronPieChart';

import ObjectionsTable from '../../components/tables/ObjectionsTable';
import TierGate from '../../components/TierGate';

export default function ObjectionsPage() {
  const { tier } = useAuth();
  const hasAccess = meetsMinTier(tier, 'insight');
  const { data, isLoading, error } = useMetrics('objections', { enabled: hasAccess });

  // Fall back to dummy data when the user doesn't have access
  const displayData = hasAccess ? data : DUMMY_OBJECTIONS;
  const sections = displayData?.sections || {};
  const charts = displayData?.charts || {};
  const tables = displayData?.tables || {};

  return (
    <Box>
      {/* Page header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ color: COLORS.text.primary, fontWeight: 700 }}>
          Objections Intelligence
        </Typography>
        <Typography sx={{ color: COLORS.text.muted, fontSize: '0.9rem', mt: 0.5 }}>
          Objection patterns, resolution rates, and closer performance
        </Typography>
      </Box>

      {/* Loading state */}
      {isLoading && !data && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography sx={{ color: COLORS.text.muted }}>Loading objections data...</Typography>
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
            Failed to load objections data
          </Typography>
          <Typography sx={{ color: COLORS.text.muted, fontSize: '0.85rem' }}>
            {error.message || 'Please try again later.'}
          </Typography>
        </Box>
      )}

      {/* Dashboard content */}
      {displayData && (
      <TierGate requiredTier="insight" label="objection intelligence">
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>

          {/* Summary — 9 scorecards */}
          <ScorecardGrid
            title="Objection Summary"
            metrics={sections.summary}
            glowColor={COLORS.neon.amber}
            columns={3}
          />

          {/* Objections by Type — Stacked Bar */}
          <ChartWrapper
            title="Objections by Type (Resolved vs Unresolved)"
            accentColor={COLORS.neon.amber}
            loading={isLoading}
            error={error?.message}
            isEmpty={!charts.objectionsByType?.data?.length}
            height={280}
          >
            <TronBarChart
              data={charts.objectionsByType?.data || []}
              series={charts.objectionsByType?.series || []}
              height={280}
              stacked
              yAxisFormat="number"
            />
          </ChartWrapper>

          {/* Objection Type Summary Table */}
          <Box>
            <Box
              sx={{
                borderTop: `1px solid ${COLORS.border.subtle}`,
                marginBottom: '16px',
                paddingTop: '24px',
              }}
            >
              <Typography
                variant="h5"
                sx={{
                  color: COLORS.text.secondary,
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  marginBottom: '16px',
                }}
              >
                Objection Type Breakdown
              </Typography>
            </Box>
            <ObjectionsTable rows={tables.byType?.rows || []} />
          </Box>

          {/* Objection Trends — Line */}
          <ChartWrapper
            title="Top 3 Objections Over Time"
            accentColor={COLORS.neon.cyan}
            loading={isLoading}
            error={error?.message}
            isEmpty={!charts.objectionTrends?.data?.length}
            height={280}
          >
            <TronLineChart
              data={charts.objectionTrends?.data || []}
              series={charts.objectionTrends?.series || []}
              height={280}
              yAxisFormat="number"
              showArea={true}
            />
          </ChartWrapper>

          {/* Unresolved by Type — Pie */}
          <ChartWrapper
            title="Unresolved Objections by Type"
            accentColor={COLORS.neon.red}
            loading={isLoading}
            error={error?.message}
            isEmpty={!charts.unresolvedByType?.data?.length}
            height={280}
          >
            <TronPieChart
              data={charts.unresolvedByType?.data || []}
              height={280}
            />
          </ChartWrapper>

          {/* Resolution Rate by Closer — Bar */}
          <ChartWrapper
            title="Resolution Rate by Closer"
            accentColor={COLORS.neon.green}
            loading={isLoading}
            error={error?.message}
            isEmpty={!charts.resolutionByCloser?.data?.length}
            height={280}
          >
            <TronBarChart
              data={charts.resolutionByCloser?.data || []}
              series={charts.resolutionByCloser?.series || []}
              height={280}
              yAxisFormat="percent"
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
