/**
 * CALENDAR PROVIDERS
 *
 * Same adapter pattern as transcript providers.
 * Google Calendar is the only one implemented for MVP.
 * Others are stubbed with clear interfaces.
 *
 * TO ADD A NEW PROVIDER:
 * 1. Add an entry here
 * 2. Create src/services/calendar/adapters/{Name}Adapter.js
 * 3. The adapter must implement: normalizeEvent(rawEvent) → StandardCalendarEvent
 * 4. Register it in CalendarService.js adapter map
 */
module.exports = [
  { key: 'google_calendar', label: 'Google Calendar', implemented: true },
  { key: 'calendly',        label: 'Calendly',        implemented: false },
  { key: 'ghl',             label: 'GoHighLevel',     implemented: false },
  { key: 'hubspot',         label: 'HubSpot',         implemented: false },
];
