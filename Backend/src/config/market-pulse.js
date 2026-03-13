/**
 * MARKET PULSE CONFIGURATION — Backend
 *
 * AI-powered theme condensing config. Mirrors the prompts/settings
 * previously in Frontend/server/config/marketPulse.js.
 */

module.exports = {
  // ── AI Model ───────────────────────────────────────────────────────
  model: 'claude-sonnet-4-20250514',
  maxTokens: 1024,

  // ── Caching ────────────────────────────────────────────────────────
  cacheTtlMinutes: 60,

  // ── Input Limits ───────────────────────────────────────────────────
  maxTexts: 500,

  // ── Theme Constraints ──────────────────────────────────────────────
  minThemes: 5,
  maxThemes: 15,

  // ── Type Labels ────────────────────────────────────────────────────
  typeLabels: {
    pains: 'pain points / problems',
    goals: 'goals / desired outcomes',
  },

  // ── System Prompt ──────────────────────────────────────────────────
  systemPrompt: `You are an expert market researcher analyzing sales call transcripts. Your job is to identify recurring themes in what prospects say, preserving their natural language. You always respond with valid JSON only.`,

  // ── User Prompt Template ───────────────────────────────────────────
  userPromptTemplate: `You are analyzing {{count}} raw {{typeLabel}} statements extracted from sales calls for a business.

Your job: group these into {{minThemes}}-{{maxThemes}} distinct themes, counting how many statements belong to each theme.

Rules:
- Keep the prospect's actual voice/phrasing — don't corporate-ify it
- Merge semantically similar statements (e.g., "more family time" = "spend time with kids")
- Each theme label should be a short phrase (3-10 words) that a marketer could use
- Sort by count descending (most common first)
- Every input statement must be counted in exactly one theme

Respond with ONLY a JSON array, no other text:
[{"theme": "string", "count": number}, ...]

Here are the statements:
{{statements}}`,

  // ── Script Comparison ──────────────────────────────────────────────
  scriptComparisonModel: 'claude-sonnet-4-20250514',
  scriptComparisonMaxTokens: 2000,

  scriptComparisonSystemPrompt: `You are a sales methodology analyst. You compare what prospects actually say in sales calls against a client's sales script template to find alignment gaps. Return structured JSON only.`,

  scriptComparisonPrompt: `You have two inputs:

1. PROSPECT THEMES — these are clustered themes from what prospects actually said on sales calls (type: {{type}}):
{{themes}}

2. SALES SCRIPT TEMPLATE — this is the script closers are supposed to follow:
{{scriptTemplate}}

Analyze the alignment between what prospects are saying and what the script covers. Return ONLY valid JSON (no markdown fences):

{
  "addressed": [
    { "theme": "<prospect theme>", "scriptSection": "<which part of the script addresses this>", "note": "<brief note on alignment>" }
  ],
  "gaps": [
    { "theme": "<prospect theme NOT addressed by the script>", "suggestion": "<how the script could be updated to address this>" }
  ],
  "unused": [
    { "scriptSection": "<script section/question that never shows up in prospect conversations>", "note": "<why this might be happening>" }
  ]
}

Rules:
- "addressed": themes the script already covers well
- "gaps": themes prospects bring up that the script DOESN'T address — these are opportunities to improve the script
- "unused": script sections that aren't surfacing in conversations — either closers skip them or they don't resonate
- Be specific. Reference actual theme text and actual script sections.
- Return at least 1 item in each category if possible. If a category genuinely has 0, return an empty array.`,
};
