/**
 * CALL OUTCOMES
 *
 * Every call that gets AI-processed is assigned exactly one of these outcomes.
 * The AI is instructed to pick EXACTLY one from the aiAssignable set.
 *
 * Outcomes with aiAssignable: false can only be set by webhooks or manual action
 * (e.g., Closed - Won requires a payment webhook, Deposit requires payment confirmation).
 *
 * TO ADD/REMOVE: Update this array. The AI prompt and all validation logic
 * reads from this config automatically.
 */
module.exports = [
  { key: 'closed_won',    label: 'Closed - Won',   aiAssignable: false, description: 'Prospect fully committed and purchased — set ONLY by payment webhook' },
  { key: 'deposit',       label: 'Deposit',         aiAssignable: false, description: 'Prospect made a partial payment — set ONLY by payment webhook' },
  { key: 'follow_up',     label: 'Follow Up',       description: 'DEFAULT when call ends with any next step, continued interest, or ambiguity. Includes verbal commits where no payment was processed on the call.' },
  { key: 'lost',          label: 'Lost',             description: 'Prospect clearly and definitively declined — said "no", "not interested", or gave a firm final objection they refused to move past. Do NOT use just because objections were raised.' },
  { key: 'disqualified',  label: 'Disqualified',     description: 'Prospect does not meet criteria for the offer, or closer explicitly told prospect they are not a good fit.' },
  { key: 'not_pitched',   label: 'Not Pitched',      description: 'Closer spoke with prospect but deliberately chose not to present the offer — call was purely discovery/rapport, or closer felt prospect wasn\'t ready.' },
  { key: 'refunded',      label: 'Refunded',          aiAssignable: false, description: 'Deal was closed but customer received a full refund — set ONLY by refund webhook' },
];
