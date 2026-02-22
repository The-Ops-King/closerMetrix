/**
 * AI PROCESSING SCENARIOS (20-23)
 *
 * Tests AI processing through the full pipeline.
 * These scenarios test end-to-end flows from transcript → AI → outcome.
 *
 * Uses mockBigQuery + mocked Anthropic API.
 */

jest.mock('../../src/db/BigQueryClient', () => require('../helpers/mockBigQuery'));
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: jest.fn() },
  }));
});

const aiProcessor = require('../../src/services/ai/AIProcessor');
const mockBQ = require('../helpers/mockBigQuery');

const CLIENT_ID = 'friends_inc';

const MOCK_CLIENT = {
  client_id: CLIENT_ID,
  company_name: 'Friends Inc',
  offer_name: 'Elite Coaching',
  offer_price: 5000,
  ai_prompt_overall: 'We help business owners scale revenue.',
  disqualification_criteria: 'Revenue under $50k, not decision maker',
  status: 'active',
};

const MOCK_CLOSER = {
  closer_id: 'closer_sarah_001',
  client_id: CLIENT_ID,
  name: 'Sarah Closer',
  work_email: 'sarah@acmecoaching.com',
  status: 'active',
};

function seedCallForAI(callOverrides = {}) {
  mockBQ._seedTable('Clients', [MOCK_CLIENT]);
  mockBQ._seedTable('Closers', [MOCK_CLOSER]);
  mockBQ._seedTable('Calls', [{
    call_id: 'call_scenario',
    appointment_id: 'event_scenario',
    client_id: CLIENT_ID,
    closer_id: 'closer_sarah_001',
    prospect_email: 'john@example.com',
    prospect_name: 'John Smith',
    attendance: 'Show',
    call_type: 'First Call',
    call_outcome: null,
    processing_status: 'queued',
    processing_error: null,
    appointment_date: '2026-02-20T20:00:00.000Z',
    created: '2026-02-18T10:00:00.000Z',
    duration_minutes: 45,
    closer: 'Sarah Closer',
    ...callOverrides,
  }]);
}

function setupMock(responseJson) {
  const mockClient = {
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(responseJson) }],
        usage: { input_tokens: 4000, output_tokens: 1000 },
      }),
    },
  };
  aiProcessor._setAnthropicClient(mockClient);
  return mockClient;
}

const TRANSCRIPT = '00:00:05 - Sarah: Hi John.\n00:00:12 - John: Hi, excited to chat.';

