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
const { callAI } = require('./aiClient');

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

  if (!isAvailable()) {
    throw new Error('No AI API key configured');
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
  const aiProvider = options.aiProvider || 'claude';

  logger.info('Market Pulse AI request', { clientId, type, textCount: capped.length, aiProvider });

  const response = await callAI({
    provider: aiProvider,
    systemPrompt: pulseConfig.systemPrompt,
    userMessage: prompt,
    model: pulseConfig.model,
    maxTokens: pulseConfig.maxTokens,
    clientId,
  });

  const responseText = response.text;

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
 * Compare clustered prospect themes against the client's script template.
 *
 * @param {string} clientId - Client ID (for logging)
 * @param {'pains'|'goals'} type - Theme type
 * @param {Array<{theme: string, count: number}>} themes - Clustered themes from condenseTexts
 * @param {string} scriptTemplate - The client's sales script
 * @returns {Promise<{addressed: Array, gaps: Array, unused: Array}>}
 */
async function compareWithScript(clientId, type, themes, scriptTemplate) {
  if (!themes || themes.length === 0 || !scriptTemplate) return { addressed: [], gaps: [], unused: [] };

  if (!isAvailable()) throw new Error('No AI API key configured');

  const themesText = themes.map((t, i) => `${i + 1}. "${t.theme}" (mentioned ${t.count} times)`).join('\n');
  const typeLabel = pulseConfig.typeLabels[type] || type;

  const prompt = pulseConfig.scriptComparisonPrompt
    .replace('{{type}}', typeLabel)
    .replace('{{themes}}', themesText)
    .replace('{{scriptTemplate}}', scriptTemplate);

  const aiProvider = arguments[4] || 'claude'; // 5th arg = aiProvider

  logger.info('Market Pulse script comparison request', { clientId, type, themeCount: themes.length, aiProvider });

  const response = await callAI({
    provider: aiProvider,
    systemPrompt: pulseConfig.scriptComparisonSystemPrompt,
    userMessage: prompt,
    model: pulseConfig.scriptComparisonModel,
    maxTokens: pulseConfig.scriptComparisonMaxTokens,
    clientId,
  });

  const responseText = response.text;

  let result;
  try {
    const jsonStr = responseText.includes('{')
      ? responseText.slice(responseText.indexOf('{'), responseText.lastIndexOf('}') + 1)
      : responseText;
    result = JSON.parse(jsonStr);
  } catch (parseErr) {
    logger.error('Script comparison parse error', { clientId, type, error: parseErr.message });
    throw new Error('Failed to parse script comparison response');
  }

  return {
    addressed: Array.isArray(result.addressed) ? result.addressed : [],
    gaps: Array.isArray(result.gaps) ? result.gaps : [],
    unused: Array.isArray(result.unused) ? result.unused : [],
  };
}

/**
 * Check whether the Market Pulse service is available.
 */
function isAvailable() {
  return Boolean(config.anthropicApiKey || config.openaiApiKey || config.googleAiApiKey);
}

module.exports = { condenseTexts, compareWithScript, isAvailable };
