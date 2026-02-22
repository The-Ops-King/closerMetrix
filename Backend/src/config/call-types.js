/**
 * CALL TYPES
 *
 * Determined by looking at prospect history in the Calls table.
 * A prospect who has never had a "Show" call is always a First Call.
 * A prospect who HAS had a "Show" call and books again is a Follow Up.
 */
module.exports = [
  { key: 'first_call',             label: 'First Call',              description: 'Prospect has never had a Show call before' },
  { key: 'follow_up',              label: 'Follow Up',              description: 'Prospect has had at least one prior Show call' },
  { key: 'rescheduled_first',      label: 'Rescheduled First Call',  description: 'First call that was rescheduled (no prior Show)' },
  { key: 'rescheduled_follow_up',  label: 'Rescheduled Follow Up',   description: 'Follow-up call that was rescheduled' },
];
