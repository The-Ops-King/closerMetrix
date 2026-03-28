/**
 * PROMPT BUILDER — Two-Layer AI Prompt Assembly
 *
 * Builds the complete AI prompt for transcript analysis.
 *
 * ARCHITECTURE:
 * Layer 1: MASTER PROMPT — assembled from .md files in config/prompts/
 *   Edit the .md files directly to change what the AI is told.
 *   See config/prompts/master.js for variable and conditional syntax.
 *
 * Layer 2: CLIENT OVERRIDES — per-client settings from BigQuery
 *   ai_prompt_overall, ai_prompt_discovery, ai_prompt_pitch,
 *   ai_prompt_close, ai_prompt_objections, script_template, etc.
 *   These are appended by master.js with precedence over defaults.
 *
 * The JSON response format stays HERE (code-driven) because it must
 * match BigQuery columns and ResponseParser validation.
 */

const callOutcomes = require('../../config/call-outcomes');
const objectionTypes = require('../../config/objection-types');
const scoringRubric = require('../../config/scoring-rubric');
const { buildMasterPrompt } = require('../../config/prompts/master');

class PromptBuilder {
  /**
   * Builds the complete prompt for the Anthropic API.
   *
   * @param {Object} client — Client record from BigQuery
   * @param {Object} callMetadata — { call_id, call_type, closer_name, duration_minutes, prospect_name, prospect_email }
   * @param {string} transcript — Full transcript text
   * @returns {Object} { systemPrompt, userMessage }
   */
  buildPrompt(client, callMetadata, transcript) {
    const systemPrompt = this._buildSystemPrompt(client, callMetadata);
    const userMessage = this._buildUserMessage(callMetadata, transcript);
    return { systemPrompt, userMessage };
  }

  /**
   * Assembles the system prompt from master .md sections + JSON response format.
   * Client overrides are handled inside buildMasterPrompt.
   */
  _buildSystemPrompt(client, callMetadata) {
    const masterPrompt = buildMasterPrompt(client, callMetadata);
    const responseFormat = this._buildResponseFormat(client);

    return `${masterPrompt}\n\n${responseFormat}`;
  }

  /**
   * JSON RESPONSE FORMAT — code-driven, must match BQ columns + ResponseParser.
   * NOT editable via .md files — changing this requires code + schema changes.
   */
  _buildResponseFormat(client) {
    const hasScript = !!(client && client.script_template);
    const aiOutcomes = callOutcomes.filter(o => o.aiAssignable !== false);

    const scoreFields = scoringRubric.scoreTypes
      .map(s => `    "${s.key}": <number ${scoringRubric.scale.min}-${scoringRubric.scale.max}> // ${s.description}`)
      .join(',\n');

    const objectionTypeKeys = objectionTypes.map(o => `"${o.key}"`).join(', ');

    return `## REQUIRED OUTPUT FORMAT
Return ONLY valid JSON (no markdown fences, no explanation text). The JSON must match this schema exactly:

{
  "call_outcome": "<one of: ${aiOutcomes.map(o => o.label).join(', ')}>",
  "scores": {
${scoreFields}
  },
  "summary": "<3-5 sentence summary that captures the narrative arc: how the call opened, the key turning point(s), what the prospect's real concerns were, and how it ended. Write this like you're briefing a sales manager who needs to understand this call in 30 seconds.>",
  "objections": [
    {
      "objection_type": "<one of: ${objectionTypeKeys}>",
      "objection_text": "<what the prospect actually said — quote them as closely as possible>",
      "closer_response": "<how the closer responded — quote or paraphrase their actual response>",
      "was_overcome": <true or false — did the prospect move past this objection?>,
      "timestamp_approximate": "<approximate time in transcript, e.g. '00:15:30'>"
    }
  ],
  "coaching_notes": "<2-4 specific, actionable coaching points. Reference exact moments in the call by timestamp. Format: what happened → what should have happened → why it matters. The closer should read this and know EXACTLY what to do differently on their next call.>",
  "disqualification_reason": "<if outcome is Disqualified, explain specifically why this prospect doesn't fit — otherwise null>",
  "payment_plan_offered": "<full | deposit | installments | financed | none | null>",
  "compliance_flags": [
    {
      "category": "<Claims | Guarantees | Earnings | Pressure>",
      "exact_phrase": "<what was actually said — quote it exactly>",
      "timestamp": "<HH:MM:SS>",
      "risk_level": "<high | medium | low>",
      "explanation": "<why this is flagged and what the closer should say instead>"
    }
  ],
  "prospect_goals": "<1-2 sentence summary of the prospect's stated goals/desired future state. null if not discussed.>",
  "prospect_pains": "<1-2 sentence summary of the prospect's stated pains/current problems. null if not discussed.>",
  "prospect_situation": "<1-2 sentence summary of the prospect's current situation/context. null if not discussed.>"
}

## RULES
- Return ONLY the JSON object. No markdown code fences, no preamble, no explanation outside the JSON.
- If no objections were raised, return an empty array for "objections".
- All scores must be numbers between ${scoringRubric.scale.min} and ${scoringRubric.scale.max}. Use decimal precision (e.g., 6.5, not just 7).
- If the closer never pitched (outcome = "Not Pitched"), pitch_score and close_attempt_score should reflect that no attempt was made (typically 1.0-2.0). But still evaluate everything else — a Not Pitched call can still have excellent discovery.
- ${hasScript ? 'Score script_adherence_score based on how closely the closer followed the provided script template.' : 'Set script_adherence_score to null — no script has been provided to evaluate against.'}
- DO NOT inflate scores. A typical closer on a typical call should average around 5.5-6.5 across categories. Scores of 8+ should require specific evidence of excellence. Scores below 4 should require specific evidence of failure.
- For "payment_plan_offered": set to "full" if prospect paid in full, "deposit" if a deposit was taken, "installments" if a payment plan was discussed, "financed" if third-party financing was offered, "none" if no payment discussion, or null if you can't determine.
- For "compliance_flags": return an empty array if none found. Only flag genuinely problematic statements, not normal sales language.
- For "prospect_goals", "prospect_pains", and "prospect_situation": Extract what the PROSPECT said about their own situation, not what the closer said. If the prospect didn't discuss a particular area, set it to null. Keep each to 1-2 sentences — capture the essence, not a transcript.`;
  }

  /**
   * Builds the user message containing call metadata and the transcript.
   */
  _buildUserMessage(callMetadata, transcript) {
    const metaParts = [];

    if (callMetadata.call_type) {
      metaParts.push(`Call Type: ${callMetadata.call_type}`);
    }
    if (callMetadata.closer_name) {
      metaParts.push(`Closer: ${callMetadata.closer_name}`);
    }
    if (callMetadata.prospect_name) {
      metaParts.push(`Prospect: ${callMetadata.prospect_name}`);
    }
    if (callMetadata.duration_minutes) {
      metaParts.push(`Duration: ${callMetadata.duration_minutes} minutes`);
    }

    const metaSection = metaParts.length > 0
      ? `## CALL METADATA\n${metaParts.join('\n')}\n\n`
      : '';

    return `${metaSection}## TRANSCRIPT\n${transcript}`;
  }
}

module.exports = new PromptBuilder();
