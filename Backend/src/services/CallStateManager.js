/**
 * CALL STATE MANAGER — THE CORE
 *
 * Manages the lifecycle state machine for every call record.
 * This is the central decision-maker for what happens when calendar events,
 * transcripts, payments, and timeouts arrive.
 *
 * Responsibilities:
 * 1. State transitions — validates and executes state changes
 * 2. Duplicate detection — handles same appointment_id arriving multiple times
 * 3. Call type determination — First Call vs Follow Up based on prospect history
 * 4. Record creation — creates new call records with all required fields
 * 5. Record updates — updates existing records (time changes, state changes)
 *
 * Every state transition is audit-logged with before/after values.
 */

const callQueries = require('../db/queries/calls');
const closerQueries = require('../db/queries/closers');
const auditLogger = require('../utils/AuditLogger');
const { generateId } = require('../utils/idGenerator');
const { nowISO } = require('../utils/dateUtils');
const logger = require('../utils/logger');

/**
 * Valid state transitions — key is current state, value is array of valid
 * next states with their triggers. If a transition is not listed here,
 * it is INVALID and will be logged as an error.
 */
const STATE_TRANSITIONS = {
  // New calls start with attendance: null (blank on dashboard)
  'null': [
    { to: 'Canceled',            trigger: 'calendar_cancelled_or_deleted_or_declined' },
    { to: 'Rescheduled',         trigger: 'calendar_moved_and_not_yet_held' },
    { to: 'Show',                trigger: 'transcript_received_valid' },
    { to: 'Ghosted - No Show',   trigger: 'transcript_received_empty_or_one_speaker' },
    { to: 'Waiting for Outcome', trigger: 'appointment_time_passed' },
    { to: 'No Recording',        trigger: 'system_recording_failure' },
    { to: 'Overbooked',          trigger: 'closer_double_booked' },
  ],
  // Legacy — existing records may still have 'Scheduled' attendance
  'Scheduled': [
    { to: 'Canceled',            trigger: 'calendar_cancelled_or_deleted_or_declined' },
    { to: 'Rescheduled',         trigger: 'calendar_moved_and_not_yet_held' },
    { to: 'Show',                trigger: 'transcript_received_valid' },
    { to: 'Ghosted - No Show',   trigger: 'transcript_received_empty_or_one_speaker' },
    { to: 'Ghosted - No Show',   trigger: 'transcript_timeout' },
    { to: 'Waiting for Outcome', trigger: 'appointment_time_passed' },
    { to: 'No Recording',        trigger: 'system_recording_failure' },
    { to: 'Overbooked',          trigger: 'closer_double_booked' },
  ],
  // Appointment end time passed — waiting for transcript or timeout
  'Waiting for Outcome': [
    { to: 'Canceled',            trigger: 'calendar_cancelled_or_deleted_or_declined' },
    { to: 'Show',                trigger: 'transcript_received_valid' },
    { to: 'Ghosted - No Show',   trigger: 'transcript_timeout' },
    { to: 'Ghosted - No Show',   trigger: 'transcript_received_empty_or_one_speaker' },
    { to: 'No Recording',        trigger: 'system_recording_failure' },
    { to: 'Overbooked',          trigger: 'closer_double_booked' },
  ],
  'No Recording': [
    { to: 'Show',               trigger: 'transcript_received_valid' },
    { to: 'Ghosted - No Show',  trigger: 'transcript_received_empty' },
  ],
  'Ghosted - No Show': [
    { to: 'Show',               trigger: 'transcript_reprocessed' },
    { to: 'Overbooked',         trigger: 'closer_double_booked' },
  ],
  'Show': [
    { to: 'Closed - Won',       trigger: 'ai_outcome' },
    { to: 'Deposit',            trigger: 'ai_outcome' },
    { to: 'Follow Up',          trigger: 'ai_outcome' },
    { to: 'Lost',               trigger: 'ai_outcome' },
    { to: 'Disqualified',       trigger: 'ai_outcome' },
    { to: 'Not Pitched',        trigger: 'ai_outcome' },
  ],
  'Follow Up': [
    { to: 'Closed - Won',       trigger: 'payment_received' },
  ],
  'Lost': [
    { to: 'Closed - Won',       trigger: 'payment_received' },
    { to: 'Follow Up',          trigger: 'new_call_scheduled' },
  ],
  'Not Pitched': [
    { to: 'Follow Up',          trigger: 'new_call_scheduled' },
    { to: 'Closed - Won',       trigger: 'payment_received' },
  ],
  'Rescheduled': [
    { to: 'Canceled',           trigger: 'calendar_cancelled_or_deleted_or_declined' },
  ],
  'Canceled': [],
  'Closed - Won': [],
  'Deposit': [
    { to: 'Closed - Won',       trigger: 'payment_received_full' },
  ],
  // Closer was double-booked and took another call during this slot.
  // Recoverable if a transcript arrives (call was actually attended).
  'Overbooked': [
    { to: 'Show',               trigger: 'transcript_received_valid' },
    { to: 'Canceled',           trigger: 'calendar_cancelled_or_deleted_or_declined' },
  ],
};

