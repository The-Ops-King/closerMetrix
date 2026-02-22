/**
 * CALENDAR SERVICE — Orchestrator
 *
 * Orchestrates the full calendar event processing pipeline:
 * 1. Receive push notification → fetch changed events from Google Calendar API
 * 2. Filter events to find sales calls (using client's filter_word)
 * 3. Identify the closer (by calendar email → work_email lookup)
 * 4. Normalize the event (via adapter)
 * 5. Hand off to CallStateManager (creates/updates/cancels call records)
 *
 * This is the bridge between "Google sent us a notification" and
 * "a call record exists in BigQuery."
 */

const { google } = require('googleapis');
const googleAdapter = require('./adapters/GoogleCalendarAdapter');
const callStateManager = require('../CallStateManager');
const clientQueries = require('../../db/queries/clients');
const closerQueries = require('../../db/queries/closers');
const auditLogger = require('../../utils/AuditLogger');
const alertService = require('../../utils/AlertService');
const logger = require('../../utils/logger');
const config = require('../../config');

class CalendarService {
  constructor() {
    this.calendarApi = null;

    /**
     * In-memory dedup — tracks recently processed event IDs to prevent
     * duplicate call records when Google sends multiple push notifications
     * for the same event within seconds.
     *
     * Key: eventId, Value: timestamp (ms) when processing started.
     * Events processed within the last 60 seconds are skipped.
     */
    this._recentlyProcessed = new Map();
    this._DEDUP_WINDOW_MS = 60000; // 60 seconds
  }

