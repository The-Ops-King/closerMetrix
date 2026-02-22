/**
 * PROMPT BUILDER — Unit Tests
 *
 * Tests dynamic prompt assembly from config files and client records.
 */

const promptBuilder = require('../../src/services/ai/PromptBuilder');
const callOutcomes = require('../../src/config/call-outcomes');
const objectionTypes = require('../../src/config/objection-types');
const scoringRubric = require('../../src/config/scoring-rubric');

const MOCK_CLIENT = {
  client_id: 'friends_inc',
  company_name: 'Friends Inc',
  offer_name: 'Elite Coaching Program',
  offer_price: 5000,
  offer_description: 'A 12-week intensive coaching program',
  ai_prompt_overall: 'We are a high-ticket coaching company focused on business owners.',
  ai_prompt_discovery: 'Closers must ask about revenue, team size, and top 3 challenges.',
  ai_prompt_pitch: 'The pitch should always mention our money-back guarantee.',
  ai_prompt_close: 'Ask for the sale directly at least twice.',
  ai_prompt_objections: 'For financial objections, always offer the payment plan first.',
  ai_context_notes: 'Our average client sees 2x revenue growth in 6 months.',
  script_template: '1. Intro and rapport\n2. Discovery questions\n3. Present the offer\n4. Handle objections\n5. Close',
  common_objections: 'Financial, Spouse/Partner, Think About It',
  disqualification_criteria: 'Revenue under $50k/year, not the decision maker, no budget',
};

const MOCK_CALL_METADATA = {
  call_id: 'call_001',
  call_type: 'First Call',
  closer_name: 'Sarah Closer',
  prospect_name: 'John Smith',
  prospect_email: 'john@example.com',
  duration_minutes: 45,
};

const MOCK_TRANSCRIPT = '00:00:05 - Sarah Closer: Hi John, thanks for joining.\n00:00:12 - John Smith: Thanks for having me.';

