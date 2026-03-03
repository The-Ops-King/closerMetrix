/**
 * INSIGHT ENGINE SERVICE — AI Per-Page Insight Cards
 *
 * Uses Claude Sonnet to generate 2-4 sentence insights about team
 * performance for each dashboard page. Follows the Market Pulse pattern:
 * lazy client init, in-memory cache with MD5 hash keys, graceful degradation.
 *
 * All tunable settings live in config/insightEngine.js — prompts, model,
 * cache TTL, section templates.
 */

const crypto = require('crypto');
const config = require('../config');
const insightConfig = require('../config/insightEngine');
const logger = require('../utils/logger');
const { callAI } = require('./aiClient');

// ── In-memory cache ──────────────────────────────────────────────────
// Key: "clientId:section:hash" → { text, expiresAt }
const cache = new Map();

/**
 * Generate a short MD5 hash of the metrics object for cache keying.
 * Same metrics input = same cache key, regardless of property order.
 */
function hashMetrics(metrics) {
  const stable = JSON.stringify(metrics, Object.keys(metrics).sort());
  return crypto.createHash('md5').update(stable).digest('hex').slice(0, 12);
}

/**
 * Clean expired entries from the cache.
 */
function pruneCache() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

/**
 * Build the user prompt for a given section.
 * Replaces {{metrics}} and {{dateRange}} in the section template.
 * When priorInsights are provided, appends the trend-awareness block.
 *
 * @param {string} section
 * @param {object} metrics
 * @param {Array<{ text: string, generatedAt: string }>} [priorInsights]
 * @param {object} [closerProfiles] - Cross-section closer profiles for holistic analysis
 */
function buildPrompt(section, metrics, priorInsights, closerProfiles, kpiTargets) {
  const template = insightConfig.sectionPrompts[section];
  if (!template) {
    throw new Error(`No insight prompt template for section: ${section}`);
  }

  const dateRange = metrics.dateRange || 'the selected period';
  const metricsJson = JSON.stringify(metrics, null, 2);

  let prompt = template
    .replace('{{dateRange}}', dateRange)
    .replace('{{metrics}}', metricsJson);

  // Append prior insights for trend awareness
  if (priorInsights && priorInsights.length > 0) {
    const priorBlock = priorInsights
      .map(p => {
        const date = p.generatedAt
          ? new Date(p.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : 'Unknown date';
        return `[${date}]: "${p.text}"`;
      })
      .join('\n\n');

    prompt += insightConfig.priorInsightsPrompt.replace('{{priorInsights}}', priorBlock);
  }

  // Append cross-section closer profiles for holistic analysis
  if (closerProfiles && Object.keys(closerProfiles).length > 0) {
    const profilesJson = JSON.stringify(closerProfiles, null, 2);
    prompt += insightConfig.closerProfilesPrompt.replace('{{closerProfiles}}', profilesJson);
  }

  // Append KPI targets for goal-aware analysis
  if (kpiTargets && Object.keys(kpiTargets).length > 0) {
    const targetsJson = JSON.stringify(kpiTargets, null, 2);
    prompt += insightConfig.kpiTargetsPrompt.replace('{{kpiTargets}}', targetsJson);
  }

  return prompt;
}

// ── Core API ─────────────────────────────────────────────────────────

/**
 * Generate an AI insight for a dashboard page section.
 *
 * @param {string} clientId - Client ID (for cache key + logging)
 * @param {string} section - Dashboard section name (e.g. 'financial', 'overview')
 * @param {object} metrics - Compact metrics snapshot from the page
 * @param {object} [options] - Options
 * @param {boolean} [options.force] - Skip cache and force fresh AI call
 * @param {Array<{ text: string, generatedAt: string }>} [options.priorInsights] - Prior insights for trend context
 * @param {string} [options.modelOverride] - Override the default model (e.g. for Opus on data-analysis)
 * @param {number} [options.maxTokensOverride] - Override the default max tokens
 * @returns {Promise<{ text: string, json: object|null, model: string, tokensUsed: number }>} AI-generated insight + metadata
 * @throws {Error} If API key is missing or AI call fails
 */
async function generateInsight(clientId, section, metrics, options = {}) {
  if (!metrics || Object.keys(metrics).length === 0) {
    return { text: '' };
  }

  if (!isAvailable()) {
    throw new Error('No AI API key configured');
  }

  // Validate section has a prompt template
  if (!insightConfig.sectionPrompts[section]) {
    throw new Error(`Unknown insight section: ${section}`);
  }

  // Determine model + maxTokens (data-analysis sections use Opus)
  const isDataAnalysis = section.startsWith('data-analysis-');
  const model = options.modelOverride
    || (isDataAnalysis ? insightConfig.dataAnalysisModel : insightConfig.model);
  const maxTokens = options.maxTokensOverride
    || (isDataAnalysis ? insightConfig.dataAnalysisMaxTokens : insightConfig.maxTokens);

  // Check cache (skip if force refresh)
  const cacheTtlMs = insightConfig.cacheTtlMinutes * 60 * 1000;
  pruneCache();
  const cacheKey = `${clientId}:${section}:${hashMetrics(metrics)}`;
  if (!options.force) {
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      logger.debug('Insight cache hit', { clientId, section, key: cacheKey });
      return { text: cached.text, json: cached.json || null };
    }
  }

  const prompt = buildPrompt(section, metrics, options.priorInsights, options.closerProfiles, options.kpiTargets);

  logger.info('Insight AI request', { clientId, section });

  // Use the data-analysis system prompt for structured JSON sections
  const systemPrompt = isDataAnalysis
    ? 'You are a high-ticket sales analytics advisor. You return structured JSON analysis. Follow the schema exactly. Do NOT wrap output in markdown code fences.'
    : insightConfig.systemPrompt;

  // Determine AI provider (passed via options from dashboard route)
  const aiProvider = options.aiProvider || 'claude';

  let response = await callAI({
    provider: aiProvider,
    systemPrompt,
    userMessage: prompt,
    model,
    maxTokens,
    clientId,
  });

  let text = response.text;

  if (!text) {
    throw new Error('AI returned empty insight text');
  }

  // For data-analysis sections, parse JSON response (with retry on failure)
  let json = null;
  if (isDataAnalysis) {
    // Strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    try {
      json = JSON.parse(cleaned);
    } catch (parseErr) {
      logger.warn('Data analysis JSON parse failed, retrying', {
        clientId, section, error: parseErr.message,
      });
      // Retry: ask the model to fix its JSON
      const retryResponse = await callAI({
        provider: aiProvider,
        systemPrompt: 'You previously returned invalid JSON. Fix it and return ONLY valid JSON — no markdown fences, no explanation.',
        userMessage: `Original request:\n${prompt}\n\nYour previous response:\n${text}\n\nThat was not valid JSON. Please return ONLY the corrected JSON object.`,
        model,
        maxTokens,
        clientId,
      });
      const retryText = retryResponse.text;
      const retryCleaned = retryText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      json = JSON.parse(retryCleaned); // Let it throw if still invalid
      text = retryCleaned;
    }
  }

  // Cache result
  cache.set(cacheKey, { text, json, expiresAt: Date.now() + cacheTtlMs });

  const tokensUsed = response.outputTokens || 0;
  logger.info('Insight AI success', { clientId, section, textLength: text.length, tokensUsed, isDataAnalysis });

  return { text, json, model, tokensUsed };
}

/**
 * Check whether the Insight Engine is available (API key configured).
 */
function isAvailable() {
  return Boolean(config.anthropicApiKey || config.openaiApiKey || config.googleAiApiKey);
}

module.exports = { generateInsight, isAvailable };
