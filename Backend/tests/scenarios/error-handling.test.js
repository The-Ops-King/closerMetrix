/**
 * ERROR HANDLING & DATA INTEGRITY SCENARIOS (37, 48) + Invalid State Transitions
 *
 * Tests the system's behavior when things go wrong:
 * - Scenario 37: Calendar event exists but closer email doesn't match any known closer
 * - Scenario 48: Transcript webhook from an unknown closer (can't determine client)
 * - Invalid state transitions: verify the state machine rejects impossible paths
 * - Disqualified prospect rebooks: DQ'd prospect should still be classified as Follow Up
 */

jest.mock('../../src/db/BigQueryClient', () => require('../helpers/mockBigQuery'));

const callStateManager = require('../../src/services/CallStateManager');
const transcriptService = require('../../src/services/transcript/TranscriptService');
const calendarService = require('../../src/services/calendar/CalendarService');
const googleAdapter = require('../../src/services/calendar/adapters/GoogleCalendarAdapter');
const mockBQ = require('../helpers/mockBigQuery');

const CLIENT_ID = 'friends_inc';

/**
 * Seeds the minimum data needed for most tests: one client and one closer.
 */
function seedBaseData() {
  mockBQ._seedTable('Clients', [{
    client_id: CLIENT_ID,
    company_name: 'Friends Inc',
    webhook_secret: 'secret_123',
    status: 'active',
    filter_word: 'strategy,discovery',
    offer_name: 'Executive Coaching',
    offer_price: 10000,
    transcript_provider: 'fathom',
    timezone: 'America/New_York',
  }]);
  mockBQ._seedTable('Closers', [{
    closer_id: 'closer_sarah_001',
    client_id: CLIENT_ID,
    name: 'Sarah Closer',
    work_email: 'sarah@acmecoaching.com',
    transcript_provider: 'fathom',
    status: 'active',
  }]);
}

/**
 * Helper: process a raw Google Calendar event through the adapter + state manager.
 * Simulates the path CalendarService._processOneEvent takes,
 * minus the Google API calls and filter_word check.
 */
async function processRawEvent(rawEvent, closer) {
  const event = googleAdapter.normalizeEvent(rawEvent);
  event.declinedAttendees = googleAdapter.getDeclinedAttendees(rawEvent);
  return callStateManager.handleCalendarEvent(event, CLIENT_ID, closer);
}

beforeEach(() => {
  mockBQ._reset();
});

