/**
 * GOOGLE CALENDAR ADAPTER — Unit Tests
 *
 * Tests the normalization of raw Google Calendar API events
 * into StandardCalendarEvent format.
 */

const adapter = require('../../src/services/calendar/adapters/GoogleCalendarAdapter');
const createdFixture = require('../helpers/fixtures/google-calendar-created.json');
const cancelledFixture = require('../helpers/fixtures/google-calendar-cancelled.json');
const updatedFixture = require('../helpers/fixtures/google-calendar-updated.json');

describe('GoogleCalendarAdapter', () => {
  describe('normalizeEvent', () => {
    it('should normalize a confirmed event into StandardCalendarEvent format', () => {
      const event = adapter.normalizeEvent(createdFixture);

      expect(event.eventId).toBe('event_abc123');
      expect(event.eventType).toBe('updated'); // Google doesn't distinguish created vs updated
      expect(event.title).toBe('Discovery Call with John Smith');
      expect(event.startTime).toBe('2026-02-20T20:00:00.000Z'); // -05:00 → UTC
      expect(event.endTime).toBe('2026-02-20T21:00:00.000Z');
      expect(event.originalTimezone).toBe('America/New_York');
      expect(event.organizerEmail).toBe('sarah@acmecoaching.com');
      expect(event.status).toBe('confirmed');
      expect(event.rawEvent).toBe(createdFixture);
    });

    it('should normalize attendees with proper fields', () => {
      const event = adapter.normalizeEvent(createdFixture);

      expect(event.attendees).toHaveLength(2);
      expect(event.attendees[0]).toEqual({
        email: 'sarah@acmecoaching.com',
        name: 'Sarah Closer',
        isOrganizer: true,
        responseStatus: 'accepted',
      });
      expect(event.attendees[1]).toEqual({
        email: 'john@example.com',
        name: 'John Smith',
        isOrganizer: false,
        responseStatus: 'needsAction',
      });
    });

    it('should handle a cancelled event', () => {
      const event = adapter.normalizeEvent(cancelledFixture);

      expect(event.eventId).toBe('event_abc123');
      expect(event.eventType).toBe('cancelled');
      expect(event.status).toBe('cancelled');
    });

    it('should extract updated time correctly', () => {
      const event = adapter.normalizeEvent(updatedFixture);

      // Updated fixture has 17:00-18:00 EST instead of 15:00-16:00
      expect(event.startTime).toBe('2026-02-20T22:00:00.000Z');
      expect(event.endTime).toBe('2026-02-20T23:00:00.000Z');
    });

    it('should handle event with no attendees', () => {
      const noAttendees = { ...createdFixture, attendees: undefined };
      const event = adapter.normalizeEvent(noAttendees);
      expect(event.attendees).toEqual([]);
    });

    it('should handle event with no title', () => {
      const noTitle = { ...createdFixture, summary: undefined };
      const event = adapter.normalizeEvent(noTitle);
      expect(event.title).toBe('(No title)');
    });

    it('should handle all-day event (date instead of dateTime)', () => {
      const allDay = {
        ...createdFixture,
        start: { date: '2026-02-20' },
        end: { date: '2026-02-21' },
      };
      const event = adapter.normalizeEvent(allDay);
      expect(event.startTime).toBe('2026-02-20T00:00:00.000Z');
      expect(event.originalTimezone).toBe('UTC');
    });
  });

  describe('getEventType', () => {
    it('should return "cancelled" for cancelled events', () => {
      expect(adapter.getEventType(cancelledFixture)).toBe('cancelled');
    });

    it('should return "updated" for confirmed events', () => {
      expect(adapter.getEventType(createdFixture)).toBe('updated');
    });
  });

  describe('isDeleted', () => {
    it('should return true for cancelled events', () => {
      expect(adapter.isDeleted(cancelledFixture)).toBe(true);
    });

    it('should return false for confirmed events', () => {
      expect(adapter.isDeleted(createdFixture)).toBe(false);
    });
  });

  describe('getDeclinedAttendees', () => {
    it('should return empty array when no attendees declined', () => {
      expect(adapter.getDeclinedAttendees(createdFixture)).toEqual([]);
    });

    it('should return declined attendees', () => {
      const withDeclined = {
        ...createdFixture,
        attendees: [
          ...createdFixture.attendees,
          { email: 'declined@example.com', displayName: 'Declined Person', responseStatus: 'declined' },
        ],
      };
      const declined = adapter.getDeclinedAttendees(withDeclined);
      expect(declined).toHaveLength(1);
      expect(declined[0]).toEqual({ email: 'declined@example.com', name: 'Declined Person' });
    });

    it('should handle event with no attendees', () => {
      expect(adapter.getDeclinedAttendees({})).toEqual([]);
    });
  });
});
