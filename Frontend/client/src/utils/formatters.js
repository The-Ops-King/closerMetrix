/**
 * NUMBER FORMATTERS
 *
 * Consistent formatting for metrics displayed in scorecards, charts, and tables.
 * Ported from the existing goals/projections apps and standardized.
 */

/**
 * Format a number as currency (e.g. "$12,345").
 * @param {number} n - The number to format
 * @param {boolean} [showCents=false] - Whether to show cents
 * @returns {string}
 */
export function fmtDollar(n, showCents = false) {
  if (n == null || isNaN(n)) return '$0';
  return '$' + Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  });
}

/**
 * Format a decimal as percentage (e.g. 0.73 → "73.0%").
 * @param {number} n - Decimal value (0-1 scale)
 * @param {number} [decimals=1] - Number of decimal places
 * @returns {string}
 */
export function fmtPercent(n, decimals = 1) {
  if (n == null || isNaN(n) || !isFinite(n)) return '\u2014'; // em-dash
  return (n * 100).toFixed(decimals) + '%';
}

/**
 * Format a plain number with commas (e.g. 1234 → "1,234").
 * @param {number} n
 * @param {number} [decimals=0]
 * @returns {string}
 */
export function fmtNumber(n, decimals = 0) {
  if (n == null || isNaN(n)) return '0';
  return Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format a score (e.g. 7.3 → "7.3").
 * @param {number} n
 * @returns {string}
 */
export function fmtScore(n) {
  if (n == null || isNaN(n)) return '\u2014';
  return n.toFixed(1);
}

/**
 * Format a number with a +/- sign prefix (e.g. +$1,234 or -3).
 * Used for delta indicators.
 * @param {number} n
 * @param {boolean} [isDollar=false]
 * @returns {string}
 */
export function fmtDelta(n, isDollar = false) {
  if (n == null || isNaN(n)) return '\u2014';
  const abs = Math.abs(Math.round(n));
  const formatted = abs.toLocaleString('en-US');
  if (n === 0) return isDollar ? '$0' : '0';
  if (isDollar) {
    return n > 0 ? `+$${formatted}` : `-$${formatted}`;
  }
  return n > 0 ? `+${formatted}` : `-${formatted}`;
}

/**
 * Format a decimal minutes value as "Xm Ys" (e.g. 18.7 → "18m 42s").
 * @param {number} n - Minutes as a decimal
 * @returns {string}
 */
export function fmtDuration(n) {
  if (n == null || isNaN(n)) return '\u2014';
  const mins = Math.floor(n);
  const secs = Math.round((n - mins) * 60);
  return `${mins}m ${secs}s`;
}

/**
 * Format a metric value based on its format type.
 * Used by Scorecard component to auto-format based on metric definition.
 * @param {number} value
 * @param {'percent'|'currency'|'number'|'score'|'decimal'|'duration'} format
 * @returns {string}
 */
export function formatMetric(value, format) {
  switch (format) {
    case 'percent': return fmtPercent(value);
    case 'currency': return fmtDollar(value);
    case 'number': return fmtNumber(value);
    case 'score': return fmtScore(value);
    case 'decimal': return fmtNumber(value, 1);
    case 'duration': return fmtDuration(value);
    default: return String(value ?? '\u2014');
  }
}

// ── CHART AXIS & TOOLTIP FORMATTERS ──
// Consolidated from TronLineChart + TronBarChart.

/**
 * Returns a tick label formatter for chart Y-axis values.
 * Abbreviates large numbers for readability (e.g. "$12K", "1.5M").
 *
 * @param {'percent'|'currency'|'number'} format
 * @returns {function} Formatter function for axis tick labels
 */
export function getAxisFormatter(format) {
  switch (format) {
    case 'percent':
      return (value) => fmtPercent(value, 0);
    case 'currency':
      return (value) => {
        if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
        if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
        return fmtDollar(value);
      };
    case 'number':
    default:
      return (value) => {
        if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
        if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
        return fmtNumber(value);
      };
  }
}

/**
 * Returns a tooltip value formatter for chart hover values.
 * Full precision (not abbreviated like axis ticks).
 *
 * @param {'percent'|'currency'|'number'} format
 * @returns {function} Formatter function for tooltip values
 */
export function getTooltipFormatter(format) {
  switch (format) {
    case 'percent':
      return (value) => fmtPercent(value);
    case 'currency':
      return (value) => fmtDollar(value);
    case 'number':
    default:
      return (value) => fmtNumber(value);
  }
}

/**
 * Formats a Date object as 'MMM D' (e.g. "Jan 6").
 * Used for X-axis tick labels on time-series charts.
 *
 * @param {Date} date - Date object to format
 * @returns {string} Formatted date label
 */
export function formatDateLabel(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}
