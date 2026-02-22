/**
 * CALLS QUERIES
 *
 * Parameterized BigQuery queries for the Calls table.
 * Every query that returns client-scoped data includes client_id in the WHERE clause.
 */

const bq = require('../BigQueryClient');

const CALLS_TABLE = bq.table('Calls');

module.exports = {
  /**
   * Finds an existing call record by appointment_id and client_id.
   * Used for duplicate detection and calendar event updates.
   *
   * @param {string} appointmentId — Calendar event ID
   * @param {string} clientId — Client this call belongs to
   * @returns {Object|null} Most recent matching call record or null
   */
  async findByAppointmentId(appointmentId, clientId) {
    const rows = await bq.query(
      `SELECT * FROM ${CALLS_TABLE}
       WHERE appointment_id = @appointmentId AND client_id = @clientId
       ORDER BY created DESC
       LIMIT 1`,
      { appointmentId, clientId }
    );
    return rows.length > 0 ? rows[0] : null;
  },

  /**
   * Finds a call record by call_id and client_id.
   *
   * @param {string} callId — The call's UUID
   * @param {string} clientId — Client this call belongs to
   * @returns {Object|null} Call record or null
   */
  async findById(callId, clientId) {
    const rows = await bq.query(
      `SELECT * FROM ${CALLS_TABLE}
       WHERE call_id = @callId AND client_id = @clientId
       LIMIT 1`,
      { callId, clientId }
    );
    return rows.length > 0 ? rows[0] : null;
  },

  /**
   * Finds calls awaiting transcript match by closer email and time window.
   * Used by TranscriptService to match incoming transcripts to existing call records.
   *
   * @param {string} clientId — Client scope
   * @param {string} closerEmail — Closer's work email
   * @param {string} scheduledStartTime — ISO timestamp of the scheduled call
   * @param {number} toleranceMinutes — How far off the time can be (default 30)
   * @returns {Object|null} Matching call record or null
   */
  async findForTranscriptMatch(clientId, closerEmail, scheduledStartTime, toleranceMinutes = 30) {
    const rows = await bq.query(
      `SELECT c.* FROM ${CALLS_TABLE} c
       JOIN ${bq.table('Closers')} cl ON c.closer_id = cl.closer_id
       WHERE c.client_id = @clientId
         AND cl.work_email = @closerEmail
         AND (c.attendance IS NULL OR c.attendance IN ('Scheduled', 'No Recording', 'Waiting for Outcome'))
         AND ABS(TIMESTAMP_DIFF(
               SAFE.PARSE_TIMESTAMP('%Y-%m-%dT%H:%M:%E*SZ', c.appointment_date),
               TIMESTAMP(@scheduledStartTime),
               MINUTE
             )) <= @toleranceMinutes
       ORDER BY c.appointment_date DESC
       LIMIT 1`,
      { clientId, closerEmail, scheduledStartTime, toleranceMinutes }
    );
    return rows.length > 0 ? rows[0] : null;
  },

  /**
   * Finds calls awaiting transcript match including prospect email.
   * Higher-confidence match than findForTranscriptMatch.
   */
  async findForTranscriptMatchWithProspect(clientId, closerEmail, prospectEmail, scheduledStartTime, toleranceMinutes = 30) {
    const rows = await bq.query(
      `SELECT c.* FROM ${CALLS_TABLE} c
       JOIN ${bq.table('Closers')} cl ON c.closer_id = cl.closer_id
       WHERE c.client_id = @clientId
         AND cl.work_email = @closerEmail
         AND c.prospect_email = @prospectEmail
         AND (c.attendance IS NULL OR c.attendance IN ('Scheduled', 'No Recording', 'Waiting for Outcome'))
         AND ABS(TIMESTAMP_DIFF(
               SAFE.PARSE_TIMESTAMP('%Y-%m-%dT%H:%M:%E*SZ', c.appointment_date),
               TIMESTAMP(@scheduledStartTime),
               MINUTE
             )) <= @toleranceMinutes
       ORDER BY c.appointment_date DESC
       LIMIT 1`,
      { clientId, closerEmail, prospectEmail, scheduledStartTime, toleranceMinutes }
    );
    return rows.length > 0 ? rows[0] : null;
  },

  /**
   * Counts prior "Show" calls for a prospect under a given client.
   * Used to determine call_type (First Call vs Follow Up).
   *
   * @param {string} prospectEmail — Prospect's email
   * @param {string} clientId — Client scope
   * @returns {number} Number of prior Show calls
   */
  async countPriorShows(prospectEmail, clientId) {
    const rows = await bq.query(
      `SELECT COUNT(*) as show_count
       FROM ${CALLS_TABLE}
       WHERE prospect_email = @prospectEmail
         AND client_id = @clientId
         AND attendance IN ('Show', 'Follow Up', 'Lost', 'Closed - Won', 'Deposit', 'Disqualified', 'Not Pitched')`,
      { prospectEmail, clientId }
    );
    return rows[0].show_count;
  },

  /**
   * Finds the most recent call for a prospect that was actually held (Show or any post-Show state).
   * Used by PaymentService to link payments to the originating call.
   *
   * After AI processing, attendance transitions from 'Show' to the outcome
   * (Follow Up, Lost, Closed - Won, etc.), so we match all post-Show states.
   */
  async findMostRecentShowForProspect(prospectEmail, clientId) {
    const rows = await bq.query(
      `SELECT * FROM ${CALLS_TABLE}
       WHERE prospect_email = @prospectEmail
         AND client_id = @clientId
         AND attendance IN ('Show', 'Follow Up', 'Lost', 'Closed - Won', 'Deposit', 'Disqualified', 'Not Pitched')
       ORDER BY appointment_date DESC
       LIMIT 1`,
      { prospectEmail, clientId }
    );
    return rows.length > 0 ? rows[0] : null;
  },

  /**
   * Finds calls stuck in 'Scheduled' state past their end time.
   * Used by TimeoutService to detect ghost/no-recording calls.
   *
   * Uses appointment_end_date (the event's scheduled end time) for the
   * comparison. Falls back to appointment_date + 1 hour for legacy records
   * that don't have an end time stored.
   *
   * @param {string} clientId — Client scope
   * @param {string} cutoffTimestamp — ISO timestamp; calls ending before this are "stuck"
   * @returns {Array} Array of stuck call records
   */
  async findStuckScheduled(clientId, cutoffTimestamp) {
    return bq.query(
      `SELECT * FROM ${CALLS_TABLE}
       WHERE client_id = @clientId
         AND attendance = 'Scheduled'
         AND COALESCE(appointment_end_date, appointment_date) < @cutoffTimestamp
       ORDER BY appointment_date ASC`,
      { clientId, cutoffTimestamp }
    );
  },

  /**
   * Finds ALL calls stuck in 'Scheduled' state past their end time,
   * across all clients. Used by TimeoutService background job.
   *
   * Uses appointment_end_date for accurate "is the call over?" detection.
   * Falls back to appointment_date for legacy records without end time.
   *
   * @param {string} cutoffTimestamp — ISO timestamp; calls ending before this are "stuck"
   * @returns {Array} Array of call records with client_id for proper scoping
   */
  async findAllStuckScheduled(cutoffTimestamp) {
    return bq.query(
      `SELECT * FROM ${CALLS_TABLE}
       WHERE attendance = 'Scheduled'
         AND COALESCE(appointment_end_date, appointment_date) < @cutoffTimestamp
       ORDER BY appointment_date ASC`,
      { cutoffTimestamp }
    );
  },

  /**
   * PHASE 1: Finds calls with null/Scheduled attendance whose appointment
   * end time has passed. These get transitioned to 'Waiting for Outcome'.
   *
   * Cutoff = now (no offset — trigger as soon as end time passes)
   *
   * @param {string} cutoffTimestamp — ISO timestamp (typically now)
   * @returns {Array} Array of call records to transition
   */
  async findPendingPastEndTime(cutoffTimestamp) {
    return bq.query(
      `SELECT * FROM ${CALLS_TABLE}
       WHERE (attendance IS NULL OR attendance = 'Scheduled')
         AND COALESCE(appointment_end_date, appointment_date) < @cutoffTimestamp
       ORDER BY appointment_date ASC`,
      { cutoffTimestamp }
    );
  },

  /**
   * PHASE 1 (per-client): Same as findPendingPastEndTime but scoped to one client.
   */
  async findPendingPastEndTimeForClient(clientId, cutoffTimestamp) {
    return bq.query(
      `SELECT * FROM ${CALLS_TABLE}
       WHERE client_id = @clientId
         AND (attendance IS NULL OR attendance = 'Scheduled')
         AND COALESCE(appointment_end_date, appointment_date) < @cutoffTimestamp
       ORDER BY appointment_date ASC`,
      { clientId, cutoffTimestamp }
    );
  },

  /**
   * PHASE 2: Finds calls in 'Waiting for Outcome' whose appointment end time
   * is past the timeout threshold. These get transitioned to 'Ghosted - No Show'.
   *
   * Cutoff = now - timeoutMinutes
   *
   * @param {string} cutoffTimestamp — ISO timestamp (now - timeout window)
   * @returns {Array} Array of call records to transition
   */
  async findWaitingPastTimeout(cutoffTimestamp) {
    return bq.query(
      `SELECT * FROM ${CALLS_TABLE}
       WHERE attendance = 'Waiting for Outcome'
         AND COALESCE(appointment_end_date, appointment_date) < @cutoffTimestamp
       ORDER BY appointment_date ASC`,
      { cutoffTimestamp }
    );
  },

  /**
   * PHASE 2 (per-client): Same as findWaitingPastTimeout but scoped to one client.
   */
  async findWaitingPastTimeoutForClient(clientId, cutoffTimestamp) {
    return bq.query(
      `SELECT * FROM ${CALLS_TABLE}
       WHERE client_id = @clientId
         AND attendance = 'Waiting for Outcome'
         AND COALESCE(appointment_end_date, appointment_date) < @cutoffTimestamp
       ORDER BY appointment_date ASC`,
      { clientId, cutoffTimestamp }
    );
  },

  /**
   * Finds calls for the same closer that overlap in time with a given call.
   * Used to detect double-booking — when a closer takes one call, the other
   * overlapping calls should be marked as 'Overbooked'.
   *
   * Two time ranges overlap when: start1 < end2 AND end1 > start2
   *
   * Only returns calls in pre-outcome or Ghosted state (states that can
   * transition to Overbooked).
   *
   * @param {string} closerId — The closer who is double-booked
   * @param {string} clientId — Client scope
   * @param {string} excludeCallId — The call that WAS taken (don't mark it as overbooked)
   * @param {string} startTime — Start time of the taken call (ISO string)
   * @param {string} endTime — End time of the taken call (ISO string)
   * @returns {Array} Array of overlapping call records
   */
  async findOverlappingPreOutcomeCalls(closerId, clientId, excludeCallId, startTime, endTime) {
    return bq.query(
      `SELECT * FROM ${CALLS_TABLE}
       WHERE closer_id = @closerId
         AND client_id = @clientId
         AND call_id != @excludeCallId
         AND (attendance IS NULL OR attendance IN ('Scheduled', 'Waiting for Outcome', 'Ghosted - No Show'))
         AND appointment_date < @endTime
         AND COALESCE(appointment_end_date, appointment_date) > @startTime`,
      { closerId, clientId, excludeCallId, startTime, endTime }
    );
  },

  /**
   * Finds calls in 'Waiting for Outcome' for a specific closer.
   * Used by Fathom polling to match recordings to waiting calls.
   *
   * Returns calls that:
   * - Belong to the closer (by closer_id)
   * - Are in pre-outcome state (Waiting for Outcome, null, or Scheduled)
   * - Don't already have a transcript
   *
   * @param {string} closerId — The closer to find calls for
   * @param {string} clientId — Client scope
   * @returns {Array} Array of call records waiting for transcripts
   */
  async findWaitingForTranscript(closerId, clientId) {
    return bq.query(
      `SELECT * FROM ${CALLS_TABLE}
       WHERE closer_id = @closerId
         AND client_id = @clientId
         AND (attendance IS NULL OR attendance IN ('Scheduled', 'Waiting for Outcome'))
         AND (transcript_status IS NULL OR transcript_status IN ('Pending', 'No Transcript'))
       ORDER BY appointment_date DESC`,
      { closerId, clientId }
    );
  },

  /**
   * Finds all calls with processing errors. Used for diagnostics.
   */
  async findErrored(clientId) {
    return bq.query(
      `SELECT * FROM ${CALLS_TABLE}
       WHERE client_id = @clientId
         AND processing_status = 'error'
       ORDER BY last_modified DESC`,
      { clientId }
    );
  },

  /**
   * Inserts a new call record.
   */
  async create(callData) {
    await bq.insert('Calls', callData);
    return callData;
  },

  /**
   * Updates fields on an existing call record.
   */
  async update(callId, clientId, updates) {
    return bq.update('Calls', {
      ...updates,
      last_modified: new Date().toISOString(),
    }, { call_id: callId, client_id: clientId });
  },
};