describe('PromptBuilder', () => {
  describe('buildPrompt', () => {
    it('should return systemPrompt and userMessage', () => {
      const result = promptBuilder.buildPrompt(MOCK_CLIENT, MOCK_CALL_METADATA, MOCK_TRANSCRIPT);
      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('userMessage');
      expect(typeof result.systemPrompt).toBe('string');
      expect(typeof result.userMessage).toBe('string');
    });
  });

  describe('Master Prompt (Layer 1)', () => {
    let systemPrompt;

    beforeAll(() => {
      const result = promptBuilder.buildPrompt(MOCK_CLIENT, MOCK_CALL_METADATA, MOCK_TRANSCRIPT);
      systemPrompt = result.systemPrompt;
    });

    it('should include all call outcomes from config', () => {
      for (const outcome of callOutcomes) {
        expect(systemPrompt).toContain(outcome.label);
      }
    });

    it('should include all objection types from config', () => {
      for (const type of objectionTypes) {
        expect(systemPrompt).toContain(type.key);
        expect(systemPrompt).toContain(type.label);
      }
    });

    it('should include scoring rubric levels', () => {
      for (const level of scoringRubric.levels) {
        expect(systemPrompt).toContain(level.label);
      }
    });

    it('should include all score type keys', () => {
      for (const scoreType of scoringRubric.scoreTypes) {
        expect(systemPrompt).toContain(scoreType.key);
      }
    });

    it('should include the valid score range', () => {
      expect(systemPrompt).toContain(String(scoringRubric.scale.min));
      expect(systemPrompt).toContain(String(scoringRubric.scale.max));
    });

    it('should instruct to return only valid JSON', () => {
      expect(systemPrompt).toContain('Return ONLY valid JSON');
    });

    it('should define the output schema', () => {
      expect(systemPrompt).toContain('"call_outcome"');
      expect(systemPrompt).toContain('"scores"');
      expect(systemPrompt).toContain('"summary"');
      expect(systemPrompt).toContain('"objections"');
      expect(systemPrompt).toContain('"coaching_notes"');
    });
  });

  describe('Client Mini-Prompts (Layer 2)', () => {
    it('should include client context when provided', () => {
      const { systemPrompt } = promptBuilder.buildPrompt(MOCK_CLIENT, MOCK_CALL_METADATA, MOCK_TRANSCRIPT);
      expect(systemPrompt).toContain('CLIENT CONTEXT');
      expect(systemPrompt).toContain('high-ticket coaching company');
    });

    it('should include offer details', () => {
      const { systemPrompt } = promptBuilder.buildPrompt(MOCK_CLIENT, MOCK_CALL_METADATA, MOCK_TRANSCRIPT);
      expect(systemPrompt).toContain('Elite Coaching Program');
      expect(systemPrompt).toContain('$5000');
    });

    it('should include script template', () => {
      const { systemPrompt } = promptBuilder.buildPrompt(MOCK_CLIENT, MOCK_CALL_METADATA, MOCK_TRANSCRIPT);
      expect(systemPrompt).toContain('SCRIPT TEMPLATE');
      expect(systemPrompt).toContain('Intro and rapport');
    });

    it('should include discovery scoring instructions', () => {
      const { systemPrompt } = promptBuilder.buildPrompt(MOCK_CLIENT, MOCK_CALL_METADATA, MOCK_TRANSCRIPT);
      expect(systemPrompt).toContain('DISCOVERY SCORING INSTRUCTIONS');
      expect(systemPrompt).toContain('revenue, team size');
    });

    it('should include pitch scoring instructions', () => {
      const { systemPrompt } = promptBuilder.buildPrompt(MOCK_CLIENT, MOCK_CALL_METADATA, MOCK_TRANSCRIPT);
      expect(systemPrompt).toContain('PITCH SCORING INSTRUCTIONS');
      expect(systemPrompt).toContain('money-back guarantee');
    });

    it('should include close scoring instructions', () => {
      const { systemPrompt } = promptBuilder.buildPrompt(MOCK_CLIENT, MOCK_CALL_METADATA, MOCK_TRANSCRIPT);
      expect(systemPrompt).toContain('CLOSE SCORING INSTRUCTIONS');
    });

    it('should include objection handling instructions', () => {
      const { systemPrompt } = promptBuilder.buildPrompt(MOCK_CLIENT, MOCK_CALL_METADATA, MOCK_TRANSCRIPT);
      expect(systemPrompt).toContain('OBJECTION HANDLING INSTRUCTIONS');
      expect(systemPrompt).toContain('payment plan first');
    });

    it('should include disqualification criteria', () => {
      const { systemPrompt } = promptBuilder.buildPrompt(MOCK_CLIENT, MOCK_CALL_METADATA, MOCK_TRANSCRIPT);
      expect(systemPrompt).toContain('DISQUALIFICATION CRITERIA');
      expect(systemPrompt).toContain('Revenue under $50k');
    });

    it('should include common objections', () => {
      const { systemPrompt } = promptBuilder.buildPrompt(MOCK_CLIENT, MOCK_CALL_METADATA, MOCK_TRANSCRIPT);
      expect(systemPrompt).toContain('KNOWN COMMON OBJECTIONS');
    });

    it('should include additional context notes', () => {
      const { systemPrompt } = promptBuilder.buildPrompt(MOCK_CLIENT, MOCK_CALL_METADATA, MOCK_TRANSCRIPT);
      expect(systemPrompt).toContain('ADDITIONAL CONTEXT');
      expect(systemPrompt).toContain('2x revenue growth');
    });

    it('should omit empty client sections', () => {
      const minimalClient = { client_id: 'minimal', company_name: 'Minimal Corp' };
      const { systemPrompt } = promptBuilder.buildPrompt(minimalClient, MOCK_CALL_METADATA, MOCK_TRANSCRIPT);
      expect(systemPrompt).not.toContain('CLIENT-SPECIFIC INSTRUCTIONS');
      expect(systemPrompt).not.toContain('DISCOVERY SCORING');
    });

    it('should handle null client gracefully', () => {
      const { systemPrompt } = promptBuilder.buildPrompt(null, MOCK_CALL_METADATA, MOCK_TRANSCRIPT);
      expect(systemPrompt).not.toContain('CLIENT-SPECIFIC INSTRUCTIONS');
      // Should still have the master prompt
      expect(systemPrompt).toContain('CALL OUTCOMES');
    });
  });

  describe('User Message', () => {
    it('should include call metadata', () => {
      const { userMessage } = promptBuilder.buildPrompt(MOCK_CLIENT, MOCK_CALL_METADATA, MOCK_TRANSCRIPT);
      expect(userMessage).toContain('CALL METADATA');
      expect(userMessage).toContain('First Call');
      expect(userMessage).toContain('Sarah Closer');
      expect(userMessage).toContain('John Smith');
      expect(userMessage).toContain('45 minutes');
    });

    it('should include the transcript', () => {
      const { userMessage } = promptBuilder.buildPrompt(MOCK_CLIENT, MOCK_CALL_METADATA, MOCK_TRANSCRIPT);
      expect(userMessage).toContain('TRANSCRIPT');
      expect(userMessage).toContain('thanks for joining');
    });

    it('should handle minimal metadata', () => {
      const { userMessage } = promptBuilder.buildPrompt(MOCK_CLIENT, {}, MOCK_TRANSCRIPT);
      expect(userMessage).toContain('TRANSCRIPT');
      expect(userMessage).toContain('thanks for joining');
    });
  });
});
