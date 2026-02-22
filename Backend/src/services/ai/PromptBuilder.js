/**
 * PROMPT BUILDER — Dynamic Two-Layer AI Prompt Assembly
 *
 * Builds the complete AI prompt for transcript analysis.
 *
 * ARCHITECTURE:
 * The system prompt = Master Prompt + Client Mini-Prompts
 * The user message = Call metadata + Transcript
 *
 * Layer 1: MASTER PROMPT (same for every call, every client)
 * Built from config files:
 * - scoring-rubric.js → scoring instructions
 * - objection-types.js → objection classification categories
 * - call-outcomes.js → outcome options
 * - Output JSON schema → what the AI must return
 *
 * Layer 2: CLIENT MINI-PROMPTS (unique per client)
 * Pulled from the client's database record:
 * - ai_prompt_overall, ai_prompt_discovery, ai_prompt_pitch,
 *   ai_prompt_close, ai_prompt_objections, ai_context_notes,
 *   script_template, common_objections, disqualification_criteria
 *
 * This means:
 * - Adding a new objection type? Update objection-types.js → every future AI call includes it.
 * - Client wants custom discovery scoring? Update their ai_prompt_discovery in BigQuery → done.
 * - Want to change the scoring scale? Update scoring-rubric.js → all clients affected.
 */

const callOutcomes = require('../../config/call-outcomes');
const objectionTypes = require('../../config/objection-types');
const scoringRubric = require('../../config/scoring-rubric');

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
    const systemPrompt = this._buildSystemPrompt(client);
    const userMessage = this._buildUserMessage(callMetadata, transcript);
    return { systemPrompt, userMessage };
  }

  /**
   * Assembles the system prompt from Master Prompt + Client Mini-Prompts.
   */
  _buildSystemPrompt(client) {
    const masterPrompt = this._buildMasterPrompt();
    const clientPrompt = this._buildClientPrompt(client);

    const parts = [masterPrompt];
    if (clientPrompt) {
      parts.push(clientPrompt);
    }

    return parts.join('\n\n');
  }

  /**
   * MASTER PROMPT — universal instructions for every analysis.
   * Built entirely from config files so it stays in sync automatically.
   */
  _buildMasterPrompt() {
    const outcomeInstruction = callOutcomes
      .map(o => `- "${o.label}": ${o.description}`)
      .join('\n');

    const objectionInstruction = objectionTypes
      .map(o => `- "${o.key}" (${o.label}): ${o.description}`)
      .join('\n');

    const scoringInstruction = scoringRubric.levels
      .map(l => `- ${l.range}: ${l.label} — ${l.description}`)
      .join('\n');

    const scoreFields = scoringRubric.scoreTypes
      .map(s => `    "${s.key}": <number ${scoringRubric.scale.min}-${scoringRubric.scale.max}> // ${s.description}`)
      .join(',\n');

    const objectionTypeKeys = objectionTypes.map(o => `"${o.key}"`).join(', ');

    return `You are an expert sales call analyst. You will analyze a sales call transcript and provide a structured evaluation.

## YOUR TASK
Analyze the provided sales call transcript and return a JSON object with:
1. The call outcome (what happened on the call)
2. Scores for each aspect of the closer's performance
3. A brief narrative summary
4. All objections raised by the prospect
5. Key coaching feedback for the closer

## CALL OUTCOMES
Assign exactly ONE of these outcomes:
${outcomeInstruction}

## SCORING RUBRIC
Score each category on a scale of ${scoringRubric.scale.min} to ${scoringRubric.scale.max}:
${scoringInstruction}

## OBJECTION TYPES
Classify each objection into exactly one of these types:
${objectionInstruction}

## REQUIRED OUTPUT FORMAT
Return ONLY valid JSON (no markdown fences, no explanation text). The JSON must match this schema exactly:

{
  "call_outcome": "<one of: ${callOutcomes.map(o => o.label).join(', ')}>",
  "scores": {
${scoreFields}
  },
  "summary": "<2-4 sentence summary of what happened on the call>",
  "objections": [
    {
      "objection_type": "<one of: ${objectionTypeKeys}>",
      "objection_text": "<what the prospect actually said>",
      "closer_response": "<how the closer responded>",
      "was_overcome": <true or false>,
      "timestamp_approximate": "<approximate time in transcript, e.g. '00:15:30'>"
    }
  ],
  "coaching_notes": "<1-3 specific, actionable coaching points for the closer>",
  "disqualification_reason": "<if outcome is Disqualified, explain why — otherwise null>"
}

## RULES
- Return ONLY the JSON object. No markdown code fences, no preamble, no explanation.
- If no objections were raised, return an empty array for "objections".
- All scores must be numbers between ${scoringRubric.scale.min} and ${scoringRubric.scale.max}.
- If the closer never pitched (outcome = "Not Pitched"), pitch_score and close_attempt_score should reflect that no attempt was made (typically 1-2).
- If script_adherence cannot be assessed (no script provided), set script_adherence_score to null.
- Be honest and critical in scoring. A score of 7 means "average" — most closers should land around 6-7 unless they're truly exceptional or poor.`;
  }

  /**
   * CLIENT MINI-PROMPTS — per-client custom instructions.
   * Only includes sections where the client has provided content.
   */
  _buildClientPrompt(client) {
    if (!client) return null;

    const sections = [];

    if (client.ai_prompt_overall) {
      sections.push(`## CLIENT CONTEXT\n${client.ai_prompt_overall}`);
    }

    if (client.offer_name) {
      const offerParts = [`OFFER: ${client.offer_name}`];
      if (client.offer_price) offerParts[0] += ` — $${client.offer_price}`;
      if (client.offer_description) offerParts.push(client.offer_description);
      sections.push(`## OFFER DETAILS\n${offerParts.join('\n')}`);
    }

    if (client.script_template) {
      sections.push(`## SCRIPT TEMPLATE (for adherence scoring)\n${client.script_template}`);
    }

    if (client.ai_prompt_discovery) {
      sections.push(`## DISCOVERY SCORING INSTRUCTIONS\n${client.ai_prompt_discovery}`);
    }

    if (client.ai_prompt_pitch) {
      sections.push(`## PITCH SCORING INSTRUCTIONS\n${client.ai_prompt_pitch}`);
    }

    if (client.ai_prompt_close) {
      sections.push(`## CLOSE SCORING INSTRUCTIONS\n${client.ai_prompt_close}`);
    }

    if (client.ai_prompt_objections) {
      sections.push(`## OBJECTION HANDLING INSTRUCTIONS\n${client.ai_prompt_objections}`);
    }

    if (client.disqualification_criteria) {
      sections.push(`## DISQUALIFICATION CRITERIA\n${client.disqualification_criteria}`);
    }

    if (client.common_objections) {
      sections.push(`## KNOWN COMMON OBJECTIONS\n${client.common_objections}`);
    }

    if (client.ai_context_notes) {
      sections.push(`## ADDITIONAL CONTEXT\n${client.ai_context_notes}`);
    }

    if (sections.length === 0) return null;

    return `# CLIENT-SPECIFIC INSTRUCTIONS\n\n${sections.join('\n\n')}`;
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
