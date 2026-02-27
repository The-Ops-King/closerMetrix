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
  const { text: insightText, generatedAt: insightGeneratedAt, isLoading: insightLoading, isOnDemandLoading, generateWithFilters, remainingAnalyses } = useInsight('adherence', data);

  // Fall back to dummy data when the user doesn't have access
  const displayData = hasAccess ? data : DUMMY_ADHERENCE;

  // Destructure API response sections — same envelope shape as all dashboard pages:
  // { sections: { overall, bySection }, charts: { radarData, adherenceByCloser, ... } }
  const sections = displayData?.sections || {};
  const charts = displayData?.charts || {};

  // Extract radar chart data for the TronRadarChart component.
  const radarData = charts.radarData;

  // ── Dual radar comparison selectors ──
  // Each can be 'top', 'bottom', 'average', or a closerId string
  const [radarCompare1, setRadarCompare1] = useState('top');
  const [radarCompare2, setRadarCompare2] = useState('average');

  // Colors for each selector slot so the two polygons are always distinct
  const SLOT_COLORS = [COLORS.neon.green, COLORS.neon.cyan];

  // Pre-compute sorted closers + team average values (shared by both selectors)
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

  // Resolve a selector value into a { label, values } object
  const resolveSelection = (value) => {
    if (!closersSorted.length) return null;
    if (value === 'average') {
      return { label: 'Team Average', values: avgValues };
    }
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

  // Build the two radar datasets with their slot colors
  const radarDatasets = useMemo(() => {
    const ds = [];
    const sel1 = resolveSelection(radarCompare1);
    if (sel1) ds.push({ ...sel1, color: SLOT_COLORS[0] });
    const sel2 = resolveSelection(radarCompare2);
    if (sel2) ds.push({ ...sel2, color: SLOT_COLORS[1] });
    return ds;
  }, [radarData, radarCompare1, radarCompare2, closersSorted, avgValues]);

  // Build selector options: Top, Bottom, Average, then each closer by name
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
          Script Adherence
        </Typography>
        <Typography sx={{ color: COLORS.text.muted, fontSize: '0.9rem', mt: 0.5 }}>
          Script adherence scores and closer benchmarks
        </Typography>
      </Box>

      <InsightCard text={insightText} isLoading={insightLoading} generatedAt={insightGeneratedAt} isOnDemandLoading={isOnDemandLoading} onAnalyze={generateWithFilters} remainingAnalyses={remainingAnalyses} />

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

          {/* Charts — 2x2 grid */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              gap: 2,
            }}
          >
            {/* Radar Chart — Spider chart overlaying datasets with closer comparison */}
            <ChartWrapper
              title="Script Adherence by Section"
              accentColor={COLORS.neon.purple}
              loading={isLoading}
              error={error?.message}
              isEmpty={!radarData?.byCloser?.length}
              height={340}
            >
              {/* Dual closer comparison selectors */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                {[
                  { value: radarCompare1, setter: setRadarCompare1, color: SLOT_COLORS[0] },
                  { value: radarCompare2, setter: setRadarCompare2, color: SLOT_COLORS[1] },
                ].map((slot, idx) => (
                  <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    {/* Color dot matching the polygon */}
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

            {/* Script Adherence Over Time — Line chart */}
            <ChartWrapper
              title="Script Adherence Over Time"
              accentColor={COLORS.neon.green}
              loading={isLoading}
              error={error?.message}
              isEmpty={!charts.adherenceOverTime?.data?.length}
              height={340}
            >
              <TronLineChart
                data={charts.adherenceOverTime?.data || []}
                series={charts.adherenceOverTime?.series || []}
                height={340}
                yAxisFormat="number"
                showArea={true}
              />
            </ChartWrapper>

            {/* Overall Adherence by Closer — Bar chart */}
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

            {/* Objection Handling by Closer — Bar chart */}
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
      </TierGate>
      )}
    </Box>
  );
}
