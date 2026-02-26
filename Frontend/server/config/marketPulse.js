/**
 * MARKET PULSE CONFIGURATION
 *
 * Master config for the AI-powered theme condensing feature.
 * Every tunable knob lives here — prompts, model, cache, limits, colors.
 *
 * To adjust AI behavior: edit the prompts below.
 * To change the model: update `model`.
 * To change caching: update `cacheTtlMinutes`.
 * To change theme count: update `themeRange` in the prompt or constraints.
 */

module.exports = {
  // ── AI Model ───────────────────────────────────────────────────────
  model: 'claude-sonnet-4-20250514',
  maxTokens: 1024,

  // ── Caching ────────────────────────────────────────────────────────
  // How long AI results stay cached before re-calling Sonnet.
  // Admin "Refresh AI" button bypasses this.
  cacheTtlMinutes: 60,

  // ── Input Limits ───────────────────────────────────────────────────
  // Max number of raw text statements sent to the AI per request.
  // 500 keeps the prompt under ~12K tokens even for verbose texts.
  maxTexts: 500,

  // ── Theme Constraints ──────────────────────────────────────────────
  minThemes: 5,
  maxThemes: 15,

  // ── Type Labels ────────────────────────────────────────────────────
  // Maps the `type` parameter to a human-readable label used in prompts.
  typeLabels: {
    pains: 'pain points / problems',
    goals: 'goals / desired outcomes',
  },

  // ── System Prompt ──────────────────────────────────────────────────
  // Sets the AI's role and expertise. Sent as the system message.
  systemPrompt: `You are an expert market researcher analyzing sales call transcripts. Your job is to identify recurring themes in what prospects say, preserving their natural language. You always respond with valid JSON only.`,

  // ── User Prompt Template ───────────────────────────────────────────
  // Variables available: {{count}}, {{typeLabel}}, {{minThemes}}, {{maxThemes}}, {{statements}}
  //
  // This is the main prompt sent to the AI. Edit this to change how
  // themes are grouped, labeled, or counted.
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

  // ── UI Colors ──────────────────────────────────────────────────────
  // Color names from the Tron theme (resolved via COLORS.neon.* on frontend).
  // Used by the MarketInsightPage to style each section.
  colors: {
    pains: 'red',
    goals: 'green',
    aiBadge: 'purple',
  },
};
