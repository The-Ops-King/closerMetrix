/**
 * CLOSER SCOREBOARD PAGE — INSIGHT+ ONLY
 *
 * The "show-off" page — ranks closers across every category with beautiful
 * charts and leaderboards. Features a Champion Spotlight, head-to-head
 * comparison table, bar chart rankings, skills radar, efficiency metrics,
 * and trend lines.
 *
 * Sections:
 *   1. Champion Spotlight — #1 closer hero card + TopPerformers ranked list
 *   2. Head-to-Head Comparison Table — metric x closer matrix
 *   3. Revenue & Close Rankings — 2x2 bar chart grid
 *   4. Skills Radar — dual-closer radar + call quality bars
 *   5. Efficiency & Speed — 2x2 bar chart grid
 *   6. Trends Over Time — close rate & revenue line charts by closer
 *
 * Data: computePageData('closer-scoreboard', rawData, filters)
 * Green glow theme — champion/competitive accent.
 */

import React, { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import { COLORS } from '../../theme/constants';
import { hexToRgba } from '../../utils/colors';
import { useMetrics } from '../../hooks/useMetrics';
import { useInsight } from '../../hooks/useInsight';
import InsightCard from '../../components/InsightCard';
import { useAuth } from '../../context/AuthContext';
import { meetsMinTier } from '../../utils/tierConfig';
import ChartWrapper from '../../components/charts/ChartWrapper';
import TronBarChart from '../../components/charts/TronBarChart';
import TronLineChart from '../../components/charts/TronLineChart';
import TronRadarChart from '../../components/charts/TronRadarChart';
import TierGate from '../../components/TierGate';
import CloserChampion from '../../components/leaderboard/CloserChampion';
import TopPerformers from '../../components/leaderboard/TopPerformers';
import CloserComparisonTable from '../../components/tables/CloserComparisonTable';

// Dummy data shown blurred behind TierGate for basic tier
const DUMMY_SCOREBOARD = {
  champion: { name: 'Top Closer', powerScore: 82, stats: [
    { label: 'Close Rate', value: '28%' }, { label: 'Revenue', value: '$142,500' },
    { label: 'Show Rate', value: '74%' }, { label: 'Deals', value: '19' },
    { label: 'Avg Deal', value: '$7,500' }, { label: 'Adherence', value: '8.2' },
  ]},
  topPerformers: [
    { name: 'Top Closer', dealsClosed: 19, revenue: 142500 },
    { name: 'Second Closer', dealsClosed: 14, revenue: 98000 },
    { name: 'Third Closer', dealsClosed: 11, revenue: 77000 },
  ],
  comparisonTable: { closers: [], metrics: [] },
  leaderboards: null,
  isEmpty: false,
};

export default function CloserScoreboardPage() {
  const { tier } = useAuth();
  const hasAccess = meetsMinTier(tier, 'insight');
  const { data: realData, isLoading, error } = useMetrics('closer-scoreboard', { enabled: hasAccess, filterOverrides: { closerId: null } });
  const data = hasAccess ? realData : DUMMY_SCOREBOARD;
  const { text: insightText, generatedAt: insightGeneratedAt, isLoading: insightLoading, isOnDemandLoading, generateWithFilters, remainingAnalyses } = useInsight('closer-scoreboard', data);

  const charts = hasAccess ? (data?.charts || {}) : {
    revenueByCloser: { data: [{ x: 'Closer A', y: 142500 }, { x: 'Closer B', y: 98000 }, { x: 'Closer C', y: 77000 }], series: [{ dataKey: 'y', label: 'Revenue', color: 'green' }] },
    closeRateByCloser: { data: [{ x: 'Closer A', y: 0.28 }, { x: 'Closer B', y: 0.24 }, { x: 'Closer C', y: 0.19 }], series: [{ dataKey: 'y', label: 'Close Rate', color: 'cyan' }] },
    showRateByCloser: { data: [{ x: 'Closer A', y: 0.74 }, { x: 'Closer B', y: 0.71 }, { x: 'Closer C', y: 0.65 }], series: [{ dataKey: 'y', label: 'Show Rate', color: 'blue' }] },
    cashByCloser: { data: [{ x: 'Closer A', y: 95000 }, { x: 'Closer B', y: 68000 }, { x: 'Closer C', y: 52000 }], series: [{ dataKey: 'y', label: 'Cash', color: 'teal' }] },
  };
  const radarData = charts.radarData;

  // ── Dual radar comparison selectors (same pattern as AdherencePage) ──
  const [radarCompare1, setRadarCompare1] = useState('top');
  const [radarCompare2, setRadarCompare2] = useState('average');
  const SLOT_COLORS = [COLORS.neon.green, COLORS.neon.cyan];

  const { closersSorted, avgValues } = useMemo(() => {
    const byCloser = radarData?.byCloser;
    if (!byCloser?.length) return { closersSorted: [], avgValues: [] };

    const numAxes = radarData.axes.length;
    const avg = Array.from({ length: numAxes }, (_, i) =>
      +(byCloser.reduce((sum, c) => sum + c.values[i], 0) / byCloser.length).toFixed(1)
    );
    const withAvgs = byCloser.map(c => ({
      ...c,
      avg: c.values.reduce((a, b) => a + b, 0) / c.values.length,
    }));
    return {
      closersSorted: [...withAvgs].sort((a, b) => b.avg - a.avg),
      avgValues: avg,
    };
  }, [radarData]);

  const resolveSelection = (value) => {
    if (!closersSorted.length) return null;
    if (value === 'average') return { label: 'Team Average', values: avgValues };
    if (value === 'top') {
      const c = closersSorted[0];
      return { label: `${c.label} (Top)`, values: c.values };
    }
    if (value === 'bottom') {
      const c = closersSorted[closersSorted.length - 1];
      return { label: `${c.label} (Bottom)`, values: c.values };
    }
    const found = radarData.byCloser.find(c => c.closerId === value);
    return found ? { label: found.label, values: found.values } : null;
  };

  const radarDatasets = useMemo(() => {
    const ds = [];
    const sel1 = resolveSelection(radarCompare1);
    if (sel1) ds.push({ ...sel1, color: SLOT_COLORS[0] });
    const sel2 = resolveSelection(radarCompare2);
    if (sel2) ds.push({ ...sel2, color: SLOT_COLORS[1] });
    return ds;
  }, [radarData, radarCompare1, radarCompare2, closersSorted, avgValues]);

  const radarCompareOptions = useMemo(() => {
    const opts = [
      { value: 'top', label: 'Top Closer' },
      { value: 'bottom', label: 'Bottom Closer' },
      { value: 'average', label: 'Team Average' },
    ];
    (radarData?.byCloser || []).forEach(c => {
      opts.push({ value: c.closerId, label: c.label });
    });
    return opts;
  }, [radarData]);

  return (
    <Box>
      {/* Page header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ color: COLORS.text.primary, fontWeight: 700 }}>
          Closer Scoreboard
        </Typography>
        <Typography sx={{ color: COLORS.text.muted, fontSize: '0.9rem', mt: 0.5 }}>
          Head-to-head closer rankings across every metric
        </Typography>
      </Box>

      <InsightCard text={insightText} isLoading={insightLoading} generatedAt={insightGeneratedAt} isOnDemandLoading={isOnDemandLoading} onAnalyze={generateWithFilters} remainingAnalyses={remainingAnalyses} />

      {/* Loading state */}
      {isLoading && !data && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography sx={{ color: COLORS.text.muted }}>Loading scoreboard data...</Typography>
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
            Failed to load scoreboard data
          </Typography>
          <Typography sx={{ color: COLORS.text.muted, fontSize: '0.85rem' }}>
            {error.message || 'Please try again later.'}
          </Typography>
        </Box>
      )}

      {/* Empty state — fewer than 2 closers */}
      {data?.isEmpty && (
        <Box
          sx={{
            textAlign: 'center', py: 8,
            backgroundColor: hexToRgba(COLORS.neon.amber, 0.05),
            borderRadius: 2,
            border: `1px solid ${hexToRgba(COLORS.neon.amber, 0.2)}`,
          }}
        >
          <Typography sx={{ color: COLORS.neon.amber, mb: 1, fontSize: '1.1rem', fontWeight: 600 }}>
            Not Enough Closers
          </Typography>
          <Typography sx={{ color: COLORS.text.muted, fontSize: '0.85rem' }}>
            {data.message}
          </Typography>
        </Box>
      )}

      {/* Main content */}
      {data && !data.isEmpty && (
      <TierGate requiredTier="insight" label="closer scoreboard">
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

          {/* ═══ Section 1: Champion Spotlight ═══ */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              gap: 2,
            }}
          >
            <CloserChampion
              name={data.champion?.name}
              powerScore={data.champion?.powerScore}
              stats={data.champion?.stats || []}
            />
            <TopPerformers
              closers={data.topPerformers || []}
              title="Power Rankings"
            />
          </Box>

          {/* ═══ Section 2: Head-to-Head Comparison Table ═══ */}
          <CloserComparisonTable
            closers={data.comparisonTable?.closers || []}
            metrics={data.comparisonTable?.metrics || []}
          />

          {/* ═══ Section 2b: Category Leaderboards ═══ */}
          {data.leaderboards && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr 1fr' },
                gap: 2,
              }}
            >
              <TopPerformers closers={data.leaderboards.revenue} title="Top by Revenue" />
              <TopPerformers closers={data.leaderboards.cash} title="Top by Cash" />
              <TopPerformers closers={data.leaderboards.dealsClosed} title="Top by Deals Closed" />
              <TopPerformers closers={data.leaderboards.avgDealSize} title="Highest Avg Deal" />
              <TopPerformers closers={data.leaderboards.closeRate} title="Best Close Rate" />
              <TopPerformers closers={data.leaderboards.showRate} title="Best Show Rate" />
              <TopPerformers closers={data.leaderboards.callsTaken} title="Most Calls Taken" />
              <TopPerformers closers={data.leaderboards.callQuality} title="Best Call Quality" />
              <TopPerformers closers={data.leaderboards.avgDuration} title="Longest Avg Duration" />
            </Box>
          )}

          {/* ═══ Section 3: Revenue & Close Rankings (2x2) ═══ */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              gap: 2,
            }}
          >
            <ChartWrapper
              title="Revenue by Closer"
              accentColor={COLORS.neon.green}
              loading={isLoading}
              isEmpty={!charts.revenueByCloser?.data?.length}
              height={280}
            >
              <TronBarChart
                data={charts.revenueByCloser?.data || []}
                series={charts.revenueByCloser?.series || []}
                height={280}
                yAxisFormat="currency"
              />
            </ChartWrapper>

            <ChartWrapper
              title="Close Rate by Closer"
              accentColor={COLORS.neon.cyan}
              loading={isLoading}
              isEmpty={!charts.closeRateByCloser?.data?.length}
              height={280}
            >
              <TronBarChart
                data={charts.closeRateByCloser?.data || []}
                series={charts.closeRateByCloser?.series || []}
                height={280}
                yAxisFormat="percent"
              />
            </ChartWrapper>

            <ChartWrapper
              title="Show Rate by Closer"
              accentColor={COLORS.neon.blue}
              loading={isLoading}
              isEmpty={!charts.showRateByCloser?.data?.length}
              height={280}
            >
              <TronBarChart
                data={charts.showRateByCloser?.data || []}
                series={charts.showRateByCloser?.series || []}
                height={280}
                yAxisFormat="percent"
              />
            </ChartWrapper>

            <ChartWrapper
              title="Cash Collected by Closer"
              accentColor={COLORS.neon.teal}
              loading={isLoading}
              isEmpty={!charts.cashByCloser?.data?.length}
              height={280}
            >
              <TronBarChart
                data={charts.cashByCloser?.data || []}
                series={charts.cashByCloser?.series || []}
                height={280}
                yAxisFormat="currency"
              />
            </ChartWrapper>
          </Box>

          {/* ═══ Section 4: Skills Radar ═══ */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              gap: 2,
            }}
          >
            <ChartWrapper
              title="Skills Radar"
              accentColor={COLORS.neon.purple}
              loading={isLoading}
              isEmpty={!radarData?.byCloser?.length}
              height={380}
            >
              {/* Dual closer comparison selectors */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                {[
                  { value: radarCompare1, setter: setRadarCompare1, color: SLOT_COLORS[0] },
                  { value: radarCompare2, setter: setRadarCompare2, color: SLOT_COLORS[1] },
                ].map((slot, idx) => (
                  <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box sx={{
                      width: 8, height: 8, borderRadius: '50%',
                      bgcolor: slot.color,
                      boxShadow: `0 0 6px ${hexToRgba(slot.color, 0.6)}`,
                      flexShrink: 0,
                    }} />
                    <FormControl size="small" sx={{ minWidth: 140 }}>
                      <Select
                        value={slot.value}
                        onChange={(e) => slot.setter(e.target.value)}
                        sx={{
                          color: COLORS.text.primary,
                          fontSize: '0.75rem',
                          height: 28,
                          '.MuiOutlinedInput-notchedOutline': {
                            borderColor: hexToRgba(slot.color, 0.3),
                          },
                          '&:hover .MuiOutlinedInput-notchedOutline': {
                            borderColor: hexToRgba(slot.color, 0.5),
                          },
                          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                            borderColor: slot.color,
                          },
                        }}
                        MenuProps={{
                          PaperProps: {
                            sx: {
                              bgcolor: COLORS.bg.elevated,
                              border: `1px solid ${COLORS.border.default}`,
                            },
                          },
                        }}
                      >
                        {radarCompareOptions.map(opt => (
                          <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: '0.75rem' }}>
                            {opt.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    {idx === 0 && (
                      <Typography sx={{ color: COLORS.text.muted, fontSize: '0.75rem', px: 0.25 }}>
                        vs
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
              <TronRadarChart
                axes={radarData?.axes || []}
                datasets={radarDatasets}
                maxValue={10}
                height={340}
              />
            </ChartWrapper>

            <ChartWrapper
              title="Overall Call Quality by Closer"
              accentColor={COLORS.neon.purple}
              loading={isLoading}
              isEmpty={!charts.callQualityByCloser?.data?.length}
              height={380}
            >
              <TronBarChart
                data={charts.callQualityByCloser?.data || []}
                series={charts.callQualityByCloser?.series || []}
                height={340}
                yAxisFormat="number"
              />
            </ChartWrapper>
          </Box>

          {/* ═══ Section 5: Efficiency & Speed (2x2) ═══ */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              gap: 2,
            }}
          >
            <ChartWrapper
              title="Avg Days to Close by Closer"
              accentColor={COLORS.neon.amber}
              loading={isLoading}
              isEmpty={!charts.daysToCloseByCloser?.data?.length}
              height={280}
            >
              <TronBarChart
                data={charts.daysToCloseByCloser?.data || []}
                series={charts.daysToCloseByCloser?.series || []}
                height={280}
                yAxisFormat="number"
              />
            </ChartWrapper>

            <ChartWrapper
              title="Avg Calls to Close by Closer"
              accentColor={COLORS.neon.purple}
              loading={isLoading}
              isEmpty={!charts.callsToCloseByCloser?.data?.length}
              height={280}
            >
              <TronBarChart
                data={charts.callsToCloseByCloser?.data || []}
                series={charts.callsToCloseByCloser?.series || []}
                height={280}
                yAxisFormat="number"
              />
            </ChartWrapper>

            <ChartWrapper
              title="Objection Resolution Rate by Closer"
              accentColor={COLORS.neon.cyan}
              loading={isLoading}
              isEmpty={!charts.objResRateByCloser?.data?.length}
              height={280}
            >
              <TronBarChart
                data={charts.objResRateByCloser?.data || []}
                series={charts.objResRateByCloser?.series || []}
                height={280}
                yAxisFormat="percent"
              />
            </ChartWrapper>

            <ChartWrapper
              title="Avg Call Duration by Closer"
              accentColor={COLORS.neon.blue}
              loading={isLoading}
              isEmpty={!charts.avgDurationByCloser?.data?.length}
              height={280}
            >
              <TronBarChart
                data={charts.avgDurationByCloser?.data || []}
                series={charts.avgDurationByCloser?.series || []}
                height={280}
                yAxisFormat="number"
              />
            </ChartWrapper>
          </Box>

          {/* ═══ Section 6: Trends Over Time ═══ */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              gap: 2,
            }}
          >
            <ChartWrapper
              title="Close Rate by Closer Over Time"
              accentColor={COLORS.neon.cyan}
              loading={isLoading}
              isEmpty={!charts.closeRateTrend?.data?.length}
              height={340}
            >
              <TronLineChart
                data={charts.closeRateTrend?.data || []}
                series={charts.closeRateTrend?.series || []}
                height={340}
                yAxisFormat="percent"
                showArea={true}
                areaOpacity={0.25}
              />
            </ChartWrapper>

            <ChartWrapper
              title="Revenue by Closer Over Time"
              accentColor={COLORS.neon.green}
              loading={isLoading}
              isEmpty={!charts.revenueTrend?.data?.length}
              height={340}
            >
              <TronLineChart
                data={charts.revenueTrend?.data || []}
                series={charts.revenueTrend?.series || []}
                height={340}
                yAxisFormat="currency"
                showArea={true}
                areaOpacity={0.25}
              />
            </ChartWrapper>
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
              Closers with fewer than 3 held calls are excluded
            </Typography>
          </Box>
        </Box>
      </TierGate>
      )}
    </Box>
  );
}
