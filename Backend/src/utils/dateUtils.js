/**
 * DATE UTILITIES
 *
 * All dates in CloserMetrix are stored in UTC. These helpers handle
 * conversion, formatting, and timezone operations.
 *
 * IMPORTANT: The Calls table stores appointment_date as a STRING in ISO format
 * (legacy decision). These utilities work with that constraint.
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

module.exports = {
  nowISO,
  nowTimestamp,
  diffMinutes,
  isPast,
  durationMinutes,
};
