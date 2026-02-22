/**
 * OBJECTION TYPES
 *
 * Standardized categories for sales objections.
 * The AI processor classifies every objection into one of these types.
 *
 * TO ADD A NEW TYPE: Add an entry to this array. The AI prompt is built
 * dynamically from this list, so no other code changes are needed.
 *
 * TO REMOVE A TYPE: Remove the entry. Existing data in BigQuery with that
 * type remains, but new objections won't be classified into it.
 */
module.exports = [
  { key: 'financial',     label: 'Financial',           description: 'Price too high, can\'t afford, budget concerns, payment plan needed' },
  { key: 'spouse',        label: 'Spouse/Partner',      description: 'Need to talk to spouse, partner not on board, family decision' },
  { key: 'think_about',   label: 'Think About It',      description: 'Need time to decide, want to think it over, not ready to commit today' },
  { key: 'timing',        label: 'Timing',              description: 'Not the right time, too busy, want to wait, bad season' },
  { key: 'trust',         label: 'Trust/Credibility',   description: 'Skeptical of results, seems too good to be true, want proof' },
  { key: 'already_tried', label: 'Already Tried',       description: 'Tried similar before and it didn\'t work, burned before' },
  { key: 'diy',           label: 'DIY',                 description: 'Can do it myself, don\'t need help, have the skills already' },
  { key: 'not_ready',     label: 'Not Ready',           description: 'Not at the right stage, need more preparation first' },
  { key: 'competitor',    label: 'Competitor',           description: 'Considering other options, already working with someone, comparing' },
  { key: 'authority',     label: 'Authority',            description: 'Not the decision maker, need approval from boss/board/partner' },
  { key: 'value',         label: 'Value',                description: 'Don\'t see the value, not sure it\'s worth it, ROI unclear' },
  { key: 'commitment',    label: 'Commitment',           description: 'Scared of long-term commitment, want flexibility, contract concerns' },
  { key: 'other',         label: 'Other',                description: 'Anything not fitting the above categories' },
];