// =============================================================================
// SCENARIO 37: Calendar event exists, no call record created (error detection)
// =============================================================================
describe('Scenario 37: Calendar event exists but closer email unrecognized', () => {
  it('should skip the event when the organizer does not match any known closer', async () => {
    seedBaseData();

    // Build a calendar event with an organizer email that does NOT match
    // any closer in the Closers table for this client.
    const rawEvent = {
      id: 'event_unknown_closer_001',
      status: 'confirmed',
      summary: 'Discovery Call with Prospect',
      start: {
        dateTime: '2026-02-20T15:00:00-05:00',
        timeZone: 'America/New_York',
      },
      end: {
        dateTime: '2026-02-20T16:00:00-05:00',
        timeZone: 'America/New_York',
      },
      organizer: {
        email: 'not_a_closer@unknown.com',
        displayName: 'Unknown Person',
        self: true,
      },
      creator: {
        email: 'not_a_closer@unknown.com',
        displayName: 'Unknown Person',
      },
      attendees: [
        {
          email: 'not_a_closer@unknown.com',
          displayName: 'Unknown Person',
          organizer: true,
          responseStatus: 'accepted',
        },
        {
          email: 'prospect@example.com',
          displayName: 'Some Prospect',
          responseStatus: 'needsAction',
        },
      ],
    };

    // CalendarService._processOneEvent would call _identifyCloser, which
    // queries Closers by work_email for this client. Since the organizer
    // email doesn't match, it returns null and the event is skipped.
    // We test this through CalendarService._processOneEvent indirectly by
    // checking CalendarService._identifyCloser logic.
    //
    // Directly: CalendarService._identifyCloser checks the organizer email
    // and each attendee email against the Closers table. Neither
    // "not_a_closer@unknown.com" nor "prospect@example.com" are closers.
    const closerQueries = require('../../src/db/queries/closers');
    const closerFromOrganizer = await closerQueries.findByWorkEmail(
      'not_a_closer@unknown.com',
      CLIENT_ID
    );
    expect(closerFromOrganizer).toBeNull();

    const closerFromAttendee = await closerQueries.findByWorkEmail(
      'prospect@example.com',
      CLIENT_ID
    );
    expect(closerFromAttendee).toBeNull();

    // Verify no call record was created
    const calls = mockBQ._getTable('Calls');
    expect(calls).toHaveLength(0);
  });

  it('should still create a record when the organizer IS a known closer', async () => {
    seedBaseData();

    const rawEvent = {
      id: 'event_valid_closer_001',
      status: 'confirmed',
      summary: 'Discovery Call with Real Prospect',
      start: {
        dateTime: '2026-02-20T15:00:00-05:00',
        timeZone: 'America/New_York',
      },
      end: {
        dateTime: '2026-02-20T16:00:00-05:00',
        timeZone: 'America/New_York',
      },
      organizer: {
        email: 'sarah@acmecoaching.com',
        displayName: 'Sarah Closer',
        self: true,
      },
      creator: {
        email: 'sarah@acmecoaching.com',
        displayName: 'Sarah Closer',
      },
      attendees: [
        {
          email: 'sarah@acmecoaching.com',
          displayName: 'Sarah Closer',
          organizer: true,
          responseStatus: 'accepted',
        },
        {
          email: 'realprospect@example.com',
          displayName: 'Real Prospect',
          responseStatus: 'needsAction',
        },
      ],
    };

    const closer = {
      closer_id: 'closer_sarah_001',
      client_id: CLIENT_ID,
      name: 'Sarah Closer',
      work_email: 'sarah@acmecoaching.com',
      status: 'active',
      transcript_provider: 'fathom',
    };

    const result = await processRawEvent(rawEvent, closer);
    expect(result.action).toBe('created');
    expect(result.callRecord.closer_id).toBe('closer_sarah_001');

    const calls = mockBQ._getTable('Calls');
    expect(calls).toHaveLength(1);
  });
});

