/**
 * INSIGHT ENGINE SERVICE — Backend AI Per-Page Insights
 *
 * Mirrors Frontend/server/services/insightEngine.js but uses the Backend's
 * aiClient (which has ANTHROPIC_API_KEY). The dashboard proxies to this
 * so AI keys don't need to be on the client-facing service.
 */

const crypto = require('crypto');
const config = require('../config');
const insightConfig = require('../config/insight-engine');
const logger = require('../utils/logger');
const { callAI } = require('./ai/aiClient');

// ── In-memory cache ──────────────────────────────────────────────────
const cache = new Map();

function hashMetrics(metrics) {
  const stable = JSON.stringify(metrics, Object.keys(metrics).sort());
  return crypto.createHash('md5').update(stable).digest('hex').slice(0, 12);
}

function pruneCache() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

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

  if (closerProfiles && Object.keys(closerProfiles).length > 0) {
    const profilesJson = JSON.stringify(closerProfiles, null, 2);
    prompt += insightConfig.closerProfilesPrompt.replace('{{closerProfiles}}', profilesJson);
  }

  if (kpiTargets && Object.keys(kpiTargets).length > 0) {
    const targetsJson = JSON.stringify(kpiTargets, null, 2);
    prompt += insightConfig.kpiTargetsPrompt.replace('{{kpiTargets}}', targetsJson);
  }

  return prompt;
}

async function generateInsight(clientId, section, metrics, options = {}) {
  if (!metrics || Object.keys(metrics).length === 0) {
    return { text: '' };
  }

  if (!isAvailable()) {
    throw new Error('No AI API key configured');
  }

  if (!insightConfig.sectionPrompts[section]) {
    throw new Error(`Unknown insight section: ${section}`);
  }

  const isDataAnalysis = section.startsWith('data-analysis-');
  const model = options.modelOverride
    || (isDataAnalysis ? insightConfig.dataAnalysisModel : insightConfig.model);
  const maxTokens = options.maxTokensOverride
    || (isDataAnalysis ? insightConfig.dataAnalysisMaxTokens : insightConfig.maxTokens);

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

  const systemPrompt = isDataAnalysis
    ? 'You are a high-ticket sales analytics advisor. You return structured JSON analysis. Follow the schema exactly. Do NOT wrap output in markdown code fences.'
    : insightConfig.systemPrompt;

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

  let json = null;
  if (isDataAnalysis) {
    const cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    try {
      json = JSON.parse(cleaned);
    } catch (parseErr) {
      logger.warn('Data analysis JSON parse failed, retrying', {
        clientId, section, error: parseErr.message,
      });
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
      json = JSON.parse(retryCleaned);
      text = retryCleaned;
    }
  }

  cache.set(cacheKey, { text, json, expiresAt: Date.now() + cacheTtlMs });

  const tokensUsed = response.outputTokens || 0;
  logger.info('Insight AI success', { clientId, section, textLength: text.length, tokensUsed, isDataAnalysis });

  return { text, json, model, tokensUsed };
}

function isAvailable() {
  return Boolean(config.ai.apiKey || config.ai.openaiApiKey || config.ai.googleAiApiKey);
}

module.exports = { generateInsight, isAvailable };
