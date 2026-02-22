/**
 * BASE TRANSCRIPT ADAPTER — Interface Definition
 *
 * Every transcript adapter (Fathom, tl;dv, Generic, etc.) must extend
 * this class and implement all methods.
 *
 * The adapter's job: take a raw webhook payload from the transcript provider
 * and normalize it into our StandardTranscript format.
 *
 * StandardTranscript shape:
 * {
 *   closerEmail:        string        — Email of the person who recorded
 *   prospectEmail:      string|null   — Prospect email if available
 *   prospectName:       string|null   — Prospect name if available
 *   scheduledStartTime: string        — UTC ISO timestamp of when meeting was scheduled
 *   recordingStartTime: string        — When recording actually started
 *   recordingEndTime:   string        — When recording ended
 *   durationSeconds:    number        — Recording duration in seconds
 *   transcript:         string|null   — Full transcript as flat text
 *   shareUrl:           string|null   — Link to recording
 *   transcriptUrl:      string|null   — Link to transcript
 *   title:              string|null   — Meeting title
 *   summary:            string|null   — Auto-generated summary (if provider offers it)
 *   provider:           string        — Provider key from transcript-providers.js
 *   providerMeetingId:  string|null   — Provider's own meeting/recording ID
 *   speakerCount:       number|null   — Number of distinct speakers detected
 *   speakers:           Array|null    — Speaker details for evaluation
 *   rawPayload:         Object        — Original unmodified webhook payload
 * }
 */

class BaseTranscriptAdapter {
  /**
   * Normalizes a raw webhook payload into the StandardTranscript format.
   *
   * @param {Object} rawPayload — The raw webhook body from the provider
   * @returns {Object} StandardTranscript
   * @throws {Error} Must be implemented by subclass
   */
  normalizePayload(rawPayload) {
    throw new Error('normalizePayload() must be implemented by subclass');
  }

  /**
   * Returns the provider key (must match transcript-providers.js).
   *
   * @returns {string} Provider key
   */
  getProviderKey() {
    throw new Error('getProviderKey() must be implemented by subclass');
  }

  /**
   * Checks whether the transcript data is present in the payload.
   * For some providers (Fathom), the webhook may arrive without the transcript,
   * requiring a separate polling step.
   *
   * @param {Object} rawPayload — The raw webhook body
   * @returns {boolean} true if transcript text is included
   */
  hasTranscript(rawPayload) {
    throw new Error('hasTranscript() must be implemented by subclass');
  }

  /**
   * Returns the provider's meeting/recording ID from the payload.
   * Used for polling the transcript if it's not included in the webhook.
   *
   * @param {Object} rawPayload — The raw webhook body
   * @returns {string|null} Provider's meeting/recording ID
   */
  getMeetingId(rawPayload) {
    throw new Error('getMeetingId() must be implemented by subclass');
  }
}

module.exports = BaseTranscriptAdapter;