class CallStateManager {
  /**
   * Handles an incoming calendar event. This is the main entry point for
   * the calendar pipeline.
   *
   * Determines whether to create a new record, update an existing one,
   * or skip (duplicate webhook).
   *
   * @param {Object} event — StandardCalendarEvent from the adapter
   * @param {string} clientId — Client this event belongs to
   * @param {Object} closer — Closer record from BigQuery
   * @returns {Object} { action: 'created'|'updated'|'skipped'|'canceled', callRecord }
   */
  async handleCalendarEvent(event, clientId, closer, filterWord = '') {
    const { eventId, eventType, startTime, status } = event;

    // Check for existing record with this appointment_id
    const dedup = await this._handleDeduplication(eventId, clientId, startTime, status, event, closer);

    switch (dedup.action) {
      case 'skip':
        logger.debug('Skipping duplicate calendar webhook', { eventId, clientId });
        return { action: 'skipped', callRecord: dedup.existingRecord };

      case 'update':
        return this._updateExistingCall(dedup.existingRecord, event, clientId, closer, filterWord);

      case 'cancel':
        return this._cancelCall(dedup.existingRecord, event, clientId);

      case 'create_new':
        return this._createNewCall(event, clientId, closer, dedup.existingRecord, filterWord);

      default:
        logger.error('Unknown dedup action', { action: dedup.action, eventId });
        return { action: 'error', callRecord: null };
    }
  }

  /**
   * Transitions a call record to a new state.
   *
   * Validates the transition against STATE_TRANSITIONS, updates the record,
   * and writes an audit log entry.
   *
   * @param {string} callId — Call to transition
   * @param {string} clientId — Client scope
   * @param {string} newState — Target attendance state
   * @param {string} trigger — What caused this transition
   * @param {Object} [additionalUpdates] — Extra fields to update alongside the state change
   * @returns {boolean} true if transition was valid and applied
   */
  async transitionState(callId, clientId, newState, trigger, additionalUpdates = {}) {
    const call = await callQueries.findById(callId, clientId);
    if (!call) {
      logger.error('Cannot transition — call not found', { callId, clientId });
      return false;
    }

    const currentState = call.attendance;

    // Validate the transition
    if (!this._isValidTransition(currentState, newState, trigger)) {
      logger.error('Invalid state transition', {
        callId,
        clientId,
        currentState,
        newState,
        trigger,
      });

      await auditLogger.log({
        clientId,
        entityType: 'call',
        entityId: callId,
        action: 'error',
        fieldChanged: 'attendance',
        oldValue: currentState,
        newValue: newState,
        triggerSource: trigger,
        metadata: { error: 'Invalid state transition' },
      });

      return false;
    }

    // Apply the transition
    const updates = {
      attendance: newState,
      ...additionalUpdates,
    };

    await callQueries.update(callId, clientId, updates);

    // Audit log the state change
    await auditLogger.log({
      clientId,
      entityType: 'call',
      entityId: callId,
      action: 'state_change',
      fieldChanged: 'attendance',
      oldValue: currentState,
      newValue: newState,
      triggerSource: trigger,
    });

    logger.info('Call state transitioned', {
      callId,
      clientId,
      from: currentState,
      to: newState,
      trigger,
    });

    // When a call transitions to 'Show', check if the closer has other
    // overlapping calls that should be marked as 'Overbooked'.
    if (newState === 'Show') {
      try {
        await this._markOverlappedCalls(call);
      } catch (error) {
        // Don't fail the Show transition if overlap check fails
        logger.error('Failed to check for overlapping calls', {
          callId,
          clientId,
          error: error.message,
        });
      }
    }

    return true;
  }

