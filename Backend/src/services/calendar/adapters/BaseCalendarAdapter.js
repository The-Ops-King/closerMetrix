/**
 * BASE CALENDAR ADAPTER — Interface Definition
 *
 * Every calendar adapter (Google Calendar, Calendly, GHL, HubSpot)
 * must extend this class and implement all methods.
 *
 * The adapter's job: take a raw event from the calendar provider
 * and normalize it into our StandardCalendarEvent format.
 *
 * StandardCalendarEvent shape:
 * {
 *   eventId:           string   — Provider's unique event ID
 *   eventType:         string   — 'created', 'updated', 'cancelled'
 *   title:             string   — Event title/summary
 *   startTime:         string   — UTC ISO timestamp
 *   endTime:           string   — UTC ISO timestamp
 *   originalTimezone:  string   — Timezone the event was created in
 *   organizerEmail:    string   — Who created/hosts the event
 *   attendees:         Array    — [{ email, name, isOrganizer, responseStatus }]
 *   status:            string   — 'confirmed', 'cancelled', 'tentative'
 *   calendarId:        string   — Which calendar this came from
 *   rawEvent:          Object   — Original unmodified event for debugging
 * }
 */

class BaseCalendarAdapter {
  /**
   * Normalizes a raw calendar event into the StandardCalendarEvent format.
   *
   * @param {Object} rawEvent — The raw event object from the provider's API
   * @returns {Object} StandardCalendarEvent
   * @throws {Error} Must be implemented by subclass
   */
  normalizeEvent(rawEvent) {
    throw new Error('normalizeEvent() must be implemented by subclass');
  }

  /**
   * Determines the event type from a raw event.
   * Google Calendar uses the event status field.
   * Other providers may use webhook headers or payload fields.
   *
   * @param {Object} rawEvent — The raw event object
   * @returns {string} 'created', 'updated', or 'cancelled'
   * @throws {Error} Must be implemented by subclass
   */
  getEventType(rawEvent) {
    throw new Error('getEventType() must be implemented by subclass');
  }

  /**
   * Determines if an event has been deleted (vs cancelled).
   * Some providers distinguish between cancellation and deletion.
   *
   * @param {Object} rawEvent — The raw event object
   * @returns {boolean}
   */
  isDeleted(rawEvent) {
    throw new Error('isDeleted() must be implemented by subclass');
  }
}

module.exports = BaseCalendarAdapter;
