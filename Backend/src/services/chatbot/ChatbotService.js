/**
 * CHATBOT SERVICE
 *
 * Orchestrates the AI chatbot conversation loop:
 * 1. Rate-limits per client (30 messages/hour)
 * 2. Sends messages to Claude with tool definitions
 * 3. Executes tool calls in a loop until Claude produces a final text response
 * 4. Stores conversation history in BigQuery (fire-and-forget)
 *
 * Uses the Anthropic SDK directly (not the shared callAI helper) because
 * the chatbot needs multi-turn tool_use support that callAI doesn't provide.
 */

const crypto = require('crypto');
const Anthropic = require('@anthropic-ai/sdk');
const config = require('../../config');
const logger = require('../../utils/logger');
const { buildSystemPrompt } = require('./systemPrompt');
const { getToolDefinitions, executeToolCall } = require('./tools');

// ── Rate Limiter: 30 chat messages per client per hour ──

const MAX_MESSAGES_PER_HOUR = 30;
const HOUR_MS = 60 * 60 * 1000;
const chatRateLimitMap = new Map(); // clientId → [timestamp, ...]

async function checkChatRateLimit(clientId, bq) {
  const now = Date.now();
  const cutoff = now - HOUR_MS;
  let timestamps = chatRateLimitMap.get(clientId) || [];
  timestamps = timestamps.filter(t => t > cutoff);

  // Cold start detection: if in-memory map is empty for this client, check BQ
  if (timestamps.length === 0 && bq) {
    try {
      const sql = `SELECT COUNT(*) as cnt FROM ${bq.table('ChatConversations')} WHERE client_id = @clientId AND role = 'user' AND created_at > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)`;
      const rows = await bq.query(sql, { clientId });
      const bqCount = rows[0]?.cnt || 0;
      if (bqCount >= MAX_MESSAGES_PER_HOUR) {
        // Seed the in-memory map so subsequent checks don't hit BQ again
        chatRateLimitMap.set(clientId, Array(bqCount).fill(now));
        throw new Error(`Chat rate limit exceeded: ${MAX_MESSAGES_PER_HOUR} messages/hour. Try again later.`);
      }
      // Seed with BQ count so we track correctly going forward
      if (bqCount > 0) {
        timestamps = Array(bqCount).fill(now);
      }
    } catch (err) {
      // If it's the rate limit error we just threw, re-throw it
      if (err.message.includes('rate limit')) throw err;
      // Otherwise log and continue with in-memory only
      logger.warn('Chatbot: BQ rate limit check failed, using in-memory only', { error: err.message });
    }
  }

  if (timestamps.length >= MAX_MESSAGES_PER_HOUR) {
    const retryAfterSec = Math.ceil((timestamps[0] + HOUR_MS - now) / 1000);
    throw new Error(`Chat rate limit exceeded: ${MAX_MESSAGES_PER_HOUR} messages/hour. Try again in ${retryAfterSec}s.`);
  }

  timestamps.push(now);
  chatRateLimitMap.set(clientId, timestamps);
}

// Periodic cleanup of stale rate-limit entries
setInterval(() => {
  const cutoff = Date.now() - HOUR_MS;
  for (const [key, timestamps] of chatRateLimitMap) {
    const filtered = timestamps.filter(t => t > cutoff);
    if (filtered.length === 0) chatRateLimitMap.delete(key);
    else chatRateLimitMap.set(key, filtered);
  }
}, 10 * 60 * 1000).unref();

// ── Sanitize internal names from responses ──

function sanitizeResponse(text) {
  const internals = [
    'v_calls_joined_flat_prefixed', 'v_objections_joined', 'v_close_cycle_stats_dated',
    'calls_call_id', 'calls_client_id', 'calls_call_outcome', 'calls_attendance',
    'calls_appointment_date', 'calls_revenue_generated', 'calls_cash_collected',
    'calls_prospect_name', 'calls_closer_id', 'closers_name', 'clients_client_id',
    'closer-automation.CloserAutomation', 'BigQueryClient', 'bq.query', 'bq.table',
    'client_id', '@clientId',
  ];
  let sanitized = text;
  for (const term of internals) {
    sanitized = sanitized.replaceAll(term, '[internal]');
  }
  return sanitized;
}

// ── Max result size for tool outputs (prevent token overflow) ──
const MAX_TOOL_RESULT_BYTES = 10 * 1024; // 10KB

function truncateResult(result) {
  const json = JSON.stringify(result);
  if (json.length <= MAX_TOOL_RESULT_BYTES) return json;
  return json.substring(0, MAX_TOOL_RESULT_BYTES) + '... (truncated)';
}

class ChatbotService {
  /**
   * @param {object} opts
   * @param {object} opts.bq — BigQueryClient instance
   */
  constructor({ bq }) {
    this.bq = bq;
    this.anthropic = null;
  }

  /** Lazy-init Anthropic client */
  _getClient() {
    if (!this.anthropic) {
      if (!config.ai.apiKey) {
        throw new Error('ANTHROPIC_API_KEY not configured — chatbot unavailable');
      }
      this.anthropic = new Anthropic({ apiKey: config.ai.apiKey });
    }
    return this.anthropic;
  }

