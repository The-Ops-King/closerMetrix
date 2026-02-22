/**
 * CALL STATE MANAGER — Unit Tests
 *
 * Tests the state machine logic, dedup handling, call type determination,
 * and prospect extraction. Uses mockBigQuery for in-memory state.
 */

jest.mock('../../src/db/BigQueryClient', () => require('../helpers/mockBigQuery'));

const callStateManager = require('../../src/services/CallStateManager');
const mockBQ = require('../helpers/mockBigQuery');

// Reusable test data
const CLIENT_ID = 'friends_inc';

const CLOSER = {
  closer_id: 'closer_sarah_001',
  client_id: CLIENT_ID,
  name: 'Sarah Closer',
  work_email: 'sarah@acmecoaching.com',
  status: 'active',
  transcript_provider: 'fathom',
};

// Filter words for title extraction tests — matches what a real client config would have
const FILTER_WORD = 'strategy,discovery';

function makeEvent(overrides = {}) {
  return {
    eventId: 'event_abc123',
    eventType: 'updated',
    title: 'Discovery Call with John Smith',
    startTime: '2026-02-20T20:00:00.000Z',
    endTime: '2026-02-20T21:00:00.000Z',
    originalTimezone: 'America/New_York',
    organizerEmail: 'sarah@acmecoaching.com',
    attendees: [
      { email: 'sarah@acmecoaching.com', name: 'Sarah Closer', isOrganizer: true, responseStatus: 'accepted' },
      { email: 'john@example.com', name: 'John Smith', isOrganizer: false, responseStatus: 'accepted' },
    ],
    status: 'confirmed',
    calendarId: 'sarah@acmecoaching.com',
    declinedAttendees: [],
    rawEvent: {},
    ...overrides,
  };
}

beforeEach(() => {
  mockBQ._reset();
});

