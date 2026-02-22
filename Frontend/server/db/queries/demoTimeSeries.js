/**
 * SHARED DEMO TIME-SERIES GENERATOR
 *
 * Used by all dashboard query files to generate filter-aware demo data.
 * Auto-selects granularity based on date range span so charts show
 * appropriate density for the selected period.
 *
 * Granularity logic:
 *   <= 10 days  → daily    (1 point/day)
 *   <= 45 days  → biDaily  (1 point/2 days)  — covers "This Month"
 *   <= 120 days → weekly   (1 point/week)
 *   > 120 days  → monthly  (1 point/30 days)
 */

/**
 * Compute smart granularity (step size in days) based on date range.
 *
 * @param {string} dateStart - ISO date string (YYYY-MM-DD)
 * @param {string} dateEnd - ISO date string
 * @returns {{ intervalDays: number, label: string }}
 */
function computeGranularity(dateStart, dateEnd) {
  if (!dateStart || !dateEnd) return { intervalDays: 7, label: 'weekly' };
  const start = new Date(dateStart);
  const end = new Date(dateEnd);
  const days = Math.round((end - start) / (1000 * 60 * 60 * 24));

  if (days <= 10) return { intervalDays: 1, label: 'daily' };
  if (days <= 45) return { intervalDays: 2, label: 'biDaily' };
  if (days <= 120) return { intervalDays: 7, label: 'weekly' };
  return { intervalDays: 30, label: 'monthly' };
}

/**
 * Generate time-series demo data that respects the selected date range.
 * Adjusts point density automatically based on range duration.
 *
 * @param {object} filters - { dateStart, dateEnd } (other keys ignored)
 * @param {Array} seriesDefs - [{ key, base, variance }]
 * @returns {Array<object>} [{ date, ...seriesValues }]
 */
function generateTimeSeries(filters, seriesDefs) {
  const { dateStart, dateEnd } = filters || {};
  const { intervalDays } = computeGranularity(dateStart, dateEnd);

  const end = dateEnd ? new Date(dateEnd) : new Date();
  const start = dateStart ? new Date(dateStart) : new Date(end.getTime() - 56 * 24 * 60 * 60 * 1000);
  const totalDays = Math.round((end - start) / (1000 * 60 * 60 * 24));

  const data = [];
  const current = new Date(start);
  let i = 0;

  while (current <= end) {
    const point = { date: current.toISOString().split('T')[0] };
    const progress = totalDays > 0 ? i / Math.max(totalDays / intervalDays, 1) : 0;

    for (const { key, base, variance } of seriesDefs) {
      // Slight upward trend + random noise for realistic look
      const trendFactor = 1 + progress * 0.08;
      const noise = (Math.random() - 0.5) * 2 * variance;
      const value = base * trendFactor + noise;
      // Round to 3 decimals for rates (base < 1), whole numbers for counts/dollars
      point[key] = base < 1 ? Math.round(value * 1000) / 1000 : Math.max(0, Math.round(value));
    }

    data.push(point);
    current.setDate(current.getDate() + intervalDays);
    i++;
  }

  return data;
}

module.exports = { generateTimeSeries, computeGranularity };
