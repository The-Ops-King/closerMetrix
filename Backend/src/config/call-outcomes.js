/**
 * CALL OUTCOMES
 *
 * Every call that gets AI-processed is assigned exactly one of these outcomes.
 * The AI is instructed to pick EXACTLY one.
 *
 * TO ADD/REMOVE: Update this array. The AI prompt and all validation logic
 * reads from this config automatically.
 */
module.exports = [
  { key: 'closed_won',    label: 'Closed - Won',   description: 'Prospect fully committed and purchased' },
  { key: 'deposit',       label: 'Deposit',         description: 'Prospect made a partial payment with intent to pay remainder' },
  { key: 'follow_up',     label: 'Follow Up',       description: 'Prospect interested but did not commit, another call expected' },
  { key: 'lost',          label: 'Lost',             description: 'Prospect clearly declined or expressed no interest' },
  { key: 'disqualified',  label: 'Disqualified',     description: 'Prospect does not meet criteria for the offer' },
  { key: 'not_pitched',   label: 'Not Pitched',      description: 'Closer spoke with prospect but chose not to pitch — prospect wasn\'t ready, didn\'t qualify emotionally, or closer felt it wasn\'t the right time' },
];
