/**
 * VIOLATIONS PAGE — EXECUTIVE ONLY
 *
 * SEC/FTC violation intelligence — the MONEY FEATURE that justifies the
 * Executive tier price. Shows risk flags, exact phrases closers used that
 * could trigger regulatory trouble, and links to recordings/transcripts.
 *
 * Red glow theme throughout — this page feels dangerous on purpose.
 *
 * Layout Order:
 *   1. Risk Overview — 5 scorecards (columns=5, per-card glowColor)
 *   2. Charts row — 2-col grid: Compliance Over Time (left) | Flags by Closer (right)
 *   3. Risk Categories — 4 scorecards centered (6-col grid, cards span cols 2-5)
 *   4. Risk Category Trends — full-width line chart
 *   5. Risk by Call Type — 2 scorecards (columns=2)
 *   6. Risk Review Table — with inline filter bar (reads FilterContext)
 *   7. Footer
 *
 * Data: GET /api/dashboard/violations
 */

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { COLORS } from '../../theme/constants';
import { useMetrics } from '../../hooks/useMetrics';
import { useInsight } from '../../hooks/useInsight';
import InsightCard from '../../components/InsightCard';
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
  const { text: insightText, generatedAt: insightGeneratedAt, isLoading: insightLoading, isOnDemandLoading, generateWithFilters, remainingAnalyses } = useInsight('violations', data);

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

      <InsightCard text={insightText} isLoading={insightLoading} generatedAt={insightGeneratedAt} isOnDemandLoading={isOnDemandLoading} onAnalyze={generateWithFilters} remainingAnalyses={remainingAnalyses} />

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

          {/* 1. Risk Overview — 3 scorecards full width */}
          <ScorecardGrid
            title="Risk Overview"
            metrics={sections.overview}
            glowColor={COLORS.neon.red}
            columns={3}
          />

          {/* 2. Charts row — 2-col grid */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              gap: 2,
            }}
          >
            {/* Compliance Issues Over Time — Line chart (left) */}
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

            {/* Risk Flags by Closer — Bar chart (right) */}
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
          </Box>

          {/* 3. Risk Categories — 4 scorecards full width */}
          <ScorecardGrid
            title="Risk Categories"
            metrics={sections.riskCategories}
            glowColor={COLORS.neon.amber}
            columns={4}
          />

          {/* 4. Risk Category Trends — full-width line chart */}
          <ChartWrapper
            title="Risk Category Trends"
            accentColor={COLORS.neon.red}
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
              stacked={true}
            />
          </ChartWrapper>

          {/* 5. Risk by Call Type — 2 scorecards */}
          <ScorecardGrid
            title="Risk by Call Type"
            metrics={sections.riskByCallType}
            glowColor={COLORS.neon.red}
            columns={2}
          />

          {/* 6. Risk Review Table — with inline filter bar */}
          <RiskReviewTable rows={tables.riskReview?.rows || []} />

          {/* 7. Footer */}
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
