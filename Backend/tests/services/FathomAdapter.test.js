/**
 * FATHOM ADAPTER — Unit Tests
 *
 * Tests normalization of Fathom webhook payloads into StandardTranscript format.
 */

const adapter = require('../../src/services/transcript/adapters/FathomAdapter');
const fullPayload = require('../helpers/fixtures/fathom-webhook-full.json');
const noTranscriptPayload = require('../helpers/fixtures/fathom-webhook-no-transcript.json');
const ghostedPayload = require('../helpers/fixtures/fathom-webhook-ghosted.json');

describe('FathomAdapter', () => {
  describe('normalizePayload — full payload', () => {
    let result;

    beforeAll(() => {
      result = adapter.normalizePayload(fullPayload);
    });

    it('should extract closer email from recorded_by', () => {
      expect(result.closerEmail).toBe('sarah@acmecoaching.com');
    });

    it('should extract prospect from external calendar invitee', () => {
      expect(result.prospectEmail).toBe('john@example.com');
      expect(result.prospectName).toBe('John Smith');
    });

    it('should set scheduled start time', () => {
      expect(result.scheduledStartTime).toBe('2026-02-20T20:00:00Z');
    });

    it('should set recording times', () => {
      expect(result.recordingStartTime).toBe('2026-02-20T20:02:00Z');
      expect(result.recordingEndTime).toBe('2026-02-20T20:47:00Z');
    });

    it('should calculate duration in seconds', () => {
      // 20:02 to 20:47 = 45 minutes = 2700 seconds
      expect(result.durationSeconds).toBe(2700);
    });

    it('should flatten transcript into a string with timestamps', () => {
      expect(result.transcript).toContain('00:00:05 - Sarah Closer:');
      expect(result.transcript).toContain('00:00:12 - John Smith:');
      expect(result.transcript).toContain('thanks for joining today');
      expect(typeof result.transcript).toBe('string');
    });

    it('should set share URL', () => {
      expect(result.shareUrl).toBe('https://fathom.video/share/abc123');
    });

    it('should set title from meeting_title', () => {
      expect(result.title).toBe('Discovery Call with John Smith');
    });

    it('should set summary', () => {
      expect(result.summary).toContain('revenue growth strategies');
    });

    it('should set provider to fathom', () => {
      expect(result.provider).toBe('fathom');
    });

    it('should set providerMeetingId from recording_id', () => {
      expect(result.providerMeetingId).toBe('12345');
    });

    it('should count speakers correctly', () => {
      expect(result.speakerCount).toBe(2);
    });

    it('should extract speaker details with utterance and word counts', () => {
      expect(result.speakers).toHaveLength(2);

      const closer = result.speakers.find(s => s.email === 'sarah@acmecoaching.com');
      expect(closer).toBeDefined();
      expect(closer.utteranceCount).toBe(4);

      const prospect = result.speakers.find(s => s.email === 'john@example.com');
      expect(prospect).toBeDefined();
      expect(prospect.utteranceCount).toBe(4);
      expect(prospect.wordCount).toBeGreaterThan(30);
    });

    it('should preserve raw payload', () => {
      expect(result.rawPayload).toBe(fullPayload);
    });
  });

  describe('normalizePayload — no transcript', () => {
    it('should return null transcript when payload has no transcript', () => {
      const result = adapter.normalizePayload(noTranscriptPayload);
      expect(result.transcript).toBeNull();
      expect(result.speakerCount).toBe(0);
      expect(result.speakers).toEqual([]);
    });
  });

  describe('normalizePayload — ghosted (one speaker)', () => {
    it('should count only one speaker when prospect never spoke', () => {
      const result = adapter.normalizePayload(ghostedPayload);
      expect(result.speakerCount).toBe(1);
      expect(result.speakers).toHaveLength(1);
      expect(result.speakers[0].email).toBe('sarah@acmecoaching.com');
    });
  });

  describe('hasTranscript', () => {
    it('should return true when transcript array is present', () => {
      expect(adapter.hasTranscript(fullPayload)).toBe(true);
    });

    it('should return false when transcript is null', () => {
      expect(adapter.hasTranscript(noTranscriptPayload)).toBe(false);
    });

    it('should return false when transcript is empty array', () => {
      expect(adapter.hasTranscript({ transcript: [] })).toBe(false);
    });
  });

  describe('getMeetingId', () => {
    it('should return recording_id as string', () => {
      expect(adapter.getMeetingId(fullPayload)).toBe('12345');
    });

    it('should return null when no recording_id', () => {
      expect(adapter.getMeetingId({})).toBeNull();
    });
  });

  describe('getProviderKey', () => {
    it('should return "fathom"', () => {
      expect(adapter.getProviderKey()).toBe('fathom');
    });
  });

  describe('_extractProspect', () => {
    it('should find external invitee', () => {
      const result = adapter._extractProspect(fullPayload.calendar_invitees, 'sarah@acmecoaching.com');
      expect(result.email).toBe('john@example.com');
      expect(result.name).toBe('John Smith');
    });

    it('should return null when no invitees', () => {
      const result = adapter._extractProspect(null, 'sarah@acmecoaching.com');
      expect(result.email).toBeNull();
    });

    it('should return null when all invitees are the closer', () => {
      const invitees = [{ email: 'sarah@acmecoaching.com', is_external: false }];
      const result = adapter._extractProspect(invitees, 'sarah@acmecoaching.com');
      expect(result.email).toBeNull();
    });
  });
});
