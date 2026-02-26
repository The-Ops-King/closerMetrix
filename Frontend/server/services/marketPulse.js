/**
 * MARKET PULSE SERVICE — AI Theme Condensing
 *
 * Uses Claude Sonnet to cluster raw pain/goal texts from prospect calls
 * into ranked themes with counts. E.g., "100 people said X, 50 said Y".
 *
 * Features:
 *   - Lazy-init Anthropic client (only created when first called)
 *   - In-memory cache with 1-hour TTL keyed by clientId:type:hash(texts)
 *   - 500-text cap to keep prompt under ~12K tokens
 *   - Returns [{theme, count}] sorted by count desc
 */

const crypto = require('crypto');
const config = require('../config');
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
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Generate a short hash of the texts array for cache keying.
 * Two identical text sets produce the same key, even if order differs.
 */
function hashTexts(texts) {
  // Sort for determinism, then hash
  const sorted = [...texts].sort();
  return crypto.createHash('md5').update(sorted.join('\n')).digest('hex').slice(0, 12);
}

/**
 * Clean expired entries from the cache.
 * Called lazily — no timer needed for a single-server in-memory cache.
 */
function pruneCache() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

// ── Core API ─────────────────────────────────────────────────────────

/**
 * Condense raw texts into ranked themes using Claude Sonnet.
 *
 * @param {string} clientId - Client ID (for cache key + logging)
 * @param {'pains'|'goals'} type - Whether these are pain or goal statements
 * @param {string[]} texts - Raw text strings from individual calls
 * @returns {Promise<{theme: string, count: number}[]>} Ranked themes
 * @throws {Error} If API key is missing or AI call fails
 */
async function condenseTexts(clientId, type, texts) {
  if (!texts || texts.length === 0) return [];

  const client = getClient();
  if (!client) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  // Cap at 500 texts to keep prompt reasonable
  const capped = texts.slice(0, 500);

  // Check cache
  pruneCache();
  const cacheKey = `${clientId}:${type}:${hashTexts(capped)}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    logger.debug('Market Pulse cache hit', { clientId, type, key: cacheKey });
    return cached.themes;
  }

  // Build prompt
  const typeLabel = type === 'pains' ? 'pain points / problems' : 'goals / desired outcomes';
  const numberedList = capped.map((t, i) => `${i + 1}. ${t}`).join('\n');

  const prompt = `You are analyzing ${capped.length} raw ${typeLabel} statements extracted from sales calls for a business.

Your job: group these into 5-15 distinct themes, counting how many statements belong to each theme.

Rules:
- Keep the prospect's actual voice/phrasing — don't corporate-ify it
- Merge semantically similar statements (e.g., "more family time" = "spend time with kids")
- Each theme label should be a short phrase (3-10 words) that a marketer could use
- Sort by count descending (most common first)
- Every input statement must be counted in exactly one theme

Respond with ONLY a JSON array, no other text:
[{"theme": "string", "count": number}, ...]

Here are the statements:
${numberedList}`;

  logger.info('Market Pulse AI request', { clientId, type, textCount: capped.length });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  // Parse the response — extract JSON from the text content
  const responseText = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');

  let themes;
  try {
    // Try direct parse first, then extract from markdown code block
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

  // Validate shape
  if (!Array.isArray(themes) || themes.length === 0) {
    throw new Error('AI returned empty or invalid themes');
  }

  // Ensure proper shape and sort by count desc
  themes = themes
    .filter(t => t && typeof t.theme === 'string' && typeof t.count === 'number')
    .sort((a, b) => b.count - a.count);

  // Cache result
  cache.set(cacheKey, { themes, expiresAt: Date.now() + CACHE_TTL_MS });
  logger.info('Market Pulse AI success', { clientId, type, themeCount: themes.length });

  return themes;
}

/**
 * Check whether the Market Pulse service is available.
 * Returns false if no API key is configured.
 */
function isAvailable() {
  return Boolean(config.anthropicApiKey);
}

module.exports = { condenseTexts, isAvailable };