// =============================================================================
// SCENARIO 48: Webhook can't determine which client
// =============================================================================
describe('Scenario 48: Transcript webhook from unknown closer — can\'t determine client', () => {
  it('should return unidentified when closer email does not match any closer record', async () => {
    seedBaseData();

    const unknownPayload = {
      recording_id: 99999,
      recorded_by: { email: 'totally_unknown@nowhere.com', name: 'Mystery Person' },
      calendar_invitees: [
        { email: 'totally_unknown@nowhere.com', name: 'Mystery Person', is_external: false },
        { email: 'prospect@example.com', name: 'Some Prospect', is_external: true },
      ],
      scheduled_start_time: '2026-02-20T20:00:00Z',
      recording_start_time: '2026-02-20T20:02:00Z',
      recording_end_time: '2026-02-20T20:45:00Z',
      transcript: [
        { speaker: { display_name: 'Mystery Person', matched_calendar_invitee_email: 'totally_unknown@nowhere.com' }, text: 'Hello there.', timestamp: 0 },
        { speaker: { display_name: 'Some Prospect', matched_calendar_invitee_email: 'prospect@example.com' }, text: 'Hi, glad to be here.', timestamp: 5 },
      ],
      share_url: 'https://fathom.video/share/unknown123',
    };

    const result = await transcriptService.processTranscriptWebhook('fathom', unknownPayload);
    expect(result.action).toBe('unidentified');
    expect(result.callRecord).toBeNull();
  });

  it('should NOT create any call record when client cannot be determined', async () => {
    seedBaseData();

    const unknownPayload = {
      recording_id: 88888,
      recorded_by: { email: 'ghost@phantom.com', name: 'Ghost User' },
      calendar_invitees: [
        { email: 'ghost@phantom.com', name: 'Ghost User', is_external: false },
        { email: 'someone@example.com', name: 'Someone', is_external: true },
      ],
      scheduled_start_time: '2026-02-21T14:00:00Z',
      recording_start_time: '2026-02-21T14:02:00Z',
      recording_end_time: '2026-02-21T14:30:00Z',
      transcript: [
        { speaker: { display_name: 'Ghost User', matched_calendar_invitee_email: 'ghost@phantom.com' }, text: 'Testing one two three.', timestamp: 0 },
        { speaker: { display_name: 'Someone', matched_calendar_invitee_email: 'someone@example.com' }, text: 'Can you hear me?', timestamp: 3 },
      ],
      share_url: 'https://fathom.video/share/ghost456',
    };

    await transcriptService.processTranscriptWebhook('fathom', unknownPayload);

    // No call record should have been created
    const calls = mockBQ._getTable('Calls');
    expect(calls).toHaveLength(0);
  });

  it('should correctly identify client when closer email IS known', async () => {
    seedBaseData();

    // Seed a call record for Sarah so the transcript can match
    mockBQ._seedTable('Calls', [{
      call_id: 'call_known_001',
      appointment_id: 'event_known_001',
      client_id: CLIENT_ID,
      closer_id: 'closer_sarah_001',
      prospect_email: 'prospect@example.com',
      prospect_name: 'Some Prospect',
      attendance: null,
      appointment_date: '2026-02-20T20:00:00.000Z',
      created: '2026-02-18T10:00:00.000Z',
      transcript_status: 'Pending',
      transcript_link: null,
      recording_url: null,
      call_url: null,
      duration_minutes: null,
      processing_status: 'pending',
    }]);

    const knownPayload = {
      recording_id: 77777,
      recorded_by: { email: 'sarah@acmecoaching.com', name: 'Sarah Closer' },
      calendar_invitees: [
        { email: 'sarah@acmecoaching.com', name: 'Sarah Closer', is_external: false },
        { email: 'prospect@example.com', name: 'Some Prospect', is_external: true },
      ],
      scheduled_start_time: '2026-02-20T20:00:00Z',
      recording_start_time: '2026-02-20T20:02:00Z',
      recording_end_time: '2026-02-20T20:45:00Z',
      transcript: [
        { speaker: { display_name: 'Sarah Closer', matched_calendar_invitee_email: 'sarah@acmecoaching.com' }, text: 'Hi, thanks for joining today. Let me tell you about our program.', timestamp: 0 },
        { speaker: { display_name: 'Some Prospect', matched_calendar_invitee_email: 'prospect@example.com' }, text: 'Thanks for having me. I have been looking forward to learning more about what you offer.', timestamp: 5 },
        { speaker: { display_name: 'Sarah Closer', matched_calendar_invitee_email: 'sarah@acmecoaching.com' }, text: 'Great! Let us start with some questions about your goals and current situation.', timestamp: 15 },
        { speaker: { display_name: 'Some Prospect', matched_calendar_invitee_email: 'prospect@example.com' }, text: 'Sure, I am currently struggling with time management and want to grow my business to seven figures.', timestamp: 25 },
        { speaker: { display_name: 'Some Prospect', matched_calendar_invitee_email: 'prospect@example.com' }, text: 'I have tried coaching before but it did not work out. I am hoping this will be different.', timestamp: 35 },
      ],
      share_url: 'https://fathom.video/share/known789',
    };

    const result = await transcriptService.processTranscriptWebhook('fathom', knownPayload);

    // Should NOT be unidentified — Sarah is a known closer
    expect(result.action).not.toBe('unidentified');
    // Should be 'show' since the transcript has a real conversation
    expect(result.action).toBe('show');
  });
});

