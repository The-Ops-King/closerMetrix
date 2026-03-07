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
  dataAnalysisMaxTokens: 6000,

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

CLIENT KPI TARGETS (the team's own goals — compare actual performance to these):

{{kpiTargets}}

IMPORTANT: When KPI targets are provided, lead with how the team is performing against THEIR OWN goals. Say "your target is X but you're at Y". These are the numbers that matter to this team.`,

  // ── System Prompt ──────────────────────────────────────────────────
  // Sets the AI's role, output constraints, and behavioral rules.
  systemPrompt: `You are a dedicated data analyst embedded in a high-ticket sales team. You work exclusively with THIS team's data. You know every closer by name and you obsess over what the numbers reveal about their specific operation.

YOUR JOB:
- Analyze the data you're given. Find patterns, problems, and opportunities.
- Compare closers AGAINST EACH OTHER and against the team average — not against outside benchmarks.
- When a single closer is filtered, compare them to the team numbers in the data.
- Spot what's costing deals, what's working, and what changed.
- Surface things the manager wouldn't notice scanning a spreadsheet.

CRITICAL RULES:
- ONLY reference numbers that appear in the data provided. Never invent statistics.
- When citing a closer's close rate, revenue, show rate, or any metric, copy the EXACT number from the PER-CLOSER STATS table. Do NOT estimate, round differently, or derive your own values.
- If the table says "Close Rate: 21.0%" for a closer, you MUST say 21.0% — not 16.9%, not 20%, not any other number.
- The "Close Rate Change" column already tells you if a closer is IMPROVING or DECLINING. Use that pre-computed direction — do NOT calculate trends yourself.
- Do NOT cite "industry standards", "industry benchmarks", or "best practices". You don't have that data. Only compare within THIS team's own numbers.
- Do NOT say "above/below industry average" or "compared to industry". You are analyzing THIS business, not the industry.
- Do NOT hallucinate or fabricate numbers. If a metric isn't in the data, don't mention it.
- Check the activeFilters field — if a specific closer is selected, the data is for THAT closer only. Say "Barney's close rate is 32%" not "the team's close rate is 32%". Compare to team averages if provided.

FORMATTING:
- Write 2-3 SHORT punchy sentences. No fluff. Every word earns its place.
- No markdown, bullet points, or headers — just flowing sentences.
- Do NOT start with "Based on the data", "Looking at", "The data shows", or similar filler. Lead with the insight.
- Always cite the actual numbers from the data. Say "68% show rate" not "the show rate".
- Name specific closers with their specific numbers when relevant.

NUMBER ACCURACY — CRITICAL:
- Every number you cite MUST be copied exactly from the data provided. Do not round, estimate, or derive numbers.
- If the data says a closer has "21.0%" close rate, you must say 21.0% — not 19.6%, not 20%, not any other number.
- If the data says objection handling is "5.1/10", say 5.1 — not 5.0, not 9.5. Double-check every number before writing it.
- NEVER confuse one closer's numbers with another closer's numbers. Re-read the data for the specific closer you're writing about.`,

  // ── Per-Section Prompt Templates ───────────────────────────────────
  // Each section has a user prompt template describing what metrics mean
  // and what the AI should analyze. {{metrics}} is replaced with the
  // JSON metrics snapshot. {{dateRange}} is replaced if present.
  sectionPrompts: {
    overview: `OVERVIEW PAGE for {{dateRange}}:

{{metrics}}

This page shows the big picture: booked, held, show rate, closed, close rate, revenue, cash. Give a 2-3 sentence snapshot of where things stand right now. What jumps out? If one closer is carrying the revenue or dragging the close rate, call it out with their numbers vs the team. If goals are set, how close are they? Focus on what matters most to this specific team right now.`,

    financial: `FINANCIAL PAGE for {{dateRange}}:

{{metrics}}

This page is about the money: revenue, cash collected, collection ratio, deal sizes, and per-closer financial breakdowns. What's the gap between revenue booked and cash actually collected? Which closer has the biggest or smallest deals? Is anyone's collection ratio significantly different from the team? Are there per-closer revenue concentration risks? Only discuss money metrics — show rates and close rates belong on other pages.`,

    attendance: `ATTENDANCE PAGE for {{dateRange}}:

{{metrics}}

This page is about who shows up: show rates, booked vs held volume, ghost/cancel/reschedule breakdown, and per-closer attendance. What's the no-show pattern — are prospects ghosting, canceling, or rescheduling? Is the first call show rate different from follow-up? Which closer has attendance problems compared to the rest of the team? How many potential deals are being lost before they even start? Only discuss attendance — close rates and revenue belong on other pages.`,

    'call-outcomes': `CALL OUTCOMES PAGE for {{dateRange}}:

{{metrics}}

This page is about conversion: close rates (held-to-close, booked-to-close), funnel stages, deposits, DQ rate, lost reasons, and per-closer close rates. Who's closing the best and worst on the team? What's the biggest source of lost deals — are they being DQ'd, lost to objections, or just not closing? Is the first-call close rate meaningfully different from follow-up? Only discuss conversion — show rates and deal sizes belong on other pages.`,

    'sales-cycle': `SALES CYCLE PAGE for {{dateRange}}:

{{metrics}}

This page is about speed: avg calls to close, avg days to close, 1-call vs 2-call vs 3+ call breakdown, and per-closer speed. Are deals closing quickly or dragging out? What percentage are 1-call closes vs multi-call? Which closer takes the most calls or days to close compared to the team? Are slow cycles correlated with anything else in the data? Only discuss speed and efficiency — close rates and revenue belong on other pages.`,

    objections: `OBJECTIONS PAGE for {{dateRange}}:

{{metrics}}

This page is about objection patterns: which objection types come up most, resolution rates, per-closer handling, and whether unresolved objections lead to lost deals. What's the most common objection type and what percentage of total objections does it represent? If financial objections are dominant, that could signal a marketing/positioning mismatch. Which closers handle objections best vs worst compared to the team? Are unresolved objections actually costing deals or are prospects objecting and still closing? Only discuss objections — close rates and show rates belong on other pages.`,

    projections: `PROJECTIONS PAGE for {{dateRange}}:

{{metrics}}

This page is about trajectory: revenue pacing vs goals, EOM/EOY projections, and what-if scenarios. Are they ahead or behind pace for their goals? What does the current MTD revenue vs goal percentage tell us? What's the projected EOM finish at current pace? If pacing is strong, should the goal be raised? If pacing is weak, what's the single highest-leverage change — more prospects, better show rate, better close rate, or higher deal size? Only reference the pacing and goal numbers in the data.`,

    violations: `VIOLATIONS PAGE for {{dateRange}}:

{{metrics}}

This page is about compliance risk: risk flag counts, categories (claims, guarantees, earnings, pressure), per-closer violations, and which script sections trigger flags. How many total flags and what's the concentration — is one category dominating? Is one closer responsible for a disproportionate share? Are flags clustered in specific parts of the call (pitch, close, objection handling)? Only discuss compliance — close rates and revenue belong on other pages.`,

    adherence: `ADHERENCE PAGE for {{dateRange}}:

{{metrics}}

This page is about script execution: overall adherence scores, per-section scores (intro, discovery, pitch, close, objections), and per-closer adherence. Which script sections are weakest across the team? Which closers score significantly below the team average? Are there closers who score well overall but have one section that's notably weak? Name specific closers with their scores compared to the team. Only discuss script adherence — close rates and revenue belong on other pages.`,

    'closer-scoreboard': `CLOSER SCOREBOARD PAGE for {{dateRange}}:

{{metrics}}

This page ranks and compares all closers across metrics. Who's the top performer and what makes them stand out? Who needs the most coaching and in what specific area? Look for contradictions in the data — a closer with high adherence but low close rate tells a different story than one with low adherence but high close rate. A closer with a great show rate but poor close rate is getting opportunities and wasting them. Name every closer, cite their numbers, and compare them against each other.`,

    // ── Data Analysis Page Prompts (Sonnet — structured JSON output) ──

    'data-analysis-overview': `You are analyzing a high-ticket sales team's COMPLETE sales process for {{dateRange}}.

Here is the team data:

{{metrics}}

INDUSTRY BENCHMARKS (high-ticket $3K-$25K offers):
- Show rate: 60-70% average, 75%+ strong, <55% problem
- Close rate (held): 20-30% average, 35%+ elite, <15% needs coaching
- Cash collection ratio: 65-75% healthy, <55% collection issues
- 1-call close rate: 40-60% typical, 70%+ strong
- Avg calls to close: 1.5-2.5 efficient, 3+ slow
- Objection resolution: 50-65% average, 75%+ strong

ANALYSIS INSTRUCTIONS:
1. TREND DETECTION: If PREVIOUS PERIOD or LAST 90 DAYS data is provided, compare CURRENT PERIOD metrics to the PREVIOUS (older) period. PREVIOUS PERIOD is the OLDER data — CURRENT PERIOD (the main TEAM METRICS) is the NEWER data. If a metric went from 13% (previous) to 21% (current), that is INCREASING/IMPROVING, not declining. Double-check your math: current > previous = improving, current < previous = declining. Flag any metric that moved more than 5 percentage points or 10%.
2. MARKET INTELLIGENCE: If painsThemes/goalsThemes are provided, analyze what prospects actually care about. Look for dominant pain points, emerging themes. ONLY include scriptGaps if the data contains a section called "painsScriptAlignment" or "goalsScriptAlignment" or "CLIENT SCRIPT TEMPLATE". If NONE of those exist in the data, set scriptGaps to [] and do NOT mention scripts, script alignment, or script gaps anywhere in your output — not in executiveSummary, not in priorityActions, not in closerCoaching, nowhere.
3. CROSS-DOMAIN CONNECTIONS: Connect the dots across domains. Only reference scripts if script data is actually present. If prospects mention a pain, that's a coaching opportunity regardless.
4. If CLIENT KPI TARGETS are provided, compare actual performance against them first.
5. SCRIPT RULE: Search the metrics data for "SCRIPT TEMPLATE" or "scriptAlignment". If neither string appears, this client has NO script. Do not reference scripts at all.

Return ONLY valid JSON matching this exact schema (no markdown, no backticks, no explanation outside the JSON):
{
  "executiveSummary": "5-8 sentence executive summary covering: current performance snapshot, key trend direction, most important market intelligence finding, and the single highest-leverage change. Name closers and cite specific numbers.",
  "summaryStats": {
    "totalRevenue": <number>,
    "teamCloseRate": "<string like '22%'>",
    "callsAnalyzed": <number>,
    "insightsGenerated": <number — count of priorityActions>,
    "highPriorityCount": <number — count of high priority actions>
  },
  "trendAnalysis": [
    {
      "metric": "<metric name like 'Close Rate' or 'Revenue'>",
      "current": "<formatted current value>",
      "previous": "<formatted previous period value>",
      "direction": "up|down|stable",
      "changePercent": <number>,
      "insight": "<1-2 sentence explanation of what this trend means for the business>"
    }
  ],
  "marketIntelligence": {
    "topPains": [
      { "theme": "<pain theme>", "count": <number>, "percentage": <number> }
    ],
    "topGoals": [
      { "theme": "<goal theme>", "count": <number>, "percentage": <number> }
    ],
    "scriptGaps": [
      { "finding": "<what the gap is>", "recommendation": "<how to fix it>" }
    ]
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
  "closerCoaching": [
    {
      "closerId": "<closer_id>",
      "name": "<closer name>",
      "status": "strong|improving|declining|needs-coaching — USE the Close Rate Change column from PER-CLOSER STATS to determine improving vs declining",
      "keyFinding": "<one sentence — cite the EXACT close rate from the PER-CLOSER STATS table, the EXACT prev close rate, and the EXACT change direction>",
      "recommendation": "<one sentence coaching action>"
    }
  ],
  "closerQuickView": [
    {
      "closerId": "<closer_id>",
      "name": "<closer name>",
      "closeRate": "<MUST match the Close Rate from PER-CLOSER STATS table exactly, as decimal like 0.22>",
      "revenue": "<MUST match Revenue from PER-CLOSER STATS table>",
      "showRate": "<MUST match Show Rate from PER-CLOSER STATS table, as decimal>",
      "adherence": "<MUST match Script Adherence from PER-CLOSER STATS table>",
      "status": "strong|average|needs-coaching"
    }
  ]
}

Generate 6-8 priorityActions spanning performance, trends, market intelligence, and coaching. Include trendAnalysis only if historical data is provided (otherwise empty array). Include marketIntelligence only if theme data is provided (otherwise null). CRITICAL: scriptGaps MUST be [] if no "SCRIPT TEMPLATE" or "scriptAlignment" appears in the metrics — NEVER fabricate script findings. For closerCoaching trend direction: if current metric > previous metric, that is "improving" not "declining". Include closerCoaching for ALL closers. Include ALL closers in closerQuickView. Be specific — name closers and cite exact numbers.`,

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

Be specific with numbers. Compare to both team average AND industry benchmarks. Look at the full profile — don't just list what's above and below average. Find what's interesting: where do this closer's numbers not tell a coherent story compared to the team? What does their combination of metrics suggest about how they actually sell?

CRITICAL: Copy all numbers (close rate, show rate, revenue, etc.) EXACTLY as they appear in the data. Do NOT round, estimate, or derive your own values. If the data says 21.0% close rate, say 21.0% — not 16.9%, not 20%.`,
  },
};
