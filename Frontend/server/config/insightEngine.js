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
    overview: `Executive summary dashboard for {{dateRange}}:

{{metrics}}

THIS IS THE OVERVIEW PAGE — it shows at-a-glance scorecards (booked, held, show rate, closed, close rate, revenue, cash, violations count). Give a 2-3 sentence exec summary hitting the big three: show rate, close rate, cash collection — compare each to benchmarks. If any closer is carrying or dragging the team, name them. If CLIENT KPI TARGETS are provided, compare actuals to the client's own goals first.`,

    financial: `Financial performance data for {{dateRange}}:

{{metrics}}

THIS IS THE FINANCIAL PAGE — it shows revenue, cash collected, collection ratio, deal sizes, and per-closer financial breakdowns. Focus ONLY on money metrics: revenue vs cash gap (collection ratio benchmark: 65-75%), deal size trends, revenue per call held, and per-closer financial differences. Name any closer with notably different deal economics. Do NOT discuss show rates or close rates — those belong on other pages. If CLIENT KPI TARGETS are provided, compare revenue and cash to the client's own targets.`,

    attendance: `Attendance and show rate data for {{dateRange}}:

{{metrics}}

THIS IS THE ATTENDANCE PAGE — it shows show rates, volume (booked vs held), ghost/cancel/reschedule breakdown, and per-closer attendance. Focus ONLY on attendance: show rate vs benchmark (60-70% avg, 75%+ strong), first call vs follow-up show rates (follow-ups should be 75-85%), ghost/cancel/reschedule split, and which closers have show rate problems. Do NOT discuss close rates or revenue — those belong on other pages. Name any closer with a show rate 10+ points below team average.`,

    'call-outcomes': `Call outcome and conversion data for {{dateRange}}:

{{metrics}}

THIS IS THE CALL OUTCOMES PAGE — it shows close rates, funnel conversion (booked→held→qualified→closed), deposits, DQ rate, lost reasons, and per-closer close rates. Focus ONLY on conversion: held-to-close (benchmark 20-30%), scheduled-to-close (15-22%), first call vs follow-up conversion, DQ rate, lost call rate, and lost reasons. Name the strongest and weakest closer by close rate. Do NOT discuss show rates or deal sizes — those belong on other pages.`,

    'sales-cycle': `Sales cycle speed data for {{dateRange}}:

{{metrics}}

THIS IS THE SALES CYCLE PAGE — it shows avg calls to close, avg days to close, 1-call vs 2-call vs 3+ call breakdown, and per-closer speed metrics. Focus ONLY on speed and efficiency: calls to close (benchmark 1.5-2.5 efficient, 3+ slow), days to close (3-7 fast, 14+ slow), 1-call close percentage, and which closers are slowest. Do NOT discuss close rates or revenue — those belong on other pages.`,

    objections: `Objection handling data for {{dateRange}}:

{{metrics}}

THIS IS THE OBJECTIONS PAGE — it shows objection types, resolution rates, per-closer objection handling, and objection-to-outcome correlation. Focus ONLY on objections: overall resolution rate (benchmark 50-65% avg, 75%+ strong), which objection types are hardest to resolve, which closers handle objections best/worst, and whether unresolved objections correlate with lost deals. Do NOT discuss close rates or show rates — those belong on other pages.`,

    projections: `Projections, pacing, and goal tracking data for {{dateRange}}:

{{metrics}}

THIS IS THE PROJECTIONS PAGE — it shows revenue pacing vs monthly/quarterly/yearly goals, EOM and EOY projections, and scenario sliders. Focus ONLY on pacing and goals: Are they ahead or behind pace for their monthly goal? What's the MTD revenue vs goal percentage? What's their projected EOM finish? If pacing is strong (120%+), suggest raising the goal. If pacing is weak (<80%), identify the single highest-leverage fix (more prospects, better show rate, better close rate, or higher deal size). Reference the actual pacing numbers and goal amounts. Do NOT give generic close rate or show rate advice — only mention those metrics in terms of their impact on hitting the revenue goal.`,

    violations: `Compliance and risk flag data for {{dateRange}}:

{{metrics}}

THIS IS THE VIOLATIONS PAGE — it shows SEC/FTC risk flags, flag counts, risk categories (claims, guarantees, earnings, pressure), per-closer violations, risk by script section, and trending direction. Focus ONLY on compliance risk: total flag count, which categories are most common, which closers are responsible for disproportionate flags, whether violations are concentrated in specific script sections (pitch, close, objection handling), and whether the trend is improving or worsening. Do NOT discuss close rates or revenue — those belong on other pages.`,

    adherence: `Script adherence scoring data for {{dateRange}}:

{{metrics}}

THIS IS THE ADHERENCE PAGE — it shows overall script adherence scores, per-section scores (intro, discovery, pitch, close, objections), and per-closer adherence. Focus ONLY on script adherence: overall score vs benchmark (7+/10 solid, below 5 needs intervention), which script sections are weakest across the team, and which closers are significantly below team average. Name specific closers with their scores. Do NOT discuss close rates or revenue — those belong on other pages.`,

    'closer-scoreboard': `Closer ranking and comparison data for {{dateRange}}:

{{metrics}}

THIS IS THE CLOSER SCOREBOARD PAGE — it shows all closers ranked and compared across metrics. Focus on rankings and mismatches: Who's the top performer and why? Who needs coaching and in what area? Look for contradictions — high adherence but low close rate (script problem?), high show rate but low close rate (pitch problem?), low adherence but high close rate (maverick who should update the script?). Name every closer with their specific numbers.`,

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