beforeEach(() => {
  mockBQ._reset();
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 20: Normal call → AI determines Follow Up
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 20: AI determines Follow Up', () => {
  it('should transition to Follow Up with scores and objections', async () => {
    seedCallForAI();
    setupMock({
      call_outcome: 'Follow Up',
      scores: {
        discovery_score: 7.0,
        pitch_score: 6.5,
        close_attempt_score: 5.0,
        objection_handling_score: 7.0,
        overall_call_score: 6.5,
        script_adherence_score: 6.0,
        prospect_fit_score: 8.0,
      },
      summary: 'Good discovery, weak close. Prospect needs time to think.',
      objections: [
        { objection_type: 'think_about', objection_text: 'Need to think about it', closer_response: 'I understand', was_overcome: false },
      ],
      coaching_notes: 'Create more urgency.',
      disqualification_reason: null,
    });

    const result = await aiProcessor.processCall('call_scenario', CLIENT_ID, TRANSCRIPT);

    expect(result.success).toBe(true);
    expect(result.outcome).toBe('Follow Up');
    expect(result.scores.discovery_score).toBe(7.0);
    expect(result.objectionCount).toBe(1);

    const calls = mockBQ._getTable('Calls');
    expect(calls[0].attendance).toBe('Follow Up');
    expect(calls[0].call_outcome).toBe('Follow Up');
    expect(calls[0].processing_status).toBe('complete');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 21: AI determines Closed - Won
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 21: AI determines Closed - Won', () => {
  it('should transition to Closed - Won', async () => {
    seedCallForAI();
    setupMock({
      call_outcome: 'Closed - Won',
      scores: {
        discovery_score: 9.0,
        pitch_score: 8.5,
        close_attempt_score: 9.0,
        objection_handling_score: 8.5,
        overall_call_score: 9.0,
        script_adherence_score: 8.0,
        prospect_fit_score: 9.5,
      },
      summary: 'Excellent close. Prospect committed and paid in full.',
      objections: [
        { objection_type: 'financial', objection_text: 'Seems expensive', closer_response: 'Let me break down the ROI', was_overcome: true },
      ],
      coaching_notes: 'Great job overall. Minor: could use more social proof.',
      disqualification_reason: null,
    });

    const result = await aiProcessor.processCall('call_scenario', CLIENT_ID, TRANSCRIPT);

    expect(result.success).toBe(true);
    expect(result.outcome).toBe('Closed - Won');

    const calls = mockBQ._getTable('Calls');
    expect(calls[0].attendance).toBe('Closed - Won');
    expect(calls[0].overall_call_score).toBe(9.0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 22: AI determines Lost
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 22: AI determines Lost', () => {
  it('should transition to Lost with coaching feedback', async () => {
    seedCallForAI();
    setupMock({
      call_outcome: 'Lost',
      scores: {
        discovery_score: 4.0,
        pitch_score: 3.5,
        close_attempt_score: 2.0,
        objection_handling_score: 3.0,
        overall_call_score: 3.5,
        script_adherence_score: 4.0,
        prospect_fit_score: 6.0,
      },
      summary: 'Prospect was not engaged. Closer rushed through discovery and lost rapport.',
      objections: [
        { objection_type: 'trust', objection_text: 'I do not know if this works', closer_response: 'It does, trust me', was_overcome: false },
        { objection_type: 'value', objection_text: 'I do not see the value', closer_response: 'Let me explain again', was_overcome: false },
      ],
      coaching_notes: 'Slow down discovery. Use social proof for trust objections.',
      disqualification_reason: null,
    });

    const result = await aiProcessor.processCall('call_scenario', CLIENT_ID, TRANSCRIPT);

    expect(result.success).toBe(true);
    expect(result.outcome).toBe('Lost');
    expect(result.objectionCount).toBe(2);

    const calls = mockBQ._getTable('Calls');
    expect(calls[0].attendance).toBe('Lost');
    expect(calls[0].overall_call_score).toBe(3.5);

    const objections = mockBQ._getTable('Objections');
    expect(objections).toHaveLength(2);
    expect(objections[0].objection_type).toBe('trust');
    expect(objections[1].objection_type).toBe('value');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 23: AI determines Disqualified
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 23: AI determines Disqualified', () => {
  it('should transition to Disqualified with reason', async () => {
    seedCallForAI();
    setupMock({
      call_outcome: 'Disqualified',
      scores: {
        discovery_score: 8.0,
        pitch_score: null,
        close_attempt_score: null,
        objection_handling_score: null,
        overall_call_score: 5.0,
        script_adherence_score: 7.0,
        prospect_fit_score: 2.0,
      },
      summary: 'Prospect does not meet revenue threshold. Good discovery uncovered this early.',
      objections: [],
      coaching_notes: 'Good job qualifying out early. Save time for better prospects.',
      disqualification_reason: 'Prospect revenue is $30k/year, below the $50k minimum.',
    });

    const result = await aiProcessor.processCall('call_scenario', CLIENT_ID, TRANSCRIPT);

    expect(result.success).toBe(true);
    expect(result.outcome).toBe('Disqualified');

    const calls = mockBQ._getTable('Calls');
    expect(calls[0].attendance).toBe('Disqualified');
    expect(calls[0].lost_reason).toContain('$30k');
    expect(calls[0].prospect_fit_score).toBe(2.0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Additional AI scenarios
// ─────────────────────────────────────────────────────────────────────────────
describe('AI Processing — additional scenarios', () => {
  it('Scenario: Deposit outcome', async () => {
    seedCallForAI();
    setupMock({
      call_outcome: 'Deposit',
      scores: {
        discovery_score: 8.0,
        pitch_score: 7.5,
        close_attempt_score: 8.0,
        objection_handling_score: 7.0,
        overall_call_score: 7.5,
        script_adherence_score: 7.0,
        prospect_fit_score: 8.5,
      },
      summary: 'Prospect put down a deposit. Remaining balance due in 7 days.',
      objections: [
        { objection_type: 'financial', objection_text: 'Cannot pay all upfront', closer_response: 'We offer a deposit option', was_overcome: true },
      ],
      coaching_notes: 'Good use of the deposit strategy.',
      disqualification_reason: null,
    });

    const result = await aiProcessor.processCall('call_scenario', CLIENT_ID, TRANSCRIPT);

    expect(result.success).toBe(true);
    expect(result.outcome).toBe('Deposit');

    const calls = mockBQ._getTable('Calls');
    expect(calls[0].attendance).toBe('Deposit');
  });

  it('Scenario: Not Pitched outcome', async () => {
    seedCallForAI();
    setupMock({
      call_outcome: 'Not Pitched',
      scores: {
        discovery_score: 7.0,
        pitch_score: 1.0,
        close_attempt_score: 1.0,
        objection_handling_score: null,
        overall_call_score: 4.0,
        script_adherence_score: 5.0,
        prospect_fit_score: 3.0,
      },
      summary: 'Closer determined prospect was not emotionally ready and chose not to pitch.',
      objections: [],
      coaching_notes: 'Good read on the prospect. Consider rescheduling for a follow-up.',
      disqualification_reason: null,
    });

    const result = await aiProcessor.processCall('call_scenario', CLIENT_ID, TRANSCRIPT);

    expect(result.success).toBe(true);
    expect(result.outcome).toBe('Not Pitched');

    const calls = mockBQ._getTable('Calls');
    expect(calls[0].attendance).toBe('Not Pitched');
    expect(calls[0].pitch_score).toBe(1.0);
  });

  it('Scenario: AI response with markdown fences', async () => {
    seedCallForAI();
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{
            type: 'text',
            text: '```json\n' + JSON.stringify({
              call_outcome: 'Follow Up',
              scores: { discovery_score: 7 },
              summary: 'Prospect interested.',
              objections: [],
              coaching_notes: 'Good job.',
              disqualification_reason: null,
            }) + '\n```',
          }],
          usage: { input_tokens: 3000, output_tokens: 800 },
        }),
      },
    };
    aiProcessor._setAnthropicClient(mockClient);

    const result = await aiProcessor.processCall('call_scenario', CLIENT_ID, TRANSCRIPT);

    expect(result.success).toBe(true);
    expect(result.outcome).toBe('Follow Up');
  });

  it('Scenario: Follow Up call with prior show history', async () => {
    seedCallForAI({ call_type: 'Follow Up' });
    setupMock({
      call_outcome: 'Closed - Won',
      scores: {
        discovery_score: 8.0,
        pitch_score: 8.0,
        close_attempt_score: 9.0,
        objection_handling_score: 8.5,
        overall_call_score: 8.5,
        script_adherence_score: 7.5,
        prospect_fit_score: 9.0,
      },
      summary: 'Follow-up call resulted in close. Prospect signed up.',
      objections: [],
      coaching_notes: 'Excellent follow-through.',
      disqualification_reason: null,
    });

    const result = await aiProcessor.processCall('call_scenario', CLIENT_ID, TRANSCRIPT);

    expect(result.success).toBe(true);
    expect(result.outcome).toBe('Closed - Won');
  });
});
