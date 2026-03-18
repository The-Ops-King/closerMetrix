/**
 * TL;DV API CLIENT
 *
 * Handles programmatic interaction with the tl;dv API:
 * - Fetch meeting details (organizer, invitees, metadata)
 * - Fetch meeting transcript
 * - List recent meetings (for polling fallback)
 *
 * tl;dv API keys are per-client (stored on the Clients table as tldv_api_key).
 * One org admin generates the key for their whole team.
 *
 * tl;dv API docs: https://pasta.tldv.io/docs
 * Auth: x-api-key header
 */

const logger = require('../../utils/logger');

const TLDV_BASE_URL = 'https://pasta.tldv.io/v1alpha1';

class TldvAPI {
  /**
   * Fetches meeting details from tl;dv.
   * Used when TranscriptReady arrives without organizer/invitee data.
   *
   * @param {string} meetingId — The tl;dv meeting ID
   * @param {string} apiKey — The client's tl;dv API key
   * @returns {Object} Meeting details (organizer, invitees, happenedAt, duration, name, url)
   */
  async fetchMeetingDetails(meetingId, apiKey) {
    logger.info('Fetching tl;dv meeting details', { meetingId });

    const response = await fetch(`${TLDV_BASE_URL}/meetings/${meetingId}`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`tl;dv meeting fetch failed (${response.status}): ${body}`);
    }

    const data = await response.json();

    logger.info('tl;dv meeting details fetched', {
      meetingId,
      name: data.name,
      organizer: data.organizer?.email,
    });

    return data;
  }

  /**
   * Fetches the transcript for a specific meeting.
   * Used as a fallback when the webhook payload doesn't include transcript data.
   *
   * @param {string} meetingId — The tl;dv meeting ID
   * @param {string} apiKey — The client's tl;dv API key
   * @returns {Array} Transcript segments [{speaker, text, startTime, endTime}]
   */
  async fetchTranscript(meetingId, apiKey) {
    logger.info('Fetching tl;dv transcript', { meetingId });

    const response = await fetch(`${TLDV_BASE_URL}/meetings/${meetingId}/transcript`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`tl;dv transcript fetch failed (${response.status}): ${body}`);
    }

    const text = await response.text();
    if (!text || text.trim().length === 0) {
      logger.debug('tl;dv transcript empty response', { meetingId });
      return [];
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      logger.warn('tl;dv transcript response not valid JSON', { meetingId, bodyPreview: text.slice(0, 100) });
      return [];
    }

    const segments = data.data || data.transcript || [];

    logger.info('tl;dv transcript fetched', {
      meetingId,
      segmentCount: segments.length,
    });

    return segments;
  }

  /**
   * Lists recent meetings from tl;dv.
   * Used by TimeoutService to poll for recordings when webhooks don't arrive.
   *
   * @param {string} apiKey — The client's tl;dv API key
   * @param {number} [pageSize=20] — Number of meetings to return
   * @returns {Array} Array of tl;dv meeting objects
   */
  async listRecentMeetings(apiKey, pageSize = 20) {
    const params = new URLSearchParams({
      page: '1',
      page_size: String(pageSize),
    });

    logger.info('Polling tl;dv for recent meetings');

    const response = await fetch(`${TLDV_BASE_URL}/meetings?${params}`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`tl;dv meetings list failed (${response.status}): ${body}`);
    }

    const data = await response.json();
    const meetings = data.results || data.data || [];

    logger.info('tl;dv meetings fetched', { count: meetings.length });

    return meetings;
  }

  /**
   * Validates a tl;dv API key by making a simple list call.
   *
   * @param {string} apiKey — The API key to test
   * @returns {Object} { valid: boolean, error?: string }
   */
  async validateApiKey(apiKey) {
    try {
      const response = await fetch(`${TLDV_BASE_URL}/meetings?page=1&page_size=1`, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
        },
      });

      if (response.ok) {
        return { valid: true };
      }

      const body = await response.text();
      return { valid: false, error: `API returned ${response.status}: ${body}` };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
}

module.exports = new TldvAPI();
