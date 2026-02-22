/**
 * TL;DV ADAPTER — Tier 1 Transcript Provider
 *
 * Normalizes tl;dv webhook payloads (MeetingReady / TranscriptReady)
 * into our StandardTranscript format.
 *
 * tl;dv webhook payload:
 * {
 *   "id": "event-id",
 *   "event": "MeetingReady" | "TranscriptReady",
 *   "data": {
 *     "id": "meeting-id",
 *     "name": "Meeting Title",
 *     "happenedAt": "ISO timestamp",
 *     "url": "https://tldv.io/app/meetings/xxx",
 *     "duration": 2580 (seconds),
 *     "organizer": { "name": "Closer", "email": "closer@example.com" },
 *     "invitees": [{ "name": "Prospect", "email": "prospect@example.com" }]
 *   },
 *   "executedAt": "ISO timestamp"
 * }
 *
 * Transcript (fetched via API):
 * {
 *   "data": [{ "speaker": "Name", "text": "...", "startTime": 5.0, "endTime": 8.5 }]
 * }
 *
 * NOTE: tl;dv API is v1alpha1 — expect possible changes.
 */

const BaseTranscriptAdapter = require('./BaseTranscriptAdapter');

class TLDVAdapter extends BaseTranscriptAdapter {
  normalizePayload(payload) {
    const data = payload.data || {};
    const closerEmail = data.organizer?.email || null;
    const prospectInfo = this._extractProspect(data.invitees, closerEmail);

    // tl;dv may include transcript in the webhook or require a separate fetch
    const transcript = this._flattenTranscript(data.transcript);
    const speakers = this._extractSpeakers(data.transcript);

    return {
      closerEmail,
      prospectEmail: prospectInfo.email,
      prospectName: prospectInfo.name,
      scheduledStartTime: data.happenedAt || null,
      recordingStartTime: data.happenedAt || null,
      recordingEndTime: this._calculateEndTime(data.happenedAt, data.duration),
      durationSeconds: data.duration || null,
      transcript,
      shareUrl: data.url || null,
      transcriptUrl: data.url || null,
      title: data.name || null,
      summary: null,
      provider: 'tldv',
      providerMeetingId: data.id || null,
      speakerCount: speakers.length || null,
      speakers,
      rawPayload: payload,
    };
  }

  getProviderKey() {
    return 'tldv';
  }

  hasTranscript(payload) {
    const data = payload.data || {};
    return Array.isArray(data.transcript) && data.transcript.length > 0;
  }

  getMeetingId(payload) {
    return payload.data?.id || null;
  }

  _extractProspect(invitees, closerEmail) {
    if (!Array.isArray(invitees) || invitees.length === 0) {
      return { email: null, name: null };
    }

    const prospect = invitees.find(
      i => i.email?.toLowerCase() !== closerEmail?.toLowerCase()
    );

    if (prospect) {
      return { email: prospect.email, name: prospect.name || null };
    }

    return { email: null, name: null };
  }

  /**
   * Flattens tl;dv transcript data into a single string.
   *
   * Input:  [{ speaker: "Name", text: "...", startTime: 5.0, endTime: 8.5 }]
   * Output: "00:00:05 - Name: text"
   */
  _flattenTranscript(transcriptData) {
    if (!Array.isArray(transcriptData) || transcriptData.length === 0) {
      return null;
    }

    return transcriptData
      .map(entry => {
        const speaker = entry.speaker || 'Unknown';
        const timestamp = this._formatSeconds(entry.startTime);
        const text = entry.text || '';
        return `${timestamp} - ${speaker}: ${text}`;
      })
      .join('\n');
  }

  _extractSpeakers(transcriptData) {
    if (!Array.isArray(transcriptData) || transcriptData.length === 0) {
      return [];
    }

    const speakerMap = new Map();

    for (const entry of transcriptData) {
      const name = entry.speaker || 'Unknown';

      if (!speakerMap.has(name)) {
        speakerMap.set(name, {
          name,
          email: null,
          utteranceCount: 0,
          wordCount: 0,
        });
      }

      const speaker = speakerMap.get(name);
      speaker.utteranceCount += 1;
      speaker.wordCount += (entry.text || '').split(/\s+/).filter(w => w.length > 0).length;
    }

    return Array.from(speakerMap.values());
  }

  /**
   * Converts seconds to HH:MM:SS format.
   */
  _formatSeconds(totalSeconds) {
    if (totalSeconds == null) return '00:00:00';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return [hours, minutes, seconds]
      .map(v => String(v).padStart(2, '0'))
      .join(':');
  }

  _calculateEndTime(startTime, durationSeconds) {
    if (!startTime || !durationSeconds) return null;
    const start = new Date(startTime);
    return new Date(start.getTime() + durationSeconds * 1000).toISOString();
  }
}

module.exports = new TLDVAdapter();
