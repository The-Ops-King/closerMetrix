/**
 * INSIGHT ENGINE CONFIGURATION
 *
 * Master config for the AI-powered per-page insight cards.
 * Every tunable knob lives here — prompts, model, cache, section templates.
 *
 * To adjust AI behavior: edit the prompts below.
 * To change the model: update `model`.
 * To change caching: update `cacheTtlMinutes`.
 */

module.exports = {
  // ── AI Model ───────────────────────────────────────────────────────
  model: 'claude-sonnet-4-20250514',
  maxTokens: 512,

  // ── Caching ────────────────────────────────────────────────────────
  // How long AI insights stay cached before re-calling Sonnet.
  // Keyed by clientId:section:metricsHash — same data = same insight.
  cacheTtlMinutes: 60,

  // ── Daily Job Settings ─────────────────────────────────────────────
  // How many days of data the daily insight job covers.
  dailyDateRangeDays: 30,

  // ── Tier → Sections Mapping ────────────────────────────────────────
  // Which sections to generate insights for, based on client tier.
  tierSections: {
    basic: ['overview'],
    insight: [
      'overview', 'financial', 'attendance', 'call-outcomes',
      'sales-cycle', 'objections', 'projections', 'closer-scoreboard',
    ],
    executive: [
      'overview', 'financial', 'attendance', 'call-outcomes',
      'sales-cycle', 'objections', 'projections', 'closer-scoreboard',
      'violations', 'adherence',
    ],
  },

  // ── Prior Insights Prompt ──────────────────────────────────────────
  // Appended to the user prompt when prior daily insights are available.
  // Helps the AI identify multi-day/multi-week trends.
  priorInsightsPrompt: `

Here are your previous insights for this section (most recent first):

{{priorInsights}}

When writing today's insight, note any patterns that persist or change. If something has been flagged multiple times, say how long it's been an issue. If something improved, call that out.`,

  // ── Closer Profiles Prompt ─────────────────────────────────────────
  // Appended when cross-section closer profiles are available (daily job).
  // Gives the AI full context on each closer across ALL metrics so it can
  // spot mismatches like "high adherence but low close rate → script problem".
  closerProfilesPrompt: `

CLOSER PROFILES (cross-section summary — use this to make connections across metrics):

{{closerProfiles}}

IMPORTANT: Use these profiles to find mismatches and coaching opportunities. Examples:
- If a closer has HIGH script adherence but LOW close rate, the script itself may need updating — look at what the top closer does differently.
- If a closer has HIGH show rate but LOW close rate, they're getting opportunities but can't convert — focus on their pitch/close technique.
- If a closer has LOW adherence but HIGH close rate, their improvisation is working — consider updating the script to match what they're doing.
- If a closer has HIGH objection resolution but LOW close rate, they're handling pushback but can't seal the deal — look at their close attempt.
Always name the specific closers and their numbers when making these cross-metric observations.`,

  // ── System Prompt ──────────────────────────────────────────────────
  // Sets the AI's role, output constraints, and industry benchmarks.
  systemPrompt: `You are a high-ticket sales analytics advisor for coaching, consulting, and info-product businesses. You review dashboard data and write concise, scannable insights.

FORMATTING RULES:
- Write 2-3 SHORT punchy sentences. No fluff. No filler. Every word earns its place.
- Do NOT use markdown, bullet points, or headers — just flowing sentences.
- Do NOT start with "Based on the data", "Looking at", "The team", or similar filler. Lead with the insight.
- Reference actual numbers. Say "68% show rate" not "the show rate".
- Always name specific closers who are underperforming OR outperforming. Don't be vague — say "Lily is closing at 15% vs the team's 27%" not "some closers are below average".

INDUSTRY BENCHMARKS (high-ticket $3K-$25K offers, phone/Zoom sales):
- Show rate: 60-70% is average, 75%+ is strong, below 55% is a problem
- Close rate (held-to-close): 20-30% is average, 35%+ is elite, below 15% needs coaching
- Close rate (scheduled-to-close): 15-22% is average
- Cash collection ratio: 65-75% is healthy, below 55% signals collection issues
- 1-call close rate: 40-60% of closes is typical, 70%+ means strong first-call process
- Avg calls to close: 1.5-2.5 is efficient, 3+ means deals are dragging
- Avg days to close: 3-7 days is fast, 14+ days is slow pipeline
- Objection resolution rate: 50-65% is average, 75%+ is strong
- Script adherence: 7+/10 is solid, below 5/10 needs immediate intervention
- Show rate by type: First call 60-70%, Follow-up 75-85%

Always compare the team's numbers to these benchmarks. Say "above/below industry standard" when relevant. This context is what makes the insight valuable — raw numbers alone aren't actionable.`,

  // ── Per-Section Prompt Templates ───────────────────────────────────
  // Each section has a user prompt template describing what metrics mean
  // and what the AI should analyze. {{metrics}} is replaced with the
  // JSON metrics snapshot. {{dateRange}} is replaced if present.
  sectionPrompts: {
    overview: `Sales team overview for {{dateRange}}:

{{metrics}}

Give a 2-3 sentence executive summary. Hit the big three: show rate, close rate, cash collection — compare each to industry benchmarks. If any closer is significantly dragging down or carrying the team, name them with their specific numbers.`,

    financial: `Financial data for {{dateRange}}:

{{metrics}}

Focus on the money: revenue, cash collected, collection ratio (benchmark: 65-75%), and deal sizes. Name any closer whose deal economics are notably different — higher avg deal size, worse collection rate, etc. If the gap between revenue and cash collected is concerning, say so directly.`,

    attendance: `Attendance data for {{dateRange}}:

{{metrics}}

Evaluate show rate vs benchmark (60-70% avg, 75%+ strong). Break down first call vs follow-up show rates (follow-ups should be 75-85%). If ghost rate is high, flag it. Name any closer with a show rate 10+ points below the team average.`,

    'call-outcomes': `Call outcomes data for {{dateRange}}:

{{metrics}}

Evaluate close rates: held-to-close (benchmark 20-30%), scheduled-to-close (15-22%). Compare first call vs follow-up conversion. Flag the lost call rate and DQ rate. Name the strongest and weakest closer by close rate with their specific numbers.`,

    'sales-cycle': `Sales cycle data for {{dateRange}}:

{{metrics}}

Evaluate efficiency: avg calls to close (benchmark 1.5-2.5 is efficient, 3+ is slow), avg days to close (3-7 days fast, 14+ slow). What % are 1-call closes vs multi-call? Name any closer who takes significantly more calls/days to close than the team.`,

    objections: `Objections data for {{dateRange}}:

{{metrics}}

Evaluate resolution rate (benchmark 50-65% avg, 75%+ strong). Which objection types are hardest to overcome? Name any closer who handles objections notably better or worse. If unresolved objections correlate with lost deals, say so.`,

    projections: `Projections and pacing data for {{dateRange}}:

{{metrics}}

Are they on pace for their goals? What's the gap? Identify the highest-leverage improvement — which single metric change (show rate, close rate, deal size) would have the biggest revenue impact?`,

    violations: `Compliance/violations data for {{dateRange}}:

{{metrics}}

How many flags, what categories? Name any closer responsible for a disproportionate share. Are violations concentrated in specific script sections (pitch, close, objection handling)? Is the trend improving or worsening?`,

    adherence: `Script adherence data for {{dateRange}}:

{{metrics}}

Overall score vs benchmark (7+/10 solid, below 5 needs intervention). Which script sections are weakest across the team? Name any closer significantly below the team average with their specific score.`,

    'closer-scoreboard': `Closer scoreboard comparison for {{dateRange}}:

{{metrics}}

Rank and compare closers. Who's the top performer and why? Who needs coaching and in what specific area? Look for mismatches — e.g. high show rate but low close rate means the closer is getting opportunities but can't convert. Name names with numbers.`,
  },
};
