/**
 * ADMIN CHAT ROUTES
 *
 * AI Chatbot endpoints for the CloserMetrix dashboard.
 * All routes require admin API key authentication.
 *
 * Routes:
 *   POST /admin/chat/message        — Send a chat message and get AI response
 *   GET  /admin/chat/conversations   — List recent conversations (admin analytics)
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const config = require('../../config');
const logger = require('../../utils/logger');
const bq = require('../../db/BigQueryClient');
const ChatbotService = require('../../services/chatbot/ChatbotService');

// ── Singleton chatbot service ──
const chatbotService = new ChatbotService({ bq });

// ── Validation patterns ──
const CLIENT_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HTML_TAG_RE = /<[^>]*>/g;

// ── Auth middleware — same pattern as other admin routes ──
router.use((req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const token = auth.slice(7);
  if (!config.admin.apiKey) {
    return res.status(503).json({ success: false, error: 'Admin API key not configured' });
  }
  const expected = crypto.createHash('sha256').update(config.admin.apiKey).digest();
  const received = crypto.createHash('sha256').update(token).digest();
  if (!crypto.timingSafeEqual(expected, received)) {
    return res.status(403).json({ success: false, error: 'Invalid API key' });
  }
  next();
});

/**
 * POST /admin/chat/message
 *
 * Send a chat message and receive an AI-generated response.
 * The chatbot can query data, compute metrics, add records, and soft-delete.
 *
 * Body:
 *   clientId      — Required. Client ID for data scoping.
 *   conversationId — Optional UUID. Generated if not provided.
 *   message       — Required. User message (max 2000 chars).
 *   history       — Optional. Array of {role, content} previous messages (max 50).
 *   companyName   — Optional. Client company name for personalization.
 *
 * Returns:
 *   { success, response, conversationId, toolsUsed }
 */
router.post('/message', async (req, res) => {
  try {
    const { clientId, message, history, companyName } = req.body;
    let { conversationId } = req.body;

    // Validate clientId
    if (!clientId || !CLIENT_ID_RE.test(clientId)) {
      return res.status(400).json({ success: false, error: 'Invalid or missing clientId' });
    }

    // Validate message
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    // Strip HTML tags and enforce length limit
    const cleanMessage = message.replace(HTML_TAG_RE, '').trim();
    if (cleanMessage.length === 0) {
      return res.status(400).json({ success: false, error: 'Message cannot be empty' });
    }
    if (cleanMessage.length > 2000) {
      return res.status(400).json({ success: false, error: 'Message must be 2000 characters or less' });
    }

    // Validate or generate conversationId
    if (conversationId) {
      if (!UUID_RE.test(conversationId)) {
        return res.status(400).json({ success: false, error: 'Invalid conversationId format' });
      }
    } else {
      conversationId = crypto.randomUUID();
    }

    // Validate history
    let validHistory = [];
    if (history) {
      if (!Array.isArray(history)) {
        return res.status(400).json({ success: false, error: 'History must be an array' });
      }
      validHistory = history.slice(0, 50).filter(item => {
        if (!item || typeof item !== 'object') return false;
        if (item.role !== 'user' && item.role !== 'assistant') return false;
        if (typeof item.content !== 'string') return false;
        return true;
      }).map(item => ({
        role: item.role,
        content: item.content.slice(0, 4000),
      }));
    }

    // Call chatbot service
    const result = await chatbotService.chat({
      clientId,
      conversationId,
      message: cleanMessage,
      history: validHistory,
      companyName: companyName || 'Your Company',
    });

    return res.json({
      success: true,
      response: result.response,
      conversationId: result.conversationId,
      toolsUsed: result.toolsUsed,
    });
  } catch (err) {
    // Handle rate limit errors with 429
    if (err.message && err.message.includes('rate limit')) {
      logger.warn('Chatbot rate limit hit', { error: err.message });
      return res.status(429).json({ success: false, error: err.message });
    }

    logger.error('Chatbot message error', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: 'An unexpected error occurred' });
  }
});

/**
 * GET /admin/chat/conversations
 *
 * List recent chat conversations for admin analytics.
 * Optionally filter by clientId. Uses queryAdmin for cross-tenant when no clientId.
 *
 * Query params:
 *   clientId — Optional. Filter to one client.
 *   limit    — Optional. Default 20, max 100.
 *
 * Returns:
 *   { success, conversations: [{conversation_id, client_id, message_count, first_message, last_message}] }
 */
router.get('/conversations', async (req, res) => {
  try {
    const { clientId } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

    let sql, rows;

    if (clientId) {
      if (!CLIENT_ID_RE.test(clientId)) {
        return res.status(400).json({ success: false, error: 'Invalid clientId format' });
      }

      sql = `
        SELECT
          conversation_id,
          COUNT(*) AS message_count,
          MIN(created_at) AS first_message,
          MAX(created_at) AS last_message,
          ARRAY_AGG(content ORDER BY created_at LIMIT 1)[OFFSET(0)] AS first_user_message
        FROM ${bq.table('ChatConversations')}
        WHERE client_id = @clientId AND role = 'user' AND status = 'Active'
        GROUP BY conversation_id
        ORDER BY MAX(created_at) DESC
        LIMIT @queryLimit
      `;
      rows = await bq.query(sql, { clientId, queryLimit: limit });
    } else {
      // Cross-tenant admin query
      sql = `
        SELECT
          conversation_id,
          client_id,
          COUNT(*) AS message_count,
          MIN(created_at) AS first_message,
          MAX(created_at) AS last_message,
          ARRAY_AGG(content ORDER BY created_at LIMIT 1)[OFFSET(0)] AS first_user_message
        FROM ${bq.table('ChatConversations')}
        WHERE role = 'user' AND status = 'Active'
        GROUP BY conversation_id, client_id
        ORDER BY MAX(created_at) DESC
        LIMIT @queryLimit
      `;
      rows = await bq.queryAdmin(sql, { queryLimit: limit });
    }

    return res.json({ success: true, conversations: rows });
  } catch (err) {
    logger.error('Chatbot conversations list error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to retrieve conversations' });
  }
});

module.exports = router;
