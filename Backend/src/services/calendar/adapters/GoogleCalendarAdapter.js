/**
 * GOOGLE CALENDAR ADAPTER
 *
 * Normalizes Google Calendar API event objects into our StandardCalendarEvent format.
 *
 * Google Calendar events come from the Calendar API (v3) after we receive
 * a push notification. The push notification itself contains only headers —
 * we then call events.list() or events.get() to fetch the actual event data.
 *
 * Key fields in a Google Calendar event:
 * - id:             Event ID (stable across updates)
 * - summary:        Event title
 * - start.dateTime: Start time with timezone offset
 * - end.dateTime:   End time with timezone offset
 * - start.timeZone: IANA timezone name
 * - organizer:      { email, displayName, self }
 * - attendees:      [{ email, displayName, organizer, responseStatus }]
 * - status:         'confirmed', 'tentative', 'cancelled'
 * - creator:        { email, displayName }
 *
 * responseStatus values: 'needsAction', 'declined', 'tentative', 'accepted'
 */

const BaseCalendarAdapter = require('./BaseCalendarAdapter');

class GoogleCalendarAdapter extends BaseCalendarAdapter {
  /**
   * Normalizes a Google Calendar event into StandardCalendarEvent format.
   *
   * @param {Object} rawEvent — Event object from Google Calendar API v3
   * @returns {Object} StandardCalendarEvent
   */
  normalizeEvent(rawEvent) {
    return {
      eventId: rawEvent.id,
      eventType: this.getEventType(rawEvent),
      title: rawEvent.summary || '(No title)',
      startTime: this._extractUTCTime(rawEvent.start),
      endTime: this._extractUTCTime(rawEvent.end),
      originalTimezone: rawEvent.start?.timeZone || 'UTC',
      organizerEmail: rawEvent.organizer?.email || rawEvent.creator?.email || null,
      attendees: this._normalizeAttendees(rawEvent.attendees || []),
      status: rawEvent.status || 'confirmed',
      calendarId: rawEvent.organizer?.email || null,
      rawEvent,
    };
  }

  /**
   * Determines the event type based on event status and context.
   *
   * @param {Object} rawEvent — Google Calendar event
   * @returns {string} 'created', 'updated', or 'cancelled'
   */
  getEventType(rawEvent) {
    if (rawEvent.status === 'cancelled') return 'cancelled';

    // Google doesn't explicitly tell us 'created' vs 'updated' in the event itself.
    // The push notification header X-Goog-Resource-State gives us 'exists' for both.
    // We determine create vs update by checking if we already have a record in BigQuery
    // (handled by CalendarService/CallStateManager, not here).
    return 'updated';
  }

  /**
   * Checks if the event was deleted (Google sets status to 'cancelled'
   * for both user cancellations and deletions).
   *
   * @param {Object} rawEvent — Google Calendar event
   * @returns {boolean}
   */
  isDeleted(rawEvent) {
    return rawEvent.status === 'cancelled';
  }

  /**
   * Checks if any attendee has declined the event.
   * A decline by the prospect or closer triggers a 'Canceled' state.
   *
   * @param {Object} rawEvent — Google Calendar event
   * @returns {Array} Array of attendees who declined { email, name }
   */
  getDeclinedAttendees(rawEvent) {
    if (!rawEvent.attendees) return [];
    return rawEvent.attendees
      .filter(a => a.responseStatus === 'declined')
      .map(a => ({
        email: a.email,
        name: a.displayName || null,
      }));
  }

  /**
   * Extracts UTC ISO timestamp from a Google Calendar start/end object.
   *
   * Google Calendar events can have:
   * - dateTime: "2026-02-16T15:00:00-05:00" (timed event)
   * - date: "2026-02-16" (all-day event — unlikely for sales calls)
   *
   * @param {Object} timeObj — { dateTime, timeZone } or { date }
   * @returns {string} UTC ISO timestamp
   */
  _extractUTCTime(timeObj) {
    if (!timeObj) return null;

    if (timeObj.dateTime) {
      return new Date(timeObj.dateTime).toISOString();
    }

    // All-day events — convert date to start-of-day UTC
    if (timeObj.date) {
      return new Date(timeObj.date + 'T00:00:00Z').toISOString();
    }

    return null;
  }

  /**
   * Normalizes Google Calendar attendee objects into our standard format.
   *
   * @param {Array} attendees — Google Calendar attendee array
   * @returns {Array} [{ email, name, isOrganizer, responseStatus }]
   */
  _normalizeAttendees(attendees) {
    return attendees.map(a => ({
      email: a.email,
      name: a.displayName || null,
      isOrganizer: a.organizer || false,
      responseStatus: a.responseStatus || 'needsAction',
    }));
  }
}

module.exports = new GoogleCalendarAdapter();
