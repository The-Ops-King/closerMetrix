/**
 * TronBarChart — Vertical or horizontal bar chart with neon Tron styling.
 *
 * Supports:
 *   - Vertical bars (default) — e.g. calls by type over time
 *   - Horizontal bars — e.g. ranked leaderboards (close rate by closer)
 *   - Stacked mode — e.g. resolved vs unresolved objections
 *
 * Built on MUI X Charts v7 <BarChart> component.
 *
 * Data format:
 *   data: [
 *     { label: 'Week 1', firstCalls: 12, followUps: 8 },
 *     { label: 'Week 2', firstCalls: 15, followUps: 10 },
 *   ]
 *   series: [
 *     { key: 'firstCalls', label: 'First Calls', color: 'cyan' },
 *     { key: 'followUps', label: 'Follow-Ups', color: 'amber' },
 *   ]
 *
 * For horizontal ranked charts (leaderboards), pass:
 *   data: [
 *     { label: 'Sarah', closeRate: 0.28 },
 *     { label: 'Mike', closeRate: 0.22 },
 *   ]
 *   series: [{ key: 'closeRate', label: 'Close Rate', color: 'green' }]
 *   layout: 'horizontal'
 */

import React, { useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { BarChart } from '@mui/x-charts/BarChart';
import { COLORS } from '../../theme/constants';
import { getAxisFormatter, getTooltipFormatter } from '../../utils/formatters';
import { COLOR_MAP } from '../../utils/colors';

/**
 * Custom tooltip for stacked bar charts that includes a total row.
 * Receives MUI X Charts axis tooltip props + custom props via slotProps.
 */
function StackedAxisTooltip({ axisValue, series, dataIndex, stackTotalLabel, yAxisFormat }) {
  if (dataIndex == null || !series) return null;

  const tooltipFmt = getTooltipFormatter(yAxisFormat);
  const items = [];
  let total = 0;

  Object.values(series).forEach((s) => {
    const val = s.data?.[dataIndex] ?? 0;
    total += val;
    items.push({
      label: s.label,
      color: s.color,
      formatted: s.valueFormatter ? s.valueFormatter(val) : tooltipFmt(val),
    });
  });

  return (
    <Box
      sx={{
        p: 1.5,
        backgroundColor: COLORS.bg.primary,
        border: `1px solid ${COLORS.border.default}`,
        borderRadius: '8px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
      }}
    >
      <Typography sx={{ fontWeight: 600, mb: 1, color: COLORS.text.primary, fontSize: '0.85rem' }}>
        {axisValue}
      </Typography>
      {items.map((item, i) => (
        <Box
          key={i}
          sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 3, mb: 0.5 }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: item.color, flexShrink: 0 }} />
            <Typography sx={{ color: COLORS.text.secondary, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
              {item.label}
            </Typography>
          </Box>
          <Typography sx={{ color: COLORS.text.primary, fontWeight: 600, fontSize: '0.8rem' }}>
            {item.formatted}
          </Typography>
        </Box>
      ))}
      <Box
        sx={{
          borderTop: `1px solid ${COLORS.border.default}`,
          mt: 1,
          pt: 1,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 3,
        }}
      >
        <Typography sx={{ color: COLORS.text.primary, fontSize: '0.8rem', fontWeight: 600 }}>
          {stackTotalLabel}
        </Typography>
        <Typography sx={{ color: COLORS.text.primary, fontWeight: 700, fontSize: '0.8rem' }}>
          {tooltipFmt(total)}
        </Typography>
      </Box>
    </Box>
  );
}

/**
 * @param {Object} props
 * @param {Array<Object>} props.data - Array of data points with a `label` (or `date`) string and numeric value keys
 * @param {Array<{key: string, label: string, color: string}>} props.series - Series configuration
 * @param {number} [props.height=350] - Chart height in pixels
 * @param {'vertical'|'horizontal'} [props.layout='vertical'] - Bar orientation
 * @param {boolean} [props.stacked=false] - Whether to stack bars on top of each other
 * @param {'percent'|'currency'|'number'} [props.yAxisFormat='number'] - How to format the value axis
 */
