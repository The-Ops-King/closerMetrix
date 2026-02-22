/**
 * FOLLOW-UP CHAOS SCENARIOS (26-30)
 *
 * Tests complex follow-up chains: scheduled follow-ups that never happen,
 * follow-ups after losses, different closers, re-bookings that the system
 * must correctly identify as Follow Ups, and ghosting on the final follow-up.
 *
 * These scenarios exercise the CallStateManager's call type determination,
 * the TranscriptService's matching, the AIProcessor's outcome setting,
 * and the TimeoutService's ghost detection — all working together across
 * multiple calls for the same prospect.
 */

jest.mock('../../src/db/BigQueryClient', () => require('../helpers/mockBigQuery'));
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: jest.fn() },
  }));
});

const callStateManager = require('../../src/services/CallStateManager');
const transcriptService = require('../../src/services/transcript/TranscriptService');
const aiProcessor = require('../../src/services/ai/AIProcessor');
const timeoutService = require('../../src/services/TimeoutService');
const mockBQ = require('../helpers/mockBigQuery');

const CLIENT_ID = 'friends_inc';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seeds the Clients and Closers tables with baseline test data.
 * Every test starts from this state.
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
    ai_prompt_overall: 'This is a coaching offer',
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
 * Creates a normalized calendar event (StandardCalendarEvent) for
 * handleCalendarEvent. Mirrors the shape produced by GoogleCalendarAdapter.
 */
function makeCalendarEvent(overrides = {}) {
  return {
    eventId: 'event_fu_001',
    eventType: 'confirmed',
    startTime: '2026-02-20T20:00:00.000Z',
    endTime: '2026-02-20T21:00:00.000Z',
    status: 'confirmed',
    originalTimezone: 'America/New_York',
    organizerEmail: 'sarah@acmecoaching.com',
    attendees: [
      { email: 'sarah@acmecoaching.com', name: 'Sarah Closer', isOrganizer: true },
      { email: 'john@example.com', name: 'John Smith', isOrganizer: false },
    ],
    ...overrides,
  };
}

/**
 * Creates a Fathom webhook payload for processTranscriptWebhook.
 * Contains a multi-speaker transcript that evaluates as a real conversation.
 */
function makeFathomPayload(overrides = {}) {
  return {
    recording_id: 12345,
    recorded_by: { email: 'sarah@acmecoaching.com', name: 'Sarah Closer' },
    calendar_invitees: [
      { email: 'sarah@acmecoaching.com', name: 'Sarah Closer', is_external: false },
      { email: 'john@example.com', name: 'John Smith', is_external: true },
    ],
    scheduled_start_time: '2026-02-20T20:00:00.000Z',
    recording_start_time: '2026-02-20T20:05:00.000Z',
    recording_end_time: '2026-02-20T20:50:00.000Z',
    meeting_title: 'Strategy Call with John Smith',
    transcript: [
      { speaker: { display_name: 'Sarah Closer', matched_calendar_invitee_email: 'sarah@acmecoaching.com' }, text: 'Thanks for joining today.', timestamp: 0 },
      { speaker: { display_name: 'John Smith', matched_calendar_invitee_email: 'john@example.com' }, text: 'Happy to be here, excited to learn more.', timestamp: 5 },
      { speaker: { display_name: 'Sarah Closer', matched_calendar_invitee_email: 'sarah@acmecoaching.com' }, text: 'Tell me about your situation.', timestamp: 15 },
      { speaker: { display_name: 'John Smith', matched_calendar_invitee_email: 'john@example.com' }, text: 'I have been stuck in my role and need help growing.', timestamp: 25 },
      { speaker: { display_name: 'Sarah Closer', matched_calendar_invitee_email: 'sarah@acmecoaching.com' }, text: 'Our program addresses exactly that.', timestamp: 45 },
      { speaker: { display_name: 'John Smith', matched_calendar_invitee_email: 'john@example.com' }, text: 'Let me think about it.', timestamp: 60 },
    ],
    share_url: 'https://fathom.video/share/fu001',
    ...overrides,
  };
}

/**
 * Configures the mocked Anthropic client to return a specific AI outcome.
 * Must be called before each aiProcessor.processCall invocation.
 */
function mockAIResponse(outcome = 'Follow Up') {
  const Anthropic = require('@anthropic-ai/sdk');
  const mockClient = new Anthropic();
  mockClient.messages.create.mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({
      call_outcome: outcome,
      scores: {
        overall_call_score: 7,
        discovery_score: 7,
        pitch_score: 6,
        close_attempt_score: 5,
        objection_handling_score: 6,
        script_adherence_score: 7,
        prospect_fit_score: 8,
      },
      summary: 'Test summary.',
      objections: [],
      disqualification_reason: null,
    })}],
    usage: { input_tokens: 3000, output_tokens: 800 },
  });
  aiProcessor._setAnthropicClient(mockClient);
}

