/**
 * TronRadarChart — Custom SVG radar/spider chart with Tron neon styling.
 *
 * One of the most visually striking charts in the dashboard.
 * Used on the Script Adherence page (Executive only) to show per-section
 * adherence scores in a radial layout. Can overlay multiple datasets
 * (e.g. "Team Average" vs "Top Performer") for comparison.
 *
 * Implementation:
 *   - Pure SVG, no external charting library dependency
 *   - Responsive via viewBox (scales to container width)
 *   - Concentric grid polygons at 25/50/75/100% of radius
 *   - Axis lines from center to each vertex
 *   - Neon-colored data polygons with glow filter
 *   - Scale labels on the top axis (0 → maxValue)
 *   - Legend below the chart with colored dots
 *
 * Props:
 *   axes: string[]           — Labels for each axis (e.g. ['Intro', 'Pain', ...])
 *   datasets: Array<{        — One polygon per dataset
 *     label: string,          —   Legend label (e.g. 'Team Average')
 *     values: number[],       —   One value per axis, in same order as axes
 *     color: string           —   Hex color for this dataset's polygon
 *   }>
 *   maxValue: number          — Max scale value (default 10, e.g. for 1-10 scoring)
 *   height: number            — SVG height in pixels (default 400)
 */

import React, { useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { COLORS } from '../../theme/constants';

/**
 * Calculate the (x, y) point for a given axis index and value.
 *
 * Axes are evenly distributed around the circle, starting from the top (12 o'clock).
 * The angle formula starts at -PI/2 (top) and goes clockwise.
 *
 * @param {number} axisIndex - Which axis (0-indexed)
 * @param {number} numAxes   - Total number of axes
 * @param {number} value     - Data value on this axis
 * @param {number} maxValue  - Max possible value (defines the outer ring)
 * @param {number} radius    - Pixel radius of the chart
 * @param {number} cx        - Center x
 * @param {number} cy        - Center y
 * @returns {{ x: number, y: number }}
 */
function getPoint(axisIndex, numAxes, value, maxValue, radius, cx, cy) {
  const angle = (2 * Math.PI * axisIndex) / numAxes - Math.PI / 2;
  const r = (value / maxValue) * radius;
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

/**
 * Build an SVG polygon points string from an array of { x, y } objects.
 *
 * @param {Array<{x: number, y: number}>} points
 * @returns {string} SVG points attribute value (e.g. "100,50 150,80 ...")
 */
function pointsToString(points) {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

export default function TronRadarChart({
  axes = [],
  datasets = [],
  maxValue = 10,
  height = 400,
}) {
  // Guard: nothing to render if no axes or datasets
  if (!axes.length || !datasets.length) {
    return null;
  }

  const numAxes = axes.length;

  // SVG layout constants — everything is computed from the viewBox dimensions.
  // We use a fixed viewBox so the chart scales responsively via width="100%".
  const viewBoxWidth = 500;
  const viewBoxHeight = height;
  const cx = viewBoxWidth / 2;

  // Reserve space: top for labels, bottom for legend
  const legendHeight = 40;
  const labelPadding = 50; // space outside the polygon for axis labels
  const topPadding = 30;

  // The chart center is offset slightly toward the top to leave room for the legend
  const chartAreaHeight = viewBoxHeight - legendHeight - topPadding;
  const cy = topPadding + chartAreaHeight / 2;

  // Radius is limited by the available space minus padding for labels
  const radius = Math.min(chartAreaHeight / 2, (viewBoxWidth / 2)) - labelPadding;

  /**
   * Pre-compute the grid ring polygons (concentric outlines at 25%, 50%, 75%, 100%).
   * Each ring is a regular polygon connecting points at the same fraction of radius on every axis.
   */
  const gridRings = useMemo(() => {
    const fractions = [0.25, 0.5, 0.75, 1.0];
    return fractions.map((frac) => {
      const points = [];
      for (let i = 0; i < numAxes; i++) {
        points.push(getPoint(i, numAxes, frac * maxValue, maxValue, radius, cx, cy));
      }
      return pointsToString(points);
    });
  }, [numAxes, maxValue, radius, cx, cy]);

  /**
   * Pre-compute axis line endpoints (from center to the outermost ring).
   */
  const axisEndpoints = useMemo(() => {
    return axes.map((_, i) => getPoint(i, numAxes, maxValue, maxValue, radius, cx, cy));
  }, [axes, numAxes, maxValue, radius, cx, cy]);

  /**
   * Pre-compute label positions — placed just outside the outermost ring.
   * An extra offset pushes labels away from the polygon so they don't overlap.
   */
  const labelPositions = useMemo(() => {
    const labelOffset = 18; // pixels beyond the outer ring
    return axes.map((_, i) => {
      const angle = (2 * Math.PI * i) / numAxes - Math.PI / 2;
      const r = radius + labelOffset;
      return {
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
      };
    });
  }, [axes, numAxes, radius, cx, cy]);

  /**
   * Pre-compute dataset polygon points.
   * Each dataset gets an array of (x,y) points and a polygon string.
   */
  const datasetPolygons = useMemo(() => {
    return datasets.map((ds) => {
      const points = axes.map((_, i) => {
        // Clamp value between 0 and maxValue to prevent drawing outside the chart
        const val = Math.max(0, Math.min(ds.values[i] || 0, maxValue));
        return getPoint(i, numAxes, val, maxValue, radius, cx, cy);
      });
      return {
        points,
        polygonStr: pointsToString(points),
        color: ds.color || COLORS.neon.cyan,
        label: ds.label,
      };
    });
  }, [datasets, axes, numAxes, maxValue, radius, cx, cy]);

  /**
   * Scale label values — shown along the top axis (12 o'clock direction).
   * We show labels at each grid ring: 25%, 50%, 75%, 100% of maxValue.
   */
  const scaleLabels = useMemo(() => {
    const fractions = [0.25, 0.5, 0.75, 1.0];
    return fractions.map((frac) => {
      const val = frac * maxValue;
      const point = getPoint(0, numAxes, val, maxValue, radius, cx, cy);
      return {
        value: val % 1 === 0 ? val.toString() : val.toFixed(1),
        x: point.x + 8, // offset right so it doesn't sit on the axis line
        y: point.y + 4,  // slight vertical adjustment for text baseline
      };
    });
  }, [maxValue, numAxes, radius, cx, cy]);

  /**
   * Determine text-anchor for each axis label based on its position.
   * Labels on the left side of the chart anchor "end", right side anchor "start",
   * and top/bottom anchor "middle" for clean alignment.
   */
  function getLabelAnchor(index) {
    const angle = (2 * Math.PI * index) / numAxes - Math.PI / 2;
    const cos = Math.cos(angle);
    // Threshold for "close to center" on horizontal axis
    if (Math.abs(cos) < 0.15) return 'middle';
    return cos > 0 ? 'start' : 'end';
  }

  /**
   * Adjust vertical alignment for labels at top and bottom of the chart.
   * Labels near the top get pushed up, labels near the bottom get pushed down.
   */
  function getLabelDy(index) {
    const angle = (2 * Math.PI * index) / numAxes - Math.PI / 2;
    const sin = Math.sin(angle);
    if (sin < -0.5) return '-0.3em';  // top labels — shift up
    if (sin > 0.5) return '1em';      // bottom labels — shift down
    return '0.35em';                    // side labels — vertically centered
  }

  return (
    <Box sx={{ width: '100%' }}>
      <svg
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        width="100%"
        height={height}
        style={{ overflow: 'visible' }}
      >
        {/* ── SVG DEFS: Glow filter for data points ── */}
        <defs>
          <filter id="radar-glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ── GRID RINGS: Concentric polygons at 25/50/75/100% ── */}
        {gridRings.map((ring, i) => (
          <polygon
            key={`ring-${i}`}
            points={ring}
            fill="none"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth={1}
          />
        ))}

        {/* ── AXIS LINES: From center to each vertex ── */}
        {axisEndpoints.map((endpoint, i) => (
          <line
            key={`axis-${i}`}
            x1={cx}
            y1={cy}
            x2={endpoint.x}
            y2={endpoint.y}
            stroke="rgba(255, 255, 255, 0.12)"
            strokeWidth={1}
          />
        ))}

        {/* ── SCALE LABELS: Values along the top axis ── */}
        {scaleLabels.map((sl, i) => (
          <text
            key={`scale-${i}`}
            x={sl.x}
            y={sl.y}
            fill={COLORS.text.muted}
            fontSize={10}
            textAnchor="start"
          >
            {sl.value}
          </text>
        ))}

        {/* ── AXIS LABELS: Category names outside the polygon ── */}
        {axes.map((label, i) => (
          <text
            key={`label-${i}`}
            x={labelPositions[i].x}
            y={labelPositions[i].y}
            fill={COLORS.text.secondary}
            fontSize={12}
            fontFamily="Inter, Roboto, Helvetica, sans-serif"
            textAnchor={getLabelAnchor(i)}
            dy={getLabelDy(i)}
          >
            {label}
          </text>
        ))}

        {/* ── DATA POLYGONS: One filled polygon per dataset ── */}
        {datasetPolygons.map((dp, di) => (
          <g key={`dataset-${di}`}>
            {/* Filled polygon area — semi-transparent fill with neon stroke */}
            <polygon
              points={dp.polygonStr}
              fill={dp.color}
              fillOpacity={0.15}
              stroke={dp.color}
              strokeWidth={2}
              strokeLinejoin="round"
              filter="url(#radar-glow)"
            />

            {/* Data point circles at each vertex — small dots with glow */}
            {dp.points.map((pt, pi) => (
              <circle
                key={`point-${di}-${pi}`}
                cx={pt.x}
                cy={pt.y}
                r={4}
                fill={dp.color}
                stroke={dp.color}
                strokeWidth={1}
                filter="url(#radar-glow)"
              />
            ))}
          </g>
        ))}

        {/* ── LEGEND: Colored dots + labels below the chart ── */}
        {datasets.length > 0 && (
          <g>
            {datasets.map((ds, di) => {
              // Distribute legend items evenly across the bottom
              const totalWidth = datasets.length * 140;
              const startX = cx - totalWidth / 2;
              const itemX = startX + di * 140;
              const legendY = viewBoxHeight - 10;

              return (
                <g key={`legend-${di}`}>
                  {/* Colored dot */}
                  <circle
                    cx={itemX}
                    cy={legendY}
                    r={5}
                    fill={ds.color || COLORS.neon.cyan}
                  />
                  {/* Label text */}
                  <text
                    x={itemX + 12}
                    y={legendY}
                    fill={COLORS.text.secondary}
                    fontSize={12}
                    fontFamily="Inter, Roboto, Helvetica, sans-serif"
                    dy="0.35em"
                  >
                    {ds.label}
                  </text>
                </g>
              );
            })}
          </g>
        )}
      </svg>
    </Box>
  );
}
