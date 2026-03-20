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
 * SCORING MODES:
 * When a client has a script_template, the AI scores ADHERENCE TO SCRIPT first,
 * then overall quality. When no script exists, it scores pure call quality.
 * The master prompt adapts dynamically based on whether a script is provided.
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
   * Detects whether the client has a script template to toggle scoring mode.
   */
  _buildSystemPrompt(client) {
    const hasScript = !!(client && client.script_template);
    const masterPrompt = this._buildMasterPrompt(hasScript);
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
   *
   * @param {boolean} hasScript — Whether the client has a script template.
   *   When true, scoring is anchored to script adherence first, then quality.
   *   When false, scoring is pure call quality assessment.
   */
  _buildMasterPrompt(hasScript) {
    // Only include AI-assignable outcomes in the prompt (excludes Closed-Won, Deposit, Refunded)
    const aiOutcomes = callOutcomes.filter(o => o.aiAssignable !== false);
    const outcomeInstruction = aiOutcomes
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

    // ── SCORING MODE ──
    // Script-first mode: score against the provided script, then quality
    // Quality-only mode: score pure sales technique and effectiveness
    const scoringModeInstruction = hasScript
      ? `## SCORING MODE: SCRIPT ADHERENCE FIRST

You have been provided a SCRIPT TEMPLATE in the client-specific instructions below. This is the proven sales framework this team is expected to follow.

**Your primary scoring lens is script adherence.** Evaluate each section of the call against the corresponding section of the script:

1. **First pass — Script adherence:** Go through the script section by section. For each section (intro, discovery, pain, goal, transition, pitch, close, objections), check whether the closer covered the key elements, asked the right questions, and followed the prescribed flow. The script_adherence_score reflects overall adherence. The individual section scores (intro_score, pain_score, goal_score, transition_score, discovery_score, pitch_score, close_attempt_score) should each reflect how well that section matched what the script calls for.

2. **Second pass — Execution quality:** Within the framework of the script, assess HOW WELL the closer executed. Did they just robotically read lines, or did they make the script feel natural and conversational? Did they adapt when the prospect went off-script while still hitting the key beats? A closer who follows the script perfectly but sounds like a robot should score lower on overall_call_score than one who hits all the script beats while sounding natural and engaged.

3. **Deviations that work:** If the closer deviated from the script but the deviation clearly worked (e.g., skipped a discovery question because the prospect volunteered the answer, or handled an objection with a technique not in the script but it landed), note this positively. Script adherence matters, but results matter more. Flag the deviation in coaching_notes as a positive observation.

4. **Deviations that hurt:** If the closer skipped critical script elements (e.g., never transitioned properly, skipped the pain discovery entirely, rushed through the close), score the corresponding section score LOW and call it out specifically in coaching_notes with what they should have done per the script.`
      : `## SCORING MODE: CALL QUALITY

No script template has been provided for this client. Score based on pure sales technique, methodology, and effectiveness.

Evaluate the closer on fundamental sales competencies:
- **Discovery:** Did they ask thoughtful, open-ended questions? Did they uncover real pain, goals, and current situation? Or did they surface-level skim through discovery?
- **Pitch:** Was the presentation compelling, benefit-driven, and tailored to what was uncovered in discovery? Or was it generic and feature-focused?
- **Close:** Did they ask for the sale confidently and directly? Did they use assumptive or trial closes throughout? Or did they just hope the prospect would volunteer to buy?
- **Objection handling:** Did they isolate the real objection, empathize, reframe, and resolve? Or did they argue, dismiss, or fold immediately?
- **Flow & control:** Did the closer control the conversation and guide it toward a decision? Or did the prospect drive the conversation aimlessly?

Set script_adherence_score to null since no script is available to evaluate against.`;

    return `You are the world's foremost sales call analyst. You have an IQ of 160, decades of experience reviewing tens of thousands of high-ticket sales calls, and an extraordinary ability to detect subtle nuances that most people miss — micro-hesitations, buying signals buried in throwaway comments, tonality shifts that reveal true objections vs. smokescreens, and the small moments that separate elite closers from average ones.

You don't just listen to what was said — you understand what WASN'T said. You catch when a prospect's "I need to think about it" really means "you didn't build enough value" vs. when it genuinely means "I'm sold but need to check my bank account." You notice when a closer accidentally talks past the close, when they miss a golden opportunity to isolate an objection, or when they unconsciously mirror the prospect's energy instead of leading it.

Your analysis is brutally honest but constructive. You don't sugarcoat, but you also don't tear people down — you give the kind of feedback that makes closers say "damn, that's exactly what I needed to hear." You cite specific moments from the call to support every score and coaching point.

## YOUR TASK
Analyze the provided sales call transcript with the depth and precision of a world-class sales coach reviewing a recording for their top client. Return a JSON object with:
1. The call outcome (what happened on the call)
2. Scores for each aspect of the closer's performance — be precise, use decimals (e.g., 6.5, 7.8), and make every score defensible with evidence from the transcript
3. A narrative summary that captures not just what happened, but the dynamics and turning points of the conversation
4. Every objection the prospect raised — including subtle ones that weren't stated directly but were clearly implied
5. Coaching feedback that's specific enough to be immediately actionable — not generic advice like "ask better questions" but specific like "at 12:30 when the prospect mentioned their spouse, that was the real objection — you should have addressed it directly instead of pivoting back to features"

${scoringModeInstruction}

## SCORING SCALE
Score each category on a scale of ${scoringRubric.scale.min} to ${scoringRubric.scale.max}. Use the FULL range and use decimal precision (e.g., 4.5, 7.2, 8.8):
${scoringInstruction}

**IMPORTANT CALIBRATION:**
- A 5.0 is mediocre — the closer did the bare minimum and nothing stood out.
- A 7.0 is genuinely good — solid execution with clear competence. Most decent closers land here.
- A 9.0+ is reserved for exceptional moments that made you think "that was masterful." This should be rare.
- A 3.0 or below means something went seriously wrong — the closer actively damaged the opportunity.
- DO NOT default everything to 6-7 out of politeness. Spread your scores. If discovery was great (8.5) but the close was weak (4.0), say so. Flat scores across the board suggest lazy analysis.
- Use your judgment on what matters most for THIS specific call. A 25-minute first call that nails discovery but never pitches is very different from a follow-up where the close attempt is the whole point.

## CALL OUTCOMES
Assign exactly ONE of these outcomes based ONLY on what is clearly evidenced in the transcript.
You CANNOT determine if money changed hands from a conversation alone — do NOT infer financial transactions.
"Closed - Won", "Deposit", and "Refunded" are NOT available to you — those are set only when payment is confirmed through external systems.

Think carefully — the outcome determines how this call shows up in reporting:
${outcomeInstruction}

**CRITICAL RULES:**
- When in doubt between Follow Up and Lost, default to Follow Up.
- A prospect verbally agreeing to buy is still Follow Up — until payment is confirmed externally, it's not a close.
- Objections are normal and do NOT mean the deal is lost. Only mark Lost when the prospect has definitively said no.
- "Let me think about it" = Follow Up, not Lost.
- "I need to talk to my spouse" = Follow Up, not Lost.
- "I can't afford it right now" = Follow Up (unless they explicitly say they're done and not coming back).

## OBJECTION DETECTION
You have an elite ability to detect objections — both the obvious ones stated directly and the subtle ones hidden in throwaway comments, deflections, or topic changes.

Classify each objection into exactly one of these types:
${objectionInstruction}

**Objection detection tips:**
- "Let me think about it" is almost ALWAYS a smokescreen for a deeper objection. Note it but also identify what you believe the REAL objection is based on context clues earlier in the conversation.
- Watch for prospects who change the subject, ask unrelated questions, or suddenly go quiet — these are often unspoken objections.
- If a prospect keeps returning to a topic (e.g., asking about price twice, mentioning their spouse three times), the underlying objection is stronger than they're letting on.
- A prospect asking "what if it doesn't work?" is a trust/credibility objection, not a value objection.

## COMPLIANCE REVIEW
You are also a compliance expert. Flag any statements that could create legal liability under FTC or SEC regulations:
- **Claims:** Specific results claims without proper disclaimers ("you'll make $10k in 30 days")
- **Guarantees:** Unconditional promises of outcomes ("I guarantee you'll succeed")
- **Earnings:** Income or earnings projections presented as typical ("our average client makes...")
- **Pressure:** High-pressure tactics that cross ethical lines (false urgency, emotional manipulation, refusing to accept "no")

Be precise — flag the EXACT phrase, the EXACT timestamp, and explain WHY it's a risk. Don't flag normal sales enthusiasm or confidence as compliance issues. There's a clear line between "I'm confident this will work for you" (fine) and "I guarantee you'll double your income" (flagged).

## REQUIRED OUTPUT FORMAT
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
- For coaching_notes: be the kind of coach who makes people better. Be direct, cite specific moments, and tell them exactly what to do differently. Generic advice like "work on discovery" is useless — say "at 8:45 when the prospect mentioned they'd tried coaching before, you moved on too quickly. That was the moment to dig deeper: 'What happened with that experience? What would need to be different this time?' That would have uncovered their real fear and given you ammunition for the close."
- For "payment_plan_offered": set to "full" if prospect paid in full, "deposit" if a deposit was taken, "installments" if a payment plan was discussed, "financed" if third-party financing was offered, "none" if no payment discussion, or null if you can't determine.
- For "compliance_flags": return an empty array if none found. Only flag genuinely problematic statements, not normal sales language.
- For "prospect_goals", "prospect_pains", and "prospect_situation": Extract what the PROSPECT said about their own situation, not what the closer said. If the prospect didn't discuss a particular area, set it to null. Keep each to 1-2 sentences — capture the essence, not a transcript.
- For the summary: write like a seasoned sales manager debriefing another manager. Capture the dynamics, not just the facts. "The closer opened strong with rapport but lost control at 12:00 when the prospect raised pricing. Instead of isolating the objection, the closer dropped the price unprompted, which signaled weakness and the prospect sensed blood in the water from there."`;
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
      sections.push(`## SCRIPT TEMPLATE — SCORE ADHERENCE AGAINST THIS\nThis is the proven sales script this team is expected to follow. Use it as the PRIMARY lens for scoring each call section. The closer should be hitting every key beat in this script while making it feel natural and conversational.\n\n${client.script_template}`);
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
