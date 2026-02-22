/**
 * RISK CATEGORIES (Future — Executive Tier)
 *
 * Categories for FTC/SEC compliance risk detection in transcripts.
 * Not used in MVP but defined here so the config structure is ready.
 *
 * When the Executive tier launches, the AI will scan for these risk types
 * and flag them in a separate compliance analysis.
 */
module.exports = [
  { key: 'income_claims',     label: 'Income Claims',       description: 'Specific dollar amounts promised, guaranteed returns, "you will make X"' },
  { key: 'false_urgency',     label: 'False Urgency',       description: 'Fake deadlines, artificial scarcity, pressure tactics not based on reality' },
  { key: 'misleading_results', label: 'Misleading Results', description: 'Atypical results presented as typical, cherry-picked testimonials' },
  { key: 'health_claims',     label: 'Health Claims',       description: 'Unverified medical or health benefit claims' },
  { key: 'refund_misrep',     label: 'Refund Misrepresentation', description: 'Incorrect refund policy statements, misleading guarantee terms' },
];