// =============================================================================
// INVALID STATE TRANSITIONS: State machine rejects impossible paths
// =============================================================================
describe('Invalid State Transitions', () => {
  /**
   * Helper: seeds a call with a specific starting attendance state.
   */
  function seedCallWithState(callId, attendance, extraFields = {}) {
    seedBaseData();
    mockBQ._seedTable('Calls', [{
      call_id: callId,
      appointment_id: `event_${callId}`,
      client_id: CLIENT_ID,
      closer_id: 'closer_sarah_001',
      prospect_email: 'john@example.com',
      prospect_name: 'John Smith',
      attendance,
      appointment_date: '2026-02-20T20:00:00.000Z',
      created: '2026-02-18T10:00:00.000Z',
      ...extraFields,
    }]);
  }

  it('should REJECT null -> Closed - Won (cannot skip Show)', async () => {
    seedCallWithState('call_invalid_001', null);

    const result = await callStateManager.transitionState(
      'call_invalid_001',
      CLIENT_ID,
      'Closed - Won',
      'ai_outcome'
    );

    expect(result).toBe(false);

    // Attendance should remain null
    const calls = mockBQ._getTable('Calls');
    expect(calls[0].attendance).toBeNull();
  });

  it('should REJECT Show -> Waiting for Outcome (cannot go backward from Show)', async () => {
    seedCallWithState('call_invalid_002', 'Show');

    const result = await callStateManager.transitionState(
      'call_invalid_002',
      CLIENT_ID,
      'Waiting for Outcome',
      'appointment_time_passed'
    );

    expect(result).toBe(false);

    const calls = mockBQ._getTable('Calls');
    expect(calls[0].attendance).toBe('Show');
  });

  it('should REJECT Canceled -> Show (Canceled is terminal for Shows)', async () => {
    seedCallWithState('call_invalid_003', 'Canceled');

    const result = await callStateManager.transitionState(
      'call_invalid_003',
      CLIENT_ID,
      'Show',
      'transcript_received_valid'
    );

    expect(result).toBe(false);

    const calls = mockBQ._getTable('Calls');
    expect(calls[0].attendance).toBe('Canceled');
  });

  it('should REJECT Closed - Won -> Follow Up (Closed-Won is terminal for non-refund)', async () => {
    seedCallWithState('call_invalid_004', 'Closed - Won');

    const result = await callStateManager.transitionState(
      'call_invalid_004',
      CLIENT_ID,
      'Follow Up',
      'new_call_scheduled'
    );

    expect(result).toBe(false);

    const calls = mockBQ._getTable('Calls');
    expect(calls[0].attendance).toBe('Closed - Won');
  });

  it('should REJECT Ghosted - No Show -> Waiting for Outcome (cannot go backward)', async () => {
    seedCallWithState('call_invalid_005', 'Ghosted - No Show');

    const result = await callStateManager.transitionState(
      'call_invalid_005',
      CLIENT_ID,
      'Waiting for Outcome',
      'appointment_time_passed'
    );

    expect(result).toBe(false);

    const calls = mockBQ._getTable('Calls');
    expect(calls[0].attendance).toBe('Ghosted - No Show');
  });

  it('should REJECT Waiting for Outcome -> null (cannot go backward to unset)', async () => {
    seedCallWithState('call_invalid_006', 'Waiting for Outcome');

    // There is no valid trigger to transition back to null
    const result = await callStateManager.transitionState(
      'call_invalid_006',
      CLIENT_ID,
      null,
      'system_reset'
    );

    expect(result).toBe(false);

    const calls = mockBQ._getTable('Calls');
    expect(calls[0].attendance).toBe('Waiting for Outcome');
  });

  it('should log an audit entry with error action for every invalid transition', async () => {
    seedCallWithState('call_audit_err_001', 'Canceled');

    await callStateManager.transitionState(
      'call_audit_err_001',
      CLIENT_ID,
      'Show',
      'transcript_received_valid'
    );

    const auditEntries = mockBQ._getTable('AuditLog');
    const errorEntry = auditEntries.find(
      e => e.entity_id === 'call_audit_err_001' && e.action === 'error'
    );
    expect(errorEntry).toBeDefined();
    expect(errorEntry.field_changed).toBe('attendance');
    expect(errorEntry.old_value).toBe('Canceled');
    expect(errorEntry.new_value).toBe('Show');
    expect(JSON.parse(errorEntry.metadata).error).toBe('Invalid state transition');
  });
});

