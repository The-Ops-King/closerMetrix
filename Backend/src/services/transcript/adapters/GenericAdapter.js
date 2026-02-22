/**
 * GENERIC ADAPTER — Tier 3 Transcript Provider
 *
 * Handles standardized JSON payloads from any provider that doesn't have
 * a dedicated adapter. Clients can use Zapier/Make/custom code to format
 * their transcript provider's data into this standard shape.
 *
 * Expected payload format:
 * {
 *   "closer_email": "closer@example.com",
 *   "prospect_email": "prospect@example.com",     // optional
 *   "prospect_name": "John Smith",                 // optional
 *   "scheduled_start_time": "ISO timestamp",
 *   "recording_start_time": "ISO timestamp",       // optional
 *   "recording_end_time": "ISO timestamp",         // optional
 *   "duration_seconds": 2580,                      // optional
 *   "transcript": "Full transcript text as string",
 *   "share_url": "https://...",                    // optional
 *   "title": "Meeting title",                      // optional
 *   "summary": "Meeting summary",                  // optional
 *   "meeting_id": "provider-meeting-id",           // optional
 *   "speakers": [                                   // optional
 *     { "name": "Speaker Name", "email": "email@example.com" }
 *   ]
 * }
 */

const BaseTranscriptAdapter = require('./BaseTranscriptAdapter');

class GenericAdapter extends BaseTranscriptAdapter {
  normalizePayload(payload) {
    const speakerCount = Array.isArray(payload.speakers) ? payload.speakers.length : null;

    return {
      closerEmail: payload.closer_email || null,
      prospectEmail: payload.prospect_email || null,
      prospectName: payload.prospect_name || null,
      scheduledStartTime: payload.scheduled_start_time || null,
      recordingStartTime: payload.recording_start_time || null,
      recordingEndTime: payload.recording_end_time || null,
      durationSeconds: payload.duration_seconds || null,
      transcript: payload.transcript || null,
      shareUrl: payload.share_url || null,
      transcriptUrl: payload.transcript_url || null,
      title: payload.title || null,
      summary: payload.summary || null,
      provider: 'generic',
      providerMeetingId: payload.meeting_id || null,
      speakerCount,
      speakers: null,
      rawPayload: payload,
    };
  }

  getProviderKey() {
    return 'generic';
  }

  hasTranscript(payload) {
    return typeof payload.transcript === 'string' && payload.transcript.length > 0;
  }

  getMeetingId(payload) {
    return payload.meeting_id || null;
  }
}

module.exports = new GenericAdapter();
