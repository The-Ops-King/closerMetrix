/**
 * MULTI-CLIENT DATA ISOLATION TESTS
 *
 * Verifies that data operations on one client do not leak to or
 * interfere with another client. Every query is scoped by client_id.
 *
 * Covers:
 * - Calendar events creating isolated call records
 * - Transcript matching scoped to the correct client
 * - AI results stored only on the originating client's call
 * - Payments matched only to the correct client's prospect
 * - Timeout checks isolated per client
 */

jest.mock('../../src/db/BigQueryClient', () => require('../helpers/mockBigQuery'));
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn(),
    },
  }));
});

const callStateManager = require('../../src/services/CallStateManager');
const transcriptService = require('../../src/services/transcript/TranscriptService');
const aiProcessor = require('../../src/services/ai/AIProcessor');
const paymentService = require('../../src/services/PaymentService');
const timeoutService = require('../../src/services/TimeoutService');
const mockBQ = require('../helpers/mockBigQuery');

const CLIENT_A = 'alpha_corp';
const CLIENT_B = 'beta_llc';

function seedTwoClients() {
  mockBQ._seedTable('Clients', [
    {
      client_id: CLIENT_A,
      company_name: 'Alpha Corp',
      webhook_secret: 'secret_alpha',
      status: 'active',
      filter_word: 'strategy',
      offer_name: 'Alpha Coaching',
      offer_price: 5000,
      transcript_provider: 'fathom',
      ai_prompt_overall: 'Alpha coaching offer',
      timezone: 'America/New_York',
    },
    {
      client_id: CLIENT_B,
      company_name: 'Beta LLC',
      webhook_secret: 'secret_beta',
      status: 'active',
      filter_word: 'discovery',
      offer_name: 'Beta Program',
      offer_price: 8000,
      transcript_provider: 'fathom',
      ai_prompt_overall: 'Beta program offer',
      timezone: 'America/Chicago',
    },
  ]);
  mockBQ._seedTable('Closers', [
    {
      closer_id: 'closer_alice',
      client_id: CLIENT_A,
      name: 'Alice Alpha',
      work_email: 'alice@alphacorp.com',
      transcript_provider: 'fathom',
      status: 'active',
    },
    {
      closer_id: 'closer_bob',
      client_id: CLIENT_B,
      name: 'Bob Beta',
      work_email: 'bob@betallc.com',
      transcript_provider: 'fathom',
      status: 'active',
    },
  ]);
}

function makeCalendarEvent(organizerEmail, prospectEmail, overrides = {}) {
  return {
    eventId: `event_${Date.now()}`,
    eventType: 'confirmed',
    startTime: '2026-02-20T20:00:00.000Z',
    endTime: '2026-02-20T21:00:00.000Z',
    status: 'confirmed',
    originalTimezone: 'America/New_York',
    organizerEmail,
    attendees: [
      { email: organizerEmail, name: 'Closer', isOrganizer: true },
      { email: prospectEmail, name: 'Prospect', isOrganizer: false },
    ],
    ...overrides,
  };
}

function makeFathomPayload(closerEmail, closerName, prospectEmail, prospectName) {
  return {
    recording_id: Math.floor(Math.random() * 100000),
    recorded_by: { email: closerEmail, name: closerName },
    calendar_invitees: [
      { email: closerEmail, name: closerName, is_external: false },
      { email: prospectEmail, name: prospectName, is_external: true },
    ],
    scheduled_start_time: '2026-02-20T20:00:00.000Z',
    recording_start_time: '2026-02-20T20:05:00.000Z',
    recording_end_time: '2026-02-20T20:50:00.000Z',
    meeting_title: 'Strategy Call',
    transcript: [
      { speaker: { display_name: closerName, matched_calendar_invitee_email: closerEmail }, text: 'Welcome to the call.', timestamp: 0 },
      { speaker: { display_name: prospectName, matched_calendar_invitee_email: prospectEmail }, text: 'Thanks for having me.', timestamp: 5 },
      { speaker: { display_name: closerName, matched_calendar_invitee_email: closerEmail }, text: 'Tell me about your goals.', timestamp: 15 },
      { speaker: { display_name: prospectName, matched_calendar_invitee_email: prospectEmail }, text: 'I want to grow my business and improve my skills.', timestamp: 25 },
      { speaker: { display_name: closerName, matched_calendar_invitee_email: closerEmail }, text: 'Great, let me explain how we can help.', timestamp: 35 },
      { speaker: { display_name: prospectName, matched_calendar_invitee_email: prospectEmail }, text: 'That sounds interesting, tell me more about the program.', timestamp: 45 },
    ],
    share_url: 'https://fathom.video/share/test',
  };
}