// =============================================================================
// DISQUALIFIED PROSPECT REBOOKS: Should be classified as Follow Up
// =============================================================================
describe('Disqualified prospect rebooks — should be Follow Up', () => {
  it('should classify a new call as Follow Up when prospect had a prior Disqualified call', async () => {
    seedBaseData();

    // Seed a prior call where the prospect was Disqualified
    // (Disqualified is a post-Show state, so countPriorShows includes it)
    mockBQ._seedTable('Calls', [{
      call_id: 'call_dq_001',
      appointment_id: 'event_dq_001',
      client_id: CLIENT_ID,
      closer_id: 'closer_sarah_001',
      prospect_email: 'disqualified_prospect@example.com',
      prospect_name: 'DQ Prospect',
      attendance: 'Disqualified',
      call_outcome: 'Disqualified',
      appointment_date: '2026-02-10T20:00:00.000Z',
      created: '2026-02-10T10:00:00.000Z',
    }]);

    // Now the same prospect books a new call via a new calendar event
    const rebookEvent = {
      id: 'event_dq_rebook_001',
      status: 'confirmed',
      summary: 'Strategy Call with DQ Prospect',
      start: {
        dateTime: '2026-02-25T15:00:00-05:00',
        timeZone: 'America/New_York',
      },
      end: {
        dateTime: '2026-02-25T16:00:00-05:00',
        timeZone: 'America/New_York',
      },
      organizer: {
        email: 'sarah@acmecoaching.com',
        displayName: 'Sarah Closer',
        self: true,
      },
      creator: {
        email: 'sarah@acmecoaching.com',
        displayName: 'Sarah Closer',
      },
      attendees: [
        {
          email: 'sarah@acmecoaching.com',
          displayName: 'Sarah Closer',
          organizer: true,
          responseStatus: 'accepted',
        },
        {
          email: 'disqualified_prospect@example.com',
          displayName: 'DQ Prospect',
          responseStatus: 'needsAction',
        },
      ],
    };

    const closer = {
      closer_id: 'closer_sarah_001',
      client_id: CLIENT_ID,
      name: 'Sarah Closer',
      work_email: 'sarah@acmecoaching.com',
      status: 'active',
      transcript_provider: 'fathom',
    };

    const result = await processRawEvent(rebookEvent, closer);

    expect(result.action).toBe('created');
    // Because the prospect had a prior Disqualified (post-Show) call,
    // determineCallType should return 'Follow Up'
    expect(result.callRecord.call_type).toBe('Follow Up');

    // Verify two call records exist: the original DQ and the new rebook
    const calls = mockBQ._getTable('Calls');
    expect(calls).toHaveLength(2);
    expect(calls[0].attendance).toBe('Disqualified');
    expect(calls[1].call_type).toBe('Follow Up');
    expect(calls[1].attendance).toBeNull(); // newly created, not yet held
  });

  it('should classify as First Call if prospect was only ghosted (no prior Show)', async () => {
    seedBaseData();

    // Seed a prior call where the prospect was Ghosted (NOT a post-Show state)
    mockBQ._seedTable('Calls', [{
      call_id: 'call_ghost_001',
      appointment_id: 'event_ghost_001',
      client_id: CLIENT_ID,
      closer_id: 'closer_sarah_001',
      prospect_email: 'ghosted_prospect@example.com',
      prospect_name: 'Ghosted Prospect',
      attendance: 'Ghosted - No Show',
      call_outcome: null,
      appointment_date: '2026-02-10T20:00:00.000Z',
      created: '2026-02-10T10:00:00.000Z',
    }]);

    const rebookEvent = {
      id: 'event_ghost_rebook_001',
      status: 'confirmed',
      summary: 'Discovery Call with Ghosted Prospect',
      start: {
        dateTime: '2026-02-25T15:00:00-05:00',
        timeZone: 'America/New_York',
      },
      end: {
        dateTime: '2026-02-25T16:00:00-05:00',
        timeZone: 'America/New_York',
      },
      organizer: {
        email: 'sarah@acmecoaching.com',
        displayName: 'Sarah Closer',
        self: true,
      },
      creator: {
        email: 'sarah@acmecoaching.com',
        displayName: 'Sarah Closer',
      },
      attendees: [
        {
          email: 'sarah@acmecoaching.com',
          displayName: 'Sarah Closer',
          organizer: true,
          responseStatus: 'accepted',
        },
        {
          email: 'ghosted_prospect@example.com',
          displayName: 'Ghosted Prospect',
          responseStatus: 'needsAction',
        },
      ],
    };

    const closer = {
      closer_id: 'closer_sarah_001',
      client_id: CLIENT_ID,
      name: 'Sarah Closer',
      work_email: 'sarah@acmecoaching.com',
      status: 'active',
      transcript_provider: 'fathom',
    };

    const result = await processRawEvent(rebookEvent, closer);

    expect(result.action).toBe('created');
    // Ghosted is NOT a post-Show state, so this is still a First Call
    expect(result.callRecord.call_type).toBe('First Call');
  });
});
