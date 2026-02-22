/**
 * RESPONSE PARSER — Unit Tests
 *
 * Tests AI response parsing, validation, and normalization.
 */

const responseParser = require('../../src/services/ai/ResponseParser');

const VALID_RESPONSE = JSON.stringify({
  call_outcome: 'Follow Up',
  scores: {
    discovery_score: 7.5,
    pitch_score: 6.0,
    close_attempt_score: 5.5,
    objection_handling_score: 8.0,
    overall_call_score: 7.0,
    script_adherence_score: 6.5,
    prospect_fit_score: 8.5,
  },
  summary: 'The closer had a good discovery phase but could have pushed harder on the close.',
  objections: [
    {
      objection_type: 'financial',
      objection_text: "That's more than I expected to pay.",
      closer_response: 'I understand. Let me show you the ROI breakdown.',
      was_overcome: true,
      timestamp_approximate: '00:25:00',
    },
    {
      objection_type: 'spouse',
      objection_text: 'I need to talk to my wife about this.',
      closer_response: 'Of course. When can we schedule a follow-up with both of you?',
      was_overcome: false,
      timestamp_approximate: '00:35:00',
    },
  ],
  coaching_notes: 'Push harder on the close. Use urgency tactics after handling the spouse objection.',
  disqualification_reason: null,
});

