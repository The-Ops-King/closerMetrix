/**
 * TRANSCRIPT EDGE CASE SCENARIOS (18-25)
 *
 * Tests transcript processing edge cases through the full pipeline.
 * Uses mockBigQuery for in-memory state.
 *
 * Note: Scenarios 20-23 involve AI processing and payment webhooks which
 * are Phase 4 and Phase 5. We test the transcript-pipeline portions here
 * and verify state is ready for downstream processing.
 */

jest.mock('../../src/db/BigQueryClient', () => require('../helpers/mockBigQuery'));
jest.mock('../../src/services/ai/AIProcessor', () => ({
  processCall: jest.fn().mockResolvedValue({ success: true, outcome: 'Follow Up', costUsd: 0 }),
}));

const transcriptService = require('../../src/services/transcript/TranscriptService');
const callStateManager = require('../../src/services/CallStateManager');
const fathomAdapter = require('../../src/services/transcript/adapters/FathomAdapter');
const mockBQ = require('../helpers/mockBigQuery');

const CLIENT_ID = 'friends_inc';
const MOCK_CLOSER = {
  closer_id: 'closer_sarah_001',
  client_id: CLIENT_ID,
  name: 'Sarah Closer',
  work_email: 'sarah@acmecoaching.com',
  status: 'active',
  transcript_provider: 'fathom',
};

function seedCloserAndCall(callOverrides = {}) {
  mockBQ._seedTable('Closers', [MOCK_CLOSER]);
  mockBQ._seedTable('Calls', [{
    call_id: 'call_001',
    appointment_id: 'event_abc123',
    client_id: CLIENT_ID,
    closer_id: 'closer_sarah_001',
    prospect_email: 'john@example.com',
    prospect_name: 'John Smith',
    attendance: null,
    appointment_date: '2026-02-20T20:00:00.000Z',
    created: '2026-02-18T10:00:00.000Z',
    transcript_status: 'Pending',
    transcript_link: null,
    recording_url: null,
    call_url: null,
    duration_minutes: null,
    processing_status: 'pending',
    ...callOverrides,
  }]);
}