export default function TronBarChart({
  data = [],
  series = [],
  height = 350,
  layout = 'vertical',
  stacked = false,
  yAxisFormat = 'number',
  stackTotalLabel,
}) {
  /**
   * Extract category labels for the category axis.
   * Each data item should have a `label` or `date` field for the category axis.
   */
  const categoryLabels = useMemo(
    () => data.map((d) => d.label || d.date || ''),
    [data]
  );

  /**
   * Build MUI X Charts series configuration.
   *
   * For stacked bars, all series share the same `stack` identifier.
   * Colors come from the friendly-name COLOR_MAP.
   */
  const chartSeries = useMemo(() => {
    const tooltipFmt = getTooltipFormatter(yAxisFormat);

    return series.map((s) => ({
      data: data.map((d) => d[s.key] ?? 0),
      label: s.label,
      color: COLOR_MAP[s.color] || s.color || COLORS.neon.cyan,
      // When stacked=true, all series share the same stack group
      ...(stacked ? { stack: 'total' } : {}),
      valueFormatter: tooltipFmt,
    }));
  }, [data, series, stacked, yAxisFormat]);

  // Don't render if no data — parent ChartWrapper handles empty state
  if (!data.length || !series.length) return null;

  /**
   * Axis configuration depends on layout direction.
   *
   * Vertical bars:   X = categories (band), Y = values
   * Horizontal bars: X = values, Y = categories (band)
   */
  const isHorizontal = layout === 'horizontal';
  const valueAxisFormatter = getAxisFormatter(yAxisFormat);

  const xAxisConfig = isHorizontal
    ? [
        {
          valueFormatter: valueAxisFormatter,
          tickNumber: 5,
          tickLabelStyle: {
            fill: COLORS.text.secondary,
            fontSize: 11,
          },
        },
      ]
    : [
        {
          data: categoryLabels,
          scaleType: 'band',
          tickLabelStyle: {
            fill: COLORS.text.secondary,
            fontSize: 11,
            // Rotate labels if there are many categories or long label names to prevent overlap
            ...(categoryLabels.length > 8 || categoryLabels.some((l) => l.length > 10)
              ? { angle: -35, textAnchor: 'end' }
              : {}),
          },
        },
      ];

  const yAxisConfig = isHorizontal
    ? [
        {
          data: categoryLabels,
          scaleType: 'band',
          tickLabelStyle: {
            fill: COLORS.text.secondary,
            fontSize: 11,
          },
        },
      ]
    : [
        {
          valueFormatter: valueAxisFormatter,
          tickLabelStyle: {
            fill: COLORS.text.secondary,
            fontSize: 12,
          },
        },
      ];

  // Increase left margin for horizontal layout to give room for category labels
  const leftMargin = isHorizontal ? 130 : 70;
  // Increase bottom margin when vertical labels will be rotated (long names or many categories)
  const needsRotation = !isHorizontal && (categoryLabels.length > 8 || categoryLabels.some((l) => l.length > 10));
  const bottomMargin = needsRotation ? 80 : 40;

  return (
    <BarChart
      height={height}
      series={chartSeries}
      xAxis={xAxisConfig}
      yAxis={yAxisConfig}
      layout={isHorizontal ? 'horizontal' : 'vertical'}
      grid={{
        // Grid lines along the value axis only
        horizontal: !isHorizontal,
        vertical: isHorizontal,
      }}
      margin={{ top: 20, right: 20, bottom: bottomMargin, left: leftMargin }}
      borderRadius={4}
      slots={stackTotalLabel && stacked ? { axisContent: StackedAxisTooltip } : undefined}
      slotProps={{
        ...(stackTotalLabel && stacked ? { axisContent: { stackTotalLabel, yAxisFormat } } : {}),
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
          // Hide legend if there's only one series (redundant with chart title)
          hidden: series.length <= 1,
        },
      }}
      sx={{
        // ── TRON DARK THEME ──
        backgroundColor: 'transparent',

        // Grid lines — barely visible
        '& .MuiChartsGrid-horizontalLine': {
          stroke: 'rgba(255, 255, 255, 0.04)',
          strokeDasharray: '4 4',
        },
        '& .MuiChartsGrid-verticalLine': {
          stroke: 'rgba(255, 255, 255, 0.04)',
          strokeDasharray: '4 4',
        },

        // Axis — minimal chrome
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

        // Bar styling — subtle gradient + neon glow on hover
        '& .MuiBarElement-root': {
          fillOpacity: 0.9,
          transition: 'fill-opacity 0.2s ease, filter 0.2s ease',
          rx: 4,
          maskImage: 'linear-gradient(to top, rgba(0,0,0,0.4) 0%, rgba(0,0,0,1) 100%)',
          WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,0.4) 0%, rgba(0,0,0,1) 100%)',
          '&:hover': {
            fillOpacity: 1,
            filter: 'brightness(1.3) drop-shadow(0 0 8px rgba(77, 212, 232, 0.3))',
            maskImage: 'none',
            WebkitMaskImage: 'none',
          },
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
      }}
    />
  );
}
