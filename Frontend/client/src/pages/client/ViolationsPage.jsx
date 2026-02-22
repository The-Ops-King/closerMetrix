/**
 * VIOLATIONS PAGE — EXECUTIVE ONLY
 *
 * SEC/FTC violation intelligence — the MONEY FEATURE that justifies the
 * Executive tier price. Shows risk flags, exact phrases closers used that
 * could trigger regulatory trouble, and links to recordings/transcripts.
 *
 * Red/magenta glow theme throughout — this page feels dangerous on purpose.
 *
 * Sections:
 *   1. Risk Overview — 5 scorecards (flag count, unique calls, % calls, trend, FTC/SEC count)
 *   2. Risk Categories — 4 scorecards (Claims, Guarantees, Earnings, Pressure)
 *   3. Risk by Call Type — 2 scorecards (First Call %, Follow-Up %)
 *   4. Compliance Issues Over Time — line chart
 *   5. Risk Review Table — the big feature, exact flagged phrases with context
 *   6. Risk Flags by Closer — bar chart
 *   7. Risk Category Trends — line chart
 *
 * Data: GET /api/dashboard/violations
 */

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { COLORS } from '../../theme/constants';
import { useMetrics } from '../../hooks/useMetrics';
import { useAuth } from '../../context/AuthContext';
import { meetsMinTier } from '../../utils/tierConfig';
import { DUMMY_VIOLATIONS } from '../../utils/dummyData';
import ScorecardGrid from '../../components/scorecards/ScorecardGrid';
import ChartWrapper from '../../components/charts/ChartWrapper';
import TronLineChart from '../../components/charts/TronLineChart';
import TronBarChart from '../../components/charts/TronBarChart';

import RiskReviewTable from '../../components/tables/RiskReviewTable';
import TierGate from '../../components/TierGate';

export default function ViolationsPage() {
  const { tier } = useAuth();
  const hasAccess = meetsMinTier(tier, 'executive');
  const { data, isLoading, error } = useMetrics('violations', { enabled: hasAccess });

  // Fall back to dummy data when the user doesn't have access
  const displayData = hasAccess ? data : DUMMY_VIOLATIONS;
  const sections = displayData?.sections || {};
  const charts = displayData?.charts || {};
  const tables = displayData?.tables || {};

  return (
    <Box>
      {/* Page header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ color: COLORS.text.primary, fontWeight: 700 }}>
          SEC / FTC Violations
        </Typography>
        <Typography sx={{ color: COLORS.text.muted, fontSize: '0.9rem', mt: 0.5 }}>
          Compliance flags and risk analysis
        </Typography>
      </Box>

      {/* Loading state */}
      {isLoading && !data && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography sx={{ color: COLORS.text.muted }}>Loading violations data...</Typography>
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
            Failed to load violations data
          </Typography>
          <Typography sx={{ color: COLORS.text.muted, fontSize: '0.85rem' }}>
            {error.message || 'Please try again later.'}
          </Typography>
        </Box>
      )}

      {/* Dashboard content */}
      {displayData && (
      <TierGate requiredTier="executive" label="violation intelligence">
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>

          {/* Risk Overview — 5 scorecards */}
          <ScorecardGrid
            title="Risk Overview"
            metrics={sections.overview}
            glowColor={COLORS.neon.red}
            columns={5}
          />

          {/* Risk Categories — 4 scorecards (Claims, Guarantees, Earnings, Pressure) */}
          <ScorecardGrid
            title="Risk Categories"
            metrics={sections.riskCategories}
            glowColor={COLORS.neon.amber}
            columns={4}
          />

          {/* Risk by Call Type — 2 scorecards */}
          <ScorecardGrid
            title="Risk by Call Type"
            metrics={sections.riskByCallType}
            glowColor={COLORS.neon.magenta}
            columns={2}
          />

          {/* Compliance Issues Over Time — Line chart */}
          <ChartWrapper
            title="Compliance Issues Over Time"
            accentColor={COLORS.neon.red}
            loading={isLoading}
            error={error?.message}
            isEmpty={!charts.complianceOverTime?.data?.length}
            height={280}
          >
            <TronLineChart
              data={charts.complianceOverTime?.data || []}
              series={charts.complianceOverTime?.series || []}
              height={280}
              yAxisFormat="number"
              showArea={true}
            />
          </ChartWrapper>

          {/* Risk Review Table — the money feature */}
          <Box>
            <Box
              sx={{
                borderTop: `1px solid ${COLORS.border.subtle}`,
                mb: 2,
                pt: 3,
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
                  mb: 2,
                }}
              >
                Risk Review — Flagged Phrases
              </Typography>
            </Box>
            <RiskReviewTable rows={tables.riskReview?.rows || []} />
          </Box>

          {/* Risk Flags by Closer — Bar chart */}
          <ChartWrapper
            title="Risk Flags by Closer"
            accentColor={COLORS.neon.amber}
            loading={isLoading}
            error={error?.message}
            isEmpty={!charts.flagsByCloser?.data?.length}
            height={280}
          >
            <TronBarChart
              data={charts.flagsByCloser?.data || []}
              series={charts.flagsByCloser?.series || []}
              height={280}
              yAxisFormat="number"
            />
          </ChartWrapper>

          {/* Risk Category Trends — Line chart */}
          <ChartWrapper
            title="Risk Category Trends"
            accentColor={COLORS.neon.magenta}
            loading={isLoading}
            error={error?.message}
            isEmpty={!charts.riskTrends?.data?.length}
            height={280}
          >
            <TronLineChart
              data={charts.riskTrends?.data || []}
              series={charts.riskTrends?.series || []}
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
