/**
 * MARKET PULSE SERVICE — AI Theme Condensing
 *
 * Uses Claude Sonnet to cluster raw pain/goal texts from prospect calls
 * into ranked themes with counts. E.g., "100 people said X, 50 said Y".
 *
 * All tunable settings live in config/marketPulse.js — prompts, model,
 * cache TTL, text limits, theme counts, colors.
 */

const crypto = require('crypto');
const config = require('../config');
const pulseConfig = require('../config/marketPulse');
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
// Key: "clientId:type:hash" → { themes: [...], expiresAt: timestamp }
const cache = new Map();

/**
 * Generate a short hash of the texts array for cache keying.
 * Two identical text sets produce the same key, even if order differs.
 */
function hashTexts(texts) {
  const sorted = [...texts].sort();
  return crypto.createHash('md5').update(sorted.join('\n')).digest('hex').slice(0, 12);
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
 * Build the user prompt from the template in config.
 * Replaces {{variables}} with actual values.
 */
function buildPrompt(type, texts) {
  const typeLabel = pulseConfig.typeLabels[type] || type;
  const numberedList = texts.map((t, i) => `${i + 1}. ${t}`).join('\n');

  return pulseConfig.userPromptTemplate
    .replace('{{count}}', texts.length)
    .replace('{{typeLabel}}', typeLabel)
    .replace('{{minThemes}}', pulseConfig.minThemes)
    .replace('{{maxThemes}}', pulseConfig.maxThemes)
    .replace('{{statements}}', numberedList);
}

// ── Core API ─────────────────────────────────────────────────────────

/**
 * Condense raw texts into ranked themes using Claude Sonnet.
 *
 * @param {string} clientId - Client ID (for cache key + logging)
 * @param {'pains'|'goals'} type - Whether these are pain or goal statements
 * @param {string[]} texts - Raw text strings from individual calls
 * @param {object} [options] - Options
 * @param {boolean} [options.force] - Skip cache and force fresh AI call
 * @returns {Promise<{theme: string, count: number}[]>} Ranked themes
 * @throws {Error} If API key is missing or AI call fails
 */
async function condenseTexts(clientId, type, texts, options = {}) {
  if (!texts || texts.length === 0) return [];

  const client = getClient();
  if (!client) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  // Cap texts using config limit
  const capped = texts.slice(0, pulseConfig.maxTexts);

  // Check cache (skip if force refresh)
  const cacheTtlMs = pulseConfig.cacheTtlMinutes * 60 * 1000;
  pruneCache();
  const cacheKey = `${clientId}:${type}:${hashTexts(capped)}`;
  if (!options.force) {
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      logger.debug('Market Pulse cache hit', { clientId, type, key: cacheKey });
      return cached.themes;
    }
  }

  const prompt = buildPrompt(type, capped);

  logger.info('Market Pulse AI request', { clientId, type, textCount: capped.length });

  const response = await client.messages.create({
    model: pulseConfig.model,
    max_tokens: pulseConfig.maxTokens,
    system: pulseConfig.systemPrompt,
    messages: [{ role: 'user', content: prompt }],
  });

  // Parse the response — extract JSON from the text content
  const responseText = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');

  let themes;
  try {
    const jsonStr = responseText.includes('[')
      ? responseText.slice(responseText.indexOf('['), responseText.lastIndexOf(']') + 1)
      : responseText;
    themes = JSON.parse(jsonStr);
  } catch (parseErr) {
    logger.error('Market Pulse parse error', {
      clientId, type,
      response: responseText.slice(0, 200),
      error: parseErr.message,
    });
    throw new Error('Failed to parse AI response');
  }

  if (!Array.isArray(themes) || themes.length === 0) {
    throw new Error('AI returned empty or invalid themes');
  }

  // Ensure proper shape and sort by count desc
  themes = themes
    .filter(t => t && typeof t.theme === 'string' && typeof t.count === 'number')
    .sort((a, b) => b.count - a.count);

  // Cache result
  cache.set(cacheKey, { themes, expiresAt: Date.now() + cacheTtlMs });
  logger.info('Market Pulse AI success', { clientId, type, themeCount: themes.length });

  return themes;
}

/**
 * Check whether the Market Pulse service is available.
 */
function isAvailable() {
  return Boolean(config.anthropicApiKey);
}

module.exports = { condenseTexts, isAvailable };