describe('CallStateManager', () => {
  describe('handleCalendarEvent — new call creation', () => {
    it('should create a new call record when no existing record', async () => {
      const event = makeEvent();
      const result = await callStateManager.handleCalendarEvent(event, CLIENT_ID, CLOSER);

      expect(result.action).toBe('created');
      expect(result.callRecord).toBeDefined();
      expect(result.callRecord.appointment_id).toBe('event_abc123');
      expect(result.callRecord.client_id).toBe(CLIENT_ID);
      expect(result.callRecord.closer_id).toBe('closer_sarah_001');
      expect(result.callRecord.prospect_email).toBe('john@example.com');
      expect(result.callRecord.prospect_name).toBe('John Smith');
      expect(result.callRecord.attendance).toBeNull();
      expect(result.callRecord.call_type).toBe('First Call');
      expect(result.callRecord.source).toBe('Google Calendar');
      expect(result.callRecord.transcript_status).toBe('Pending');

      // Verify it's in the mock DB
      const calls = mockBQ._getTable('Calls');
      expect(calls).toHaveLength(1);
    });

    it('should set call_type to "Follow Up" when prospect has prior shows', async () => {
      // Seed a prior show for this prospect
      mockBQ._seedTable('Calls', [{
        call_id: 'prior_call_001',
        appointment_id: 'event_prior',
        client_id: CLIENT_ID,
        closer_id: 'closer_sarah_001',
        prospect_email: 'john@example.com',
        attendance: 'Show',
        created: '2026-02-15T10:00:00.000Z',
      }]);

      const event = makeEvent({ eventId: 'event_new_123' });
      const result = await callStateManager.handleCalendarEvent(event, CLIENT_ID, CLOSER);

      expect(result.action).toBe('created');
      expect(result.callRecord.call_type).toBe('Follow Up');
    });

    it('should extract prospect from attendees (non-organizer)', async () => {
      const event = makeEvent();
      const result = await callStateManager.handleCalendarEvent(event, CLIENT_ID, CLOSER);

      expect(result.callRecord.prospect_email).toBe('john@example.com');
      expect(result.callRecord.prospect_name).toBe('John Smith');
    });

    it('should set prospect to "unknown" when no non-organizer attendees', async () => {
      const event = makeEvent({
        attendees: [
          { email: 'sarah@acmecoaching.com', name: 'Sarah Closer', isOrganizer: true, responseStatus: 'accepted' },
        ],
      });
      const result = await callStateManager.handleCalendarEvent(event, CLIENT_ID, CLOSER);

      expect(result.callRecord.prospect_email).toBe('unknown');
    });
  });

  describe('handleCalendarEvent — duplicate detection', () => {
    it('should skip when same event arrives with no changes (Scenario C)', async () => {
      // Create initial record with same prospect info as makeEvent()
      mockBQ._seedTable('Calls', [{
        call_id: 'call_001',
        appointment_id: 'event_abc123',
        client_id: CLIENT_ID,
        attendance: null,
        appointment_date: '2026-02-20T20:00:00.000Z',
        prospect_email: 'john@example.com',
        prospect_name: 'John Smith',
        created: '2026-02-18T10:00:00.000Z',
      }]);

      const event = makeEvent();
      const result = await callStateManager.handleCalendarEvent(event, CLIENT_ID, CLOSER);

      expect(result.action).toBe('skipped');
      // No new records created
      const calls = mockBQ._getTable('Calls');
      expect(calls).toHaveLength(1);
    });

    it('should update time when event is rescheduled before the call (Scenario A)', async () => {
      mockBQ._seedTable('Calls', [{
        call_id: 'call_001',
        appointment_id: 'event_abc123',
        client_id: CLIENT_ID,
        attendance: null,
        appointment_date: '2026-02-20T20:00:00.000Z',
        created: '2026-02-18T10:00:00.000Z',
      }]);

      // Event comes in with a new time
      const event = makeEvent({ startTime: '2026-02-21T18:00:00.000Z' });
      const result = await callStateManager.handleCalendarEvent(event, CLIENT_ID, CLOSER);

      expect(result.action).toBe('updated');
      expect(result.callRecord.appointment_date).toBe('2026-02-21T18:00:00.000Z');
    });

    it('should create new record when event reused after call held (Scenario B)', async () => {
      mockBQ._seedTable('Calls', [{
        call_id: 'call_001',
        appointment_id: 'event_abc123',
        client_id: CLIENT_ID,
        attendance: 'Show',
        call_outcome: 'Follow Up',
        appointment_date: '2026-02-20T20:00:00.000Z',
        created: '2026-02-18T10:00:00.000Z',
      }]);

      // Same event ID arrives with new time (closer reused the event)
      const event = makeEvent({ startTime: '2026-02-27T20:00:00.000Z' });
      const result = await callStateManager.handleCalendarEvent(event, CLIENT_ID, CLOSER);

      expect(result.action).toBe('created');
      const calls = mockBQ._getTable('Calls');
      expect(calls).toHaveLength(2);
    });
  });

  describe('handleCalendarEvent — cancellation', () => {
    it('should cancel a pending call when event is cancelled', async () => {
      mockBQ._seedTable('Calls', [{
        call_id: 'call_001',
        appointment_id: 'event_abc123',
        client_id: CLIENT_ID,
        attendance: null,
        appointment_date: '2026-02-20T20:00:00.000Z',
        created: '2026-02-18T10:00:00.000Z',
      }]);

      const event = makeEvent({ status: 'cancelled', eventType: 'cancelled' });
      const result = await callStateManager.handleCalendarEvent(event, CLIENT_ID, CLOSER);

      expect(result.action).toBe('canceled');
      expect(result.callRecord.attendance).toBe('Canceled');
    });

    it('should skip cancel if no existing record and event is already cancelled', async () => {
      const event = makeEvent({ status: 'cancelled', eventType: 'cancelled' });
      const result = await callStateManager.handleCalendarEvent(event, CLIENT_ID, CLOSER);

      expect(result.action).toBe('skipped');
    });

    it('should cancel when an attendee declines', async () => {
      mockBQ._seedTable('Calls', [{
        call_id: 'call_001',
        appointment_id: 'event_abc123',
        client_id: CLIENT_ID,
        attendance: null,
        appointment_date: '2026-02-20T20:00:00.000Z',
        created: '2026-02-18T10:00:00.000Z',
      }]);

      const event = makeEvent({
        declinedAttendees: [{ email: 'john@example.com', name: 'John Smith' }],
      });
      const result = await callStateManager.handleCalendarEvent(event, CLIENT_ID, CLOSER);

      expect(result.action).toBe('canceled');
    });

    it('should NOT cancel a call that already happened (Show state)', async () => {
      mockBQ._seedTable('Calls', [{
        call_id: 'call_001',
        appointment_id: 'event_abc123',
        client_id: CLIENT_ID,
        attendance: 'Show',
        call_outcome: 'Lost',
        appointment_date: '2026-02-20T20:00:00.000Z',
        created: '2026-02-18T10:00:00.000Z',
      }]);

      const event = makeEvent({ status: 'cancelled', eventType: 'cancelled' });
      const result = await callStateManager.handleCalendarEvent(event, CLIENT_ID, CLOSER);

      // Should skip (not cancel) because the call already happened
      expect(result.action).toBe('skipped');
      const calls = mockBQ._getTable('Calls');
      expect(calls[0].attendance).toBe('Show');
    });
  });

  describe('transitionState', () => {
    it('should transition null → Canceled', async () => {
      mockBQ._seedTable('Calls', [{
        call_id: 'call_001',
        client_id: CLIENT_ID,
        attendance: null,
      }]);

      const success = await callStateManager.transitionState(
        'call_001', CLIENT_ID, 'Canceled', 'calendar_cancelled_or_deleted_or_declined'
      );

      expect(success).toBe(true);
      const calls = mockBQ._getTable('Calls');
      expect(calls[0].attendance).toBe('Canceled');
    });

    it('should transition null → Show', async () => {
      mockBQ._seedTable('Calls', [{
        call_id: 'call_001',
        client_id: CLIENT_ID,
        attendance: null,
      }]);

      const success = await callStateManager.transitionState(
        'call_001', CLIENT_ID, 'Show', 'transcript_received_valid'
      );

      expect(success).toBe(true);
      const calls = mockBQ._getTable('Calls');
      expect(calls[0].attendance).toBe('Show');
    });

    it('should transition null → Waiting for Outcome', async () => {
      mockBQ._seedTable('Calls', [{
        call_id: 'call_001',
        client_id: CLIENT_ID,
        attendance: null,
      }]);

      const success = await callStateManager.transitionState(
        'call_001', CLIENT_ID, 'Waiting for Outcome', 'appointment_time_passed'
      );

      expect(success).toBe(true);
      const calls = mockBQ._getTable('Calls');
      expect(calls[0].attendance).toBe('Waiting for Outcome');
    });

    it('should transition Waiting for Outcome → Ghosted - No Show', async () => {
      mockBQ._seedTable('Calls', [{
        call_id: 'call_001',
        client_id: CLIENT_ID,
        attendance: 'Waiting for Outcome',
      }]);

      const success = await callStateManager.transitionState(
        'call_001', CLIENT_ID, 'Ghosted - No Show', 'transcript_timeout'
      );

      expect(success).toBe(true);
      const calls = mockBQ._getTable('Calls');
      expect(calls[0].attendance).toBe('Ghosted - No Show');
    });

    it('should transition Waiting for Outcome → Show (transcript arrives during wait)', async () => {
      mockBQ._seedTable('Calls', [{
        call_id: 'call_001',
        client_id: CLIENT_ID,
        attendance: 'Waiting for Outcome',
      }]);

      const success = await callStateManager.transitionState(
        'call_001', CLIENT_ID, 'Show', 'transcript_received_valid'
      );

      expect(success).toBe(true);
      const calls = mockBQ._getTable('Calls');
      expect(calls[0].attendance).toBe('Show');
    });

    it('should transition Waiting for Outcome → Canceled', async () => {
      mockBQ._seedTable('Calls', [{
        call_id: 'call_001',
        client_id: CLIENT_ID,
        attendance: 'Waiting for Outcome',
      }]);

      const success = await callStateManager.transitionState(
        'call_001', CLIENT_ID, 'Canceled', 'calendar_cancelled_or_deleted_or_declined'
      );

      expect(success).toBe(true);
      const calls = mockBQ._getTable('Calls');
      expect(calls[0].attendance).toBe('Canceled');
    });

    it('should transition legacy Scheduled → Canceled (backward compat)', async () => {
      mockBQ._seedTable('Calls', [{
        call_id: 'call_001',
        client_id: CLIENT_ID,
        attendance: 'Scheduled',
      }]);

      const success = await callStateManager.transitionState(
        'call_001', CLIENT_ID, 'Canceled', 'calendar_cancelled_or_deleted_or_declined'
      );

      expect(success).toBe(true);
      const calls = mockBQ._getTable('Calls');
      expect(calls[0].attendance).toBe('Canceled');
    });

    it('should transition legacy Scheduled → Waiting for Outcome (backward compat)', async () => {
      mockBQ._seedTable('Calls', [{
        call_id: 'call_001',
        client_id: CLIENT_ID,
        attendance: 'Scheduled',
      }]);

      const success = await callStateManager.transitionState(
        'call_001', CLIENT_ID, 'Waiting for Outcome', 'appointment_time_passed'
      );

      expect(success).toBe(true);
      const calls = mockBQ._getTable('Calls');
      expect(calls[0].attendance).toBe('Waiting for Outcome');
    });

    it('should transition Show → Closed - Won', async () => {
      mockBQ._seedTable('Calls', [{
        call_id: 'call_001',
        client_id: CLIENT_ID,
        attendance: 'Show',
      }]);

      const success = await callStateManager.transitionState(
        'call_001', CLIENT_ID, 'Closed - Won', 'ai_outcome'
      );

      expect(success).toBe(true);
    });

    it('should reject invalid transition (null → Closed - Won)', async () => {
      mockBQ._seedTable('Calls', [{
        call_id: 'call_001',
        client_id: CLIENT_ID,
        attendance: null,
      }]);

      const success = await callStateManager.transitionState(
        'call_001', CLIENT_ID, 'Closed - Won', 'ai_outcome'
      );

      expect(success).toBe(false);
      const calls = mockBQ._getTable('Calls');
      expect(calls[0].attendance).toBeNull(); // unchanged
    });

    it('should return false when call not found', async () => {
      const success = await callStateManager.transitionState(
        'nonexistent', CLIENT_ID, 'Canceled', 'calendar_cancelled_or_deleted_or_declined'
      );
      expect(success).toBe(false);
    });

    it('should apply additional updates alongside state change', async () => {
      mockBQ._seedTable('Calls', [{
        call_id: 'call_001',
        client_id: CLIENT_ID,
        attendance: null,
      }]);

      await callStateManager.transitionState(
        'call_001', CLIENT_ID, 'Show', 'transcript_received_valid',
        { duration_minutes: 45, transcript_link: 'https://fathom.video/xxx' }
      );

      const calls = mockBQ._getTable('Calls');
      expect(calls[0].attendance).toBe('Show');
      expect(calls[0].duration_minutes).toBe(45);
      expect(calls[0].transcript_link).toBe('https://fathom.video/xxx');
    });
  });

  describe('determineCallType', () => {
    it('should return "First Call" when no prior shows', async () => {
      const type = await callStateManager.determineCallType('new@example.com', CLIENT_ID);
      expect(type).toBe('First Call');
    });

    it('should return "Follow Up" when prospect has prior shows', async () => {
      mockBQ._seedTable('Calls', [{
        call_id: 'prior_001',
        client_id: CLIENT_ID,
        prospect_email: 'returning@example.com',
        attendance: 'Show',
      }]);

      const type = await callStateManager.determineCallType('returning@example.com', CLIENT_ID);
      expect(type).toBe('Follow Up');
    });

    it('should return "First Call" when prospect email is "unknown"', async () => {
      const type = await callStateManager.determineCallType('unknown', CLIENT_ID);
      expect(type).toBe('First Call');
    });

    it('should return "First Call" when prospect email is null', async () => {
      const type = await callStateManager.determineCallType(null, CLIENT_ID);
      expect(type).toBe('First Call');
    });
  });

  describe('_extractProspect', () => {
    it('should extract the non-organizer attendee', () => {
      const event = makeEvent();
      const prospect = callStateManager._extractProspect(event, CLOSER, FILTER_WORD);
      expect(prospect).toEqual({ email: 'john@example.com', name: 'John Smith' });
    });

    it('should extract name from title when all attendees are the closer', () => {
      const event = makeEvent({
        attendees: [
          { email: 'sarah@acmecoaching.com', name: 'Sarah Closer', isOrganizer: true, responseStatus: 'accepted' },
        ],
      });
      const prospect = callStateManager._extractProspect(event, CLOSER, FILTER_WORD);
      // No prospect attendee, but "John Smith" is in the title
      expect(prospect).toEqual({ email: 'unknown', name: 'John Smith' });
    });

    it('should extract name from title when no attendees', () => {
      const event = makeEvent({ attendees: [] });
      const prospect = callStateManager._extractProspect(event, CLOSER, FILTER_WORD);
      // No attendees at all, but "John Smith" is in the title
      expect(prospect).toEqual({ email: 'unknown', name: 'John Smith' });
    });

    it('should return null name when no attendees and no name in title', () => {
      const event = makeEvent({ attendees: [], title: 'Strategy Call' });
      const prospect = callStateManager._extractProspect(event, CLOSER, FILTER_WORD);
      expect(prospect).toEqual({ email: 'unknown', name: null });
    });

    it('should pick the first non-closer attendee when multiple prospects', () => {
      const event = makeEvent({
        attendees: [
          { email: 'sarah@acmecoaching.com', name: 'Sarah', isOrganizer: true },
          { email: 'prospect1@example.com', name: 'First Prospect', isOrganizer: false },
          { email: 'prospect2@example.com', name: 'Second Prospect', isOrganizer: false },
        ],
      });
      const prospect = callStateManager._extractProspect(event, CLOSER, FILTER_WORD);
      expect(prospect.email).toBe('prospect1@example.com');
    });
  });

  describe('_resolveProspectName — name resolution priority', () => {
    it('should prefer Google display name (tier 1)', () => {
      const event = makeEvent({
        title: 'Strategy Call',
        attendees: [
          { email: 'sarah@acmecoaching.com', name: 'Sarah Closer', isOrganizer: true },
          { email: 'john@example.com', name: 'John Smith', isOrganizer: false },
        ],
      });
      const prospect = callStateManager._extractProspect(event, CLOSER, FILTER_WORD);
      expect(prospect.name).toBe('John Smith');
    });

    it('should extract name from title when no display name (tier 2)', () => {
      const event = makeEvent({
        title: 'Strategy Call with Jane Doe',
        attendees: [
          { email: 'sarah@acmecoaching.com', name: 'Sarah Closer', isOrganizer: true },
          { email: 'jane@example.com', name: null, isOrganizer: false },
        ],
      });
      const prospect = callStateManager._extractProspect(event, CLOSER, FILTER_WORD);
      expect(prospect.name).toBe('Jane Doe');
    });

    it('should fall back to email prefix (tier 3)', () => {
      const event = makeEvent({
        title: 'Strategy Call',
        attendees: [
          { email: 'sarah@acmecoaching.com', name: 'Sarah Closer', isOrganizer: true },
          { email: 'john.smith@gmail.com', name: null, isOrganizer: false },
        ],
      });
      const prospect = callStateManager._extractProspect(event, CLOSER, FILTER_WORD);
      expect(prospect.name).toBe('John Smith');
    });
  });

  describe('_extractNameFromTitle', () => {
    it('should extract name after "with"', () => {
      const name = callStateManager._extractNameFromTitle('Strategy Call with Jane Doe', 'Sarah Closer', FILTER_WORD);
      expect(name).toBe('Jane Doe');
    });

    it('should extract name before separator', () => {
      const name = callStateManager._extractNameFromTitle('Jane Doe - Strategy Call', 'Sarah Closer', FILTER_WORD);
      expect(name).toBe('Jane Doe');
    });

    it('should remove the closer name and find the prospect', () => {
      const name = callStateManager._extractNameFromTitle('Meet with Tyler Ray (Jane Doe)', 'Tyler Ray', FILTER_WORD);
      expect(name).toBe('Jane Doe');
    });

    it('should find name when closer name is also in title', () => {
      const name = callStateManager._extractNameFromTitle('Tyler Ray and Jane Doe Discovery', 'Tyler Ray', FILTER_WORD);
      expect(name).toBe('Jane Doe');
    });

    it('should extract name from parentheses when main text is empty', () => {
      const name = callStateManager._extractNameFromTitle('Strategy Call (John Smith)', 'Sarah Closer', FILTER_WORD);
      expect(name).toBe('John Smith');
    });

    it('should use remaining text as name when it looks like a name after subtraction', () => {
      // "Random Text" remains after stripping filler — treated as prospect name
      // Parens are fallback only when main text yields nothing
      const name = callStateManager._extractNameFromTitle('Random Text Meet (Jane Doe)', 'Sarah Closer', FILTER_WORD);
      expect(name).toBe('Random Text');
    });

    it('should fall back to paren name when main text yields only filler', () => {
      // Main text becomes empty after stripping → falls to parens
      const name = callStateManager._extractNameFromTitle('Strategy Call Meeting (Jane Doe)', 'Sarah Closer', FILTER_WORD);
      expect(name).toBe('Jane Doe');
    });

    it('should not return the closer name from parentheses', () => {
      const name = callStateManager._extractNameFromTitle('Discovery Call (Tyler Ray)', 'Tyler Ray', FILTER_WORD);
      expect(name).toBe(null);
    });

    it('should return null when title has no names', () => {
      const name = callStateManager._extractNameFromTitle('Strategy Call', 'Sarah Closer', FILTER_WORD);
      expect(name).toBe(null);
    });

    it('should return null for empty title', () => {
      const name = callStateManager._extractNameFromTitle('', 'Sarah Closer', FILTER_WORD);
      expect(name).toBe(null);
    });

    it('should handle "Firstname Lastname strategy call" format', () => {
      const name = callStateManager._extractNameFromTitle('Jane Doe strategy call', 'Tyler Ray', FILTER_WORD);
      expect(name).toBe('Jane Doe');
    });

    it('should handle single first name in title', () => {
      const name = callStateManager._extractNameFromTitle('Call with Jane', 'Tyler Ray', FILTER_WORD);
      expect(name).toBe('Jane');
    });

    it('should preserve & as name connector for couples', () => {
      const name = callStateManager._extractNameFromTitle('Steve & Lori Teller Strategy call', 'Tyler Ray', FILTER_WORD);
      expect(name).toBe('Steve & Lori Teller');
    });

    it('should handle multiple people with & after closer name', () => {
      const name = callStateManager._extractNameFromTitle('Strategy call Tyler Ray with James Cameron & Michael Scott', 'Tyler Ray', FILTER_WORD);
      expect(name).toBe('James Cameron & Michael Scott');
    });

    it('should handle names with trailing numbers', () => {
      const name = callStateManager._extractNameFromTitle('Double Booking 1 Strategy Call', 'Tyler Ray', FILTER_WORD);
      expect(name).toBe('Double Booking 1');
    });

    it('should handle spelled-out number names', () => {
      const name = callStateManager._extractNameFromTitle('Double Booking Two Strategy Call', 'Tyler Ray', FILTER_WORD);
      expect(name).toBe('Double Booking Two');
    });

    it('should strip <> separator and extract name', () => {
      const name = callStateManager._extractNameFromTitle('keye and peelee Strategy Call <> Tyler Ray', 'Tyler Ray', FILTER_WORD);
      expect(name).toBe('Keye Peelee');
    });

    it('should strip / separator and extract name', () => {
      const name = callStateManager._extractNameFromTitle('Jane Doe / Strategy Call', 'Tyler Ray', FILTER_WORD);
      expect(name).toBe('Jane Doe');
    });

    it('should strip "w/ CloserFirst" as a unit, preserving prospect with same first name', () => {
      // "Brianna & Tyler" is the prospect couple, "w/ Tyler" is the closer
      const name = callStateManager._extractNameFromTitle('Brianna & Tyler Strategy Call w/ Tyler', 'Tyler Ray', FILTER_WORD);
      expect(name).toBe('Brianna & Tyler');
    });

    it('should strip "with CloserFirst" as a unit at end of title', () => {
      const name = callStateManager._extractNameFromTitle('Jane Doe Strategy Call with Tyler', 'Tyler Ray', FILTER_WORD);
      expect(name).toBe('Jane Doe');
    });

    it('should NOT strip "with CloserFirst" when followed by a last name (prospect)', () => {
      // "Tyler Smith" is the prospect, not the closer "Tyler Ray"
      const name = callStateManager._extractNameFromTitle('Strategy Call with Tyler Smith', 'Tyler Ray', FILTER_WORD);
      expect(name).toBe('Tyler Smith');
    });
  });

  describe('handleCalendarEvent — attendee & title updates', () => {
    it('should update record when invitee added to event that had none', async () => {
      // Event created with no invitees → prospect is "unknown"
      mockBQ._seedTable('Calls', [{
        call_id: 'call_001',
        appointment_id: 'event_abc123',
        client_id: CLIENT_ID,
        attendance: null,
        appointment_date: '2026-02-20T20:00:00.000Z',
        prospect_email: 'unknown',
        prospect_name: null,
        call_type: 'First Call',
        created: '2026-02-18T10:00:00.000Z',
      }]);

      // Same event arrives again, now with an attendee
      const event = makeEvent(); // has john@example.com as attendee
      const result = await callStateManager.handleCalendarEvent(event, CLIENT_ID, CLOSER);

      expect(result.action).toBe('updated');
      expect(result.callRecord.prospect_email).toBe('john@example.com');
      expect(result.callRecord.prospect_name).toBe('John Smith');
    });

    it('should update prospect_name when title changes and name was from title', async () => {
      // Existing record with name extracted from title
      mockBQ._seedTable('Calls', [{
        call_id: 'call_001',
        appointment_id: 'event_abc123',
        client_id: CLIENT_ID,
        attendance: null,
        appointment_date: '2026-02-20T20:00:00.000Z',
        prospect_email: 'jane@example.com',
        prospect_name: 'Old Name',
        call_type: 'First Call',
        created: '2026-02-18T10:00:00.000Z',
      }]);

      // Same event, same time, but attendee now has a display name
      const event = makeEvent({
        attendees: [
          { email: 'sarah@acmecoaching.com', name: 'Sarah Closer', isOrganizer: true },
          { email: 'jane@example.com', name: 'Jane Doe', isOrganizer: false },
        ],
      });
      const result = await callStateManager.handleCalendarEvent(event, CLIENT_ID, CLOSER);

      expect(result.action).toBe('updated');
      expect(result.callRecord.prospect_name).toBe('Jane Doe');
      expect(result.callRecord.prospect_email).toBe('jane@example.com');
    });

    it('should still skip when same event has same prospect info (true duplicate)', async () => {
      mockBQ._seedTable('Calls', [{
        call_id: 'call_001',
        appointment_id: 'event_abc123',
        client_id: CLIENT_ID,
        attendance: null,
        appointment_date: '2026-02-20T20:00:00.000Z',
        prospect_email: 'john@example.com',
        prospect_name: 'John Smith',
        call_type: 'First Call',
        created: '2026-02-18T10:00:00.000Z',
      }]);

      const event = makeEvent(); // same attendees as existing
      const result = await callStateManager.handleCalendarEvent(event, CLIENT_ID, CLOSER);

      expect(result.action).toBe('skipped');
    });

    it('should update both time and prospect when both change', async () => {
      mockBQ._seedTable('Calls', [{
        call_id: 'call_001',
        appointment_id: 'event_abc123',
        client_id: CLIENT_ID,
        attendance: null,
        appointment_date: '2026-02-20T20:00:00.000Z',
        prospect_email: 'unknown',
        prospect_name: null,
        call_type: 'First Call',
        created: '2026-02-18T10:00:00.000Z',
      }]);

      // New time AND new attendee
      const event = makeEvent({ startTime: '2026-02-21T18:00:00.000Z' });
      const result = await callStateManager.handleCalendarEvent(event, CLIENT_ID, CLOSER);

      expect(result.action).toBe('updated');
      expect(result.callRecord.appointment_date).toBe('2026-02-21T18:00:00.000Z');
      expect(result.callRecord.prospect_email).toBe('john@example.com');
      expect(result.callRecord.prospect_name).toBe('John Smith');
    });

    it('should update when prospect replaced with a different one', async () => {
      mockBQ._seedTable('Calls', [{
        call_id: 'call_001',
        appointment_id: 'event_abc123',
        client_id: CLIENT_ID,
        attendance: null,
        appointment_date: '2026-02-20T20:00:00.000Z',
        prospect_email: 'old-prospect@example.com',
        prospect_name: 'Old Prospect',
        call_type: 'First Call',
        created: '2026-02-18T10:00:00.000Z',
      }]);

      // Same time, different attendee
      const event = makeEvent({
        attendees: [
          { email: 'sarah@acmecoaching.com', name: 'Sarah Closer', isOrganizer: true },
          { email: 'new-prospect@example.com', name: 'New Prospect', isOrganizer: false },
        ],
      });
      const result = await callStateManager.handleCalendarEvent(event, CLIENT_ID, CLOSER);

      expect(result.action).toBe('updated');
      expect(result.callRecord.prospect_email).toBe('new-prospect@example.com');
      expect(result.callRecord.prospect_name).toBe('New Prospect');
    });

    it('should re-determine call_type when prospect changes from unknown to known', async () => {
      // Seed a prior show for this prospect
      mockBQ._seedTable('Calls', [
        {
          call_id: 'prior_show',
          appointment_id: 'event_old',
          client_id: CLIENT_ID,
          prospect_email: 'returning@example.com',
          attendance: 'Show',
          created: '2026-02-10T10:00:00.000Z',
        },
        {
          call_id: 'call_001',
          appointment_id: 'event_abc123',
          client_id: CLIENT_ID,
          attendance: null,
          appointment_date: '2026-02-20T20:00:00.000Z',
          prospect_email: 'unknown',
          prospect_name: null,
          call_type: 'First Call',
          created: '2026-02-18T10:00:00.000Z',
        },
      ]);

      // Invitee added — turns out it's a returning prospect
      const event = makeEvent({
        attendees: [
          { email: 'sarah@acmecoaching.com', name: 'Sarah Closer', isOrganizer: true },
          { email: 'returning@example.com', name: 'Returning Prospect', isOrganizer: false },
        ],
      });
      const result = await callStateManager.handleCalendarEvent(event, CLIENT_ID, CLOSER);

      expect(result.action).toBe('updated');
      expect(result.callRecord.prospect_email).toBe('returning@example.com');
      expect(result.callRecord.call_type).toBe('Follow Up');
    });
  });

  describe('_nameFromEmail', () => {
    it('should convert dot-separated email to name', () => {
      expect(callStateManager._nameFromEmail('john.smith@gmail.com')).toBe('John Smith');
    });

    it('should convert underscore-separated email to name', () => {
      expect(callStateManager._nameFromEmail('jane_doe@company.com')).toBe('Jane Doe');
    });

    it('should strip trailing numbers', () => {
      expect(callStateManager._nameFromEmail('jane.doe123@company.com')).toBe('Jane Doe123');
    });

    it('should handle single-word email prefix', () => {
      expect(callStateManager._nameFromEmail('john@gmail.com')).toBe('John');
    });

    it('should handle hyphenated email prefix', () => {
      expect(callStateManager._nameFromEmail('mary-jane@example.com')).toBe('Mary Jane');
    });
  });
});
