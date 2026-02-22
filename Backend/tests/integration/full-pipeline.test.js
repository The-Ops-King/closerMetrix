/**
 * FULL PIPELINE INTEGRATION TESTS
 *
 * Tests the complete lifecycle from calendar event → transcript →
 * AI processing → payment, verifying data flows correctly through
 * all services and the state machine.
 *
 * Uses mockBigQuery for in-memory state and mocked Anthropic client.
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

const CLIENT_ID = 'friends_inc';

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

function makeCalendarEvent(overrides = {}) {
  return {
    eventId: 'event_e2e_001',
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
 * Creates a raw Fathom webhook payload for processTranscriptWebhook.
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
      { speaker: { display_name: 'Sarah Closer', matched_calendar_invitee_email: 'sarah@acmecoaching.com' }, text: 'Thanks for joining me today John.', timestamp: 0 },
      { speaker: { display_name: 'John Smith', matched_calendar_invitee_email: 'john@example.com' }, text: 'Thanks for having me, excited to learn about the coaching.', timestamp: 5 },
      { speaker: { display_name: 'Sarah Closer', matched_calendar_invitee_email: 'sarah@acmecoaching.com' }, text: 'Tell me about your current situation and what brought you here.', timestamp: 15 },
      { speaker: { display_name: 'John Smith', matched_calendar_invitee_email: 'john@example.com' }, text: 'I have been in my role for 3 years and feel stuck. I want to grow.', timestamp: 25 },
      { speaker: { display_name: 'Sarah Closer', matched_calendar_invitee_email: 'sarah@acmecoaching.com' }, text: 'That is very common. Our program helps executives break through plateaus.', timestamp: 45 },
      { speaker: { display_name: 'John Smith', matched_calendar_invitee_email: 'john@example.com' }, text: 'That sounds great. What does the investment look like?', timestamp: 60 },
      { speaker: { display_name: 'Sarah Closer', matched_calendar_invitee_email: 'sarah@acmecoaching.com' }, text: 'It is a 12 week program at $10,000. We can do a payment plan.', timestamp: 70 },
      { speaker: { display_name: 'John Smith', matched_calendar_invitee_email: 'john@example.com' }, text: 'Let me think about it and talk to my spouse.', timestamp: 85 },
      { speaker: { display_name: 'Sarah Closer', matched_calendar_invitee_email: 'sarah@acmecoaching.com' }, text: 'Absolutely. I will follow up with you next week.', timestamp: 95 },
    ],
    share_url: 'https://fathom.video/share/abc123',
    ...overrides,
  };
}

function mockAIResponse(outcome = 'Follow Up', objections = []) {
  const Anthropic = require('@anthropic-ai/sdk');
  const mockClient = new Anthropic();
  mockClient.messages.create.mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({
      call_outcome: outcome,
      scores: {
        overall_call_score: 7.5,
        discovery_score: 8.0,
        pitch_score: 6.5,
        close_attempt_score: 5.0,
        objection_handling_score: 6.0,
        script_adherence_score: 7.0,
        prospect_fit_score: 8.5,
      },
      summary: 'Good discovery, needs stronger close.',
      objections: objections.length > 0 ? objections : [
        { objection_type: 'think_about', objection_text: 'Prospect wants to think about it' },
      ],
      disqualification_reason: null,
    })}],
    usage: { input_tokens: 4000, output_tokens: 1000 },
  });
  aiProcessor._setAnthropicClient(mockClient);
  return mockClient;
}

beforeEach(() => {
  mockBQ._reset();
});

describe('Full Pipeline Integration', () => {
  it('should flow: calendar → transcript → AI → complete call record', async () => {
    seedBaseData();

    // Step 1: Calendar event arrives → creates call record
    const closer = mockBQ._getTable('Closers')[0];
    const calEvent = makeCalendarEvent();
    const calResult = await callStateManager.handleCalendarEvent(calEvent, CLIENT_ID, closer);

    expect(calResult.action).toBe('created');
    expect(calResult.callRecord.attendance).toBeNull();
    expect(calResult.callRecord.prospect_email).toBe('john@example.com');
    expect(calResult.callRecord.call_type).toBe('First Call');
    const callId = calResult.callRecord.call_id;

    // Step 2: Transcript arrives → call transitions to Show
    const txResult = await transcriptService.processTranscriptWebhook('fathom', makeFathomPayload());

    expect(txResult.action).toBe('show');
    expect(txResult.evaluation.reason).toBe('valid_conversation');

    const callsAfterTx = mockBQ._getTable('Calls');
    const call = callsAfterTx.find(c => c.call_id === callId);
    expect(call.attendance).toBe('Show');

    // Step 3: AI processes → outcome + scores + objections
    mockAIResponse('Follow Up');
    const aiResult = await aiProcessor.processCall(callId, CLIENT_ID, txResult.transcript.transcript);

    expect(aiResult.success).toBe(true);
    expect(aiResult.outcome).toBe('Follow Up');

    const callsAfterAI = mockBQ._getTable('Calls');
    const finalCall = callsAfterAI.find(c => c.call_id === callId);
    expect(finalCall.attendance).toBe('Follow Up');
    expect(finalCall.overall_call_score).toBe(7.5);
    expect(finalCall.processing_status).toBe('complete');

    // Objections stored
    const objections = mockBQ._getTable('Objections');
    expect(objections.length).toBeGreaterThanOrEqual(1);
    expect(objections[0].objection_type).toBe('think_about');

    // Audit trail should have multiple entries
    const audit = mockBQ._getTable('AuditLog');
    expect(audit.length).toBeGreaterThanOrEqual(3);
  });

  it('should flow: calendar → transcript → AI → payment → Closed - Won', async () => {
    seedBaseData();
    const closer = mockBQ._getTable('Closers')[0];

    // Calendar → call created
    const calResult = await callStateManager.handleCalendarEvent(makeCalendarEvent(), CLIENT_ID, closer);
    const callId = calResult.callRecord.call_id;

    // Transcript → Show
    await transcriptService.processTranscriptWebhook('fathom', makeFathomPayload());

    // AI → Follow Up
    mockAIResponse('Follow Up');
    await aiProcessor.processCall(callId, CLIENT_ID, 'transcript text');

    // Payment → Closed - Won
    const payResult = await paymentService.processPayment({
      client_id: CLIENT_ID,
      prospect_email: 'john@example.com',
      payment_amount: 10000,
      payment_type: 'full',
      payment_date: '2026-02-22',
      product_name: 'Executive Coaching',
    }, CLIENT_ID);

    expect(payResult.status).toBe('ok');
    expect(payResult.action).toBe('new_close');

    const calls = mockBQ._getTable('Calls');
    const finalCall = calls.find(c => c.call_id === callId);
    expect(finalCall.attendance).toBe('Closed - Won');
    expect(finalCall.cash_collected).toBe(10000);
    expect(finalCall.date_closed).toBe('2026-02-22');
    expect(finalCall.product_purchased).toBe('Executive Coaching');
  });

  it('should handle: calendar → timeout → Ghosted (no transcript arrives)', async () => {
    seedBaseData();
    const closer = mockBQ._getTable('Closers')[0];

    // Calendar event for a call 4 hours ago (ended 3 hours ago)
    const pastEvent = makeCalendarEvent({
      startTime: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    });
    const calResult = await callStateManager.handleCalendarEvent(pastEvent, CLIENT_ID, closer);
    expect(calResult.callRecord.attendance).toBeNull();

    // No transcript arrives. Timeout check runs.
    const timeoutResult = await timeoutService.checkClient(CLIENT_ID);
    expect(timeoutResult.timed_out).toBe(1);

    const calls = mockBQ._getTable('Calls');
    const call = calls.find(c => c.call_id === calResult.callRecord.call_id);
    expect(call.attendance).toBe('Ghosted - No Show');
  });

  it('should handle: calendar → cancel → call is Canceled', async () => {
    seedBaseData();
    const closer = mockBQ._getTable('Closers')[0];

    const calResult = await callStateManager.handleCalendarEvent(makeCalendarEvent(), CLIENT_ID, closer);
    const callId = calResult.callRecord.call_id;

    // Event gets cancelled
    const cancelEvent = makeCalendarEvent({ eventType: 'cancelled', status: 'cancelled' });
    const cancelResult = await callStateManager.handleCalendarEvent(cancelEvent, CLIENT_ID, closer);
    expect(cancelResult.action).toBe('canceled');

    const calls = mockBQ._getTable('Calls');
    const call = calls.find(c => c.call_id === callId);
    expect(call.attendance).toBe('Canceled');
  });

  it('should detect Follow Up call type for repeat prospect', async () => {
    seedBaseData();
    const closer = mockBQ._getTable('Closers')[0];

    // First call
    const firstEvent = makeCalendarEvent({ eventId: 'event_first' });
    const firstCal = await callStateManager.handleCalendarEvent(firstEvent, CLIENT_ID, closer);
    expect(firstCal.callRecord.call_type).toBe('First Call');

    // Process transcript to mark as Show
    await transcriptService.processTranscriptWebhook('fathom', makeFathomPayload());

    // AI → Follow Up
    mockAIResponse('Follow Up');
    await aiProcessor.processCall(firstCal.callRecord.call_id, CLIENT_ID, 'text');

    // Second call for same prospect
    const secondEvent = makeCalendarEvent({
      eventId: 'event_second',
      startTime: '2026-02-25T20:00:00.000Z',
    });
    const secondCal = await callStateManager.handleCalendarEvent(secondEvent, CLIENT_ID, closer);
    expect(secondCal.callRecord.call_type).toBe('Follow Up');
  });

  it('should handle full lifecycle: close → refund → Lost', async () => {
    seedBaseData();
    const closer = mockBQ._getTable('Closers')[0];

    // Calendar → Transcript → AI (Follow Up) → Payment (Closed-Won)
    const calResult = await callStateManager.handleCalendarEvent(makeCalendarEvent(), CLIENT_ID, closer);
    const callId = calResult.callRecord.call_id;

    await transcriptService.processTranscriptWebhook('fathom', makeFathomPayload());
    mockAIResponse('Follow Up');
    await aiProcessor.processCall(callId, CLIENT_ID, 'text');

    await paymentService.processPayment({
      client_id: CLIENT_ID,
      prospect_email: 'john@example.com',
      payment_amount: 10000,
    }, CLIENT_ID);

    // Verify closed
    let calls = mockBQ._getTable('Calls');
    let call = calls.find(c => c.call_id === callId);
    expect(call.attendance).toBe('Closed - Won');
    expect(call.cash_collected).toBe(10000);

    // Full refund → Lost
    const refundResult = await paymentService.processPayment({
      client_id: CLIENT_ID,
      prospect_email: 'john@example.com',
      payment_amount: 10000,
      payment_type: 'refund',
    }, CLIENT_ID);

    expect(refundResult.action).toBe('refund');
    expect(refundResult.remaining_cash).toBe(0);

    calls = mockBQ._getTable('Calls');
    call = calls.find(c => c.call_id === callId);
    expect(call.call_outcome).toBe('Lost');
    expect(call.cash_collected).toBe(0);
  });
});
