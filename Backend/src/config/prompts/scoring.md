## SCORING SCALE

Score each category on a scale of 1.0 to 10.0. Use the FULL range and use decimal precision (e.g., 4.5, 7.2, 8.8):
- 1-3: Poor — Major issues, fundamental problems, clearly unprepared or ineffective
- 4-5: Below Average — Notable gaps but some effort shown, needs significant improvement
- 6-7: Average — Competent but room for improvement, gets the job done
- 8-9: Good — Strong performance with only minor areas to improve
- 10: Exceptional — Textbook execution, masterful handling

### Score Categories
- **intro_score** — How well the closer opened, built rapport, set the tone
- **pain_score** — How effectively the closer uncovered current pain points
- **goal_score** — How well the closer identified desired future state
- **discovery_score** — Overall: how well the closer uncovered goals, pains, and situation
- **transition_score** — How smoothly the closer transitioned from discovery to pitch
- **pitch_score** — How effectively the closer presented the offer
- **close_attempt_score** — How well the closer asked for the sale
- **objection_handling_score** — How well objections were addressed and overcome
- **overall_call_score** — Holistic call quality considering all factors
- **prospect_fit_score** — How good a fit this prospect is for the offer
- **script_adherence_score** — How closely the closer followed the script template (null if no script provided)

{{#if script_template}}
### SCRIPT ADHERENCE MODE

A script template has been provided. Your primary scoring lens is script adherence.

1. **First pass — Script adherence:** Go through the script section by section. For each section (intro, discovery, pain, goal, transition, pitch, close, objections), check whether the closer covered the key elements, asked the right questions, and followed the prescribed flow. The script_adherence_score reflects overall adherence. Individual section scores should reflect how well that section matched what the script calls for.

2. **Second pass — Execution quality:** Within the framework of the script, assess HOW WELL the closer executed. A closer who follows the script perfectly but sounds like a robot should score lower on overall_call_score than one who hits all the script beats while sounding natural and engaged.

3. **Deviations that work:** If the closer deviated from the script but the deviation clearly worked (e.g., skipped a discovery question because the prospect volunteered the answer), note this positively in coaching_notes.

4. **Deviations that hurt:** If the closer skipped critical script elements, score the corresponding section LOW and call it out in coaching_notes with what they should have done per the script.
{{/if}}
{{#unless script_template}}
### QUALITY MODE

No script template has been provided. Score based on pure sales technique, methodology, and effectiveness.

Set script_adherence_score to null since no script is available to evaluate against.

Evaluate the closer on fundamental sales competencies:
- **Discovery:** Did they ask thoughtful, open-ended questions? Did they uncover real pain, goals, and current situation? Or did they surface-level skim?
- **Pitch:** Was the presentation compelling, benefit-driven, and tailored to what was uncovered? Or was it generic and feature-focused?
- **Close:** Did they ask for the sale confidently and directly? Or did they just hope the prospect would volunteer to buy?
- **Objection handling:** Did they isolate the real objection, empathize, reframe, and resolve? Or did they argue, dismiss, or fold?
- **Flow & control:** Did the closer control the conversation and guide it toward a decision? Or did the prospect drive aimlessly?
{{/unless}}

### CALIBRATION
- A 5.0 is mediocre — the closer did the bare minimum and nothing stood out.
- A 7.0 is genuinely good — solid execution with clear competence. Most decent closers land here.
- A 9.0+ is reserved for exceptional moments that made you think "that was masterful." This should be rare.
- A 3.0 or below means something went seriously wrong — the closer actively damaged the opportunity.
- DO NOT default everything to 6-7 out of politeness. Spread your scores. If discovery was great (8.5) but the close was weak (4.0), say so. Flat scores across the board suggest lazy analysis.
- Use your judgment on what matters most for THIS specific call. A 25-minute first call that nails discovery but never pitches is very different from a follow-up where the close attempt is the whole point.
- DO NOT inflate scores. A typical closer on a typical call should average around 5.5-6.5 across categories. Scores of 8+ should require specific evidence of excellence. Scores below 4 should require specific evidence of failure.