function mockAIResponse(outcome = 'Follow Up') {
  const Anthropic = require('@anthropic-ai/sdk');
  const mockClient = new Anthropic();
  mockClient.messages.create.mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({
      call_outcome: outcome,
      scores: {
        overall_call_score: 7.0,
        discovery_score: 7.5,
        pitch_score: 6.5,
        close_attempt_score: 5.0,
        objection_handling_score: 6.0,
        script_adherence_score: 7.0,
        prospect_fit_score: 8.0,
      },
      summary: 'Solid call overall.',
      objections: [
        { objection_type: 'price', objection_text: 'Too expensive' },
      ],
      disqualification_reason: null,
    })}],
    usage: { input_tokens: 3000, output_tokens: 800 },
  });
  aiProcessor._setAnthropicClient(mockClient);
  return mockClient;
}

beforeEach(() => {
  mockBQ._reset();
});

describe('Multi-Client Data Isolation', () => {
  it('should create separate call records for each client from calendar events', async () => {
    seedTwoClients();
    const closerA = mockBQ._getTable('Closers').find(c => c.client_id === CLIENT_A);
    const closerB = mockBQ._getTable('Closers').find(c => c.client_id === CLIENT_B);

    const eventA = makeCalendarEvent('alice@alphacorp.com', 'prospect@example.com', { eventId: 'event_a' });
    const eventB = makeCalendarEvent('bob@betallc.com', 'prospect@example.com', { eventId: 'event_b' });

    const resultA = await callStateManager.handleCalendarEvent(eventA, CLIENT_A, closerA);
    const resultB = await callStateManager.handleCalendarEvent(eventB, CLIENT_B, closerB);

    expect(resultA.action).toBe('created');
    expect(resultB.action).toBe('created');

    // Both calls exist but belong to different clients
    const calls = mockBQ._getTable('Calls');
    const callsA = calls.filter(c => c.client_id === CLIENT_A);
    const callsB = calls.filter(c => c.client_id === CLIENT_B);

    expect(callsA).toHaveLength(1);
    expect(callsB).toHaveLength(1);
    expect(callsA[0].closer_id).toBe('closer_alice');
    expect(callsB[0].closer_id).toBe('closer_bob');
  });

  it('should match transcript to the correct client via closer email', async () => {
    seedTwoClients();
    const closerA = mockBQ._getTable('Closers').find(c => c.client_id === CLIENT_A);
    const closerB = mockBQ._getTable('Closers').find(c => c.client_id === CLIENT_B);

    // Create calls for both clients with the same prospect email
    const eventA = makeCalendarEvent('alice@alphacorp.com', 'prospect@example.com', { eventId: 'event_a' });
    const eventB = makeCalendarEvent('bob@betallc.com', 'prospect@example.com', { eventId: 'event_b' });

    await callStateManager.handleCalendarEvent(eventA, CLIENT_A, closerA);
    await callStateManager.handleCalendarEvent(eventB, CLIENT_B, closerB);

    // Transcript from Alice's call — should only update Client A's call
    const txResult = await transcriptService.processTranscriptWebhook(
      'fathom',
      makeFathomPayload('alice@alphacorp.com', 'Alice Alpha', 'prospect@example.com', 'Prospect')
    );

    expect(txResult.action).toBe('show');

    const calls = mockBQ._getTable('Calls');
    const callA = calls.find(c => c.client_id === CLIENT_A);
    const callB = calls.find(c => c.client_id === CLIENT_B);

    // Client A's call transitioned to Show
    expect(callA.attendance).toBe('Show');

    // Client B's call remains Scheduled (untouched)
    expect(callB.attendance).toBeNull();
  });

  it('should process AI results only for the target client call', async () => {
    seedTwoClients();
    const closerA = mockBQ._getTable('Closers').find(c => c.client_id === CLIENT_A);
    const closerB = mockBQ._getTable('Closers').find(c => c.client_id === CLIENT_B);

    // Create calls for both clients
    const eventA = makeCalendarEvent('alice@alphacorp.com', 'prospect@example.com', { eventId: 'event_a' });
    const eventB = makeCalendarEvent('bob@betallc.com', 'prospect@example.com', { eventId: 'event_b' });

    const resultA = await callStateManager.handleCalendarEvent(eventA, CLIENT_A, closerA);
    await callStateManager.handleCalendarEvent(eventB, CLIENT_B, closerB);

    // Transcript and AI for Client A only
    await transcriptService.processTranscriptWebhook(
      'fathom',
      makeFathomPayload('alice@alphacorp.com', 'Alice Alpha', 'prospect@example.com', 'Prospect')
    );

    mockAIResponse('Follow Up');
    const aiResult = await aiProcessor.processCall(resultA.callRecord.call_id, CLIENT_A, 'transcript text');

    expect(aiResult.success).toBe(true);

    const calls = mockBQ._getTable('Calls');
    const callA = calls.find(c => c.client_id === CLIENT_A);
    const callB = calls.find(c => c.client_id === CLIENT_B);

    // Client A's call has AI results
    expect(callA.call_outcome).toBe('Follow Up');
    expect(callA.overall_call_score).toBe(7.0);
    expect(callA.processing_status).toBe('complete');

    // Client B's call is untouched
    expect(callB.attendance).toBeNull();
    expect(callB.call_outcome).toBeNull();
    expect(callB.processing_status).toBe('pending');

    // Objections only for Client A
    const objections = mockBQ._getTable('Objections');
    const objA = objections.filter(o => o.client_id === CLIENT_A);
    const objB = objections.filter(o => o.client_id === CLIENT_B);
    expect(objA.length).toBeGreaterThanOrEqual(1);
    expect(objB).toHaveLength(0);
  });

  it('should match payment to correct client only', async () => {
    seedTwoClients();
    const closerA = mockBQ._getTable('Closers').find(c => c.client_id === CLIENT_A);
    const closerB = mockBQ._getTable('Closers').find(c => c.client_id === CLIENT_B);

    // Full pipeline for both clients with the same prospect email
    const eventA = makeCalendarEvent('alice@alphacorp.com', 'prospect@example.com', { eventId: 'event_a' });
    const eventB = makeCalendarEvent('bob@betallc.com', 'prospect@example.com', { eventId: 'event_b' });

    const resultA = await callStateManager.handleCalendarEvent(eventA, CLIENT_A, closerA);
    const resultB = await callStateManager.handleCalendarEvent(eventB, CLIENT_B, closerB);

    // Process transcript and AI for both
    await transcriptService.processTranscriptWebhook(
      'fathom',
      makeFathomPayload('alice@alphacorp.com', 'Alice Alpha', 'prospect@example.com', 'Prospect')
    );
    mockAIResponse('Follow Up');
    await aiProcessor.processCall(resultA.callRecord.call_id, CLIENT_A, 'text');

    await transcriptService.processTranscriptWebhook(
      'fathom',
      makeFathomPayload('bob@betallc.com', 'Bob Beta', 'prospect@example.com', 'Prospect')
    );
    mockAIResponse('Follow Up');
    await aiProcessor.processCall(resultB.callRecord.call_id, CLIENT_B, 'text');

    // Payment arrives for Client A only
    const payResult = await paymentService.processPayment({
      prospect_email: 'prospect@example.com',
      payment_amount: 5000,
      payment_type: 'full',
    }, CLIENT_A);

    expect(payResult.status).toBe('ok');

    const calls = mockBQ._getTable('Calls');
    const callA = calls.find(c => c.client_id === CLIENT_A);
    const callB = calls.find(c => c.client_id === CLIENT_B);

    // Client A → Closed - Won
    expect(callA.attendance).toBe('Closed - Won');
    expect(callA.cash_collected).toBe(5000);

    // Client B → still Follow Up (payment didn't cross over)
    expect(callB.attendance).toBe('Follow Up');
    expect(callB.cash_collected).toBeUndefined();
  });

  it('should timeout only the correct client calls', async () => {
    seedTwoClients();
    const closerA = mockBQ._getTable('Closers').find(c => c.client_id === CLIENT_A);
    const closerB = mockBQ._getTable('Closers').find(c => c.client_id === CLIENT_B);

    const pastTime = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const pastEndTime = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

    // Client A has a past call, Client B has a future call
    const eventA = makeCalendarEvent('alice@alphacorp.com', 'prospect_a@example.com', {
      eventId: 'event_past',
      startTime: pastTime,
      endTime: pastEndTime,
    });
    const eventB = makeCalendarEvent('bob@betallc.com', 'prospect_b@example.com', {
      eventId: 'event_future',
      startTime: '2026-03-01T20:00:00.000Z',
    });

    await callStateManager.handleCalendarEvent(eventA, CLIENT_A, closerA);
    await callStateManager.handleCalendarEvent(eventB, CLIENT_B, closerB);

    // Run timeout for Client A only
    const resultA = await timeoutService.checkClient(CLIENT_A);
    expect(resultA.timed_out).toBe(1);

    const calls = mockBQ._getTable('Calls');
    const callA = calls.find(c => c.client_id === CLIENT_A);
    const callB = calls.find(c => c.client_id === CLIENT_B);

    expect(callA.attendance).toBe('Ghosted - No Show');
    expect(callB.attendance).toBeNull();
  });

  it('should keep audit logs scoped to the correct client', async () => {
    seedTwoClients();
    const closerA = mockBQ._getTable('Closers').find(c => c.client_id === CLIENT_A);
    const closerB = mockBQ._getTable('Closers').find(c => c.client_id === CLIENT_B);

    const eventA = makeCalendarEvent('alice@alphacorp.com', 'prospect@example.com', { eventId: 'event_a' });
    const eventB = makeCalendarEvent('bob@betallc.com', 'other@example.com', { eventId: 'event_b' });

    await callStateManager.handleCalendarEvent(eventA, CLIENT_A, closerA);
    await callStateManager.handleCalendarEvent(eventB, CLIENT_B, closerB);

    const audit = mockBQ._getTable('AuditLog');
    const auditA = audit.filter(a => a.client_id === CLIENT_A);
    const auditB = audit.filter(a => a.client_id === CLIENT_B);

    // Each client has their own audit entries
    expect(auditA.length).toBeGreaterThanOrEqual(1);
    expect(auditB.length).toBeGreaterThanOrEqual(1);

    // No cross-contamination
    auditA.forEach(a => expect(a.client_id).toBe(CLIENT_A));
    auditB.forEach(a => expect(a.client_id).toBe(CLIENT_B));
  });

  it('should determine call type independently per client', async () => {
    seedTwoClients();
    const closerA = mockBQ._getTable('Closers').find(c => c.client_id === CLIENT_A);
    const closerB = mockBQ._getTable('Closers').find(c => c.client_id === CLIENT_B);

    // Same prospect calls Client A first
    const eventA1 = makeCalendarEvent('alice@alphacorp.com', 'prospect@example.com', { eventId: 'event_a1' });
    const resultA1 = await callStateManager.handleCalendarEvent(eventA1, CLIENT_A, closerA);
    expect(resultA1.callRecord.call_type).toBe('First Call');

    // Process through transcript + AI so the prospect has history with Client A
    await transcriptService.processTranscriptWebhook(
      'fathom',
      makeFathomPayload('alice@alphacorp.com', 'Alice Alpha', 'prospect@example.com', 'Prospect')
    );
    mockAIResponse('Follow Up');
    await aiProcessor.processCall(resultA1.callRecord.call_id, CLIENT_A, 'text');

    // Same prospect now calls Client B for the first time
    const eventB = makeCalendarEvent('bob@betallc.com', 'prospect@example.com', { eventId: 'event_b' });
    const resultB = await callStateManager.handleCalendarEvent(eventB, CLIENT_B, closerB);

    // Should be First Call for Client B even though they're a returning prospect for Client A
    expect(resultB.callRecord.call_type).toBe('First Call');
  });
});
