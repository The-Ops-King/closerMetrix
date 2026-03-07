/**
 * EMAIL INSIGHT GENERATOR
 *
 * Uses Claude AI to generate narrative insights for each email report section.
 * One API call per report (not per section) to minimize cost.
 *
 * Input:  Report data object (same shape as testData.js, minus insights)
 * Output: { overview: "...", financial: "...", ... } keyed by section name
 */

const { callAI } = require('../ai/aiClient');
const logger = require('../../utils/logger');

/**
 * Generates AI insights for all sections of an email report.
 *
 * @param {Object} data - The full report data (from EmailDataFetcher)
 * @param {string[]} sections - Which sections to generate insights for
 * @returns {Object} Insights keyed by section name
 */
async function generateInsights(data, sections = []) {
  const allSections = [
    'overview', 'financial', 'attendance', 'callOutcomes',
    'salesCycle', 'objections', 'marketInsight', 'violations', 'leaderboard',
  ];
  const targetSections = sections.length > 0
    ? sections.filter(s => allSections.includes(s))
    : allSections;

  // Build the data payload for AI — only include requested sections
  const sectionData = {};
  for (const section of targetSections) {
    if (data[section]) sectionData[section] = data[section];
  }
  if (data.closerLeaderboard) sectionData.closerLeaderboard = data.closerLeaderboard;
  if (data.alerts) sectionData.alerts = data.alerts;

  const systemPrompt = buildSystemPrompt(data.company_name, data.report_type, data.report_period, data.prev_period);
  const userMessage = buildUserMessage(sectionData, targetSections);

  try {
    logger.info('EmailInsightGenerator: Generating insights', {
      company: data.company_name,
      reportType: data.report_type,
      sectionCount: targetSections.length,
    });

    const result = await callAI({
      provider: 'claude',
      systemPrompt,
      userMessage,
      maxTokens: 4000,
    });

    // Parse JSON response
    const insights = parseInsightsResponse(result.text, targetSections);

    logger.info('EmailInsightGenerator: Insights generated', {
      company: data.company_name,
      sectionsGenerated: Object.keys(insights).length,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });

    return insights;
  } catch (error) {
    logger.error('EmailInsightGenerator: Failed to generate insights', {
      company: data.company_name,
      error: error.message,
    });
    // Return empty insights — the template handles missing insights gracefully
    return {};
  }
}

/**
 * Builds the system prompt for insight generation.
 */
function buildSystemPrompt(companyName, reportType, currentPeriod, prevPeriod) {
  return `You are a sales performance analyst writing insights for ${companyName}'s ${reportType} email report.

Period: ${currentPeriod.label} compared to ${prevPeriod.label}.

Your job is to write 2-3 sentence narrative insights for each section of the report. Your insights should:
- Call out specific closers by name (top and bottom performers) when leaderboard data is available
- Reference specific numbers and percentage changes
- Provide actionable takeaways
- Be written in a direct, conversational tone — like a sharp sales manager talking to the team owner
- Highlight what's working and what needs attention
- Be concise — no fluff, no generic motivational language

Return ONLY valid JSON with no markdown fences. The format must be:
{
  "overview": "2-3 sentence insight...",
  "financial": "2-3 sentence insight...",
  ...
}

Include a key for every section requested. If there's insufficient data for a section, write a brief note saying so.`;
}

/**
 * Builds the user message with all section data.
 */
function buildUserMessage(sectionData, sections) {
  let message = 'Here is the data for each section. Write insights for: ' + sections.join(', ') + '\n\n';
  message += JSON.stringify(sectionData, null, 2);
  return message;
}

/**
 * Parses the AI response into a clean insights object.
 * Handles JSON wrapped in markdown fences, partial responses, etc.
 */
function parseInsightsResponse(text, expectedSections) {
  // Strip markdown fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    const parsed = JSON.parse(cleaned);
    // Validate it's an object with string values
    const insights = {};
    for (const section of expectedSections) {
      if (typeof parsed[section] === 'string') {
        insights[section] = parsed[section];
      }
    }
    return insights;
  } catch (error) {
    logger.warn('EmailInsightGenerator: Failed to parse AI response as JSON', {
      error: error.message,
      responsePreview: text.slice(0, 200),
    });
    return {};
  }
}

module.exports = { generateInsights };
