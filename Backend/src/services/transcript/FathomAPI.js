/**
 * FATHOM API CLIENT
 *
 * Handles programmatic interaction with the Fathom API:
 * - Register webhooks for new closers during onboarding
 * - Delete webhooks when closers are deactivated
 *
 * Each closer has their own Fathom API key (stored in Closers.transcript_api_key).
 * When we register a webhook using their key, Fathom fires that webhook
 * whenever THAT closer's recordings are ready.
 *
 * Fathom API docs: https://api.fathom.ai/external/v1
 * Auth: X-Api-Key header with the closer's personal API key
 */

const config = require('../../config');
const logger = require('../../utils/logger');

const FATHOM_BASE_URL = 'https://api.fathom.ai/external/v1';

class FathomAPI {
  /**
   * Registers a webhook with Fathom so this closer's recordings
   * automatically send transcripts to our endpoint.
   *
   * @param {string} apiKey — The closer's Fathom API key
   * @returns {Object} { id, secret, url } — Webhook ID and secret for verification
   * @throws {Error} If registration fails
   */
  async registerWebhook(apiKey) {
    const webhookUrl = this._getWebhookUrl();

    logger.info('Registering Fathom webhook', { destinationUrl: webhookUrl });

    const response = await fetch(`${FATHOM_BASE_URL}/webhooks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify({
        destination_url: webhookUrl,
        triggered_for: ['my_recordings'],
        include_transcript: true,
        include_summary: true,
        include_action_items: false,
        include_crm_matches: false,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Fathom webhook registration failed (${response.status}): ${body}`);
    }

    const data = await response.json();

    logger.info('Fathom webhook registered', {
      webhookId: data.id,
      url: data.url,
    });

    return {
      id: data.id,
      secret: data.secret,
      url: data.url,
    };
  }

  /**
   * Deletes a webhook from Fathom (used when deactivating a closer).
   *
   * @param {string} apiKey — The closer's Fathom API key
   * @param {string} webhookId — The webhook ID returned during registration
   */
  async deleteWebhook(apiKey, webhookId) {
    logger.info('Deleting Fathom webhook', { webhookId });

    const response = await fetch(`${FATHOM_BASE_URL}/webhooks/${webhookId}`, {
      method: 'DELETE',
      headers: {
        'X-Api-Key': apiKey,
      },
    });

    if (!response.ok && response.status !== 404) {
      const body = await response.text();
      throw new Error(`Fathom webhook deletion failed (${response.status}): ${body}`);
    }

    logger.info('Fathom webhook deleted', { webhookId });
  }

  /**
   * Fetches recent meetings from Fathom for a specific closer.
   * Used by TimeoutService to poll for recordings when webhooks don't arrive.
   *
   * @param {string} apiKey — The closer's Fathom API key
   * @param {string} createdAfter — ISO timestamp; only return meetings created after this
   * @returns {Array} Array of Fathom meeting objects (with transcript if available)
   */
  async listRecentMeetings(apiKey, createdAfter) {
    const params = new URLSearchParams({
      include_transcript: 'true',
      include_summary: 'true',
      created_after: createdAfter,
    });

    logger.info('Polling Fathom for recent meetings', { createdAfter });

    const response = await fetch(`${FATHOM_BASE_URL}/meetings?${params}`, {
      method: 'GET',
      headers: {
        'X-Api-Key': apiKey,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Fathom meetings list failed (${response.status}): ${body}`);
    }

    const data = await response.json();
    const meetings = data.items || [];

    logger.info('Fathom meetings fetched', {
      count: meetings.length,
      createdAfter,
    });

    return meetings;
  }

  /**
   * Builds the webhook destination URL.
   * Uses BASE_URL from config, falling back to the Cloud Run service URL.
   */
  _getWebhookUrl() {
    const baseUrl = config.server.baseUrl;
    return `${baseUrl}/webhooks/transcript/fathom`;
  }
}

module.exports = new FathomAPI();