beforeEach(() => {
  mockBQ._reset();
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 26: Follow-up scheduled, never happens
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 26: Follow-up scheduled, never happens', () => {
  it('should create Follow Up call that times out to Ghosted', async () => {
    seedBaseData();
    const closer = mockBQ._getTable('Closers')[0];

    // First call: calendar event → creates call record
    const firstEvent = makeCalendarEvent({ eventId: 'event_first' });
    const cal1 = await callStateManager.handleCalendarEvent(firstEvent, CLIENT_ID, closer);

    // Process transcript for first call → transitions to Show
    await transcriptService.processTranscriptWebhook('fathom', makeFathomPayload());

    // AI marks the first call as Follow Up (Show → Follow Up)
    mockAIResponse('Follow Up');
    await aiProcessor.processCall(cal1.callRecord.call_id, CLIENT_ID, 'text');

    // Second call: Follow-up booked with a past time (4 hours ago ended 3 hours ago)
    const fuEvent = makeCalendarEvent({
      eventId: 'event_fu_002',
      startTime: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    });
    const cal2 = await callStateManager.handleCalendarEvent(fuEvent, CLIENT_ID, closer);

    // System correctly identifies prospect as a repeat → Follow Up
    expect(cal2.callRecord.call_type).toBe('Follow Up');

    // No transcript arrives → timeout sweep ghosts it
    const timeoutResult = await timeoutService.checkClient(CLIENT_ID);
    expect(timeoutResult.timed_out).toBeGreaterThanOrEqual(1);

    // Verify the follow-up call is now Ghosted
    const calls = mockBQ._getTable('Calls');
    const fuCall = calls.find(c => c.call_id === cal2.callRecord.call_id);
    expect(fuCall.attendance).toBe('Ghosted - No Show');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 27: Follow-up happens, prospect says no, then another follow-up
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 27: Follow-up → Lost → another follow-up anyway', () => {
  it('should create independent call records for each follow-up', async () => {
    seedBaseData();
    const closer = mockBQ._getTable('Closers')[0];

    // ── First call → Show → Follow Up (AI outcome) ──
    const event1 = makeCalendarEvent({ eventId: 'event_chain_1' });
    const cal1 = await callStateManager.handleCalendarEvent(event1, CLIENT_ID, closer);
    await transcriptService.processTranscriptWebhook('fathom', makeFathomPayload());
    mockAIResponse('Follow Up');
    await aiProcessor.processCall(cal1.callRecord.call_id, CLIENT_ID, 'text');

    // ── Second call (follow-up) → Show → Lost (AI outcome) ──
    const event2 = makeCalendarEvent({
      eventId: 'event_chain_2',
      startTime: '2026-02-25T20:00:00.000Z',
      endTime: '2026-02-25T21:00:00.000Z',
    });
    const cal2 = await callStateManager.handleCalendarEvent(event2, CLIENT_ID, closer);
    expect(cal2.callRecord.call_type).toBe('Follow Up');

    await transcriptService.processTranscriptWebhook('fathom', makeFathomPayload({
      scheduled_start_time: '2026-02-25T20:00:00.000Z',
      recording_start_time: '2026-02-25T20:05:00.000Z',
      recording_end_time: '2026-02-25T20:50:00.000Z',
    }));
    mockAIResponse('Lost');
    await aiProcessor.processCall(cal2.callRecord.call_id, CLIENT_ID, 'text');

    // ── Third call (another follow-up even though prospect was Lost) ──
    const event3 = makeCalendarEvent({
      eventId: 'event_chain_3',
      startTime: '2026-03-01T20:00:00.000Z',
      endTime: '2026-03-01T21:00:00.000Z',
    });
    const cal3 = await callStateManager.handleCalendarEvent(event3, CLIENT_ID, closer);

    // System should still identify as Follow Up (prospect has prior Shows)
    expect(cal3.callRecord.call_type).toBe('Follow Up');

    // Verify all three calls exist as independent records
    const calls = mockBQ._getTable('Calls');
    expect(calls).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 28: Follow-up with different closer
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 28: Follow-up with different closer', () => {
  it('should track follow-up with different closer for same prospect', async () => {
    seedBaseData();
    const closer1 = mockBQ._getTable('Closers')[0];

    // Add a second closer to the team
    mockBQ._seedTable('Closers', [
      ...mockBQ._getTable('Closers'),
      {
        closer_id: 'closer_mike_002',
        client_id: CLIENT_ID,
        name: 'Mike Closer',
        work_email: 'mike@acmecoaching.com',
        status: 'active',
        transcript_provider: 'fathom',
      },
    ]);

    // ── First call with Sarah → Show → Follow Up ──
    const event1 = makeCalendarEvent({ eventId: 'event_diff_closer_1' });
    const cal1 = await callStateManager.handleCalendarEvent(event1, CLIENT_ID, closer1);
    await transcriptService.processTranscriptWebhook('fathom', makeFathomPayload());
    mockAIResponse('Follow Up');
    await aiProcessor.processCall(cal1.callRecord.call_id, CLIENT_ID, 'text');

    // ── Second call with Mike (different closer), same prospect ──
    const closer2 = mockBQ._getTable('Closers').find(c => c.closer_id === 'closer_mike_002');
    const event2 = makeCalendarEvent({
      eventId: 'event_diff_closer_2',
      startTime: '2026-02-25T20:00:00.000Z',
      endTime: '2026-02-25T21:00:00.000Z',
      organizerEmail: 'mike@acmecoaching.com',
      attendees: [
        { email: 'mike@acmecoaching.com', name: 'Mike Closer', isOrganizer: true },
        { email: 'john@example.com', name: 'John Smith', isOrganizer: false },
      ],
    });
    const cal2 = await callStateManager.handleCalendarEvent(event2, CLIENT_ID, closer2);

    // System identifies as Follow Up (prospect already had a Show with Sarah)
    expect(cal2.callRecord.call_type).toBe('Follow Up');
    expect(cal2.callRecord.closer_id).toBe('closer_mike_002');

    // Verify two call records exist with different closers
    const calls = mockBQ._getTable('Calls');
    expect(calls).toHaveLength(2);
    expect(calls[0].closer_id).toBe('closer_sarah_001');
    expect(calls[1].closer_id).toBe('closer_mike_002');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 29: Prospect books what looks like a first call, but has prior Show
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 29: Prospect books new call (system identifies as Follow Up)', () => {
  it('should correctly identify Follow Up even when booked fresh', async () => {
    seedBaseData();
    const closer = mockBQ._getTable('Closers')[0];

    // ── First call → Show → Follow Up (AI outcome) ──
    const event1 = makeCalendarEvent({ eventId: 'event_rebooker_1' });
    const cal1 = await callStateManager.handleCalendarEvent(event1, CLIENT_ID, closer);
    await transcriptService.processTranscriptWebhook('fathom', makeFathomPayload());
    mockAIResponse('Follow Up');
    await aiProcessor.processCall(cal1.callRecord.call_id, CLIENT_ID, 'text');

    // ── Prospect books a brand new event (fresh booking, not using follow-up link) ──
    const event2 = makeCalendarEvent({
      eventId: 'event_rebooker_fresh',
      startTime: '2026-03-05T15:00:00.000Z',
      endTime: '2026-03-05T16:00:00.000Z',
    });
    const cal2 = await callStateManager.handleCalendarEvent(event2, CLIENT_ID, closer);

    // System should still correctly identify this as Follow Up based on prospect history
    expect(cal2.callRecord.call_type).toBe('Follow Up');
    expect(cal2.callRecord.prospect_email).toBe('john@example.com');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 30: Multiple follow-ups, ghost on final one
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 30: Multiple follow-ups, ghost on final one', () => {
  it('should ghost the final follow-up while preserving prior records', async () => {
    seedBaseData();
    const closer = mockBQ._getTable('Closers')[0];

    // ── First call → Show → Follow Up ──
    const event1 = makeCalendarEvent({ eventId: 'event_multi_fu_1' });
    const cal1 = await callStateManager.handleCalendarEvent(event1, CLIENT_ID, closer);
    await transcriptService.processTranscriptWebhook('fathom', makeFathomPayload());
    mockAIResponse('Follow Up');
    await aiProcessor.processCall(cal1.callRecord.call_id, CLIENT_ID, 'text');

    // ── Second call → Show → Follow Up again ──
    const event2 = makeCalendarEvent({
      eventId: 'event_multi_fu_2',
      startTime: '2026-02-25T20:00:00.000Z',
      endTime: '2026-02-25T21:00:00.000Z',
    });
    const cal2 = await callStateManager.handleCalendarEvent(event2, CLIENT_ID, closer);
    expect(cal2.callRecord.call_type).toBe('Follow Up');

    await transcriptService.processTranscriptWebhook('fathom', makeFathomPayload({
      scheduled_start_time: '2026-02-25T20:00:00.000Z',
      recording_start_time: '2026-02-25T20:05:00.000Z',
      recording_end_time: '2026-02-25T20:50:00.000Z',
    }));
    mockAIResponse('Follow Up');
    await aiProcessor.processCall(cal2.callRecord.call_id, CLIENT_ID, 'text');

    // ── Third follow-up — prospect ghosts (past time, no transcript) ──
    const event3 = makeCalendarEvent({
      eventId: 'event_multi_fu_3',
      startTime: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    });
    const cal3 = await callStateManager.handleCalendarEvent(event3, CLIENT_ID, closer);
    expect(cal3.callRecord.call_type).toBe('Follow Up');

    // Timeout sweep ghosts the final call
    const timeoutResult = await timeoutService.checkClient(CLIENT_ID);
    expect(timeoutResult.timed_out).toBeGreaterThanOrEqual(1);

    // Verify all three calls exist
    const calls = mockBQ._getTable('Calls');
    expect(calls).toHaveLength(3);

    // First two calls preserved their AI-assigned outcomes (Follow Up)
    expect(calls[0].attendance).toBe('Follow Up');
    expect(calls[1].attendance).toBe('Follow Up');

    // Final call was ghosted
    const ghostedCall = calls.find(c => c.call_id === cal3.callRecord.call_id);
    expect(ghostedCall.attendance).toBe('Ghosted - No Show');
  });
});
