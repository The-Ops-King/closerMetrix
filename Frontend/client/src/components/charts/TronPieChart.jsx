/**
 * TronPieChart — Pie/donut chart with neon Tron styling.
 *
 * Used for:
 *   - Attendance breakdown (Show, Ghost, Reschedule, Cancel, No-Show)
 *   - Outcome breakdown (Closed, Follow-up, Lost, DQ)
 *   - One-call vs multi-call closes
 *   - Unresolved objections by type
 *
 * Built on MUI X Charts v7 <PieChart> component.
 * Uses a donut style by default (innerRadius > 0) for the modern look.
 *
 * Data format:
 *   data: [
 *     { label: 'Show', value: 73, color: 'green' },
 *     { label: 'No-Show', value: 12, color: 'red' },
 *     { label: 'Canceled', value: 8, color: 'amber' },
 *     { label: 'Rescheduled', value: 7, color: 'purple' },
 *   ]
 *
 * Colors are friendly names that map to the neon palette.
 * If a raw hex is passed (starts with '#'), it is used directly.
 */

import React, { useMemo } from 'react';
import { PieChart } from '@mui/x-charts/PieChart';
import { COLORS } from '../../theme/constants';
import { fmtNumber, fmtPercent } from '../../utils/formatters';
import { resolveColor } from '../../utils/colors';

/**
 * @param {Object} props
 * @param {Array<{label: string, value: number, color: string}>} props.data - Pie segments
 * @param {number} [props.height=300] - Chart height in pixels
 * @param {number} [props.innerRadius=60] - Inner radius for donut hole (0 = solid pie)
 * @param {boolean} [props.showLabels=true] - Whether to show the legend
 * @param {'bottom'|'left'|'right'} [props.legendPosition='bottom'] - Legend placement
 */
export default function TronPieChart({
  data = [],
  height = 300,
  innerRadius = 60,
  showLabels = true,
  legendPosition = 'bottom',
}) {
  /**
   * Compute the total value across all segments.
   * Used to calculate percentages in tooltips.
   */
  const total = useMemo(
    () => data.reduce((sum, d) => sum + (d.value || 0), 0),
    [data]
  );

  /**
   * Build MUI X Charts pie series configuration.
   *
   * PieChart expects series as an array with one element containing a `data` array.
   * Each data item has: { id, value, label, color }.
   *
   * The valueFormatter shows both the raw value and its percentage of total.
   */
  const pieData = useMemo(
    () =>
      data.map((d, i) => ({
        id: i,
        value: d.value || 0,
        label: d.label || `Segment ${i + 1}`,
        color: resolveColor(d.color, i),
      })),
    [data]
  );

  /**
   * Tooltip formatter — shows the value and its percentage of total.
   * e.g. "73 (54.1%)"
   */
  const valueFormatter = (item) => {
    const pct = total > 0 ? item.value / total : 0;
    return `${fmtNumber(item.value)} (${fmtPercent(pct)})`;
  };

  // Don't render if no data — parent ChartWrapper handles empty state
  if (!data.length) return null;

  // Legend + pie positioning based on legendPosition
  const isLeft = legendPosition === 'left';
  const isRight = legendPosition === 'right';
  const isSide = isLeft || isRight;

  const legendConfig = {
    hidden: !showLabels,
    direction: isSide ? 'column' : 'row',
    position: isSide
      ? { vertical: 'middle', horizontal: legendPosition }
      : { vertical: 'bottom', horizontal: 'middle' },
    padding: isSide ? { top: 0 } : { top: 20 },
    labelStyle: {
      fill: COLORS.text.secondary,
      fontSize: isSide ? 14 : 12,
    },
    itemMarkWidth: isSide ? 14 : 10,
    itemMarkHeight: isSide ? 14 : 10,
    markGap: isSide ? 8 : 5,
    itemGap: isSide ? 18 : 16,
  };

  const margin = isSide
    ? { top: 10, right: isRight ? 140 : 5, bottom: 10, left: isLeft ? 140 : 5 }
    : { top: 20, right: 10, bottom: showLabels ? 60 : 10, left: 10 };

  // Shift the pie away from the legend side so it stays centered in the remaining space
  const cx = '50%';

  return (
    <PieChart
      height={height}
      series={[
        {
          data: pieData,
          innerRadius: innerRadius,
          outerRadius: Math.min(height / 2 - 20, isSide ? height / 2 - 20 : 120),
          paddingAngle: 2,
          cornerRadius: 4,
          highlightScope: { fade: 'global', highlight: 'item' },
          faded: { additionalRadius: -5, color: 'gray' },
          valueFormatter: valueFormatter,
          cx,
          cy: '50%',
        },
      ]}
      margin={margin}
      slotProps={{
        legend: legendConfig,
      }}
      sx={{
        // ── TRON DARK THEME ──
        backgroundColor: 'transparent',

        // Pie segments — neon glow on hover
        '& .MuiPieArc-root': {
          strokeWidth: 1,
          stroke: COLORS.bg.primary,
          transition: 'filter 0.2s ease',
          '&:hover': {
            filter: 'brightness(1.4) drop-shadow(0 0 10px rgba(77, 212, 232, 0.4))',
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
