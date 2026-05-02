/**
 * DATE UTILITIES
 *
 * All dates in CloserMetrix are stored in UTC. These helpers handle
 * conversion, formatting, and timezone operations.
 *
 * NOTE: appointment_date is now a native TIMESTAMP in BigQuery.
 * The BigQuery Node SDK returns TIMESTAMP values as objects like
 * { value: '2026-02-16T15:00:00.000000Z' }. The toISO() helper
 * normalizes these (and plain strings/Date objects) to ISO strings.
 */

/**
 * Returns the current UTC timestamp as an ISO string.
 * Used for created/last_modified fields.
 *
 * @returns {string} ISO timestamp like '2026-02-16T15:30:00.000Z'
 */
function nowISO() {
  return new Date().toISOString();
}

/**
 * Returns the current UTC timestamp as a BigQuery TIMESTAMP-compatible string.
 *
 * @returns {string} Timestamp like '2026-02-16 15:30:00.000000 UTC'
 */
function nowTimestamp() {
  return new Date().toISOString().replace('T', ' ').replace('Z', ' UTC');
}

/**
 * Calculates the absolute difference in minutes between two ISO timestamps.
 * Used for transcript matching (30-minute tolerance window).
 *
 * @param {string} isoA — First ISO timestamp
 * @param {string} isoB — Second ISO timestamp
 * @returns {number} Absolute difference in minutes
 */
function diffMinutes(isoA, isoB) {
  const a = new Date(isoA).getTime();
  const b = new Date(isoB).getTime();
  return Math.abs(a - b) / (1000 * 60);
}

/**
 * Checks whether an appointment time has passed (is in the past).
 *
 * @param {string} appointmentDateISO — ISO timestamp of the appointment
 * @returns {boolean} true if the appointment time is in the past
 */
function isPast(appointmentDateISO) {
  return new Date(appointmentDateISO).getTime() < Date.now();
}

/**
 * Calculates duration in minutes from two ISO timestamps.
 *
 * @param {string} startISO — Start time
 * @param {string} endISO — End time
 * @returns {number} Duration in minutes (can be fractional)
 */
function durationMinutes(startISO, endISO) {
  const start = new Date(startISO).getTime();
  const end = new Date(endISO).getTime();
  return (end - start) / (1000 * 60);
}

/**
 * Normalizes a BigQuery TIMESTAMP value to an ISO string.
 * BigQuery SDK returns TIMESTAMP as { value: '...' } objects.
 * This also handles plain strings, Date objects, and null/undefined.
 *
 * @param {*} val — BigQuery TIMESTAMP object, string, Date, or null
 * @returns {string} ISO string, or '' if null/undefined
 */
function toISO(val) {
  if (!val) return '';
  if (typeof val === 'object' && val !== null && val.value) {
    return String(val.value);
  }
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

/**
 * Returns a `YYYY-MM-DD` date string for the given moment in the given IANA
 * timezone. Used when persisting calendar-day fields (e.g. `date_closed`,
 * `last_payment_date`) that should reflect the *client's* local day, not UTC.
 *
 * If `val` is omitted, uses now. If `val` is already a plain `YYYY-MM-DD`
 * string, it's returned unchanged (no timezone interpretation possible).
 * Falls back to UTC if `timezone` is missing or invalid.
 *
 * @param {string} timezone — IANA tz like 'America/New_York' (default: 'UTC')
 * @param {Date|string} [val] — Date, ISO string, or omit for now
 * @returns {string} Date in `YYYY-MM-DD` form
 */
function dateInTimezone(timezone, val) {
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const date = val ? new Date(val) : new Date();
  if (isNaN(date.getTime())) return new Date().toISOString().split('T')[0];
  const tz = timezone || 'UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return date.toISOString().split('T')[0];
  }
}

module.exports = {
  nowISO,
  nowTimestamp,
  diffMinutes,
  isPast,
  durationMinutes,
  toISO,
  dateInTimezone,
};