  /**
   * Determines call type (First Call vs Follow Up) based on prospect history.
   *
   * @param {string} prospectEmail — Prospect's email address
   * @param {string} clientId — Client scope
   * @returns {string} 'First Call' or 'Follow Up'
   */
  async determineCallType(prospectEmail, clientId) {
    if (!prospectEmail || prospectEmail === 'unknown') {
      return 'First Call';
    }

    const priorShows = await callQueries.countPriorShows(prospectEmail, clientId);
    return priorShows > 0 ? 'Follow Up' : 'First Call';
  }

  /**
   * DUPLICATE DETECTION & CALENDAR EVENT ID HANDLING
   *
   * Handles the three scenarios described in CLAUDE.md:
   *
   * SCENARIO A: Event moved BEFORE the call happened
   *   → Update existing record's appointment_date
   *
   * SCENARIO B: Event moved AFTER the call happened (follow-up reuse)
   *   → Create a new call record
   *
   * SCENARIO C: Exact duplicate webhook
   *   → Skip
   *
   * Also handles: event cancelled/deleted
   */
  async _handleDeduplication(appointmentId, clientId, newStartTime, eventStatus, event, closer) {
    const existing = await callQueries.findByAppointmentId(appointmentId, clientId);

    // No existing record — brand new call
    if (!existing) {
      // Check if the event is already cancelled (no point creating a record)
      if (eventStatus === 'cancelled' || event.eventType === 'cancelled') {
        return { action: 'skip', existingRecord: null };
      }
      return { action: 'create_new', existingRecord: null };
    }

    // Event is cancelled/deleted — cancel the existing record
    if (eventStatus === 'cancelled' || event.eventType === 'cancelled') {
      return { action: 'cancel', existingRecord: existing };
    }

    // Check for declined attendees
    if (event.declinedAttendees && event.declinedAttendees.length > 0) {
      return { action: 'cancel', existingRecord: existing };
    }

    // Existing call has been held (Show + outcome) — this is a follow-up reuse
    if (existing.attendance === 'Show' && existing.call_outcome) {
      return { action: 'create_new', existingRecord: existing };
    }

    // Call is still pre-outcome (null, Scheduled, or Waiting for Outcome) — check if time, attendees, or title changed
    if (this._isPreOutcome(existing.attendance)) {
      const dateChanged = existing.appointment_date !== newStartTime;
      const prospectChanged = this._hasProspectChanged(existing, event, closer);

      if (dateChanged || prospectChanged) {
        return { action: 'update', existingRecord: existing };
      }
      // Same date, same prospect — duplicate webhook
      return { action: 'skip', existingRecord: existing };
    }

    // Already Canceled or Rescheduled — but event is now confirmed?
    // This could be a re-confirmation after cancel. Create new.
    if (existing.attendance === 'Canceled' || existing.attendance === 'Rescheduled') {
      return { action: 'create_new', existingRecord: existing };
    }

    // For Ghosted, No Recording — if date is different, create new
    if (existing.appointment_date !== newStartTime) {
      return { action: 'create_new', existingRecord: existing };
    }

    // Default: skip
    return { action: 'skip', existingRecord: existing };
  }