describe('ResponseParser', () => {
  describe('parse — valid JSON', () => {
    it('should parse a valid JSON response', () => {
      const result = responseParser.parse(VALID_RESPONSE);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should preserve the call outcome', () => {
      const result = responseParser.parse(VALID_RESPONSE);
      expect(result.data.call_outcome).toBe('Follow Up');
    });

    it('should preserve scores', () => {
      const result = responseParser.parse(VALID_RESPONSE);
      expect(result.data.scores.discovery_score).toBe(7.5);
      expect(result.data.scores.overall_call_score).toBe(7.0);
    });

    it('should preserve summary and coaching notes', () => {
      const result = responseParser.parse(VALID_RESPONSE);
      expect(result.data.summary).toContain('good discovery phase');
      expect(result.data.coaching_notes).toContain('Push harder');
    });

    it('should preserve objections', () => {
      const result = responseParser.parse(VALID_RESPONSE);
      expect(result.data.objections).toHaveLength(2);
      expect(result.data.objections[0].objection_type).toBe('financial');
      expect(result.data.objections[1].objection_type).toBe('spouse');
    });

    it('should preserve was_overcome as boolean', () => {
      const result = responseParser.parse(VALID_RESPONSE);
      expect(result.data.objections[0].was_overcome).toBe(true);
      expect(result.data.objections[1].was_overcome).toBe(false);
    });
  });

  describe('parse — markdown fences', () => {
    it('should strip ```json fences', () => {
      const wrapped = '```json\n' + VALID_RESPONSE + '\n```';
      const result = responseParser.parse(wrapped);
      expect(result.success).toBe(true);
      expect(result.data.call_outcome).toBe('Follow Up');
    });

    it('should strip ``` fences without json label', () => {
      const wrapped = '```\n' + VALID_RESPONSE + '\n```';
      const result = responseParser.parse(wrapped);
      expect(result.success).toBe(true);
    });

    it('should handle preamble text before JSON', () => {
      const withPreamble = 'Here is my analysis:\n\n' + VALID_RESPONSE;
      const result = responseParser.parse(withPreamble);
      expect(result.success).toBe(true);
      expect(result.data.call_outcome).toBe('Follow Up');
    });
  });

  describe('parse — error cases', () => {
    it('should fail on null input', () => {
      const result = responseParser.parse(null);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Could not extract');
    });

    it('should fail on empty string', () => {
      const result = responseParser.parse('');
      expect(result.success).toBe(false);
    });

    it('should fail on non-JSON text', () => {
      const result = responseParser.parse('I could not analyze this transcript.');
      expect(result.success).toBe(false);
    });

    it('should fail on malformed JSON', () => {
      const result = responseParser.parse('{ "call_outcome": "Follow Up", invalid }');
      expect(result.success).toBe(false);
      expect(result.error).toContain('JSON parse error');
    });
  });

  describe('_normalizeOutcome', () => {
    it('should accept exact outcome labels', () => {
      const response = JSON.stringify({ call_outcome: 'Closed - Won', scores: {}, objections: [] });
      const result = responseParser.parse(response);
      expect(result.data.call_outcome).toBe('Closed - Won');
    });

    it('should handle case-insensitive matching', () => {
      const response = JSON.stringify({ call_outcome: 'follow up', scores: {}, objections: [] });
      const result = responseParser.parse(response);
      expect(result.data.call_outcome).toBe('Follow Up');
    });

    it('should match by key (closed_won → Closed - Won)', () => {
      const response = JSON.stringify({ call_outcome: 'closed_won', scores: {}, objections: [] });
      const result = responseParser.parse(response);
      expect(result.data.call_outcome).toBe('Closed - Won');
    });

    it('should fuzzy match partial outcomes', () => {
      const response = JSON.stringify({ call_outcome: 'Closed Won', scores: {}, objections: [] });
      const result = responseParser.parse(response);
      expect(result.data.call_outcome).toBe('Closed - Won');
    });

    it('should default to Follow Up for unknown outcome', () => {
      const response = JSON.stringify({ call_outcome: 'Totally Unknown Result', scores: {}, objections: [] });
      const result = responseParser.parse(response);
      expect(result.data.call_outcome).toBe('Follow Up');
    });

    it('should default to Follow Up for null outcome', () => {
      const response = JSON.stringify({ call_outcome: null, scores: {}, objections: [] });
      const result = responseParser.parse(response);
      expect(result.data.call_outcome).toBe('Follow Up');
    });

    it('should handle Disqualified outcome', () => {
      const response = JSON.stringify({ call_outcome: 'Disqualified', scores: {}, objections: [] });
      const result = responseParser.parse(response);
      expect(result.data.call_outcome).toBe('Disqualified');
    });

    it('should handle Deposit outcome', () => {
      const response = JSON.stringify({ call_outcome: 'deposit', scores: {}, objections: [] });
      const result = responseParser.parse(response);
      expect(result.data.call_outcome).toBe('Deposit');
    });

    it('should handle Not Pitched outcome', () => {
      const response = JSON.stringify({ call_outcome: 'Not Pitched', scores: {}, objections: [] });
      const result = responseParser.parse(response);
      expect(result.data.call_outcome).toBe('Not Pitched');
    });
  });

  describe('_normalizeScores', () => {
    it('should clamp scores above max to max', () => {
      const response = JSON.stringify({
        call_outcome: 'Follow Up',
        scores: { discovery_score: 15 },
        objections: [],
      });
      const result = responseParser.parse(response);
      expect(result.data.scores.discovery_score).toBe(10);
    });

    it('should clamp scores below min to min', () => {
      const response = JSON.stringify({
        call_outcome: 'Follow Up',
        scores: { discovery_score: -2 },
        objections: [],
      });
      const result = responseParser.parse(response);
      expect(result.data.scores.discovery_score).toBe(1);
    });

    it('should set null for missing scores', () => {
      const response = JSON.stringify({
        call_outcome: 'Follow Up',
        scores: { discovery_score: 7 },
        objections: [],
      });
      const result = responseParser.parse(response);
      expect(result.data.scores.discovery_score).toBe(7);
      expect(result.data.scores.pitch_score).toBeNull();
    });

    it('should set null for non-numeric scores', () => {
      const response = JSON.stringify({
        call_outcome: 'Follow Up',
        scores: { discovery_score: 'excellent' },
        objections: [],
      });
      const result = responseParser.parse(response);
      expect(result.data.scores.discovery_score).toBeNull();
    });

    it('should handle null scores object', () => {
      const response = JSON.stringify({
        call_outcome: 'Follow Up',
        scores: null,
        objections: [],
      });
      const result = responseParser.parse(response);
      expect(result.data.scores.discovery_score).toBeNull();
      expect(result.data.scores.overall_call_score).toBeNull();
    });

    it('should preserve decimal precision to one digit', () => {
      const response = JSON.stringify({
        call_outcome: 'Follow Up',
        scores: { discovery_score: 7.456 },
        objections: [],
      });
      const result = responseParser.parse(response);
      expect(result.data.scores.discovery_score).toBe(7.5);
    });
  });

  describe('_normalizeObjections', () => {
    it('should normalize objection types by key', () => {
      const response = JSON.stringify({
        call_outcome: 'Follow Up',
        scores: {},
        objections: [
          { objection_type: 'financial', objection_text: 'Too expensive', closer_response: 'We have plans', was_overcome: true },
        ],
      });
      const result = responseParser.parse(response);
      expect(result.data.objections[0].objection_type).toBe('financial');
    });

    it('should fuzzy match objection types by label', () => {
      const response = JSON.stringify({
        call_outcome: 'Follow Up',
        scores: {},
        objections: [
          { objection_type: 'Think About It', objection_text: 'Need to think', closer_response: 'Sure', was_overcome: false },
        ],
      });
      const result = responseParser.parse(response);
      expect(result.data.objections[0].objection_type).toBe('think_about');
    });

    it('should handle "Spouse/Partner" label', () => {
      const response = JSON.stringify({
        call_outcome: 'Follow Up',
        scores: {},
        objections: [
          { objection_type: 'Spouse/Partner', objection_text: 'Need to ask wife', closer_response: 'OK', was_overcome: false },
        ],
      });
      const result = responseParser.parse(response);
      expect(result.data.objections[0].objection_type).toBe('spouse');
    });

    it('should default unknown objection types to "other"', () => {
      const response = JSON.stringify({
        call_outcome: 'Follow Up',
        scores: {},
        objections: [
          { objection_type: 'Aliens invaded', objection_text: 'Weird', closer_response: 'OK', was_overcome: false },
        ],
      });
      const result = responseParser.parse(response);
      expect(result.data.objections[0].objection_type).toBe('other');
    });

    it('should return empty array for null objections', () => {
      const response = JSON.stringify({
        call_outcome: 'Follow Up',
        scores: {},
        objections: null,
      });
      const result = responseParser.parse(response);
      expect(result.data.objections).toEqual([]);
    });

    it('should return empty array for non-array objections', () => {
      const response = JSON.stringify({
        call_outcome: 'Follow Up',
        scores: {},
        objections: 'no objections',
      });
      const result = responseParser.parse(response);
      expect(result.data.objections).toEqual([]);
    });

    it('should filter out invalid objection entries', () => {
      const response = JSON.stringify({
        call_outcome: 'Follow Up',
        scores: {},
        objections: [
          null,
          { objection_type: 'financial', objection_text: 'Too much', closer_response: 'Plan', was_overcome: true },
          'invalid',
        ],
      });
      const result = responseParser.parse(response);
      expect(result.data.objections).toHaveLength(1);
      expect(result.data.objections[0].objection_type).toBe('financial');
    });

    it('should handle Trust/Credibility objection type', () => {
      const response = JSON.stringify({
        call_outcome: 'Follow Up',
        scores: {},
        objections: [
          { objection_type: 'Trust/Credibility', objection_text: 'Seems scammy', closer_response: 'Here are testimonials', was_overcome: true },
        ],
      });
      const result = responseParser.parse(response);
      expect(result.data.objections[0].objection_type).toBe('trust');
    });
  });

  describe('defaults for missing fields', () => {
    it('should default summary when missing', () => {
      const response = JSON.stringify({
        call_outcome: 'Follow Up',
        scores: {},
        objections: [],
      });
      const result = responseParser.parse(response);
      expect(result.data.summary).toBe('No summary provided');
    });

    it('should default coaching_notes to null when missing', () => {
      const response = JSON.stringify({
        call_outcome: 'Follow Up',
        scores: {},
        objections: [],
      });
      const result = responseParser.parse(response);
      expect(result.data.coaching_notes).toBeNull();
    });

    it('should default disqualification_reason to null when missing', () => {
      const response = JSON.stringify({
        call_outcome: 'Follow Up',
        scores: {},
        objections: [],
      });
      const result = responseParser.parse(response);
      expect(result.data.disqualification_reason).toBeNull();
    });
  });
});
