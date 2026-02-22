/**
 * COLOR UTILITIES — Single source of truth for color helpers.
 *
 * Consolidates hexToRgba (was in 4 files), COLOR_MAP (was in 3 chart files),
 * and resolveColor (was in TronPieChart).
 */

import { COLORS } from '../theme/constants';

/**
 * Converts a hex color string to an rgba() value.
 * @param {string} hex - Hex color (e.g. '#4DD4E8')
 * @param {number} alpha - Opacity (0-1)
 * @returns {string} rgba() string
 */
export function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Maps friendly color names to hex values from the neon palette.
 * Used by chart series config to resolve 'cyan' -> '#4DD4E8', etc.
 */
export const COLOR_MAP = {
  cyan: COLORS.neon.cyan,
  green: COLORS.neon.green,
  amber: COLORS.neon.amber,
  magenta: COLORS.neon.magenta,
  purple: COLORS.neon.purple,
  red: COLORS.neon.red,
  blue: COLORS.neon.blue,
  muted: COLORS.text.muted,
};

/**
 * Resolves a color prop to a hex value.
 * Accepts either a friendly name ('cyan') or a raw hex ('#4DD4E8').
 * Falls back to cycling through the COLORS.chart palette by index.
 *
 * @param {string} color - Friendly name or hex string
 * @param {number} [index=0] - Fallback index for the chart palette
 * @returns {string} Hex color value
 */
export function resolveColor(color, index = 0) {
  if (!color) return COLORS.chart[index % COLORS.chart.length];
  if (color.startsWith('#')) return color;
  return COLOR_MAP[color] || COLORS.chart[index % COLORS.chart.length];
}
