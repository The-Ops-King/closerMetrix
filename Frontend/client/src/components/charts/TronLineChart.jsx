/**
 * TronLineChart — Line chart with smooth curves and gradient area fills.
 *
 * This is the SIGNATURE CloserMetrix chart look:
 *   - Neon-colored lines on a dark background
 *   - Smooth catmullRom curves for flowing, organic line shapes
 *   - Enhanced gradient fill from line color fading to transparent underneath each line
 *   - Dark-themed axes, gridlines, and tooltips
 *
 * Built on MUI X Charts v7 <LineChart> component.
 *
 * Data format:
 *   data: [
 *     { date: '2026-01-06', revenue: 14000, cash: 8400 },
 *     { date: '2026-01-13', revenue: 18200, cash: 10500 },
 *     ...
 *   ]
 *   series: [
 *     { key: 'revenue', label: 'Revenue', color: 'cyan' },
 *     { key: 'cash', label: 'Cash Collected', color: 'green' },
 *   ]
 *
 * The `color` prop on each series is a NAMED key (e.g. 'cyan', 'green')
 * that maps to the neon palette in COLORS.neon. This keeps colors consistent
 * across the dashboard without hardcoding hex values in every page.
 */

import React, { useMemo } from 'react';
import { LineChart } from '@mui/x-charts/LineChart';
import { COLORS } from '../../theme/constants';
import { getAxisFormatter, getTooltipFormatter, formatDateLabel } from '../../utils/formatters';
import { COLOR_MAP } from '../../utils/colors';

/**
 * @param {Object} props
 * @param {Array<Object>} props.data - Array of data points, each with a `date` string and numeric value keys
 * @param {Array<{key: string, label: string, color: string}>} props.series - Series configuration
 * @param {number} [props.height=350] - Chart height in pixels
 * @param {'percent'|'currency'|'number'} [props.yAxisFormat='number'] - How to format Y-axis values
 * @param {boolean} [props.showArea=true] - Whether to show gradient fill under lines
 */
export default function TronLineChart({
  data = [],
  series = [],
  height = 350,
  yAxisFormat = 'number',
  showArea = true,
  stacked = false,
}) {
  /**
   * Parse date strings into Date objects for the X axis.
   * MUI X Charts v7 xAxis with scaleType 'time' expects Date objects.
   */
  const xAxisData = useMemo(
    () => data.map((d) => new Date(d.date)),
    [data]
  );

  /**
   * Build MUI X Charts series configuration from our simplified props.
   *
   * Each series maps to:
   *   - data: array of numeric values extracted from the data by key
   *   - label: display label for legend/tooltip
   *   - color: resolved hex color from COLOR_MAP
   *   - area: whether to show gradient fill (from showArea prop)
   *   - showMark: false to keep the line clean (no dots on each point)
   *   - curve: 'catmullRom' for smooth, flowing curves
   *   - valueFormatter: full-precision formatting for tooltip display
   */
  const chartSeries = useMemo(() => {
    const tooltipFmt = getTooltipFormatter(yAxisFormat);

    return series.map((s) => ({
      data: data.map((d) => d[s.key] ?? null),
      label: s.label,
      color: COLOR_MAP[s.color] || s.color || COLORS.neon.cyan,
      area: showArea,
      ...(stacked ? { stack: 'total', stackOrder: 'none' } : {}),
      showMark: false,
      curve: 'catmullRom',
      valueFormatter: tooltipFmt,
    }));
  }, [data, series, showArea, stacked, yAxisFormat]);

  // Don't render anything if there's no data — the parent ChartWrapper handles empty state
  if (!data.length || !series.length) return null;

  return (
    <LineChart
      height={height}
      series={chartSeries}
      xAxis={[
        {
          data: xAxisData,
          scaleType: 'time',
          valueFormatter: formatDateLabel,
          // Only show ticks at actual data points, cap at 8 labels to prevent bunching
          tickInterval: (value) => xAxisData.some((d) => d.getTime() === value.getTime()),
          tickNumber: Math.min(xAxisData.length, 8),
          tickLabelStyle: {
            fill: COLORS.text.secondary,
            fontSize: 12,
          },
        },
      ]}
      yAxis={[
        {
          valueFormatter: getAxisFormatter(yAxisFormat),
          tickLabelStyle: {
            fill: COLORS.text.secondary,
            fontSize: 12,
          },
        },
      ]}
      grid={{
        horizontal: true,
        vertical: false,
      }}
      margin={{ top: 20, right: 20, bottom: 40, left: 70 }}
      slotProps={{
        legend: {
          labelStyle: {
            fill: COLORS.text.secondary,
            fontSize: 12,
          },
          itemMarkWidth: 10,
          itemMarkHeight: 10,
          markGap: 5,
          itemGap: 20,
          position: { vertical: 'top', horizontal: 'right' },
          padding: { top: 0, bottom: 10 },
        },
      }}
      sx={{
        // ── TRON DARK THEME ──
        backgroundColor: 'transparent',

        // Grid lines — barely visible, dashed for depth
        '& .MuiChartsGrid-horizontalLine': {
          stroke: 'rgba(255, 255, 255, 0.04)',
          strokeDasharray: '4 4',
        },
        '& .MuiChartsGrid-verticalLine': {
          stroke: 'rgba(255, 255, 255, 0.03)',
        },

        // Axis lines — minimal chrome
        '& .MuiChartsAxis-line': {
          stroke: 'rgba(255, 255, 255, 0.08)',
        },
        '& .MuiChartsAxis-tick': {
          stroke: 'rgba(255, 255, 255, 0.06)',
        },
        '& .MuiChartsAxis-tickLabel': {
          fill: COLORS.text.muted,
          fontSize: '11px !important',
        },

        // Area fill — gradient fade to black (transparent at bottom)
        '& .MuiAreaElement-root': {
          fillOpacity: 0.6,
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 85%)',
          WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 85%)',
        },

        // Line styling — glow effect on strokes
        '& .MuiLineElement-root': {
          strokeWidth: 2.5,
          filter: 'drop-shadow(0 0 4px rgba(77, 212, 232, 0.4))',
        },

        // Mark dots on hover
        '& .MuiMarkElement-root': {
          fill: COLORS.bg.secondary,
          strokeWidth: 2,
        },

        // Tooltip — dark glass panel
        '& .MuiChartsTooltip-root': {
          backgroundColor: `${COLORS.bg.primary} !important`,
          border: `1px solid ${COLORS.border.default} !important`,
          borderRadius: '8px !important',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6) !important',
        },
        '& .MuiChartsTooltip-table': {
          backgroundColor: COLORS.bg.primary,
        },
        '& .MuiChartsTooltip-cell': {
          color: `${COLORS.text.primary} !important`,
          borderColor: `${COLORS.border.subtle} !important`,
          fontSize: '0.8rem !important',
        },
        '& .MuiChartsTooltip-labelCell': {
          color: `${COLORS.text.secondary} !important`,
        },
        '& .MuiChartsTooltip-valueCell': {
          color: `${COLORS.text.primary} !important`,
          fontWeight: '600 !important',
        },

        // Legend
        '& .MuiChartsLegend-label': {
          fill: `${COLORS.text.secondary} !important`,
          fontSize: '12px !important',
        },

        // Crosshair highlight
        '& .MuiChartsAxisHighlight-root': {
          stroke: 'rgba(255, 255, 255, 0.12)',
          strokeWidth: 1,
          strokeDasharray: '4 2',
        },
      }}
    />
  );
}
