/**
 * PRE-CALL SCENARIOS (1-10)
 *
 * Tests the full calendar pipeline from normalized event → CallStateManager
 * → BigQuery state verification.
 *
 * These test the core calendar lifecycle without transcripts or AI:
 * scheduling, canceling, rescheduling, duplicates, and edge cases.
 */

jest.mock('../../src/db/BigQueryClient', () => require('../helpers/mockBigQuery'));

const callStateManager = require('../../src/services/CallStateManager');
const calendarService = require('../../src/services/calendar/CalendarService');
const googleAdapter = require('../../src/services/calendar/adapters/GoogleCalendarAdapter');
const mockBQ = require('../helpers/mockBigQuery');
const createdFixture = require('../helpers/fixtures/google-calendar-created.json');
const cancelledFixture = require('../helpers/fixtures/google-calendar-cancelled.json');
const updatedFixture = require('../helpers/fixtures/google-calendar-updated.json');

// Test constants
const CLIENT_ID = 'friends_inc';
const MOCK_CLOSER = {
  closer_id: 'closer_sarah_001',
  client_id: CLIENT_ID,
  name: 'Sarah Closer',
  work_email: 'sarah@acmecoaching.com',
  status: 'active',
  transcript_provider: 'fathom',
};

/**
 * Helper: process a raw Google Calendar event through the adapter + state manager.
 * This simulates the path CalendarService._processOneEvent takes,
 * minus the Google API calls and filter_word check.
 */
async function processRawEvent(rawEvent, closer = MOCK_CLOSER) {
  const event = googleAdapter.normalizeEvent(rawEvent);
  event.declinedAttendees = googleAdapter.getDeclinedAttendees(rawEvent);
  return callStateManager.handleCalendarEvent(event, CLIENT_ID, closer);
}

