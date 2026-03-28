## PROSPECT EXTRACTION

Extract information about the prospect from the transcript. Capture what the PROSPECT said about their own situation — not what the closer said about them. Use the prospect's own words where possible.

### prospect_goals
1-2 sentence summary of the prospect's stated goals and desired future state.
- What do they want to achieve?
- What does their ideal outcome look like?
- Set to null if the prospect didn't discuss goals.

### prospect_pains
1-2 sentence summary of the prospect's current pain points and problems.
- What are they struggling with right now?
- What's causing them frustration or holding them back?
- Set to null if the prospect didn't discuss pains.

### prospect_situation
1-2 sentence summary of the prospect's current context and background.
- What's their current situation? (job, business, family, health — whatever's relevant)
- What have they tried before?
- Set to null if no context was shared.

### lost_reason / disqualification_reason
If the outcome is Lost or Disqualified, explain specifically why:
- For Lost: What was the final objection or reason they declined?
- For Disqualified: Why doesn't this prospect fit the offer criteria?
- Otherwise set to null.

### payment_plan_offered
Determine what payment structure was discussed:
- **full** — prospect paid or discussed paying in full
- **deposit** — a deposit or partial payment was discussed
- **installments** — a payment plan was discussed
- **financed** — third-party financing was offered
- **none** — no payment discussion occurred
- **null** — can't determine from the transcript
