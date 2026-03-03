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

  // ── Data Analysis Model ────────────────────────────────────────────
  dataAnalysisModel: 'claude-sonnet-4-20250514',
  dataAnalysisMaxTokens: 3000,

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

  // ── KPI Targets Prompt ───────────────────────────────────────────
  // Appended when the client has set KPI targets in their settings.
  // Gives the AI context to compare actual performance to the client's own goals.
  kpiTargetsPrompt: `

CLIENT KPI TARGETS (compare actual performance to these — they matter more than generic benchmarks):

{{kpiTargets}}

IMPORTANT: When KPI targets are provided, lead with how the team is performing against THEIR OWN goals. Say "your target is X but you're at Y" — this is more meaningful than comparing to industry averages. Still mention benchmarks for context, but prioritize the client's own targets.`,

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

Give a 2-3 sentence executive summary. Hit the big three: show rate, close rate, cash collection — compare each to industry benchmarks. If any closer is significantly dragging down or carrying the team, name them with their specific numbers. If CLIENT KPI TARGETS are provided in the data, compare actual performance to the client's own goals first.`,

    financial: `Financial data for {{dateRange}}:

{{metrics}}

Focus on the money: revenue, cash collected, collection ratio (benchmark: 65-75%), and deal sizes. Name any closer whose deal economics are notably different — higher avg deal size, worse collection rate, etc. If the gap between revenue and cash collected is concerning, say so directly. If CLIENT KPI TARGETS are provided, compare revenue and cash to the client's own monthly targets.`,

    attendance: `Attendance data for {{dateRange}}:

{{metrics}}

Evaluate show rate vs benchmark (60-70% avg, 75%+ strong). Break down first call vs follow-up show rates (follow-ups should be 75-85%). If ghost rate is high, flag it. Name any closer with a show rate 10+ points below the team average. If CLIENT KPI TARGETS are provided, compare show rate to the client's own target.`,

    'call-outcomes': `Call outcomes data for {{dateRange}}:

{{metrics}}

Evaluate close rates: held-to-close (benchmark 20-30%), scheduled-to-close (15-22%). Compare first call vs follow-up conversion. Flag the lost call rate and DQ rate. Name the strongest and weakest closer by close rate with their specific numbers. If CLIENT KPI TARGETS are provided, compare close rates to the client's own targets.`,

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

    // ── Data Analysis Page Prompts (Sonnet — structured JSON output) ──

    'data-analysis-overview': `You are analyzing a high-ticket sales team's performance data for {{dateRange}}.

Here is the team data:

{{metrics}}

INDUSTRY BENCHMARKS (high-ticket $3K-$25K offers):
- Show rate: 60-70% average, 75%+ strong, <55% problem
- Close rate (held): 20-30% average, 35%+ elite, <15% needs coaching
- Cash collection ratio: 65-75% healthy, <55% collection issues
- 1-call close rate: 40-60% typical, 70%+ strong
- Avg calls to close: 1.5-2.5 efficient, 3+ slow
- Objection resolution: 50-65% average, 75%+ strong

If the data includes CLIENT KPI TARGETS, compare the team's actual performance against these targets first — this is more meaningful than generic benchmarks. Say "your target is X but team is at Y" and whether they're on track.

If a CLIENT SCRIPT TEMPLATE is provided, correlate adherence scores with outcomes. Are the closers who follow the script actually closing better? If not, the script may need updating.

Return ONLY valid JSON matching this exact schema (no markdown, no backticks, no explanation outside the JSON):
{
  "executiveSummary": "3-5 sentence executive summary with specific numbers and closer names. Compare to benchmarks. Lead with the most important finding.",
  "summaryStats": {
    "totalRevenue": <number>,
    "teamCloseRate": "<string like '22%'>",
    "callsAnalyzed": <number>,
    "insightsGenerated": <number — count of priorityActions>,
    "highPriorityCount": <number — count of high priority actions>
  },
  "priorityActions": [
    {
      "priority": "high|medium|low",
      "category": "<short category name>",
      "color": "amber|red|green|cyan|purple",
      "icon": "<material icon name>",
      "title": "<one-line insight title with a specific number>",
      "body": "<2-4 sentence detailed explanation with specific closer names and numbers>",
      "action": "<1-2 sentence recommended action>"
    }
  ],
  "closerQuickView": [
    {
      "closerId": "<closer_id>",
      "name": "<closer name>",
      "closeRate": <decimal like 0.22>,
      "revenue": <number>,
      "showRate": <decimal>,
      "adherence": <number 0-10>,
      "status": "strong|average|needs-coaching"
    }
  ]
}

Generate 4-6 priorityActions. Include ALL closers in closerQuickView. Be specific — name closers and cite exact numbers. Focus on actionable insights, not just observations.`,

    'data-analysis-team': `You are analyzing a high-ticket sales team's performance data for {{dateRange}}.

Here is the team data:

{{metrics}}

INDUSTRY BENCHMARKS (high-ticket $3K-$25K offers):
- Show rate: 60-70% average, 75%+ strong, <55% problem
- Close rate (held): 20-30% average, 35%+ elite, <15% needs coaching
- Cash collection ratio: 65-75% healthy, <55% collection issues
- Objection resolution: 50-65% average, 75%+ strong
- Script adherence: 7+/10 solid, <5/10 needs immediate intervention

If CLIENT KPI TARGETS are provided, evaluate how the team compares to their OWN targets, not just industry benchmarks. Are they hitting their goals?

If a CLIENT SCRIPT TEMPLATE is provided, identify which script sections are weakest and suggest whether the problem is the script itself or the execution by the closers.

Return ONLY valid JSON matching this exact schema (no markdown, no backticks):
{
  "insights": [
    {
      "priority": "high|medium|low",
      "category": "<short category name like 'Revenue Concentration' or 'Script vs Results'>",
      "color": "amber|red|green|cyan|purple",
      "icon": "<material symbol icon name>",
      "title": "<one-line with a specific number>",
      "body": "<3-5 sentence detailed analysis with closer names and numbers>",
      "action": "<1-2 sentence specific recommendation>"
    }
  ]
}

Generate 5-7 team-level insights. Don't just report what's high and what's low — look at the full picture and find what doesn't add up. Are the team's numbers telling a coherent story? Is revenue concentrated in one person? Are closers who follow the script actually closing better, or is the script the problem? Are the sub-scores (discovery, pitch, close attempt) pointing to a specific phase of the call that's breaking down across the board? Does objection handling quality match resolution rates, or is there a disconnect? Are there duration patterns that suggest closers are rushing or rambling?

Be brutally specific — every insight must name a closer or cite a number. The goal is to surface things a manager wouldn't see just looking at a spreadsheet.`,

    'data-analysis-individual': `You are analyzing individual closer performance for a high-ticket sales team for {{dateRange}}.

Here is the data:

{{metrics}}

INDUSTRY BENCHMARKS:
- Close rate (held): 20-30% average, 35%+ elite, <15% needs coaching
- Show rate: 60-70% average, 75%+ strong
- Objection resolution: 50-65% average, 75%+ strong
- Script adherence: 7+/10 solid, <5/10 needs intervention
- Discovery/Pitch/Close scores: 7+/10 solid, <5/10 weak

If CLIENT KPI TARGETS are provided, flag closers who are above or below the client's own targets (not just benchmarks).

Return ONLY valid JSON matching this exact schema (no markdown, no backticks):
{
  "closers": [
    {
      "closerId": "<closer_id>",
      "name": "<closer name>",
      "color": "<neon color: green|cyan|purple|amber|red|blue>",
      "stats": {
        "closeRate": <decimal>,
        "revenue": <number>,
        "callsHeld": <number>,
        "adherence": <number 0-10>,
        "showRate": <decimal>,
        "avgDealSize": <number>,
        "objResolution": <decimal>,
        "cashPerCall": <number>
      },
      "insights": [
        { "type": "strength", "text": "<specific strength with numbers>" },
        { "type": "opportunity|concern", "text": "<specific finding>" },
        { "type": "action", "text": "<specific coaching recommendation>" }
      ]
    }
  ]
}

Include ALL closers. Each closer must have exactly 3 insights (strength, opportunity or concern, action).

IMPORTANT — Look at each closer's numbers holistically. Don't just flag what's high or low in isolation. The real value is when metrics don't tell a coherent story — when someone's numbers contradict each other or when their profile doesn't make sense at face value. A closer with strong adherence but weak results tells a different story than one with weak adherence but strong results. A closer who resolves objections well but still loses deals has a different problem than one who doesn't face objections at all. Look at the full picture — close rate, show rate, adherence, sub-scores (discovery, pitch, close attempt), objection handling, duration, deal size, speed — and figure out what's actually going on with each person. What's working, what's not, and why do the numbers suggest that?

Always name the specific closer, cite their exact numbers, and give a coaching recommendation that follows logically from what the data actually shows.`,

    'data-analysis-compare': `You are comparing a single closer against their team average for a high-ticket sales team for {{dateRange}}.

Here is the data for the closer and the team average:

{{metrics}}

Return ONLY valid JSON matching this exact schema (no markdown, no backticks):
{
  "closerId": "<closer_id>",
  "closerName": "<name>",
  "comparisonSummary": "<2-3 sentence summary of how this closer compares to team average, with specific numbers>",
  "metricsAboveAvg": ["<metric name>", "<metric name>"],
  "metricsBelowAvg": ["<metric name>", "<metric name>"],
  "keyStrength": "<one sentence about their #1 strength vs team>",
  "keyGap": "<one sentence about their #1 gap vs team with a specific coaching recommendation>"
}

If CLIENT KPI TARGETS are provided, compare the closer to both the team average AND the client's own targets. Are they helping or hurting the team's progress toward its goals?

Be specific with numbers. Compare to both team average AND industry benchmarks. Look at the full profile — don't just list what's above and below average. Find what's interesting: where do this closer's numbers not tell a coherent story compared to the team? What does their combination of metrics suggest about how they actually sell?`,
  },
};
