/**
 * CHART THEME DEFAULTS
 *
 * Shared configuration for all MUI X Charts components.
 * Import these defaults and spread/merge into chart props.
 */

import { COLORS } from './constants';

export const CHART_DEFAULTS = {
  height: 350,
  margin: { top: 20, right: 20, bottom: 40, left: 60 },
  colors: COLORS.chart,
};

// Axis styling applied to all charts
export const AXIS_DEFAULTS = {
  tickLabelStyle: {
    fill: COLORS.text.secondary,
    fontSize: 12,
    fontFamily: '"Inter", sans-serif',
  },
  lineStyle: {
    stroke: COLORS.border.default,
  },
  tickStyle: {
    stroke: COLORS.border.default,
  },
};

// Grid styling — subtle horizontal lines only
export const GRID_DEFAULTS = {
  horizontal: true,
  vertical: false,
};

// Tooltip styling
export const TOOLTIP_DEFAULTS = {
  sx: {
    backgroundColor: COLORS.bg.elevated,
    border: `1px solid ${COLORS.neon.cyan}`,
    borderRadius: 1,
    '& .MuiChartsTooltip-cell': {
      color: COLORS.text.primary,
    },
  },
};

/**
 * Get gradient definitions for SVG chart area fills.
 * Add these inside a <defs> block in chart SVG.
 *
 * @param {string} id - Unique gradient ID
 * @param {string} colorKey - Key from COLORS.gradients (e.g. 'cyan', 'green')
 * @returns {{ topColor: string, bottomColor: string }}
 */
export const getGradientColors = (colorKey) => {
  const gradient = COLORS.gradients[colorKey] || COLORS.gradients.cyan;
  return {
    topColor: gradient[0],
    bottomColor: gradient[1],
  };
};