beforeEach(() => {
  mockBQ._reset();
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 18: No transcript generated (recording fails)
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 18: No transcript generated (recording fails)', () => {
  it('should handle webhook with null transcript (needs_polling)', async () => {
    const noTranscript = require('../helpers/fixtures/fathom-webhook-no-transcript.json');
    const result = await transcriptService.processTranscriptWebhook('fathom', noTranscript);

    expect(result.action).toBe('needs_polling');
    expect(result.meetingId).toBe('12346');
    expect(result.provider).toBe('fathom');
  });

  it('should transition to No Recording via timeout when polling also fails', async () => {
    seedCloserAndCall();

    // Simulate: webhook arrived with no transcript, polling failed, timeout triggers
    const success = await callStateManager.transitionState(
      'call_001', CLIENT_ID, 'No Recording', 'system_recording_failure'
    );

    expect(success).toBe(true);
    const calls = mockBQ._getTable('Calls');
    expect(calls[0].attendance).toBe('No Recording');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 19: Garbage quality transcript
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 19: Garbage quality transcript', () => {
  it('should still mark as Show if both speakers talked, even with short content', async () => {
    seedCloserAndCall();

    const garbagePayload = {
      recording_id: 99999,
      url: 'https://fathom.video/calls/garbage',
      share_url: 'https://fathom.video/share/garbage',
      scheduled_start_time: '2026-02-20T20:00:00Z',
      recording_start_time: '2026-02-20T20:02:00Z',
      recording_end_time: '2026-02-20T20:15:00Z',
      recorded_by: { name: 'Sarah Closer', email: 'sarah@acmecoaching.com' },
      calendar_invitees: [
        { name: 'Sarah Closer', email: 'sarah@acmecoaching.com', is_external: false },
        { name: 'John Smith', email: 'john@example.com', is_external: true },
      ],
      transcript: [
        { speaker: { display_name: 'Sarah Closer', matched_calendar_invitee_email: 'sarah@acmecoaching.com' }, text: 'Hey can you hear me? The audio seems really bad today.', timestamp: '00:00:05' },
        { speaker: { display_name: 'John Smith', matched_calendar_invitee_email: 'john@example.com' }, text: 'Yeah I can barely hear you too, let me try switching devices.', timestamp: '00:00:15' },
        { speaker: { display_name: 'Sarah Closer', matched_calendar_invitee_email: 'sarah@acmecoaching.com' }, text: 'Okay sounds a bit better now. So about your situation...', timestamp: '00:00:30' },
        { speaker: { display_name: 'John Smith', matched_calendar_invitee_email: 'john@example.com' }, text: 'Right so basically my revenue has been declining and I need help figuring out what to do about it.', timestamp: '00:00:45' },
        { speaker: { display_name: 'Sarah Closer', matched_calendar_invitee_email: 'sarah@acmecoaching.com' }, text: '[unintelligible] ...program can help with exactly that...', timestamp: '00:01:10' },
        { speaker: { display_name: 'John Smith', matched_calendar_invitee_email: 'john@example.com' }, text: 'Sorry I lost you again. Can you repeat that last part?', timestamp: '00:01:30' },
        { speaker: { display_name: 'Sarah Closer', matched_calendar_invitee_email: 'sarah@acmecoaching.com' }, text: 'Let me try calling you back on a different line.', timestamp: '00:01:45' },
      ],
      default_summary: null,
    };

    const result = await transcriptService.processTranscriptWebhook('fathom', garbagePayload);

    // Both speakers talked enough — it's a Show, AI will handle the quality
    expect(result.action).toBe('show');
    expect(result.evaluation.isShow).toBe(true);

    const calls = mockBQ._getTable('Calls');
    expect(calls[0].attendance).toBe('Show');
    expect(calls[0].processing_status).toBe('queued');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 20: Call held but outcome not logged by AI
// (Transcript pipeline portion — mark as Show and queue for AI)
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 20: Call held, awaiting AI outcome', () => {
  it('should mark as Show with processing_status=queued', async () => {
    seedCloserAndCall();

    const fullPayload = require('../helpers/fixtures/fathom-webhook-full.json');
    const result = await transcriptService.processTranscriptWebhook('fathom', fullPayload);

    expect(result.action).toBe('show');
    const calls = mockBQ._getTable('Calls');
    expect(calls[0].attendance).toBe('Show');
    expect(calls[0].processing_status).toBe('queued');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 24: Two closers on same call (training ride-along)
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 24: Two closers on same call (ride-along)', () => {
  it('should credit the call to the recorded_by closer', async () => {
    const CLOSER_TRAINEE = {
      closer_id: 'closer_trainee_003',
      client_id: CLIENT_ID,
      name: 'New Trainee',
      work_email: 'trainee@acmecoaching.com',
      status: 'active',
      transcript_provider: 'fathom',
    };

    mockBQ._seedTable('Closers', [MOCK_CLOSER, CLOSER_TRAINEE]);
    mockBQ._seedTable('Calls', [{
      call_id: 'call_rideAlong',
      appointment_id: 'event_ride',
      client_id: CLIENT_ID,
      closer_id: 'closer_sarah_001',
      prospect_email: 'john@example.com',
      prospect_name: 'John Smith',
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

    // Fathom records the call under Sarah (the primary closer), even though
    // trainee was also on the call. recorded_by determines credit.
    const payload = require('../helpers/fixtures/fathom-webhook-full.json');
    const result = await transcriptService.processTranscriptWebhook('fathom', payload);

    expect(result.action).toBe('show');

    const calls = mockBQ._getTable('Calls');
    // The call is attributed to Sarah via the recorded_by email
    const updatedCall = calls.find(c => c.call_id === 'call_rideAlong');
    expect(updatedCall.attendance).toBe('Show');
    expect(updatedCall.closer_id).toBe('closer_sarah_001');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 25: Prospect is disqualified
// (Transcript pipeline marks as Show; AI determines Disqualified in Phase 4)
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 25: Disqualified prospect', () => {
  it('should mark as Show and queue for AI (AI determines outcome in Phase 4)', async () => {
    seedCloserAndCall();

    const fullPayload = require('../helpers/fixtures/fathom-webhook-full.json');
    const result = await transcriptService.processTranscriptWebhook('fathom', fullPayload);

    expect(result.action).toBe('show');
    const calls = mockBQ._getTable('Calls');
    expect(calls[0].attendance).toBe('Show');
    expect(calls[0].processing_status).toBe('queued');

    // Simulate AI processing determining Disqualified outcome (Phase 4)
    const success = await callStateManager.transitionState(
      'call_001', CLIENT_ID, 'Disqualified', 'ai_outcome',
      { call_outcome: 'Disqualified', processing_status: 'complete' }
    );
    expect(success).toBe(true);
    expect(calls[0].attendance).toBe('Disqualified');
    expect(calls[0].call_outcome).toBe('Disqualified');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Additional transcript pipeline tests
// ─────────────────────────────────────────────────────────────────────────────
describe('Transcript pipeline — additional edge cases', () => {
  it('should update prospect info from transcript when call had "unknown" prospect', async () => {
    mockBQ._seedTable('Closers', [MOCK_CLOSER]);
    mockBQ._seedTable('Calls', [{
      call_id: 'call_unknown_prospect',
      appointment_id: 'event_noprospect',
      client_id: CLIENT_ID,
      closer_id: 'closer_sarah_001',
      prospect_email: 'unknown',
      prospect_name: null,
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

    const fullPayload = require('../helpers/fixtures/fathom-webhook-full.json');
    const result = await transcriptService.processTranscriptWebhook('fathom', fullPayload);

    expect(result.action).toBe('show');
    const calls = mockBQ._getTable('Calls');
    // Prospect info should have been updated from the transcript
    expect(calls[0].prospect_email).toBe('john@example.com');
    expect(calls[0].prospect_name).toBe('John Smith');
  });

  it('should handle generic provider webhook', async () => {
    mockBQ._seedTable('Closers', [MOCK_CLOSER]);

    const genericPayload = {
      closer_email: 'sarah@acmecoaching.com',
      prospect_email: 'prospect@generic.com',
      prospect_name: 'Generic Prospect',
      scheduled_start_time: '2026-02-20T20:00:00Z',
      recording_start_time: '2026-02-20T20:02:00Z',
      recording_end_time: '2026-02-20T20:45:00Z',
      duration_seconds: 2580,
      transcript: 'Closer: Hello, thanks for joining.\nProspect: Hi there, glad to be here.\nCloser: Let me tell you about our program.\nProspect: Sounds great, I\'ve been looking for something like this.\nCloser: Perfect, here\'s how it works...\nProspect: That makes sense. What\'s the investment?\nCloser: The investment is $5000 for the full program.\nProspect: I need to think about it. Can I get back to you?',
      share_url: 'https://generic.io/recording/123',
      title: 'Sales Call',
      meeting_id: 'generic_meeting_123',
    };

    const result = await transcriptService.processTranscriptWebhook('generic', genericPayload);

    // Should create a new call record (no matching calendar event)
    expect(result.action).toBe('show');
    const calls = mockBQ._getTable('Calls');
    expect(calls).toHaveLength(1);
    expect(calls[0].transcript_provider).toBe('generic');
    expect(calls[0].prospect_email).toBe('prospect@generic.com');
  });

  it('should handle tldv provider webhook with meeting data', async () => {
    mockBQ._seedTable('Closers', [MOCK_CLOSER]);

    const tldvPayload = {
      id: 'tldv_event_001',
      event: 'MeetingReady',
      data: {
        id: 'meeting_tldv_001',
        name: 'Discovery Call with Jane',
        happenedAt: '2026-02-20T20:00:00Z',
        url: 'https://tldv.io/app/meetings/xxx',
        duration: 2700,
        organizer: { name: 'Sarah Closer', email: 'sarah@acmecoaching.com' },
        invitees: [{ name: 'Jane Prospect', email: 'jane@example.com' }],
        transcript: [
          { speaker: 'Sarah Closer', text: 'Hi Jane, thanks for joining today. How are you?', startTime: 5.0, endTime: 10.0 },
          { speaker: 'Jane Prospect', text: 'I\'m great! Really excited for this call.', startTime: 11.0, endTime: 15.0 },
          { speaker: 'Sarah Closer', text: 'Awesome, tell me about your current situation.', startTime: 16.0, endTime: 22.0 },
          { speaker: 'Jane Prospect', text: 'Well, I\'ve been running my business for about 3 years now and revenue has plateaued. I need some guidance on how to break through to the next level. I\'ve tried a few things but nothing has really worked.', startTime: 23.0, endTime: 40.0 },
        ],
      },
      executedAt: '2026-02-20T20:50:00Z',
    };

    const result = await transcriptService.processTranscriptWebhook('tldv', tldvPayload);

    expect(result.action).toBe('show');
    const calls = mockBQ._getTable('Calls');
    expect(calls).toHaveLength(1);
    expect(calls[0].transcript_provider).toBe('tldv');
    expect(calls[0].prospect_email).toBe('jane@example.com');
    expect(calls[0].duration_minutes).toBe(45);
  });
});