  /**
   * Creates a new call record from a calendar event.
   */
  async _createNewCall(event, clientId, closer, existingRecord, filterWord = '') {
    const prospectInfo = this._extractProspect(event, closer, filterWord);
    const callType = await this.determineCallType(prospectInfo.email, clientId);

    const callId = generateId();
    const now = nowISO();

    const callRecord = {
      call_id: callId,
      appointment_id: event.eventId,
      client_id: clientId,
      closer_id: closer.closer_id,
      prospect_name: prospectInfo.name || null,
      prospect_email: prospectInfo.email || 'unknown',
      appointment_date: event.startTime,
      appointment_end_date: event.endTime || null,
      timezone: event.originalTimezone,
      call_type: callType,
      attendance: null,
      call_outcome: null,
      source: 'Google Calendar',
      transcript_status: 'Pending',
      transcript_provider: closer.transcript_provider || null,
      transcript_link: null,
      recording_url: null,
      call_url: null,
      duration_minutes: null,
      processing_status: 'pending',
      processing_error: null,
      ingestion_source: 'calendar',
      created: now,
      last_modified: now,
      client: closer.client_id,
      closer: closer.name,
    };

    await callQueries.create(callRecord);

    await auditLogger.log({
      clientId,
      entityType: 'call',
      entityId: callId,
      action: 'created',
      newValue: null,
      triggerSource: 'calendar_webhook',
      triggerDetail: `event_id:${event.eventId}`,
      metadata: {
        closer_name: closer.name,
        prospect_email: prospectInfo.email,
        call_type: callType,
      },
    });

    logger.info('New call record created', {
      callId,
      clientId,
      closerId: closer.closer_id,
      prospectEmail: prospectInfo.email,
      callType,
      appointmentDate: event.startTime,
    });

    return { action: 'created', callRecord };
  }

  /**
   * Updates an existing Scheduled call record.
   *
   * Handles three kinds of changes:
   * - Time change: appointment_date and timezone updated
   * - Prospect change: prospect_email and prospect_name updated (e.g., invitee added after event created)
   * - Both at once
   *
   * Also re-determines call_type when prospect email changes, since a previously
   * "unknown" prospect might actually be a returning one (Follow Up).
   *
   * @param {Object} existingRecord — Current call record from BigQuery
   * @param {Object} event — StandardCalendarEvent from the adapter
   * @param {string} clientId — Client scope
   * @param {Object} closer — Closer record from BigQuery
   * @returns {Object} { action: 'updated', callRecord }
   */
  async _updateExistingCall(existingRecord, event, clientId, closer, filterWord = '') {
    const updates = {};
    const auditEntries = [];

    // Check for time change
    if (existingRecord.appointment_date !== event.startTime) {
      updates.appointment_date = event.startTime;
      updates.appointment_end_date = event.endTime || null;
      updates.timezone = event.originalTimezone;
      auditEntries.push({
        fieldChanged: 'appointment_date',
        oldValue: existingRecord.appointment_date,
        newValue: event.startTime,
      });
    }

    // Check for prospect changes (attendee added/changed, or title changed affecting name)
    if (closer) {
      const newProspect = this._extractProspect(event, closer, filterWord);

      if (newProspect.email !== (existingRecord.prospect_email || 'unknown')) {
        updates.prospect_email = newProspect.email;
        auditEntries.push({
          fieldChanged: 'prospect_email',
          oldValue: existingRecord.prospect_email,
          newValue: newProspect.email,
        });

        // Re-determine call_type now that we know who the prospect is
        const callType = await this.determineCallType(newProspect.email, clientId);
        if (callType !== existingRecord.call_type) {
          updates.call_type = callType;
          auditEntries.push({
            fieldChanged: 'call_type',
            oldValue: existingRecord.call_type,
            newValue: callType,
          });
        }
      }

      if (newProspect.name && newProspect.name !== existingRecord.prospect_name) {
        updates.prospect_name = newProspect.name;
        auditEntries.push({
          fieldChanged: 'prospect_name',
          oldValue: existingRecord.prospect_name,
          newValue: newProspect.name,
        });
      }
    }

    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      await callQueries.update(existingRecord.call_id, clientId, updates);

      for (const entry of auditEntries) {
        await auditLogger.log({
          clientId,
          entityType: 'call',
          entityId: existingRecord.call_id,
          action: 'updated',
          fieldChanged: entry.fieldChanged,
          oldValue: entry.oldValue,
          newValue: entry.newValue,
          triggerSource: 'calendar_webhook',
          triggerDetail: `event_id:${event.eventId}`,
        });
      }

      logger.info('Call record updated', {
        callId: existingRecord.call_id,
        clientId,
        fieldsUpdated: Object.keys(updates),
      });
    }

