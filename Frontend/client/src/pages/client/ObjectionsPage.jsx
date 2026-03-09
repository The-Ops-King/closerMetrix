/**
 * OBJECTIONS PAGE — INSIGHT+ ONLY
 *
 * Objection intelligence: counts, resolution rates, per-type and per-closer
 * breakdowns, plus drill-down tables.
 *
 * Layout:
 *   1. Summary — 9 scorecards (calls held, objections faced, resolution rate, etc.)
 *   2. Row 1 (2-col): Resolved vs Unresolved bar  |  Objection Type Table
 *   3. Row 2 (2-col): Resolved by Closer Table    |  Top 3 Objections Over Time line
 *   4. Row 3 (2-col): Unresolved Pie              |  Resolution Rate by Closer bar
 *   5. Objection Detail Table — full-width with inline filter bar
 *
 * Data: GET /api/dashboard/objections
 */

import React, { useState, useEffect, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { COLORS } from '../../theme/constants';
import { useMetrics } from '../../hooks/useMetrics';
import { useInsight } from '../../hooks/useInsight';
import InsightCard from '../../components/InsightCard';
import { useAuth } from '../../context/AuthContext';
import { useFilters } from '../../context/FilterContext';
import { meetsMinTier } from '../../utils/tierConfig';
import { DUMMY_OBJECTIONS } from '../../utils/dummyData';
import ScorecardGrid from '../../components/scorecards/ScorecardGrid';
import ChartWrapper from '../../components/charts/ChartWrapper';
import TronLineChart from '../../components/charts/TronLineChart';
import TronBarChart from '../../components/charts/TronBarChart';
import TronPieChart from '../../components/charts/TronPieChart';
import ObjectionsTable from '../../components/tables/ObjectionsTable';
import ObjectionDetailTable from '../../components/tables/ObjectionDetailTable';
import TierGate from '../../components/TierGate';
import useAnimatedValue from '../../hooks/useAnimatedValue';

export default function ObjectionsPage() {
  const { tier } = useAuth();
  const hasAccess = meetsMinTier(tier, 'insight');
  const { data, isLoading, error } = useMetrics('objections', { enabled: hasAccess });
  const { text: insightText, generatedAt: insightGeneratedAt, isLoading: insightLoading, isOnDemandLoading, generateWithFilters, remainingAnalyses } = useInsight('objections', data);
  const { setAvailableObjectionTypes } = useFilters();

  // Local state for detail table filters (not linked to FilterContext)
  const [resolvedFilter, setResolvedFilter] = useState(null);
  const [outcomeFilter, setOutcomeFilter] = useState([]);

  // Fall back to dummy data when the user doesn't have access
  const displayData = hasAccess ? data : DUMMY_OBJECTIONS;
  const sections = displayData?.sections || {};
  const charts = displayData?.charts || {};
  const tables = displayData?.tables || {};

  // Dynamic heights for Row 1 (bar chart + type table) based on data count
  const typeChartTarget = useMemo(() => {
    const count = charts.objectionsByType?.data?.length || 0;
    return Math.max(200, 100 + count * 40);
  }, [charts.objectionsByType?.data?.length]);
  const typeChartHeight = useAnimatedValue(typeChartTarget);

  // Dynamic heights for Row 2 (closer table + trend chart)
  const closerRowTarget = useMemo(() => {
    const count = tables.byCloser?.rows?.length || 0;
    return Math.max(300, 100 + count * 40);
  }, [tables.byCloser?.rows?.length]);
  const closerRowHeight = useAnimatedValue(closerRowTarget);

  // Push available objection types into FilterContext for the dynamic dropdown
  useEffect(() => {
    if (displayData?.availableObjectionTypes) {
      setAvailableObjectionTypes(displayData.availableObjectionTypes);
    }
    return () => setAvailableObjectionTypes([]);
  }, [displayData?.availableObjectionTypes, setAvailableObjectionTypes]);

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

      <InsightCard text={insightText} isLoading={insightLoading} generatedAt={insightGeneratedAt} isOnDemandLoading={isOnDemandLoading} onAnalyze={generateWithFilters} remainingAnalyses={remainingAnalyses} />

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

          {/* Row 1: Resolved vs Unresolved bar  |  Objection Type Table */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              gap: '16px',
              alignItems: 'stretch',
            }}
          >
            <ChartWrapper
              title="Objections by Type (Resolved vs Unresolved)"
              accentColor={COLORS.neon.amber}
              loading={isLoading}
              error={error?.message}
              isEmpty={!charts.objectionsByType?.data?.length}
              height={typeChartHeight}
            >
              <TronBarChart
                data={charts.objectionsByType?.data || []}
                series={charts.objectionsByType?.series || []}
                layout="horizontal"
                stacked
                yAxisFormat="number"
                height={typeChartHeight}
              />
            </ChartWrapper>

            <ObjectionsTable
              rows={tables.byType?.rows || []}
              variant="type"
              title="Objection Type Breakdown"
              accentColor={COLORS.neon.amber}
            />
          </Box>

          {/* Row 2: Resolved by Closer Table  |  Top 3 Objections Over Time */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              gridAutoRows: 'minmax(300px, auto)',
              gap: '16px',
              alignItems: 'stretch',
            }}
          >
            <ObjectionsTable
              rows={tables.byCloser?.rows || []}
              variant="closer"
              title="Resolved by Closer"
              accentColor={COLORS.neon.cyan}
            />

            <ChartWrapper
              title="Top 3 Objections Over Time"
              accentColor={COLORS.neon.cyan}
              loading={isLoading}
              error={error?.message}
              isEmpty={!charts.objectionTrends?.data?.length}
              height={300}
            >
              <TronLineChart
                data={charts.objectionTrends?.data || []}
                series={charts.objectionTrends?.series || []}
                yAxisFormat="number"
                showArea={true}
                areaOpacity={0.25}
              />
            </ChartWrapper>
          </Box>

          {/* Row 3: Unresolved Pie  |  Resolution Rate by Closer bar — side by side */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              gap: '16px',
              alignItems: 'stretch',
            }}
          >
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
                yAxisFormat="percent"
              />
            </ChartWrapper>
          </Box>

          {/* Objection Detail Table — full-width with inline filters */}
          <ObjectionDetailTable
            rows={tables.detail?.rows || []}
            accentColor={COLORS.neon.cyan}
            resolvedFilter={resolvedFilter}
            setResolvedFilter={setResolvedFilter}
            outcomeFilter={outcomeFilter}
            setOutcomeFilter={setOutcomeFilter}
          />

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