beforeEach(() => {
  mockBQ._reset();
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 1: Call scheduled then canceled
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 1: Call scheduled then canceled', () => {
  it('should create a Scheduled record, then transition to Canceled', async () => {
    // Step 1: Calendar event created
    const result1 = await processRawEvent(createdFixture);
    expect(result1.action).toBe('created');
    expect(result1.callRecord.attendance).toBeNull();
    expect(result1.callRecord.appointment_id).toBe('event_abc123');

    const calls = mockBQ._getTable('Calls');
    expect(calls).toHaveLength(1);
    expect(calls[0].attendance).toBeNull();
    expect(calls[0].prospect_email).toBe('john@example.com');
    expect(calls[0].prospect_name).toBe('John Smith');

    // Step 2: Event gets cancelled
    const result2 = await processRawEvent(cancelledFixture);
    expect(result2.action).toBe('canceled');
    expect(result2.callRecord.attendance).toBe('Canceled');

    // Verify in the DB the state changed
    expect(calls[0].attendance).toBe('Canceled');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 2: Ghosted — No Show
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 2: Ghosted — No Show (prospect doesn\'t show)', () => {
  it('should create call with null attendance, then transition through Waiting for Outcome to Ghosted', async () => {
    // Step 1: Calendar event created
    const result = await processRawEvent(createdFixture);
    expect(result.action).toBe('created');
    expect(result.callRecord.attendance).toBeNull();

    // Step 2: Appointment end time passes → transition to Waiting for Outcome
    const waitingSuccess = await callStateManager.transitionState(
      result.callRecord.call_id,
      CLIENT_ID,
      'Waiting for Outcome',
      'appointment_time_passed'
    );
    expect(waitingSuccess).toBe(true);
    let calls = mockBQ._getTable('Calls');
    expect(calls[0].attendance).toBe('Waiting for Outcome');

    // Step 3: Timeout passes, no transcript → transition to Ghosted
    const ghostedSuccess = await callStateManager.transitionState(
      result.callRecord.call_id,
      CLIENT_ID,
      'Ghosted - No Show',
      'transcript_timeout'
    );

    expect(ghostedSuccess).toBe(true);
    calls = mockBQ._getTable('Calls');
    expect(calls[0].attendance).toBe('Ghosted - No Show');
  });

  it('should transition to Ghosted when transcript is empty/one-speaker', async () => {
    const result = await processRawEvent(createdFixture);

    const success = await callStateManager.transitionState(
      result.callRecord.call_id,
      CLIENT_ID,
      'Ghosted - No Show',
      'transcript_received_empty_or_one_speaker'
    );

    expect(success).toBe(true);
    const calls = mockBQ._getTable('Calls');
    expect(calls[0].attendance).toBe('Ghosted - No Show');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 3: Call rescheduled (same event ID, new time)
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 3: Call rescheduled (same event ID, new time)', () => {
  it('should update the appointment_date when time changes while still Scheduled', async () => {
    // Step 1: Original event creates Scheduled record
    const result1 = await processRawEvent(createdFixture);
    expect(result1.action).toBe('created');
    const originalTime = result1.callRecord.appointment_date;

    // Step 2: Same event ID arrives with new time (updatedFixture has 17:00 instead of 15:00)
    const result2 = await processRawEvent(updatedFixture);
    expect(result2.action).toBe('updated');

    const newTime = result2.callRecord.appointment_date;
    expect(newTime).not.toBe(originalTime);

    // Only one call record should exist
    const calls = mockBQ._getTable('Calls');
    expect(calls).toHaveLength(1);
    expect(calls[0].appointment_date).toBe(newTime);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 3.5: Call scheduled, canceled, rebooked (new event ID)
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 3.5: Call scheduled, canceled, rebooked (new event ID)', () => {
  it('should create a Canceled record and then a new Scheduled record', async () => {
    // Step 1: Original event
    const result1 = await processRawEvent(createdFixture);
    expect(result1.action).toBe('created');

    // Step 2: Cancel it
    const result2 = await processRawEvent(cancelledFixture);
    expect(result2.action).toBe('canceled');

    // Step 3: New event with a different ID
    const newEventFixture = {
      ...createdFixture,
      id: 'event_rebooking_456',
    };
    const result3 = await processRawEvent(newEventFixture);
    expect(result3.action).toBe('created');
    expect(result3.callRecord.attendance).toBeNull();
    expect(result3.callRecord.appointment_id).toBe('event_rebooking_456');

    // Two call records should exist now
    const calls = mockBQ._getTable('Calls');
    expect(calls).toHaveLength(2);
    expect(calls[0].attendance).toBe('Canceled');
    expect(calls[1].attendance).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 4: Call held — both show
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 4: Call held — both parties show', () => {
  it('should create Scheduled, then transition to Show when transcript arrives', async () => {
    // Step 1: Event creates Scheduled record
    const result = await processRawEvent(createdFixture);
    expect(result.action).toBe('created');
    expect(result.callRecord.attendance).toBeNull();

    // Step 2: Transcript arrives with valid content → transition to Show
    const success = await callStateManager.transitionState(
      result.callRecord.call_id,
      CLIENT_ID,
      'Show',
      'transcript_received_valid',
      {
        duration_minutes: 47,
        transcript_link: 'https://fathom.video/call/abc123',
        transcript_status: 'Received',
      }
    );

    expect(success).toBe(true);
    const calls = mockBQ._getTable('Calls');
    expect(calls[0].attendance).toBe('Show');
    expect(calls[0].duration_minutes).toBe(47);
    expect(calls[0].transcript_link).toBe('https://fathom.video/call/abc123');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 5: No recording (system glitch, nobody records)
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 5: No recording — system glitch', () => {
  it('should transition Scheduled → No Recording on system_recording_failure', async () => {
    const result = await processRawEvent(createdFixture);

    const success = await callStateManager.transitionState(
      result.callRecord.call_id,
      CLIENT_ID,
      'No Recording',
      'system_recording_failure'
    );

    expect(success).toBe(true);
    const calls = mockBQ._getTable('Calls');
    expect(calls[0].attendance).toBe('No Recording');
  });

  it('should allow transition from No Recording → Show if transcript arrives late', async () => {
    const result = await processRawEvent(createdFixture);

    // First: marked as No Recording
    await callStateManager.transitionState(
      result.callRecord.call_id,
      CLIENT_ID,
      'No Recording',
      'system_recording_failure'
    );

    // Then: transcript actually arrives
    const success = await callStateManager.transitionState(
      result.callRecord.call_id,
      CLIENT_ID,
      'Show',
      'transcript_received_valid'
    );

    expect(success).toBe(true);
    const calls = mockBQ._getTable('Calls');
    expect(calls[0].attendance).toBe('Show');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 6: Prospect shows up late, shorter call
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 6: Prospect shows late — shorter call', () => {
  it('should still process normally with short duration', async () => {
    const result = await processRawEvent(createdFixture);

    // Transcript arrives — short duration but still valid
    const success = await callStateManager.transitionState(
      result.callRecord.call_id,
      CLIENT_ID,
      'Show',
      'transcript_received_valid',
      { duration_minutes: 12 }
    );

    expect(success).toBe(true);
    const calls = mockBQ._getTable('Calls');
    expect(calls[0].attendance).toBe('Show');
    expect(calls[0].duration_minutes).toBe(12);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 7: Call assigned to wrong closer, reassigned
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 7: Call scheduled to wrong closer, then reassigned', () => {
  it('should create separate records for different closers on different events', async () => {
    const CLOSER_2 = {
      closer_id: 'closer_mike_002',
      client_id: CLIENT_ID,
      name: 'Mike Closer',
      work_email: 'mike@acmecoaching.com',
      status: 'active',
      transcript_provider: 'fathom',
    };

    // Step 1: Event with wrong closer (Sarah)
    const result1 = await processRawEvent(createdFixture, MOCK_CLOSER);
    expect(result1.action).toBe('created');
    expect(result1.callRecord.closer_id).toBe('closer_sarah_001');

    // Step 2: New event with correct closer (Mike), different event ID
    const correctEvent = {
      ...createdFixture,
      id: 'event_correct_789',
      organizer: { email: 'mike@acmecoaching.com', displayName: 'Mike Closer', self: true },
      attendees: [
        { email: 'mike@acmecoaching.com', displayName: 'Mike Closer', organizer: true, responseStatus: 'accepted' },
        { email: 'john@example.com', displayName: 'John Smith', responseStatus: 'accepted' },
      ],
    };
    const result2 = await processRawEvent(correctEvent, CLOSER_2);
    expect(result2.action).toBe('created');
    expect(result2.callRecord.closer_id).toBe('closer_mike_002');

    const calls = mockBQ._getTable('Calls');
    expect(calls).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 8: Call rescheduled 3-4 times before happening
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 8: Call rescheduled 3-4 times before happening', () => {
  it('should update time on each reschedule, then transition to Show', async () => {
    // Step 1: Initial creation
    const result1 = await processRawEvent(createdFixture);
    expect(result1.action).toBe('created');

    // Step 2: First reschedule (time change)
    const reschedule1 = { ...createdFixture, start: { dateTime: '2026-02-21T15:00:00-05:00', timeZone: 'America/New_York' } };
    const result2 = await processRawEvent(reschedule1);
    expect(result2.action).toBe('updated');

    // Step 3: Second reschedule
    const reschedule2 = { ...createdFixture, start: { dateTime: '2026-02-22T14:00:00-05:00', timeZone: 'America/New_York' } };
    const result3 = await processRawEvent(reschedule2);
    expect(result3.action).toBe('updated');

    // Step 4: Third reschedule
    const reschedule3 = { ...createdFixture, start: { dateTime: '2026-02-23T16:00:00-05:00', timeZone: 'America/New_York' } };
    const result4 = await processRawEvent(reschedule3);
    expect(result4.action).toBe('updated');

    // Only one record exists, with the latest time
    const calls = mockBQ._getTable('Calls');
    expect(calls).toHaveLength(1);

    // Step 5: Call finally happens
    const success = await callStateManager.transitionState(
      result1.callRecord.call_id,
      CLIENT_ID,
      'Show',
      'transcript_received_valid'
    );
    expect(success).toBe(true);
    expect(calls[0].attendance).toBe('Show');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 9: Duplicate booking — same prospect, two separate events
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 9: Duplicate booking — same prospect, two calls', () => {
  it('should create independent records for different event IDs', async () => {
    // Event 1
    const result1 = await processRawEvent(createdFixture);
    expect(result1.action).toBe('created');

    // Event 2 (different ID, same prospect)
    const event2 = {
      ...createdFixture,
      id: 'event_duplicate_456',
      start: { dateTime: '2026-02-21T15:00:00-05:00', timeZone: 'America/New_York' },
      end: { dateTime: '2026-02-21T16:00:00-05:00', timeZone: 'America/New_York' },
    };
    const result2 = await processRawEvent(event2);
    expect(result2.action).toBe('created');

    const calls = mockBQ._getTable('Calls');
    expect(calls).toHaveLength(2);
    expect(calls[0].appointment_id).toBe('event_abc123');
    expect(calls[1].appointment_id).toBe('event_duplicate_456');

    // Both have the same prospect
    expect(calls[0].prospect_email).toBe('john@example.com');
    expect(calls[1].prospect_email).toBe('john@example.com');
  });

  it('should mark the second call as Follow Up since prospect has a prior show', async () => {
    // First call goes through to Show
    const result1 = await processRawEvent(createdFixture);
    await callStateManager.transitionState(
      result1.callRecord.call_id,
      CLIENT_ID,
      'Show',
      'transcript_received_valid'
    );

    // Second event for same prospect
    const event2 = {
      ...createdFixture,
      id: 'event_followup_789',
      start: { dateTime: '2026-02-25T15:00:00-05:00', timeZone: 'America/New_York' },
      end: { dateTime: '2026-02-25T16:00:00-05:00', timeZone: 'America/New_York' },
    };
    const result2 = await processRawEvent(event2);
    expect(result2.action).toBe('created');
    expect(result2.callRecord.call_type).toBe('Follow Up');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 10: Flaky prospect — book, cancel, rebook, cancel, rebook
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 10: Flaky prospect — repeated book/cancel/rebook', () => {
  it('should handle a sequence of book/cancel/rebook correctly', async () => {
    // Round 1: Book
    const result1 = await processRawEvent(createdFixture);
    expect(result1.action).toBe('created');
    expect(result1.callRecord.attendance).toBeNull();

    // Round 1: Cancel
    const result2 = await processRawEvent(cancelledFixture);
    expect(result2.action).toBe('canceled');

    // Round 2: Rebook with new event
    const rebook1 = {
      ...createdFixture,
      id: 'event_rebook_001',
      start: { dateTime: '2026-02-22T14:00:00-05:00', timeZone: 'America/New_York' },
    };
    const result3 = await processRawEvent(rebook1);
    expect(result3.action).toBe('created');
    expect(result3.callRecord.attendance).toBeNull();

    // Round 2: Cancel again
    const cancel2 = {
      ...cancelledFixture,
      id: 'event_rebook_001',
    };
    const result4 = await processRawEvent(cancel2);
    expect(result4.action).toBe('canceled');

    // Round 3: Rebook once more
    const rebook2 = {
      ...createdFixture,
      id: 'event_rebook_002',
      start: { dateTime: '2026-02-25T15:00:00-05:00', timeZone: 'America/New_York' },
    };
    const result5 = await processRawEvent(rebook2);
    expect(result5.action).toBe('created');
    expect(result5.callRecord.attendance).toBeNull();

    // Verify: 3 records total (canceled, canceled, scheduled)
    const calls = mockBQ._getTable('Calls');
    expect(calls).toHaveLength(3);
    expect(calls[0].attendance).toBe('Canceled');
    expect(calls[1].attendance).toBe('Canceled');
    expect(calls[2].attendance).toBeNull();
  });

  it('should correctly identify call type even after multiple cancellations', async () => {
    // Book, cancel, rebook, actually show, then rebook again
    const result1 = await processRawEvent(createdFixture);
    await processRawEvent(cancelledFixture);

    const rebook = {
      ...createdFixture,
      id: 'event_rebook_show',
      start: { dateTime: '2026-02-23T14:00:00-05:00', timeZone: 'America/New_York' },
    };
    const result3 = await processRawEvent(rebook);

    // Prospect actually shows this time
    await callStateManager.transitionState(
      result3.callRecord.call_id,
      CLIENT_ID,
      'Show',
      'transcript_received_valid'
    );

    // Rebook after show — should be Follow Up
    const newEvent = {
      ...createdFixture,
      id: 'event_after_show',
      start: { dateTime: '2026-02-28T15:00:00-05:00', timeZone: 'America/New_York' },
    };
    const result4 = await processRawEvent(newEvent);
    expect(result4.action).toBe('created');
    expect(result4.callRecord.call_type).toBe('Follow Up');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 14: Calendar cancel after call held (Outcome Scenario, but related)
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 14: Calendar cancel after call already held', () => {
  it('should keep Show status when calendar event is cancelled after the call happened', async () => {
    // Step 1: Create and mark as Show
    const result1 = await processRawEvent(createdFixture);
    await callStateManager.transitionState(
      result1.callRecord.call_id,
      CLIENT_ID,
      'Show',
      'transcript_received_valid'
    );

    // Step 2: Calendar event gets cancelled (prospect cleaning up calendar)
    const result2 = await processRawEvent(cancelledFixture);

    // Should be skipped — the call already happened
    expect(result2.action).toBe('skipped');
    const calls = mockBQ._getTable('Calls');
    expect(calls[0].attendance).toBe('Show');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Additional: Audit trail verification
// ─────────────────────────────────────────────────────────────────────────────
describe('Audit trail', () => {
  it('should create audit log entries for call creation', async () => {
    await processRawEvent(createdFixture);

    const auditEntries = mockBQ._getTable('AuditLog');
    expect(auditEntries.length).toBeGreaterThanOrEqual(1);

    const createEntry = auditEntries.find(e => e.action === 'created');
    expect(createEntry).toBeDefined();
    expect(createEntry.entity_type).toBe('call');
    expect(createEntry.trigger_source).toBe('calendar_webhook');
  });

  it('should create audit log entries for state transitions', async () => {
    const result = await processRawEvent(createdFixture);

    await callStateManager.transitionState(
      result.callRecord.call_id,
      CLIENT_ID,
      'Canceled',
      'calendar_cancelled_or_deleted_or_declined'
    );

    const auditEntries = mockBQ._getTable('AuditLog');
    const stateChange = auditEntries.find(e => e.action === 'state_change');
    expect(stateChange).toBeDefined();
    expect(stateChange.old_value).toBeNull();
    expect(stateChange.new_value).toBe('Canceled');
    expect(stateChange.field_changed).toBe('attendance');
  });
});
