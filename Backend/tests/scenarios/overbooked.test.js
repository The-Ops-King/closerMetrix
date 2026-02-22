/**
 * OVERBOOKED SCENARIOS
 *
 * Tests the "Overbooked" attendance type — when a closer is double-booked
 * and takes one call but not the others.
 *
 * Key scenarios:
 * - Closer has 3 overlapping calls, takes one → other 2 become Overbooked
 * - Closer has 2 overlapping calls, one is cancelled before the other is taken
 * - Non-overlapping calls for same closer are NOT marked Overbooked
 * - Overbooked → Show if a transcript arrives (call was actually attended)
 * - Overbooked → Canceled if event is cancelled
 * - Calls already in Ghosted state → Overbooked when overlap detected
 * - Calls for different closers are NOT affected
 */

jest.mock('../../src/db/BigQueryClient', () => require('../helpers/mockBigQuery'));

const callStateManager = require('../../src/services/CallStateManager');
const mockBQ = require('../helpers/mockBigQuery');

const CLIENT_ID = 'friends_inc';

const CLOSER_A = {
  closer_id: 'closer_a',
  client_id: CLIENT_ID,
  name: 'Tyler Ray',
  work_email: 'tyler@acme.com',
  status: 'active',
  transcript_provider: 'fathom',
};

const CLOSER_B = {
  closer_id: 'closer_b',
  client_id: CLIENT_ID,
  name: 'Sarah Closer',
  work_email: 'sarah@acme.com',
  status: 'active',
  transcript_provider: 'fathom',
};

/**
 * Helper: creates a seed call record with the given overrides.
 */