    return { action: 'updated', callRecord: { ...existingRecord, ...updates } };
  }

  /**
   * Cancels a call record (event deleted, cancelled, or attendee declined).
   */
  async _cancelCall(existingRecord, event, clientId) {
    // Only cancel if the call hasn't been held yet
    const terminalStates = ['Show', 'Closed - Won', 'Deposit', 'Follow Up', 'Lost', 'Disqualified', 'Not Pitched'];
    if (terminalStates.includes(existingRecord.attendance)) {
      logger.info('Ignoring cancel for already-held call', {
        callId: existingRecord.call_id,
        attendance: existingRecord.attendance,
      });
      return { action: 'skipped', callRecord: existingRecord };
    }

    const validCancel = await this.transitionState(
      existingRecord.call_id,
      clientId,
      'Canceled',
      'calendar_cancelled_or_deleted_or_declined'
    );

    if (validCancel) {
      return { action: 'canceled', callRecord: { ...existingRecord, attendance: 'Canceled' } };
    }

    return { action: 'skipped', callRecord: existingRecord };
  }

  /**
   * Checks if the prospect info in the incoming event differs from the existing record.
   *
   * Returns true when:
   * - An attendee was added (existing has "unknown" email, event has a real email)
   * - A different attendee replaced the original one
   * - The prospect name changed (e.g., title changed, or attendee display name updated)
   *
   * This is used by _handleDeduplication to detect attendee/title changes
   * that should trigger an update rather than a skip.
   *
   * @param {Object} existing — Current call record from BigQuery
   * @param {Object} event — StandardCalendarEvent from the adapter
   * @param {Object} closer — Closer record from BigQuery
   * @returns {boolean} true if prospect info has changed
   */
  _hasProspectChanged(existing, event, closer, filterWord = '') {
    const newProspect = this._extractProspect(event, closer, filterWord);

    const emailChanged = newProspect.email !== (existing.prospect_email || 'unknown');
    const nameChanged = newProspect.name
      && newProspect.name !== existing.prospect_name;

    return emailChanged || nameChanged;
  }

  /**
   * Extracts prospect information from calendar event attendees.
   *
   * Logic:
   * 1. Get all attendees
   * 2. Remove the organizer (that's the closer)
   * 3. Remove any emails matching known closer work_emails for this client
   * 4. The remaining attendee is the prospect
   * 5. If no prospect found, return { email: 'unknown', name: null }
   *
   * Name resolution priority:
   * 1. Google profile displayName from the attendee record
   * 2. Parse the event title to find a name that ISN'T the closer's
   * 3. Fall back to the first part of the prospect's email (before @)
   *
   * @param {Object} event — StandardCalendarEvent
   * @param {Object} closer — Closer record
   * @returns {Object} { email, name }
   */
  _extractProspect(event, closer, filterWord = '') {
    if (!event.attendees || event.attendees.length === 0) {
      // No attendees yet — still try to extract a name from the title
      // e.g. "Strategy Call with John Smith" → name: "John Smith"
      const titleName = this._extractNameFromTitle(event.title, closer.name, filterWord);
      return { email: 'unknown', name: titleName };
    }

    // Filter out the closer/organizer
    const prospects = event.attendees.filter(a => {
      const email = a.email?.toLowerCase();
      return email !== closer.work_email?.toLowerCase()
        && email !== event.organizerEmail?.toLowerCase()
        && !a.isOrganizer;
    });

    if (prospects.length === 0) {
      // All attendees are closers/organizers — try title extraction
      const titleName = this._extractNameFromTitle(event.title, closer.name, filterWord);
      return { email: 'unknown', name: titleName };
    }

    const prospect = prospects[0];
    const name = this._resolveProspectName(prospect, event.title, closer.name, filterWord);

    return {
      email: prospect.email,
      name,
    };
  }

  /**
   * Resolves the prospect's display name using a three-tier fallback strategy.
   *
   * Priority:
   * 1. Google profile name (attendee displayName) — most reliable
   * 2. Extract from event title — find a name that isn't the closer's
   * 3. Email prefix — "john.smith@gmail.com" → "John Smith"
   *
   * @param {Object} prospect — Attendee object { email, name }
   * @param {string} eventTitle — Calendar event title/summary
   * @param {string} closerName — The closer's display name
   * @returns {string|null} Best-effort prospect name
   */
  _resolveProspectName(prospect, eventTitle, closerName, filterWord = '') {
    // Tier 1: Google profile display name
    if (prospect.name && prospect.name.trim()) {
      return prospect.name.trim();
    }

    // Tier 2: Extract from event title
    const titleName = this._extractNameFromTitle(eventTitle, closerName, filterWord);
    if (titleName) {
      return titleName;
    }

    // Tier 3: Email prefix — "john.smith@gmail.com" → "John Smith"
    if (prospect.email && prospect.email !== 'unknown') {
      return this._nameFromEmail(prospect.email);
    }

    return null;
  }

  /**
   * Extracts a prospect name from a calendar event title using a
   * subtraction approach: remove what you know (closer name, filter
   * words, filler) and whatever's left is the prospect.
   *
   * IMPORTANT: Only removes the closer's FULL name, not individual
   * name parts. This preserves prospect names that share a first name
   * with the closer (e.g., closer "Tyler Ray" won't strip "Tyler" from
   * prospect "Tyler Smith").
   *
   * Handles all common calendar title formats:
   *   "F with P and C", "P - F with C", "C F (P)", "F: P → C",
   *   "RE: F with P", "Confirmed: F with P", "P F #2", etc.
   *
   * @param {string} title — Calendar event title
   * @param {string} closerName — Closer's full name (e.g. "Tyler Ray")
   * @param {string} filterWord — Comma-separated filter words from client config
   * @returns {string|null} Extracted prospect name or null
   */
  _extractNameFromTitle(title, closerName, filterWord = '') {
    if (!title) return null;

    let cleaned = title;
    const closerFull = (closerName || '').trim();

    // Step 1: Strip common calendar/email prefixes
    cleaned = cleaned.replace(/^(RE:\s*|Fwd:\s*|FWD:\s*|CANCELED:\s*|Updated:\s*|Confirmed:\s*|New\s+)/i, '');

    // Step 2: Remove email addresses in angle brackets <email@example.com>
    cleaned = cleaned.replace(/<[^>]+>/g, '');

    // Step 3: Extract and save parenthesized content (might be a name)
    const parenMatch = cleaned.match(/\(([^)]+)\)/);
    const parenContent = parenMatch ? parenMatch[1].trim() : null;
    cleaned = cleaned.replace(/\([^)]*\)/g, '');

    // Step 4: Extract and save bracketed content (might be a name)
    const bracketMatch = cleaned.match(/\[([^\]]+)\]/);
    const bracketContent = bracketMatch ? bracketMatch[1].trim() : null;
    cleaned = cleaned.replace(/\[[^\]]*\]/g, '');

    // Step 5: Remove the closer's FULL name only (not individual parts)
    // "Tyler Smith" (prospect) stays intact when closer is "Tyler Ray"
    if (closerFull) {
      cleaned = cleaned.replace(new RegExp(this._escapeRegex(closerFull), 'gi'), '');
      // Also handle possessive: "Tyler Ray's Strategy Call with Prospect"
      cleaned = cleaned.replace(new RegExp(this._escapeRegex(closerFull) + "'s", 'gi'), '');

      // Step 5b: Strip "w/ Tyler" and "with Tyler" as a UNIT before general filler removal.
      // In titles like "Brianna & Tyler Strategy Call w/ Tyler", the "w/ Tyler" refers to
      // the closer, not the prospect. We strip it as a unit so "w/" and the closer's first
      // name don't get separated during filler removal (which would leave a stray "Tyler").
      // The negative lookahead (?!\s+[A-Za-z]) ensures we DON'T strip "with Tyler Smith"
      // where "Tyler Smith" is the prospect's full name.
      const closerFirst = closerFull.split(/\s+/)[0];
      if (closerFirst && closerFirst.length > 1) {
        const firstEsc = this._escapeRegex(closerFirst);
        cleaned = cleaned.replace(new RegExp('\\bw/\\s*' + firstEsc + '\\b(?!\\s+[A-Za-z])', 'gi'), '');
        cleaned = cleaned.replace(new RegExp('\\bwith\\s+' + firstEsc + '\\b(?!\\s+[A-Za-z])', 'gi'), '');
      }
    }

    // Step 6: Remove client's filter words (e.g., "strategy,discovery,sales call")
    if (filterWord) {
      // Sort by length descending so multi-word phrases match before individual words
      const filterWords = filterWord.split(',').map(w => w.trim()).filter(Boolean);
      filterWords.sort((a, b) => b.length - a.length);
      for (const fw of filterWords) {
        cleaned = cleaned.replace(new RegExp(this._escapeRegex(fw), 'gi'), '');
      }
    }

    // Step 7: Remove generic filler words and phrases
    // NOTE: "&" is NOT a filler — it's a name connector for couples ("Steve & Lori")
    const fillerPatterns = [
      /\bcall\b/gi, /\bmeeting\b/gi, /\bsession\b/gi, /\bchat\b/gi, /\bcatchup\b/gi,
      /\bwith\b/gi, /\bmeet\b/gi, /\band\b/gi, /\bvs\.?\b/gi,
      /\bfor\b/gi, /\bbetween\b/gi, /\bw\//gi,
      /\bbooked\b/gi, /\bhas\b/gi, /\ba\b/gi,
      /\bscheduled\b/gi, /\bconfirmed\b/gi, /\bnew\b/gi,
      /\bfollow[\s-]?up\b/gi, /\brescheduled\b/gi, /\bconsult(ation)?\b/gi,
      /\bdemo\b/gi, /\bintro\b/gi,
      /\bassigned\s+to\b/gi, /\bat\b/gi,
    ];
    for (const pattern of fillerPatterns) {
      cleaned = cleaned.replace(pattern, '');
    }

    // Step 8: Remove ordinals and numbering (#2, 2nd call, etc.)
    cleaned = cleaned.replace(/#\d+/g, '');
    cleaned = cleaned.replace(/\b\d+(st|nd|rd|th)\b/gi, '');

    // Step 9: Remove separators, arrows, and extra whitespace
    // Includes <> (common title separator like "Call <> Tyler Ray")
    cleaned = cleaned
      .replace(/[-–—|:→←+<>~/\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Step 10: Check if what remains looks like a name
    // If the result is ONLY the closer's first name (one word, matching),
    // treat it as ambiguous — it's probably the closer, not a prospect.
    const candidate = this._looksLikeName(cleaned) ? cleaned : null;
    if (candidate && closerFull) {
      const closerFirst = closerFull.split(/\s+/)[0];
      // Single word that matches closer's first name → ambiguous, skip
      if (candidate.split(/\s+/).length === 1
        && candidate.toLowerCase() === closerFirst.toLowerCase()) {
        // Fall through to paren/bracket checks below
      } else {
        return this._titleCase(candidate);
      }
    } else if (candidate) {
      return this._titleCase(candidate);
    }

    // Step 11: Check parenthesized content — might be the prospect name
    if (parenContent && this._looksLikeName(parenContent)) {
      if (!closerFull || parenContent.toLowerCase() !== closerFull.toLowerCase()) {
        return this._titleCase(parenContent);
      }
    }

    // Step 12: Check bracketed content
    if (bracketContent && this._looksLikeName(bracketContent)) {
      if (!closerFull || bracketContent.toLowerCase() !== closerFull.toLowerCase()) {
        return this._titleCase(bracketContent);
      }
    }

    return null;
  }

  /**
   * Checks if a string looks like a person's name (or name-like identifier).
   *
   * Accepts:
   * - Standard names: "Jane Doe", "John Smith"
   * - Couple names with &: "Steve & Lori Teller"
   * - Multi-person: "James Cameron & Michael Scott" (up to 6 words)
   * - Names with trailing numbers: "Double Booking 1" (test/ID contexts)
   *
   * Requires at least one word that starts with a letter.
   *
   * @param {string} str — Candidate name string
   * @returns {boolean}
   */
  _looksLikeName(str) {
    if (!str || str.length < 2) return false;
    const words = str.trim().split(/\s+/);
    if (words.length === 0 || words.length > 6) return false;
    // At least one word must start with a letter (not all numbers/symbols)
    const hasLetterWord = words.some(w => /^[A-Za-z]/.test(w));
    if (!hasLetterWord) return false;
    // Each word: letter-word, number, or & connector
    return words.every(w =>
      /^[A-Za-z][A-Za-z''\-]*$/.test(w) || /^\d+$/.test(w) || w === '&'
    );
  }

  /**
   * Converts an email prefix into a display name.
   * "john.smith@gmail.com" → "John Smith"
   * "jane_doe123@company.com" → "Jane Doe"
   *
   * @param {string} email — Email address
   * @returns {string|null}
   */
  _nameFromEmail(email) {
    const prefix = email.split('@')[0];
    if (!prefix) return null;

    // Split on dots, underscores, hyphens, plus signs
    const parts = prefix
      .split(/[._\-+]/)
      .filter(p => p && !/^\d+$/.test(p)); // Remove pure number segments

    if (parts.length === 0) return null;

    return parts
      .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Title-cases a string: "john smith" → "John Smith"
   */
  _titleCase(str) {
    return str.replace(/\b\w/g, c => c.toUpperCase());
  }

  /**
   * Escapes special regex characters in a string.
   */
  _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Validates whether a state transition is allowed.
   * Handles null currentState by looking up the 'null' key in STATE_TRANSITIONS.
   */
  _isValidTransition(currentState, newState, trigger) {
    const key = currentState === null || currentState === undefined ? 'null' : currentState;
    const validTransitions = STATE_TRANSITIONS[key];
    if (!validTransitions) return false;
    return validTransitions.some(t => t.to === newState && t.trigger === trigger);
  }

  /**
   * Checks if a call's attendance represents a pre-outcome state
   * (hasn't been held yet or is waiting for a transcript).
   *
   * @param {string|null} attendance — Current attendance value
   * @returns {boolean} true if null, 'Scheduled', or 'Waiting for Outcome'
   */
  _isPreOutcome(attendance) {
    return attendance === null
      || attendance === undefined
      || attendance === 'Scheduled'
      || attendance === 'Waiting for Outcome';
  }

  /**
   * Marks overlapping calls as 'Overbooked' when a closer takes one of their
   * double-booked calls.
   *
   * Called after a call transitions to 'Show'. Checks if the same closer
   * has other calls during the same time window that are still in a pre-outcome
   * or Ghosted state. Those calls were NOT taken because the closer was busy
   * on this call — so they get marked 'Overbooked' rather than 'Ghosted'.
   *
   * @param {Object} call — The call record that just transitioned to Show
   * @returns {number} Number of calls marked as Overbooked
   */
  async _markOverlappedCalls(call) {
    // Need both start and end time to detect overlap
    if (!call.appointment_date || !call.appointment_end_date) {
      return 0;
    }

    const overlapping = await callQueries.findOverlappingPreOutcomeCalls(
      call.closer_id,
      call.client_id,
      call.call_id,
      call.appointment_date,
      call.appointment_end_date
    );

    let marked = 0;
    for (const overlap of overlapping) {
      const transitioned = await this.transitionState(
        overlap.call_id,
        overlap.client_id,
        'Overbooked',
        'closer_double_booked'
      );

      if (transitioned) {
        marked++;
        logger.info('Overlapping call marked as Overbooked', {
          overbookedCallId: overlap.call_id,
          takenCallId: call.call_id,
          closerId: call.closer_id,
          clientId: call.client_id,
        });
      }
    }

    return marked;
  }
}

module.exports = new CallStateManager();
