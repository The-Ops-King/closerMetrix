/**
 * SCORING RUBRIC
 *
 * Instructs the AI on how to score calls.
 * Each score type gets a description injected into the AI prompt.
 * Scale is always 1.0 - 10.0.
 *
 * TO ADJUST SCORING: Change the descriptions here.
 * The AI prompt is built dynamically from these descriptions.
 */
module.exports = {
  scale: { min: 1.0, max: 10.0 },
  levels: [
    { range: '1-3',  label: 'Poor',           description: 'Major issues, fundamental problems, clearly unprepared or ineffective' },
    { range: '4-5',  label: 'Below Average',   description: 'Notable gaps but some effort shown, needs significant improvement' },
    { range: '6-7',  label: 'Average',         description: 'Competent but room for improvement, gets the job done' },
    { range: '8-9',  label: 'Good',            description: 'Strong performance with only minor areas to improve' },
    { range: '10',   label: 'Exceptional',     description: 'Textbook execution, masterful handling' },
  ],
  scoreTypes: [
    { key: 'discovery_score',           label: 'Discovery',          description: 'How well the closer uncovered goals, pains, and situation' },
    { key: 'pitch_score',               label: 'Pitch',              description: 'How effectively the closer presented the offer' },
    { key: 'close_attempt_score',       label: 'Close Attempt',      description: 'How well the closer asked for the sale' },
    { key: 'objection_handling_score',  label: 'Objection Handling', description: 'How well objections were addressed and overcome' },
    { key: 'overall_call_score',        label: 'Overall',            description: 'Holistic call quality considering all factors' },
    { key: 'script_adherence_score',    label: 'Script Adherence',   description: 'How closely the closer followed the script template' },
    { key: 'prospect_fit_score',        label: 'Prospect Fit',       description: 'How good a fit this prospect is for the offer' },
  ],
};
