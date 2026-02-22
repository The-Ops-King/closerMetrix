/**
 * TRANSCRIPT SERVICE — Unit Tests
 *
 * Tests transcript evaluation logic, client identification,
 * call matching, and state transitions.
 */

jest.mock('../../src/db/BigQueryClient', () => require('../helpers/mockBigQuery'));

const transcriptService = require('../../src/services/transcript/TranscriptService');
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

beforeEach(() => {
  mockBQ._reset();
});

describe('TranscriptService', () => {
  describe('evaluateTranscript', () => {
    it('should return Ghosted when transcript is null', () => {
      const result = transcriptService.evaluateTranscript({
        transcript: null,
        speakerCount: null,
        speakers: null,
        closerEmail: 'closer@test.com',
      });
      expect(result.isShow).toBe(false);
      expect(result.reason).toBe('no_transcript');
    });

    it('should return Ghosted when transcript is too short', () => {
      const result = transcriptService.evaluateTranscript({
        transcript: 'Hello?',
        speakerCount: 1,
        speakers: [],
        closerEmail: 'closer@test.com',
      });
      expect(result.isShow).toBe(false);
      expect(result.reason).toBe('transcript_too_short');
    });

    it('should return Ghosted when only one speaker', () => {
      const result = transcriptService.evaluateTranscript({
        transcript: 'A'.repeat(100),
        speakerCount: 1,
        speakers: [{ name: 'Closer', email: 'closer@test.com', utteranceCount: 10, wordCount: 100 }],
        closerEmail: 'closer@test.com',
      });
      expect(result.isShow).toBe(false);
      expect(result.reason).toBe('single_speaker');
    });

    it('should return Show even when prospect barely spoke (AI decides outcome)', () => {
      const result = transcriptService.evaluateTranscript({
        transcript: 'A'.repeat(200),
        speakerCount: 2,
        speakers: [
          { name: 'Closer', email: 'closer@test.com', utteranceCount: 20, wordCount: 500 },
          { name: 'Prospect', email: 'prospect@test.com', utteranceCount: 1, wordCount: 5 },
        ],
        closerEmail: 'closer@test.com',
      });
      expect(result.isShow).toBe(true);
      expect(result.reason).toBe('valid_conversation');
    });

    it('should return Show for a valid conversation', () => {
      const result = transcriptService.evaluateTranscript({
        transcript: 'A'.repeat(200),
        speakerCount: 2,
        speakers: [
          { name: 'Closer', email: 'closer@test.com', utteranceCount: 15, wordCount: 300 },
          { name: 'Prospect', email: 'prospect@test.com', utteranceCount: 10, wordCount: 200 },
        ],
        closerEmail: 'closer@test.com',
      });
      expect(result.isShow).toBe(true);
      expect(result.reason).toBe('valid_conversation');
    });

    it('should return Show when speakerCount is null but transcript is long enough', () => {
      const result = transcriptService.evaluateTranscript({
        transcript: 'A'.repeat(200),
        speakerCount: null,
        speakers: null,
        closerEmail: 'closer@test.com',
      });
      expect(result.isShow).toBe(true);
    });
  });

  describe('processTranscriptWebhook — full flow', () => {
    it('should match transcript to existing call and transition to Show', async () => {
      // Seed closer and matching call record
      mockBQ._seedTable('Closers', [MOCK_CLOSER]);
      mockBQ._seedTable('Calls', [{
        call_id: 'call_001',
        appointment_id: 'event_abc123',
        client_id: CLIENT_ID,
        closer_id: 'closer_sarah_001',
        prospect_email: 'john@example.com',
        attendance: null,
        appointment_date: '2026-02-20T20:00:00.000Z',
        created: '2026-02-18T10:00:00.000Z',
        transcript_status: 'Pending',
        transcript_link: null,
        recording_url: null,
        call_url: null,
        duration_minutes: null,
        prospect_name: 'John Smith',
      }]);

      const fathomPayload = require('../helpers/fixtures/fathom-webhook-full.json');
      const result = await transcriptService.processTranscriptWebhook('fathom', fathomPayload);

      expect(result.action).toBe('show');
      expect(result.evaluation.isShow).toBe(true);

      // Verify call record was updated
      const calls = mockBQ._getTable('Calls');
      expect(calls[0].attendance).toBe('Show');
      expect(calls[0].transcript_status).toBe('Received');
      expect(calls[0].transcript_provider).toBe('fathom');
      expect(calls[0].transcript_link).toBe('https://fathom.video/share/abc123');
    });

    it('should mark as Ghosted when transcript shows single speaker', async () => {
      mockBQ._seedTable('Closers', [MOCK_CLOSER]);
      mockBQ._seedTable('Calls', [{
        call_id: 'call_002',
        appointment_id: 'event_def456',
        client_id: CLIENT_ID,
        closer_id: 'closer_sarah_001',
        prospect_email: 'john@example.com',
        attendance: null,
        appointment_date: '2026-02-20T20:00:00.000Z',
        created: '2026-02-18T10:00:00.000Z',
        transcript_status: 'Pending',
        transcript_link: null,
        recording_url: null,
        call_url: null,
        duration_minutes: null,
        prospect_name: 'John Smith',
      }]);

      const ghostedPayload = require('../helpers/fixtures/fathom-webhook-ghosted.json');
      const result = await transcriptService.processTranscriptWebhook('fathom', ghostedPayload);

      expect(result.action).toBe('ghosted');
      expect(result.evaluation.isShow).toBe(false);

      const calls = mockBQ._getTable('Calls');
      expect(calls[0].attendance).toBe('Ghosted - No Show');
    });

    it('should return needs_polling when transcript is null', async () => {
      const noTranscript = require('../helpers/fixtures/fathom-webhook-no-transcript.json');
      const result = await transcriptService.processTranscriptWebhook('fathom', noTranscript);

      expect(result.action).toBe('needs_polling');
      expect(result.meetingId).toBe('12346');
    });

    it('should return unidentified when closer email is unknown', async () => {
      const payload = {
        ...require('../helpers/fixtures/fathom-webhook-full.json'),
        recorded_by: { name: 'Unknown', email: 'nobody@unknown.com' },
      };
      const result = await transcriptService.processTranscriptWebhook('fathom', payload);

      expect(result.action).toBe('unidentified');
    });

    it('should create new call record when no matching calendar event', async () => {
      mockBQ._seedTable('Closers', [MOCK_CLOSER]);
      // No call records seeded — transcript arrives before calendar

      const fathomPayload = require('../helpers/fixtures/fathom-webhook-full.json');
      const result = await transcriptService.processTranscriptWebhook('fathom', fathomPayload);

      expect(result.action).toBe('show');

      // A new call record should have been created
      const calls = mockBQ._getTable('Calls');
      expect(calls).toHaveLength(1);
      expect(calls[0].ingestion_source).toBe('transcript');
      expect(calls[0].attendance).toBe('Show');
      expect(calls[0].transcript_provider).toBe('fathom');
    });
  });

  describe('_identifyClient', () => {
    it('should find client from closer work email', async () => {
      mockBQ._seedTable('Closers', [MOCK_CLOSER]);

      const result = await transcriptService._identifyClient('sarah@acmecoaching.com');
      expect(result).toBeDefined();
      expect(result.clientId).toBe(CLIENT_ID);
      expect(result.closer.closer_id).toBe('closer_sarah_001');
    });

    it('should return null for unknown email', async () => {
      const result = await transcriptService._identifyClient('unknown@example.com');
      expect(result).toBeNull();
    });

    it('should return null for null email', async () => {
      const result = await transcriptService._identifyClient(null);
      expect(result).toBeNull();
    });
  });
});
