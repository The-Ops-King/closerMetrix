/**
 * FATHOM ADAPTER — Tier 1 Transcript Provider
 *
 * Normalizes Fathom webhook payloads (new-meeting-content-ready) into
 * our StandardTranscript format.
 *
 * Fathom webhook payload fields used:
 * - recorded_by.email        → closerEmail
 * - calendar_invitees        → prospectEmail (where is_external = true)
 * - scheduled_start_time     → scheduledStartTime
 * - recording_start_time     → recordingStartTime
 * - recording_end_time       → recordingEndTime
 * - recording_id             → providerMeetingId (used for polling)
 * - transcript               → array of { speaker, text, timestamp } OR null
 * - url / share_url          → shareUrl
 * - title / meeting_title    → title
 * - default_summary          → summary
 *
 * IMPORTANT: The transcript field is an array of objects, not a flat string.
 * This adapter flattens it into a timestamped string for AI processing.
 *
 * IMPORTANT: transcript may be null in the webhook payload. When this happens,
 * the TranscriptService must poll the Fathom API to fetch it.
 */

const BaseTranscriptAdapter = require('./BaseTranscriptAdapter');

class FathomAdapter extends BaseTranscriptAdapter {
  /**
   * Normalizes a Fathom webhook payload into StandardTranscript format.
   *
   * @param {Object} payload — Raw Fathom webhook body
   * @returns {Object} StandardTranscript
   */
  normalizePayload(payload) {
    const closerEmail = payload.recorded_by?.email || null;
    const prospectInfo = this._extractProspect(payload.calendar_invitees, closerEmail);
    const transcript = this._flattenTranscript(payload.transcript);
    const speakers = this._extractSpeakers(payload.transcript);
    const durationSeconds = this._calculateDuration(
      payload.recording_start_time,
      payload.recording_end_time
    );

    return {
      closerEmail,
      prospectEmail: prospectInfo.email,
      prospectName: prospectInfo.name,
      scheduledStartTime: payload.scheduled_start_time || payload.created_at || null,
      recordingStartTime: payload.recording_start_time || null,
      recordingEndTime: payload.recording_end_time || null,
      durationSeconds,
      transcript,
      shareUrl: payload.share_url || payload.url || null,
      transcriptUrl: payload.url || null,
      title: payload.meeting_title || payload.title || null,
      summary: payload.default_summary || null,
      provider: 'fathom',
      providerMeetingId: payload.recording_id ? String(payload.recording_id) : null,
      speakerCount: speakers.length,
      speakers,
      rawPayload: payload,
    };
  }

  getProviderKey() {
    return 'fathom';
  }

  /**
   * Checks whether the transcript array is present and non-empty.
   */
  hasTranscript(payload) {
    return Array.isArray(payload.transcript) && payload.transcript.length > 0;
  }

  /**
   * Returns the Fathom recording_id for polling.
   */
  getMeetingId(payload) {
    return payload.recording_id ? String(payload.recording_id) : null;
  }

  /**
   * Extracts prospect info from Fathom's calendar_invitees array.
   * The prospect is the attendee where is_external = true.
   * Filters out the closer's email.
   *
   * @param {Array} invitees — calendar_invitees from Fathom payload
   * @param {string} closerEmail — The closer's email to exclude
   * @returns {Object} { email, name }
   */
  _extractProspect(invitees, closerEmail) {
    if (!Array.isArray(invitees) || invitees.length === 0) {
      return { email: null, name: null };
    }

    // Prefer external invitees (that's the prospect)
    const external = invitees.find(
      i => i.is_external === true && i.email?.toLowerCase() !== closerEmail?.toLowerCase()
    );

    if (external) {
      return { email: external.email, name: external.name || null };
    }

    // Fallback: any invitee that isn't the closer
    const other = invitees.find(
      i => i.email?.toLowerCase() !== closerEmail?.toLowerCase()
    );

    if (other) {
      return { email: other.email, name: other.name || null };
    }

    return { email: null, name: null };
  }

  /**
   * Flattens Fathom's structured transcript array into a single string.
   *
   * Input:  [{ speaker: { display_name, matched_calendar_invitee_email }, text, timestamp }]
   * Output: "00:00:05 - Closer Name: Hey John, thanks for joining today.\n00:00:12 - Prospect Name: Happy to be here!"
   *
   * @param {Array|null} transcriptArray — Fathom transcript array
   * @returns {string|null} Flattened transcript text
   */
  _flattenTranscript(transcriptArray) {
    if (!Array.isArray(transcriptArray) || transcriptArray.length === 0) {
      return null;
    }

    return transcriptArray
      .map(entry => {
        const speaker = entry.speaker?.display_name || 'Unknown';
        const timestamp = entry.timestamp || '';
        const text = entry.text || '';
        return `${timestamp} - ${speaker}: ${text}`;
      })
      .join('\n');
  }

  /**
   * Extracts unique speaker information from the transcript array.
   * Used for speaker count and transcript evaluation.
   *
   * @param {Array|null} transcriptArray — Fathom transcript array
   * @returns {Array} [{ name, email, utteranceCount, wordCount }]
   */
  _extractSpeakers(transcriptArray) {
    if (!Array.isArray(transcriptArray) || transcriptArray.length === 0) {
      return [];
    }

    const speakerMap = new Map();

    for (const entry of transcriptArray) {
      const name = entry.speaker?.display_name || 'Unknown';
      const email = entry.speaker?.matched_calendar_invitee_email || null;
      const key = email || name;

      if (!speakerMap.has(key)) {
        speakerMap.set(key, {
          name,
          email,
          utteranceCount: 0,
          wordCount: 0,
        });
      }

      const speaker = speakerMap.get(key);
      speaker.utteranceCount += 1;
      speaker.wordCount += (entry.text || '').split(/\s+/).filter(w => w.length > 0).length;
    }

    return Array.from(speakerMap.values());
  }

  /**
   * Calculates recording duration in seconds from start/end times.
   *
   * @param {string} startTime — ISO timestamp
   * @param {string} endTime — ISO timestamp
   * @returns {number|null} Duration in seconds
   */
  _calculateDuration(startTime, endTime) {
    if (!startTime || !endTime) return null;
    const start = new Date(startTime);
    const end = new Date(endTime);
    const diffMs = end - start;
    return diffMs > 0 ? Math.round(diffMs / 1000) : null;
  }
}

module.exports = new FathomAdapter();
