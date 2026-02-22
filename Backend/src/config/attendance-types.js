/**
 * ATTENDANCE TYPES
 *
 * Represent what happened with a scheduled call in terms of who showed up.
 * Set by the system based on calendar events and transcript analysis.
 */
module.exports = [
  { key: 'scheduled',            label: 'Scheduled',              description: 'DEPRECATED — legacy only. New calls start with attendance: null. Kept for backward compatibility with existing data.' },
  { key: 'waiting_for_outcome',  label: 'Waiting for Outcome',    description: 'Appointment end time has passed. Waiting for transcript to arrive or timeout to trigger Ghosted.' },
  { key: 'show',                 label: 'Show',                   description: 'Both parties showed up and had a real conversation (2+ speakers, substantive dialogue)' },
  { key: 'ghosted',              label: 'Ghosted - No Show',      description: 'The meeting time passed and either: (a) no transcript exists, (b) transcript shows only one participant, or (c) transcript is essentially blank (< 50 chars). The prospect didn\'t show up.' },
  { key: 'canceled',             label: 'Canceled',               description: 'Call was canceled before it happened. Triggered by: calendar event deleted, status changed to cancelled, or an attendee declined.' },
  { key: 'rescheduled',          label: 'Rescheduled',            description: 'Call was moved to a different time. Original record gets this status, new record created at new time.' },
  { key: 'no_recording',         label: 'No Recording',           description: 'RARE — system-level failure. The call may have happened but the recording system failed. No transcript was ever generated.' },
  { key: 'overbooked',           label: 'Overbooked',             description: 'Closer was double-booked and took another call during this time slot. The call wasn\'t missed because the prospect ghosted — it was missed because the closer was in a different meeting.' },
];
