/**
 * GOOGLE CALENDAR PUSH — Channel Management
 *
 * Manages Google Calendar push notification channels for real-time event updates.
 *
 * How it works:
 * 1. For each closer, we create a "watch" on their calendar
 * 2. Google sends a POST to our webhook URL when anything changes
 * 3. Watch channels expire after ~7 days and must be renewed
 *
 * PREREQUISITE: The closer must share their Google Calendar with the
 * service account email. Tyler handles this during closer onboarding.
 *
 * Channel lifecycle:
 *   createWatch() → channel created, Google starts sending notifications
 *   renewWatch()  → stop old channel, create new one (before expiry)
 *   stopWatch()   → stop receiving notifications (closer deactivated)
 *
 * Channel metadata is stored in a lightweight in-memory map for now.
 * Phase 6 will persist channel data in BigQuery for durability.
 */

const { google } = require('googleapis');
const { generateId } = require('../../utils/idGenerator');
const logger = require('../../utils/logger');
const config = require('../../config');

class GoogleCalendarPush {
  constructor() {
    this.calendarApi = null;

    /**
     * In-memory channel registry.
     * Key: channelId, Value: { closerEmail, clientId, resourceId, expiration }
     *
     * TODO (Phase 6): Persist to BigQuery for durability across restarts.
     */
    this.channels = new Map();
  }

  /**
   * Initializes the Google Calendar API client.
   *
   * Uses OAuth2 credentials from GOOGLE_CALENDAR_CREDENTIALS env var.
   * Falls back to Application Default Credentials for local dev.
   */
  async _getCalendarApi() {
    if (this.calendarApi) return this.calendarApi;

    const creds = config.calendar.credentials;

    if (creds && creds.refresh_token) {
      // Production: OAuth2 with Tyler's refresh token
      const oauth2Client = new google.auth.OAuth2(
        creds.client_id,
        creds.client_secret
      );
      oauth2Client.setCredentials({ refresh_token: creds.refresh_token });
      this.calendarApi = google.calendar({ version: 'v3', auth: oauth2Client });
    } else {
      // Fallback: Application Default Credentials (local dev / service account)
      const auth = new google.auth.GoogleAuth({
        scopes: [
          'https://www.googleapis.com/auth/calendar.readonly',
          'https://www.googleapis.com/auth/calendar.events.readonly',
        ],
      });
      const authClient = await auth.getClient();
      this.calendarApi = google.calendar({ version: 'v3', auth: authClient });
    }

    return this.calendarApi;
  }

  /**
   * Creates a push notification watch on a closer's calendar.
   *
   * Google will start sending POST requests to our webhook URL
   * whenever events on this calendar change.
   *
   * @param {string} closerEmail — The closer's work email (= their calendar ID)
   * @param {string} clientId — Client this closer belongs to
   * @returns {Object} Channel info { channelId, resourceId, expiration }
   * @throws {Error} If the calendar is not accessible
   */
  async createWatch(closerEmail, clientId) {
    const calendar = await this._getCalendarApi();
    const channelId = generateId();
    const webhookUrl = `${config.calendar.webhookUrl}/${clientId}`;

    try {
      const response = await calendar.events.watch({
        calendarId: closerEmail,
        requestBody: {
          id: channelId,
          type: 'web_hook',
          address: webhookUrl,
          token: clientId,
          params: {
            // Request events that change, not just existence checks
            ttl: '604800',  // 7 days in seconds
          },
        },
      });

      const channelData = {
        channelId,
        closerEmail,
        clientId,
        resourceId: response.data.resourceId,
        expiration: new Date(parseInt(response.data.expiration, 10)),
      };

      this.channels.set(channelId, channelData);

      logger.info('Calendar watch created', {
        channelId,
        closerEmail,
        clientId,
        expiration: channelData.expiration.toISOString(),
      });

      return channelData;
    } catch (error) {
      logger.error('Failed to create calendar watch', {
        closerEmail,
        clientId,
        error: error.message,
        code: error.code,
      });

      if (error.code === 404) {
        throw new Error(`Calendar not found for ${closerEmail}. Has the closer shared their calendar?`);
      }
      if (error.code === 403) {
        throw new Error(`No access to calendar for ${closerEmail}. Check service account permissions.`);
      }
      throw error;
    }
  }

  /**
   * Stops a push notification channel.
   * Called when a closer is deactivated or when renewing a channel.
   *
   * @param {string} channelId — The channel to stop
   * @param {string} resourceId — The resource ID from the original watch
   */
  async stopWatch(channelId, resourceId) {
    const calendar = await this._getCalendarApi();

    try {
      await calendar.channels.stop({
        requestBody: {
          id: channelId,
          resourceId: resourceId,
        },
      });

      this.channels.delete(channelId);

      logger.info('Calendar watch stopped', { channelId });
    } catch (error) {
      // 404 means channel already expired — that's fine
      if (error.code === 404) {
        logger.debug('Calendar watch already expired', { channelId });
        this.channels.delete(channelId);
        return;
      }
      logger.error('Failed to stop calendar watch', {
        channelId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Renews a watch channel before it expires.
   * Stops the old channel and creates a new one.
   *
   * @param {string} channelId — The expiring channel
   * @returns {Object} New channel info
   */
  async renewWatch(channelId) {
    const existing = this.channels.get(channelId);
    if (!existing) {
      logger.warn('Cannot renew unknown channel', { channelId });
      return null;
    }

    // Stop the old channel
    await this.stopWatch(channelId, existing.resourceId);

    // Create a new one
    return this.createWatch(existing.closerEmail, existing.clientId);
  }

  /**
   * Creates watches for all active closers of a client.
   * Called during client onboarding.
   *
   * @param {string} clientId — Client to set up watches for
   * @param {Array} closers — Array of closer records
   * @returns {Object} { success: number, failed: number, failures: Array }
   */
  async createWatchesForClient(clientId, closers) {
    let success = 0;
    let failed = 0;
    const failures = [];

    for (const closer of closers) {
      try {
        await this.createWatch(closer.work_email, clientId);
        success++;
      } catch (error) {
        failed++;
        failures.push({
          closerEmail: closer.work_email,
          error: error.message,
        });
      }
    }

    return { success, failed, failures };
  }

  /**
   * Returns all channels that will expire within the given hours.
   * Used by the renewal job to proactively renew channels.
   *
   * @param {number} withinHours — Expiration window (default 24)
   * @returns {Array} Channels expiring soon
   */
  getExpiringChannels(withinHours = 24) {
    const cutoff = new Date(Date.now() + withinHours * 60 * 60 * 1000);
    const expiring = [];

    for (const [channelId, data] of this.channels) {
      if (data.expiration <= cutoff) {
        expiring.push({ channelId, ...data });
      }
    }

    return expiring;
  }

  /**
   * Returns summary info about all active channels.
   * Used by the health check endpoint.
   *
   * @returns {Object} { total, expiringIn24h }
   */
  getChannelStats() {
    const total = this.channels.size;
    const expiringIn24h = this.getExpiringChannels(24).length;
    return { total, expiringIn24h };
  }
}

module.exports = new GoogleCalendarPush();