  /**
   * Initializes the Google Calendar API client.
   * Called once at startup (or lazily on first use).
   *
   * Uses OAuth2 credentials from GOOGLE_CALENDAR_CREDENTIALS env var.
   * Tyler's Google account has read access to all closer calendars
   * (closers share their calendar with Tyler during onboarding).
   *
   * Falls back to Application Default Credentials (ADC) if OAuth2
   * credentials are not configured (for local dev with service account).
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
        scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
      });
      const authClient = await auth.getClient();
      this.calendarApi = google.calendar({ version: 'v3', auth: authClient });
    }

    return this.calendarApi;
  }

  /**
   * Processes a Google Calendar push notification.
   *
   * This is called by the webhook route when Google sends a notification.
   * The notification itself is headers-only — we fetch the actual events.
   *
   * @param {string} clientId — Client this notification is for
   * @param {Object} headers — The HTTP headers from Google's push notification
   * @returns {Object} Processing result { processed, skipped, errors }
   */
  async processCalendarNotification(clientId, headers) {
    const resourceState = headers['x-goog-resource-state'];
    const channelId = headers['x-goog-channel-id'];
    const resourceId = headers['x-goog-resource-id'];

    // 'sync' notifications are sent when the channel is first created — ignore
    if (resourceState === 'sync') {
      logger.debug('Calendar sync notification — ignoring', { clientId, channelId });
      return { processed: 0, skipped: 1, errors: 0 };
    }

    // 'exists' means something changed; 'not_exists' means something was deleted
    if (resourceState !== 'exists' && resourceState !== 'not_exists') {
      logger.warn('Unexpected calendar resource state', { resourceState, clientId });
      return { processed: 0, skipped: 1, errors: 0 };
    }

    try {
      // Look up the client to get their config (filter_word, etc.)
      const client = await clientQueries.findById(clientId);
      if (!client) {
        logger.error('Calendar notification for unknown client', { clientId });
        return { processed: 0, skipped: 0, errors: 1 };
      }

      // Fetch changed events from Google Calendar
      const events = await this._fetchChangedEvents(channelId, clientId);
      if (events.length === 0) {
        return { processed: 0, skipped: 0, errors: 0 };
      }

      let processed = 0;
      let skipped = 0;
      let errors = 0;

      for (const rawEvent of events) {
        try {
          const result = await this._processOneEvent(rawEvent, client);
          if (result.action === 'skipped') skipped++;
          else processed++;
        } catch (error) {
          errors++;
          logger.error('Failed to process calendar event', {
            eventId: rawEvent.id,
            clientId,
            error: error.message,
          });

          await alertService.send({
            severity: 'high',
            title: 'Calendar Event Processing Failed',
            details: `Event ${rawEvent.id} for client ${client.company_name}`,
            client: client.company_name,
            error: error.message,
          });
        }
      }

      return { processed, skipped, errors };
    } catch (error) {
      logger.error('Calendar notification processing failed', {
        clientId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Processes a single calendar event through the full pipeline.
   *
   * @param {Object} rawEvent — Raw Google Calendar event
   * @param {Object} client — Client record from BigQuery
   * @returns {Object} { action, callRecord }
   */
  async _processOneEvent(rawEvent, client) {
    // Step 0: In-memory dedup — skip if this event was processed recently.
    // Google sends multiple push notifications within seconds for the same
    // event change. Without this, both notifications pass the BigQuery dedup
    // check (the first insert hasn't committed yet) and create duplicate records.
    const eventId = rawEvent.id;
    // Dedup key uses business-level identifiers:
    //   appointment_id (eventId) + organizer email (closer) + attendee emails (prospect)
    //   + status + start time
    //
    // The eventId alone prevents cross-event collision (different closers have
    // different event IDs), but we include organizer/attendee emails for clarity.
    // Status and startTime ensure reschedules and cancels still get processed.
    //
    // NOTE: We intentionally exclude rawEvent.updated — Google changes it between
    // consecutive API fetches even when nothing meaningful changed, which defeats
    // the dedup entirely.
    const organizerEmail = rawEvent.organizer?.email || rawEvent.creator?.email || '';
    const attendeeEmails = (rawEvent.attendees || []).map(a => a.email).sort().join(',');
    const startTime = rawEvent.start?.dateTime || rawEvent.start?.date || '';
    const status = rawEvent.status || 'confirmed';
    const eventFingerprint = `${organizerEmail}:${attendeeEmails}:${status}:${startTime}`;
    if (this._isRecentlyProcessed(eventId, eventFingerprint)) {
      logger.debug('Event skipped — recently processed (dedup)', {
        eventId,
        clientId: client.client_id,
      });
      return { action: 'skipped', callRecord: null };
    }

    // Step 1: Normalize via adapter
    const event = googleAdapter.normalizeEvent(rawEvent);

    // Step 2: Check filter words — is this a sales call?
    // IMPORTANT: Skip the filter check for cancelled/deleted events.
    // When Google cancels an event, the title may be stripped or missing.
    // We still need these events to flow through to CallStateManager so
    // existing call records get properly canceled.
    const isCancelled = event.eventType === 'cancelled' || event.status === 'cancelled';
    if (!isCancelled && !this.isClientSalesCall(event.title, client.filter_word)) {
      logger.debug('Event filtered out (not a sales call)', {
        title: event.title,
        clientId: client.client_id,
        filterWord: client.filter_word,
      });
      return { action: 'skipped', callRecord: null };
    }

    // Step 3: Identify the closer
    const closer = await this._identifyCloser(event, client.client_id);
    if (!closer) {
      logger.warn('Could not identify closer for calendar event', {
        eventId: event.eventId,
        clientId: client.client_id,
        organizerEmail: event.organizerEmail,
      });

      await alertService.send({
        severity: 'medium',
        title: 'Unknown Closer on Calendar Event',
        details: `Event "${event.title}" has organizer ${event.organizerEmail} which doesn't match any active closer`,
        client: client.company_name,
      });

      return { action: 'skipped', callRecord: null };
    }

    // Step 4: Enrich event with declined attendee info
    event.declinedAttendees = googleAdapter.getDeclinedAttendees(rawEvent);

    // Step 5: Hand off to CallStateManager
    // Pass filter_word so title-based name extraction can strip filter words
    return callStateManager.handleCalendarEvent(event, client.client_id, closer, client.filter_word);
  }

  /**
   * Fetches changed calendar events from Google Calendar API.
   *
   * After receiving a push notification, we call events.list() with
   * an updatedMin parameter to get recently changed events.
   *
   * @param {string} channelId — The channel ID that received the notification
   * @param {string} clientId — Client scope
   * @returns {Array} Array of raw Google Calendar event objects
   */
  async _fetchChangedEvents(channelId, clientId) {
    try {
      const calendar = await this._getCalendarApi();

      // We need to know which calendar this channel watches.
      // For now, we'll use a time-based approach — fetch events updated in the last 5 minutes.
      // In Phase 6, we'll store channel → calendarId mapping for more precision.
      const closers = await closerQueries.listByClient(clientId);

      const allEvents = [];

      // Check each closer's calendar for recent changes
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      for (const closer of closers) {
        // Skip closers without work_email — can't fetch their calendar
        if (!closer.work_email) continue;

        try {
          const response = await calendar.events.list({
            calendarId: closer.work_email,
            updatedMin: fiveMinutesAgo,
            singleEvents: true,
            orderBy: 'updated',
            maxResults: 50,
            showDeleted: true,
          });

          if (response.data.items) {
            allEvents.push(...response.data.items);
          }
        } catch (error) {
          // Calendar might not be shared yet, or access revoked
          if (error.code === 404 || error.code === 403) {
            logger.warn('Cannot access closer calendar', {
              closerEmail: closer.work_email,
              clientId,
              error: error.message,
            });
          } else {
            throw error;
          }
        }
      }

      // Deduplicate events by event ID — the same event can appear on
      // multiple closers' calendars (e.g., organizer + attendee are both
      // closers for this client). Keep only the most recently updated copy.
      const seen = new Map();
      for (const event of allEvents) {
        const existing = seen.get(event.id);
        if (!existing || (event.updated && existing.updated && event.updated > existing.updated)) {
          seen.set(event.id, event);
        }
      }
      return Array.from(seen.values());
    } catch (error) {
      logger.error('Failed to fetch calendar events', {
        clientId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Determines if a calendar event is a sales call for this client.
   *
   * Each client has a `filter_word` field — comma-separated words.
   * If the event title contains ANY of these words (case-insensitive), it's a match.
   *
   * @param {string} eventTitle — The calendar event title
   * @param {string} filterWords — Comma-separated filter words from client config
   * @returns {boolean}
   */
  isClientSalesCall(eventTitle, filterWords) {
    if (!filterWords || !eventTitle) return false;
    const words = filterWords.split(',').map(w => w.trim().toLowerCase());
    // "*" means match ALL calendar events (closer's calendar is dedicated to sales)
    if (words.includes('*')) return true;
    const title = eventTitle.toLowerCase();
    return words.some(word => word && title.includes(word));
  }

  /**
   * Identifies which closer this calendar event belongs to.
   *
   * Checks the organizer email and attendee emails against
   * the Closers table for this client.
   *
   * @param {Object} event — StandardCalendarEvent
   * @param {string} clientId — Client scope
   * @returns {Object|null} Closer record or null
   */
  async _identifyCloser(event, clientId) {
    // Try organizer email first
    if (event.organizerEmail) {
      const closer = await closerQueries.findByWorkEmail(event.organizerEmail, clientId);
      if (closer) return closer;
    }

    // Try each attendee email
    for (const attendee of (event.attendees || [])) {
      const closer = await closerQueries.findByWorkEmail(attendee.email, clientId);
      if (closer) return closer;
    }

    return null;
  }

  /**
   * Checks if an event was recently processed (within the dedup window).
   * If not, marks it as processing now.
   *
   * Uses a composite key of eventId (appointment_id) + fingerprint
   * (organizer email, attendee emails, status, start time) so that genuine
   * changes (reschedules, cancellations, attendee adds) are still processed
   * even within the window, while identical duplicate notifications are blocked.
   *
   * @param {string} eventId — Google Calendar event ID (appointment_id)
   * @param {string} fingerprint — organizer:attendees:status:startTime
   * @returns {boolean} true if recently processed (should skip)
   */
  _isRecentlyProcessed(eventId, fingerprint) {
    const now = Date.now();
    const key = `${eventId}:${fingerprint}`;
    const lastProcessed = this._recentlyProcessed.get(key);

    if (lastProcessed && (now - lastProcessed) < this._DEDUP_WINDOW_MS) {
      return true;
    }

    // Mark as processing now
    this._recentlyProcessed.set(key, now);

    // Clean up stale entries every 100 events to prevent memory leak
    if (this._recentlyProcessed.size > 100) {
      this._cleanupRecentlyProcessed();
    }

    return false;
  }

  /**
   * Removes entries older than the dedup window from the in-memory map.
   */
  _cleanupRecentlyProcessed() {
    const cutoff = Date.now() - this._DEDUP_WINDOW_MS;
    for (const [key, timestamp] of this._recentlyProcessed) {
      if (timestamp < cutoff) {
        this._recentlyProcessed.delete(key);
      }
    }
  }

  /**
   * Clears the in-memory dedup map. Used by tests.
   */
  _resetDedup() {
    this._recentlyProcessed.clear();
  }
}

module.exports = new CalendarService();
