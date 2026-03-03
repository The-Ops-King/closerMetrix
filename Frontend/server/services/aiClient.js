/**
 * UNIFIED AI CLIENT — Multi-Provider Abstraction
 *
 * Routes AI calls to Claude (Anthropic), ChatGPT (OpenAI), or Gemini (Google)
 * based on the client's ai_provider setting.
 *
 * Each provider SDK is lazy-initialized on first use. Returns a normalized
 * { text, inputTokens, outputTokens } regardless of provider.
 *
 * Usage:
 *   const { callAI } = require('./aiClient');
 *   const result = await callAI({ provider: 'chatgpt', systemPrompt, userMessage });
 */

const config = require('../config');
const logger = require('../utils/logger');

// ── Rate Limiter: 10 AI calls per client per hour (across all providers) ──
const MAX_CALLS_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;
const rateLimitMap = new Map(); // clientId → [timestamp, timestamp, ...]

function checkRateLimit(clientId) {
  if (!clientId) return; // skip if no clientId (e.g. admin/system calls)
  const now = Date.now();
  const cutoff = now - HOUR_MS;
  let timestamps = rateLimitMap.get(clientId) || [];
  timestamps = timestamps.filter(t => t > cutoff); // prune old entries
  if (timestamps.length >= MAX_CALLS_PER_HOUR) {
    const oldestValid = timestamps[0];
    const retryAfterSec = Math.ceil((oldestValid + HOUR_MS - now) / 1000);
    throw new Error(`AI rate limit exceeded: ${MAX_CALLS_PER_HOUR} calls/hour. Try again in ${retryAfterSec}s.`);
  }
  timestamps.push(now);
  rateLimitMap.set(clientId, timestamps);
}

// Clean up stale entries every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - HOUR_MS;
  for (const [key, timestamps] of rateLimitMap) {
    const filtered = timestamps.filter(t => t > cutoff);
    if (filtered.length === 0) rateLimitMap.delete(key);
    else rateLimitMap.set(key, filtered);
  }
}, 10 * 60 * 1000).unref();

// Lazy-init singletons
let anthropicClient = null;
let openaiClient = null;
let geminiClient = null;

const MODEL_DEFAULTS = {
  claude: 'claude-sonnet-4-20250514',
  chatgpt: 'gpt-4o',
  gemini: 'gemini-2.0-flash',
};

function getAnthropicClient() {
  if (anthropicClient) return anthropicClient;
  if (!config.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const Anthropic = require('@anthropic-ai/sdk');
  anthropicClient = new Anthropic({ apiKey: config.anthropicApiKey });
  return anthropicClient;
}

function getOpenAIClient() {
  if (openaiClient) return openaiClient;
  if (!config.openaiApiKey) throw new Error('OPENAI_API_KEY not configured');
  const OpenAI = require('openai');
  openaiClient = new OpenAI({ apiKey: config.openaiApiKey });
  return openaiClient;
}

function getGeminiModel(model) {
  if (!config.googleAiApiKey) throw new Error('GOOGLE_AI_API_KEY not configured');
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  if (!geminiClient) {
    geminiClient = new GoogleGenerativeAI(config.googleAiApiKey);
  }
  return geminiClient.getGenerativeModel({ model: model || MODEL_DEFAULTS.gemini });
}

/**
 * Call an AI provider with a unified interface.
 *
 * @param {object} opts
 * @param {string} [opts.provider='claude'] - 'claude' | 'chatgpt' | 'gemini'
 * @param {string} opts.systemPrompt - System-level instruction
 * @param {string} opts.userMessage - User message / prompt content
 * @param {string} [opts.model] - Override the default model for the provider
 * @param {number} [opts.maxTokens=4096] - Max output tokens
 * @returns {Promise<{ text: string, inputTokens: number, outputTokens: number }>}
 */
async function callAI({ provider = 'claude', systemPrompt, userMessage, model, maxTokens = 4096, clientId = null }) {
  // Enforce rate limit before making the API call
  checkRateLimit(clientId);

  const startTime = Date.now();

  try {
    let result;

    switch (provider) {
      case 'claude':
        result = await _callClaude({ systemPrompt, userMessage, model, maxTokens });
        break;
      case 'chatgpt':
        result = await _callChatGPT({ systemPrompt, userMessage, model, maxTokens });
        break;
      case 'gemini':
        result = await _callGemini({ systemPrompt, userMessage, model, maxTokens });
        break;
      default:
        logger.warn('Unknown AI provider, falling back to claude', { provider });
        result = await _callClaude({ systemPrompt, userMessage, model, maxTokens });
    }

    logger.debug('AI call complete', {
      provider,
      model: model || MODEL_DEFAULTS[provider] || MODEL_DEFAULTS.claude,
      ms: Date.now() - startTime,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });

    return result;
  } catch (err) {
    logger.error('AI call failed', { provider, error: err.message });
    throw err;
  }
}

async function _callClaude({ systemPrompt, userMessage, model, maxTokens }) {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: model || MODEL_DEFAULTS.claude,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
    .trim();

  return {
    text,
    inputTokens: response.usage?.input_tokens || 0,
    outputTokens: response.usage?.output_tokens || 0,
  };
}

async function _callChatGPT({ systemPrompt, userMessage, model, maxTokens }) {
  const client = getOpenAIClient();
  const response = await client.chat.completions.create({
    model: model || MODEL_DEFAULTS.chatgpt,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  });

  const text = (response.choices?.[0]?.message?.content || '').trim();

  return {
    text,
    inputTokens: response.usage?.prompt_tokens || 0,
    outputTokens: response.usage?.completion_tokens || 0,
  };
}

async function _callGemini({ systemPrompt, userMessage, model, maxTokens }) {
  const genModel = getGeminiModel(model);
  const response = await genModel.generateContent({
    contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userMessage}` }] }],
    generationConfig: { maxOutputTokens: maxTokens },
  });

  const result = response.response;
  const text = (result.text() || '').trim();

  // Gemini usage metadata
  const usage = result.usageMetadata || {};

  return {
    text,
    inputTokens: usage.promptTokenCount || 0,
    outputTokens: usage.candidatesTokenCount || 0,
  };
}

module.exports = { callAI, MODEL_DEFAULTS };
