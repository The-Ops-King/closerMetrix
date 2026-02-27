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

let anthropicClient = null;

/**
 * Lazy-initialize the Anthropic client.
 * Returns null if no API key is configured.
 */
function getClient() {
  if (anthropicClient) return anthropicClient;
  if (!config.anthropicApiKey) return null;

  const Anthropic = require('@anthropic-ai/sdk');
  anthropicClient = new Anthropic({ apiKey: config.anthropicApiKey });
  return anthropicClient;
}

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
function buildPrompt(section, metrics, priorInsights, closerProfiles) {
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
 * @returns {Promise<{ text: string, model: string, tokensUsed: number }>} AI-generated insight text + metadata
 * @throws {Error} If API key is missing or AI call fails
 */
async function generateInsight(clientId, section, metrics, options = {}) {
  if (!metrics || Object.keys(metrics).length === 0) {
    return { text: '' };
  }

  const client = getClient();
  if (!client) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  // Validate section has a prompt template
  if (!insightConfig.sectionPrompts[section]) {
    throw new Error(`Unknown insight section: ${section}`);
  }

  // Check cache (skip if force refresh)
  const cacheTtlMs = insightConfig.cacheTtlMinutes * 60 * 1000;
  pruneCache();
  const cacheKey = `${clientId}:${section}:${hashMetrics(metrics)}`;
  if (!options.force) {
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      logger.debug('Insight cache hit', { clientId, section, key: cacheKey });
      return { text: cached.text };
    }
  }

  const prompt = buildPrompt(section, metrics, options.priorInsights, options.closerProfiles);

  logger.info('Insight AI request', { clientId, section });

  const response = await client.messages.create({
    model: insightConfig.model,
    max_tokens: insightConfig.maxTokens,
    system: insightConfig.systemPrompt,
    messages: [{ role: 'user', content: prompt }],
  });

  // Extract text from response
  const text = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
    .trim();

  if (!text) {
    throw new Error('AI returned empty insight text');
  }

  // Cache result
  cache.set(cacheKey, { text, expiresAt: Date.now() + cacheTtlMs });

  const tokensUsed = response.usage?.output_tokens || 0;
  logger.info('Insight AI success', { clientId, section, textLength: text.length, tokensUsed });

  return { text, model: insightConfig.model, tokensUsed };
}

/**
 * Check whether the Insight Engine is available (API key configured).
 */
function isAvailable() {
  return Boolean(config.anthropicApiKey);
}

module.exports = { generateInsight, isAvailable };
