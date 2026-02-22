/**
 * AI PROCESSOR — Unit Tests
 *
 * Tests the full AI processing pipeline with mocked Anthropic API
 * and mocked BigQuery.
 */

jest.mock('../../src/db/BigQueryClient', () => require('../helpers/mockBigQuery'));

// Mock the Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn(),
    },
  }));
});

const aiProcessor = require('../../src/services/ai/AIProcessor');
const mockBQ = require('../helpers/mockBigQuery');
const Anthropic = require('@anthropic-ai/sdk');

const CLIENT_ID = 'friends_inc';

const MOCK_CLIENT = {
  client_id: CLIENT_ID,
  company_name: 'Friends Inc',
  offer_name: 'Elite Coaching',
  offer_price: 5000,
  ai_prompt_overall: 'We are a coaching company.',
  status: 'active',
};

const MOCK_CLOSER = {
  closer_id: 'closer_sarah_001',
  client_id: CLIENT_ID,
  name: 'Sarah Closer',
  work_email: 'sarah@acmecoaching.com',
  status: 'active',
};

const MOCK_CALL = {
  call_id: 'call_ai_001',
  appointment_id: 'event_ai_001',
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
};

const MOCK_TRANSCRIPT = '00:00:05 - Sarah Closer: Hi John.\n00:00:12 - John Smith: Hi Sarah.';

const VALID_AI_RESPONSE = {
  call_outcome: 'Follow Up',
  scores: {
    discovery_score: 7.5,
    pitch_score: 6.0,
    close_attempt_score: 5.0,
    objection_handling_score: 7.0,
    overall_call_score: 6.5,
    script_adherence_score: 6.0,
    prospect_fit_score: 8.0,
  },
  summary: 'Good discovery but weak close attempt.',
  objections: [
    {
      objection_type: 'financial',
      objection_text: 'Too expensive.',
      closer_response: 'We have payment plans.',
      was_overcome: true,
      timestamp_approximate: '00:25:00',
    },
  ],
  coaching_notes: 'Push harder on the close.',
  disqualification_reason: null,
};

function setupMockAnthropic(responseJson) {
  const mockClient = {
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(responseJson) }],
        usage: { input_tokens: 4500, output_tokens: 1200 },
      }),
    },
  };
  aiProcessor._setAnthropicClient(mockClient);
  return mockClient;
}

beforeEach(() => {
  mockBQ._reset();
  mockBQ._seedTable('Clients', [MOCK_CLIENT]);
  mockBQ._seedTable('Closers', [MOCK_CLOSER]);
  mockBQ._seedTable('Calls', [{ ...MOCK_CALL }]);
});