function makeCall(overrides = {}) {
  return {
    call_id: overrides.call_id || 'call_' + Math.random().toString(36).slice(2, 8),
    appointment_id: overrides.appointment_id || 'evt_' + Math.random().toString(36).slice(2, 8),
    client_id: CLIENT_ID,
    closer_id: CLOSER_A.closer_id,
    prospect_name: 'Some Prospect',
    prospect_email: 'prospect@example.com',
    appointment_date: '2026-02-17T14:00:00Z',
    appointment_end_date: '2026-02-17T15:00:00Z',
    timezone: 'America/New_York',
    call_type: 'First Call',
    attendance: null,
    call_outcome: null,
    source: 'Google Calendar',
    transcript_status: 'Pending',
    processing_status: 'pending',
    ingestion_source: 'calendar',
    created: '2026-02-17T13:00:00Z',
    last_modified: '2026-02-17T13:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  mockBQ._reset();
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO: Three overlapping calls, closer takes one
// ─────────────────────────────────────────────────────────────────────────────
describe('Overbooked: Three overlapping calls, closer takes one', () => {
  it('should mark the other two calls as Overbooked when one transitions to Show', async () => {
    // All three calls at 2pm-3pm for the same closer
    const callA = makeCall({ call_id: 'call_a', appointment_id: 'evt_a', prospect_email: 'alice@example.com' });
    const callB = makeCall({ call_id: 'call_b', appointment_id: 'evt_b', prospect_email: 'bob@example.com' });
    const callC = makeCall({ call_id: 'call_c', appointment_id: 'evt_c', prospect_email: 'charlie@example.com' });

    mockBQ._seedTable('Calls', [callA, callB, callC]);

    // Transcript arrives for Call A → transition to Show
    const result = await callStateManager.transitionState(
      'call_a', CLIENT_ID, 'Show', 'transcript_received_valid'
    );
    expect(result).toBe(true);

    // Verify Call A is Show
    const calls = mockBQ._getTable('Calls');
    expect(calls.find(c => c.call_id === 'call_a').attendance).toBe('Show');

    // Call B and Call C should be Overbooked
    expect(calls.find(c => c.call_id === 'call_b').attendance).toBe('Overbooked');
    expect(calls.find(c => c.call_id === 'call_c').attendance).toBe('Overbooked');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO: Non-overlapping calls are NOT marked Overbooked
// ─────────────────────────────────────────────────────────────────────────────
describe('Overbooked: Non-overlapping calls are unaffected', () => {
  it('should NOT mark calls at different times as Overbooked', async () => {
    // Call A: 2pm-3pm
    const callA = makeCall({
      call_id: 'call_a',
      appointment_id: 'evt_a',
      appointment_date: '2026-02-17T14:00:00Z',
      appointment_end_date: '2026-02-17T15:00:00Z',
    });
    // Call B: 4pm-5pm (no overlap)
    const callB = makeCall({
      call_id: 'call_b',
      appointment_id: 'evt_b',
      appointment_date: '2026-02-17T16:00:00Z',
      appointment_end_date: '2026-02-17T17:00:00Z',
      prospect_email: 'bob@example.com',
    });

    mockBQ._seedTable('Calls', [callA, callB]);

    // Transcript arrives for Call A → Show
    await callStateManager.transitionState(
      'call_a', CLIENT_ID, 'Show', 'transcript_received_valid'
    );

    const calls = mockBQ._getTable('Calls');
    expect(calls.find(c => c.call_id === 'call_a').attendance).toBe('Show');
    // Call B should still be null (no overlap)
    expect(calls.find(c => c.call_id === 'call_b').attendance).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO: Partial overlap (call starts during another)
// ─────────────────────────────────────────────────────────────────────────────
describe('Overbooked: Partial time overlap is detected', () => {
  it('should mark a partially overlapping call as Overbooked', async () => {
    // Call A: 2:00pm - 3:00pm
    const callA = makeCall({
      call_id: 'call_a',
      appointment_id: 'evt_a',
      appointment_date: '2026-02-17T14:00:00Z',
      appointment_end_date: '2026-02-17T15:00:00Z',
    });
    // Call B: 2:30pm - 3:30pm (starts during Call A)
    const callB = makeCall({
      call_id: 'call_b',
      appointment_id: 'evt_b',
      appointment_date: '2026-02-17T14:30:00Z',
      appointment_end_date: '2026-02-17T15:30:00Z',
      prospect_email: 'bob@example.com',
    });

    mockBQ._seedTable('Calls', [callA, callB]);

    await callStateManager.transitionState(
      'call_a', CLIENT_ID, 'Show', 'transcript_received_valid'
    );

    const calls = mockBQ._getTable('Calls');
    expect(calls.find(c => c.call_id === 'call_a').attendance).toBe('Show');
    expect(calls.find(c => c.call_id === 'call_b').attendance).toBe('Overbooked');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO: Calls for different closers are NOT affected
// ─────────────────────────────────────────────────────────────────────────────
describe('Overbooked: Different closer\'s calls are unaffected', () => {
  it('should NOT mark another closer\'s overlapping call as Overbooked', async () => {
    // Call A: Closer A, 2pm-3pm
    const callA = makeCall({
      call_id: 'call_a',
      closer_id: CLOSER_A.closer_id,
    });
    // Call B: Closer B, same time (not the same closer)
    const callB = makeCall({
      call_id: 'call_b',
      closer_id: CLOSER_B.closer_id,
      prospect_email: 'bob@example.com',
    });

    mockBQ._seedTable('Calls', [callA, callB]);

    await callStateManager.transitionState(
      'call_a', CLIENT_ID, 'Show', 'transcript_received_valid'
    );

    const calls = mockBQ._getTable('Calls');
    expect(calls.find(c => c.call_id === 'call_a').attendance).toBe('Show');
    // Call B belongs to a different closer — should stay null
    expect(calls.find(c => c.call_id === 'call_b').attendance).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO: Ghosted calls get upgraded to Overbooked
// ─────────────────────────────────────────────────────────────────────────────
describe('Overbooked: Ghosted call becomes Overbooked when overlap is detected', () => {
  it('should transition Ghosted → Overbooked when closer took another call', async () => {
    // Call A: null attendance (transcript about to arrive)
    const callA = makeCall({ call_id: 'call_a' });
    // Call B: already Ghosted by TimeoutService
    const callB = makeCall({
      call_id: 'call_b',
      attendance: 'Ghosted - No Show',
      prospect_email: 'bob@example.com',
    });

    mockBQ._seedTable('Calls', [callA, callB]);

    // Transcript arrives for Call A → Show
    await callStateManager.transitionState(
      'call_a', CLIENT_ID, 'Show', 'transcript_received_valid'
    );

    const calls = mockBQ._getTable('Calls');
    expect(calls.find(c => c.call_id === 'call_a').attendance).toBe('Show');
    // Call B was Ghosted but should now be Overbooked
    expect(calls.find(c => c.call_id === 'call_b').attendance).toBe('Overbooked');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO: Waiting for Outcome → Overbooked
// ─────────────────────────────────────────────────────────────────────────────
describe('Overbooked: Waiting for Outcome becomes Overbooked', () => {
  it('should transition Waiting for Outcome → Overbooked', async () => {
    // Call A: null, transcript about to arrive
    const callA = makeCall({ call_id: 'call_a' });
    // Call B: already moved to Waiting by TimeoutService
    const callB = makeCall({
      call_id: 'call_b',
      attendance: 'Waiting for Outcome',
      prospect_email: 'bob@example.com',
    });

    mockBQ._seedTable('Calls', [callA, callB]);

    await callStateManager.transitionState(
      'call_a', CLIENT_ID, 'Show', 'transcript_received_valid'
    );

    const calls = mockBQ._getTable('Calls');
    expect(calls.find(c => c.call_id === 'call_a').attendance).toBe('Show');
    expect(calls.find(c => c.call_id === 'call_b').attendance).toBe('Overbooked');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO: Overbooked → Show (transcript arrives for overbooked call)
// ─────────────────────────────────────────────────────────────────────────────
describe('Overbooked: Can recover to Show if transcript arrives', () => {
  it('should allow Overbooked → Show transition', async () => {
    const call = makeCall({ call_id: 'call_a', attendance: 'Overbooked' });
    mockBQ._seedTable('Calls', [call]);

    const result = await callStateManager.transitionState(
      'call_a', CLIENT_ID, 'Show', 'transcript_received_valid'
    );

    expect(result).toBe(true);
    const calls = mockBQ._getTable('Calls');
    expect(calls[0].attendance).toBe('Show');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO: Overbooked → Canceled
// ─────────────────────────────────────────────────────────────────────────────
describe('Overbooked: Can be canceled', () => {
  it('should allow Overbooked → Canceled transition', async () => {
    const call = makeCall({ call_id: 'call_a', attendance: 'Overbooked' });
    mockBQ._seedTable('Calls', [call]);

    const result = await callStateManager.transitionState(
      'call_a', CLIENT_ID, 'Canceled', 'calendar_cancelled_or_deleted_or_declined'
    );

    expect(result).toBe(true);
    const calls = mockBQ._getTable('Calls');
    expect(calls[0].attendance).toBe('Canceled');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO: Already-canceled overlapping call is not touched
// ─────────────────────────────────────────────────────────────────────────────
describe('Overbooked: Already-canceled overlapping call stays canceled', () => {
  it('should not change Canceled calls to Overbooked', async () => {
    const callA = makeCall({ call_id: 'call_a' });
    const callB = makeCall({
      call_id: 'call_b',
      attendance: 'Canceled',
      prospect_email: 'bob@example.com',
    });

    mockBQ._seedTable('Calls', [callA, callB]);

    await callStateManager.transitionState(
      'call_a', CLIENT_ID, 'Show', 'transcript_received_valid'
    );

    const calls = mockBQ._getTable('Calls');
    expect(calls.find(c => c.call_id === 'call_a').attendance).toBe('Show');
    // Call B was Canceled — it should stay Canceled
    expect(calls.find(c => c.call_id === 'call_b').attendance).toBe('Canceled');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO: Already-shown overlapping call is not touched
// ─────────────────────────────────────────────────────────────────────────────
describe('Overbooked: Already-shown overlapping call stays Show', () => {
  it('should not change Show calls to Overbooked', async () => {
    // Both calls have been attended somehow (rare: both had transcripts)
    const callA = makeCall({ call_id: 'call_a' });
    const callB = makeCall({
      call_id: 'call_b',
      attendance: 'Show',
      prospect_email: 'bob@example.com',
    });

    mockBQ._seedTable('Calls', [callA, callB]);

    await callStateManager.transitionState(
      'call_a', CLIENT_ID, 'Show', 'transcript_received_valid'
    );

    const calls = mockBQ._getTable('Calls');
    expect(calls.find(c => c.call_id === 'call_a').attendance).toBe('Show');
    // Call B was already Show — it should stay Show
    expect(calls.find(c => c.call_id === 'call_b').attendance).toBe('Show');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO: No end time on the shown call → skip overlap check
// ─────────────────────────────────────────────────────────────────────────────
describe('Overbooked: Skips overlap check if no appointment_end_date', () => {
  it('should not mark anything as Overbooked if the shown call has no end time', async () => {
    const callA = makeCall({
      call_id: 'call_a',
      appointment_end_date: null,
    });
    const callB = makeCall({
      call_id: 'call_b',
      prospect_email: 'bob@example.com',
    });

    mockBQ._seedTable('Calls', [callA, callB]);

    await callStateManager.transitionState(
      'call_a', CLIENT_ID, 'Show', 'transcript_received_valid'
    );

    const calls = mockBQ._getTable('Calls');
    expect(calls.find(c => c.call_id === 'call_a').attendance).toBe('Show');
    // No overlap check without end time → Call B stays null
    expect(calls.find(c => c.call_id === 'call_b').attendance).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO: Invalid transition — Overbooked → Ghosted is not allowed
// ─────────────────────────────────────────────────────────────────────────────
describe('Overbooked: Cannot transition to Ghosted', () => {
  it('should reject Overbooked → Ghosted transition', async () => {
    const call = makeCall({ call_id: 'call_a', attendance: 'Overbooked' });
    mockBQ._seedTable('Calls', [call]);

    const result = await callStateManager.transitionState(
      'call_a', CLIENT_ID, 'Ghosted - No Show', 'transcript_timeout'
    );

    expect(result).toBe(false);
    const calls = mockBQ._getTable('Calls');
    expect(calls[0].attendance).toBe('Overbooked');
  });
});
