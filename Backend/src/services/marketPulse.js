/**
 * MARKET PULSE SERVICE — Backend AI Theme Condensing
 *
 * Uses the Backend's aiClient (which has ANTHROPIC_API_KEY) to cluster
 * raw pain/goal texts into ranked themes.
 *
 * This service was moved from Frontend to Backend so AI API keys
 * don't need to be exposed on the client-facing dashboard service.
 */

const crypto = require('crypto');
const pulseConfig = require('../config/market-pulse');
const { callAI } = require('./ai/aiClient');
const logger = require('../utils/logger');
const config = require('../config');

// ── In-memory cache ──────────────────────────────────────────────────
const cache = new Map();

function hashTexts(texts) {
  const sorted = [...texts].sort();
  return crypto.createHash('md5').update(sorted.join('\n')).digest('hex').slice(0, 12);
}

function pruneCache() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

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

/**
 * Condense raw texts into ranked themes using AI.
 */
async function condenseTexts(clientId, type, texts, options = {}) {
  if (!texts || texts.length === 0) return [];

  if (!isAvailable()) {
    throw new Error('No AI API key configured');
  }

  const capped = texts.slice(0, pulseConfig.maxTexts);

  // Check cache
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

  themes = themes
    .filter(t => t && typeof t.theme === 'string' && typeof t.count === 'number')
    .sort((a, b) => b.count - a.count);

  cache.set(cacheKey, { themes, expiresAt: Date.now() + cacheTtlMs });
  logger.info('Market Pulse AI success', { clientId, type, themeCount: themes.length });

  return themes;
}

/**
 * Compare clustered themes against a script template.
 */
async function compareWithScript(clientId, type, themes, scriptTemplate, aiProvider = 'claude') {
  if (!themes || themes.length === 0 || !scriptTemplate) {
    return { addressed: [], gaps: [], unused: [] };
  }

  if (!isAvailable()) throw new Error('No AI API key configured');

  const themesText = themes.map((t, i) => `${i + 1}. "${t.theme}" (mentioned ${t.count} times)`).join('\n');
  const typeLabel = pulseConfig.typeLabels[type] || type;

  const prompt = pulseConfig.scriptComparisonPrompt
    .replace('{{type}}', typeLabel)
    .replace('{{themes}}', themesText)
    .replace('{{scriptTemplate}}', scriptTemplate);

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

function isAvailable() {
  return Boolean(config.ai.apiKey || config.ai.openaiApiKey || config.ai.googleAiApiKey);
}

module.exports = { condenseTexts, compareWithScript, isAvailable };