describe('AIProcessor', () => {
  describe('processCall — successful flow', () => {
    it('should process a call and return success', async () => {
      setupMockAnthropic(VALID_AI_RESPONSE);

      const result = await aiProcessor.processCall('call_ai_001', CLIENT_ID, MOCK_TRANSCRIPT);

      expect(result.success).toBe(true);
      expect(result.outcome).toBe('Follow Up');
      expect(result.objectionCount).toBe(1);
      expect(result.costUsd).toBeGreaterThan(0);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should update the call record with AI results', async () => {
      setupMockAnthropic(VALID_AI_RESPONSE);

      await aiProcessor.processCall('call_ai_001', CLIENT_ID, MOCK_TRANSCRIPT);

      const calls = mockBQ._getTable('Calls');
      const call = calls.find(c => c.call_id === 'call_ai_001');
      expect(call.call_outcome).toBe('Follow Up');
      expect(call.processing_status).toBe('complete');
      expect(call.ai_summary).toContain('Good discovery');
      expect(call.discovery_score).toBe(7.5);
      expect(call.overall_call_score).toBe(6.5);
    });

    it('should transition call state to the AI outcome', async () => {
      setupMockAnthropic(VALID_AI_RESPONSE);

      await aiProcessor.processCall('call_ai_001', CLIENT_ID, MOCK_TRANSCRIPT);

      const calls = mockBQ._getTable('Calls');
      const call = calls.find(c => c.call_id === 'call_ai_001');
      expect(call.attendance).toBe('Follow Up');
    });

    it('should store objections in the Objections table', async () => {
      setupMockAnthropic(VALID_AI_RESPONSE);

      await aiProcessor.processCall('call_ai_001', CLIENT_ID, MOCK_TRANSCRIPT);

      const objections = mockBQ._getTable('Objections');
      expect(objections).toHaveLength(1);
      expect(objections[0].call_id).toBe('call_ai_001');
      expect(objections[0].client_id).toBe(CLIENT_ID);
      expect(objections[0].objection_type).toBe('financial');
      expect(objections[0].resolved).toBe(true);
      expect(objections[0].resolution_text).toBe('We have payment plans.');
      expect(objections[0].timestamp_seconds).toBe(1500); // 00:25:00
    });

    it('should record cost in CostTracking table', async () => {
      setupMockAnthropic(VALID_AI_RESPONSE);

      await aiProcessor.processCall('call_ai_001', CLIENT_ID, MOCK_TRANSCRIPT);

      const costs = mockBQ._getTable('CostTracking');
      expect(costs).toHaveLength(1);
      expect(costs[0].call_id).toBe('call_ai_001');
      expect(costs[0].client_id).toBe(CLIENT_ID);
      expect(costs[0].input_tokens).toBe(4500);
      expect(costs[0].output_tokens).toBe(1200);
      expect(costs[0].total_cost_usd).toBeGreaterThan(0);
    });

    it('should write an audit log entry', async () => {
      setupMockAnthropic(VALID_AI_RESPONSE);

      await aiProcessor.processCall('call_ai_001', CLIENT_ID, MOCK_TRANSCRIPT);

      const audit = mockBQ._getTable('AuditLog');
      const aiAudit = audit.find(a => a.action === 'ai_processed');
      expect(aiAudit).toBeDefined();
      expect(aiAudit.entity_id).toBe('call_ai_001');
      expect(aiAudit.new_value).toBe('Follow Up');
    });

    it('should call the Anthropic API with correct parameters', async () => {
      const mockClient = setupMockAnthropic(VALID_AI_RESPONSE);

      await aiProcessor.processCall('call_ai_001', CLIENT_ID, MOCK_TRANSCRIPT);

      expect(mockClient.messages.create).toHaveBeenCalledTimes(1);
      const apiCall = mockClient.messages.create.mock.calls[0][0];
      expect(apiCall.system).toContain('CALL OUTCOMES');
      expect(apiCall.system).toContain('Elite Coaching');
      expect(apiCall.messages[0].content).toContain('TRANSCRIPT');
      expect(apiCall.messages[0].content).toContain('Sarah Closer');
    });
  });

  describe('processCall — Closed - Won outcome', () => {
    it('should handle Closed - Won outcome', async () => {
      const closedWonResponse = { ...VALID_AI_RESPONSE, call_outcome: 'Closed - Won' };
      setupMockAnthropic(closedWonResponse);

      const result = await aiProcessor.processCall('call_ai_001', CLIENT_ID, MOCK_TRANSCRIPT);

      expect(result.success).toBe(true);
      expect(result.outcome).toBe('Closed - Won');

      const calls = mockBQ._getTable('Calls');
      expect(calls[0].attendance).toBe('Closed - Won');
    });
  });

  describe('processCall — Disqualified outcome', () => {
    it('should handle Disqualified with reason', async () => {
      const dqResponse = {
        ...VALID_AI_RESPONSE,
        call_outcome: 'Disqualified',
        disqualification_reason: 'Prospect revenue under $50k/year',
      };
      setupMockAnthropic(dqResponse);

      const result = await aiProcessor.processCall('call_ai_001', CLIENT_ID, MOCK_TRANSCRIPT);

      expect(result.success).toBe(true);
      expect(result.outcome).toBe('Disqualified');

      const calls = mockBQ._getTable('Calls');
      expect(calls[0].lost_reason).toContain('under $50k');
    });
  });

  describe('processCall — no objections', () => {
    it('should handle response with no objections', async () => {
      const noObjections = { ...VALID_AI_RESPONSE, objections: [] };
      setupMockAnthropic(noObjections);

      const result = await aiProcessor.processCall('call_ai_001', CLIENT_ID, MOCK_TRANSCRIPT);

      expect(result.success).toBe(true);
      expect(result.objectionCount).toBe(0);

      const objections = mockBQ._getTable('Objections');
      expect(objections).toHaveLength(0);
    });
  });

  describe('processCall — multiple objections', () => {
    it('should store multiple objections with sequence numbers', async () => {
      const multiObjection = {
        ...VALID_AI_RESPONSE,
        objections: [
          { objection_type: 'financial', objection_text: 'Too expensive', closer_response: 'Plans available', was_overcome: true },
          { objection_type: 'spouse', objection_text: 'Need to ask wife', closer_response: 'Schedule together', was_overcome: false },
          { objection_type: 'timing', objection_text: 'Bad time', closer_response: 'When is better?', was_overcome: true },
        ],
      };
      setupMockAnthropic(multiObjection);

      const result = await aiProcessor.processCall('call_ai_001', CLIENT_ID, MOCK_TRANSCRIPT);

      expect(result.objectionCount).toBe(3);

      const objections = mockBQ._getTable('Objections');
      expect(objections).toHaveLength(3);
      expect(objections[0].objection_type).toBe('financial');
      expect(objections[1].objection_type).toBe('spouse');
      expect(objections[2].objection_type).toBe('timing');
      expect(objections[0].resolved).toBe(true);
      expect(objections[1].resolved).toBe(false);
      expect(objections[2].resolved).toBe(true);
    });
  });

  describe('processCall — error handling', () => {
    it('should handle call not found', async () => {
      setupMockAnthropic(VALID_AI_RESPONSE);

      const result = await aiProcessor.processCall('nonexistent', CLIENT_ID, MOCK_TRANSCRIPT);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Call not found');
    });

    it('should handle client not found', async () => {
      setupMockAnthropic(VALID_AI_RESPONSE);
      mockBQ._seedTable('Clients', []); // Clear clients

      const result = await aiProcessor.processCall('call_ai_001', CLIENT_ID, MOCK_TRANSCRIPT);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Client not found');
    });

    it('should mark call as errored on API failure', async () => {
      const mockClient = {
        messages: {
          create: jest.fn().mockRejectedValue(new Error('API rate limit exceeded')),
        },
      };
      aiProcessor._setAnthropicClient(mockClient);

      const result = await aiProcessor.processCall('call_ai_001', CLIENT_ID, MOCK_TRANSCRIPT);

      expect(result.success).toBe(false);
      expect(result.error).toContain('API rate limit');

      const calls = mockBQ._getTable('Calls');
      expect(calls[0].processing_status).toBe('error');
      expect(calls[0].processing_error).toContain('API rate limit');
    });

    it('should mark call as errored on unparseable response', async () => {
      const mockClient = {
        messages: {
          create: jest.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'Sorry, I cannot analyze this transcript.' }],
            usage: { input_tokens: 100, output_tokens: 50 },
          }),
        },
      };
      aiProcessor._setAnthropicClient(mockClient);

      const result = await aiProcessor.processCall('call_ai_001', CLIENT_ID, MOCK_TRANSCRIPT);

      expect(result.success).toBe(false);
      expect(result.error).toContain('parsing failed');

      const calls = mockBQ._getTable('Calls');
      expect(calls[0].processing_status).toBe('error');
    });

    it('should write audit log on error', async () => {
      const mockClient = {
        messages: {
          create: jest.fn().mockRejectedValue(new Error('Network error')),
        },
      };
      aiProcessor._setAnthropicClient(mockClient);

      await aiProcessor.processCall('call_ai_001', CLIENT_ID, MOCK_TRANSCRIPT);

      const audit = mockBQ._getTable('AuditLog');
      const errorAudit = audit.find(a => a.action === 'error' && a.trigger_source === 'ai_processing');
      expect(errorAudit).toBeDefined();
    });
  });

  describe('processCall — reprocessing (objection cleanup)', () => {
    it('should delete existing objections before storing new ones', async () => {
      // Pre-seed some old objections
      mockBQ._seedTable('Objections', [
        { objection_id: 'old_1', call_id: 'call_ai_001', client_id: CLIENT_ID, objection_type: 'timing' },
        { objection_id: 'old_2', call_id: 'call_ai_001', client_id: CLIENT_ID, objection_type: 'value' },
      ]);

      setupMockAnthropic(VALID_AI_RESPONSE);

      await aiProcessor.processCall('call_ai_001', CLIENT_ID, MOCK_TRANSCRIPT);

      const objections = mockBQ._getTable('Objections');
      // Old ones should be deleted, only the new one from AI response
      expect(objections).toHaveLength(1);
      expect(objections[0].objection_type).toBe('financial');
    });
  });
});