  /**
   * Process a chat message and return Claude's response.
   *
   * @param {object} opts
   * @param {string} opts.clientId — Client ID for data isolation
   * @param {string} opts.conversationId — Conversation thread ID (UUID)
   * @param {string} opts.message — User's message text
   * @param {Array<{role: string, content: string}>} opts.history — Previous messages
   * @param {string} opts.companyName — Client's company name for system prompt
   * @returns {Promise<{response: string, conversationId: string, toolsUsed: string[]}>}
   */
  async chat({ clientId, conversationId, message, history = [], companyName = 'Your Company' }) {
    // 1. Rate limit (async — may check BQ on cold start)
    await checkChatRateLimit(clientId, this.bq);

    // 2. Build messages array from history + new user message
    const messages = [];

    // Cap history at 50 messages to prevent token overflow
    const cappedHistory = history.slice(-50);
    for (const item of cappedHistory) {
      if (item.role === 'user' || item.role === 'assistant') {
        messages.push({ role: item.role, content: item.content });
      }
    }

    // Add new user message
    messages.push({ role: 'user', content: message });

    // 3. Get Anthropic client
    const client = this._getClient();
    const toolDefs = getToolDefinitions();
    const systemPrompt = buildSystemPrompt(companyName);
    const toolsUsed = [];

    // 4. Initial Claude call
    let response;
    try {
      response = await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        system: systemPrompt,
        tools: toolDefs,
        messages,
      });
    } catch (err) {
      logger.error('Chatbot: Anthropic API call failed', { error: err.message, clientId });
      return {
        response: 'I apologize, but I encountered an error processing your request. Please try again.',
        conversationId,
        toolsUsed: [],
      };
    }

    // 5. Tool use loop — keep going while Claude wants to use tools
    let loopCount = 0;
    const maxLoops = 5; // Safety cap to prevent infinite loops

    while (response.stop_reason === 'tool_use' && loopCount < maxLoops) {
      loopCount++;

      // Add assistant's response (with tool_use blocks) to messages
      messages.push({ role: 'assistant', content: response.content });

      // Extract and execute all tool_use blocks
      const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');
      const toolResults = [];

      for (const toolBlock of toolUseBlocks) {
        toolsUsed.push(toolBlock.name);
        let result;
        try {
          result = await executeToolCall(toolBlock.name, toolBlock.input, clientId, this.bq);
        } catch (err) {
          logger.warn('Chatbot: Tool execution failed', {
            tool: toolBlock.name,
            error: err.message,
            clientId,
          });
          result = { error: err.message };
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: truncateResult(result),
        });
      }

      // Add tool results and call Claude again
      messages.push({ role: 'user', content: toolResults });

      try {
        response = await client.messages.create({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 4096,
          system: systemPrompt,
          tools: toolDefs,
          messages,
        });
      } catch (err) {
        logger.error('Chatbot: Anthropic API call failed in tool loop', {
          error: err.message,
          clientId,
          loopCount,
        });
        return {
          response: 'I encountered an error while processing tool results. Please try again.',
          conversationId,
          toolsUsed,
        };
      }
    }

    // 6. Extract final text response
    const rawText = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')
      .trim() || 'I was unable to generate a response. Please try rephrasing your question.';

    // Sanitize internal names from response
    const finalText = sanitizeResponse(rawText);

    // 7. Store conversation in BQ (fire-and-forget)
    this._storeConversation({
      conversationId,
      clientId,
      userMessage: message,
      assistantResponse: finalText,
      toolsUsed,
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
    }).catch(err => {
      logger.warn('Chatbot: Failed to store conversation', { error: err.message, clientId });
    });

    // 8. Return response
    return {
      response: finalText,
      conversationId,
      toolsUsed: [...new Set(toolsUsed)],
    };
  }

  /**
   * Store conversation messages in BigQuery.
   * Fire-and-forget — errors are logged but don't block the response.
   */
  async _storeConversation({ conversationId, clientId, userMessage, assistantResponse, toolsUsed, inputTokens, outputTokens }) {
    const now = new Date().toISOString();

    // Store user message
    await this.bq.insert('ChatConversations', {
      conversation_id: conversationId,
      client_id: clientId,
      message_id: crypto.randomUUID(),
      role: 'user',
      content: userMessage,
      input_tokens: 0,
      output_tokens: 0,
      model: 'claude-sonnet-4-5-20250929',
      created_at: now,
      status: 'Active',
    });

    // Store assistant response
    await this.bq.insert('ChatConversations', {
      conversation_id: conversationId,
      client_id: clientId,
      message_id: crypto.randomUUID(),
      role: 'assistant',
      content: assistantResponse,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      model: 'claude-sonnet-4-5-20250929',
      created_at: now,
      status: 'Active',
    });

    // Store tool usage as separate rows
    for (const toolName of toolsUsed) {
      await this.bq.insert('ChatConversations', {
        conversation_id: conversationId,
        client_id: clientId,
        message_id: crypto.randomUUID(),
        role: 'tool',
        tool_name: toolName,
        input_tokens: 0,
        output_tokens: 0,
        model: 'claude-sonnet-4-5-20250929',
        created_at: now,
        status: 'Active',
      });
    }
  }
}

module.exports = ChatbotService;
