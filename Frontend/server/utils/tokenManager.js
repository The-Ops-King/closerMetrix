/**
 * TOKEN MANAGER
 *
 * Generate, validate, and revoke access tokens for client dashboards.
 * Tokens are stored in the BigQuery AccessTokens table.
 *
 * When BigQuery is unavailable (no credentials), falls back to demo mode
 * with hardcoded demo tokens (demo-basic, demo-insight, demo-executive).
 *
 * Usage:
 *   const tokenManager = require('./utils/tokenManager');
 *   const token = await tokenManager.generateToken('client_abc', 'client', 'Main link');
 *   const record = await tokenManager.validateToken('abc-123-xyz');
 *   await tokenManager.revokeToken('abc-123-xyz');
 */

const { v4: uuidv4 } = require('uuid');
const bq = require('../db/BigQueryClient');
const logger = require('./logger');

/**
 * Demo client records returned when BigQuery is unavailable.
 * These match the demo-* token pattern checked in ClientDashboardLayout.
 */
const DEMO_CLIENTS = {
  'demo-basic': {
    client_id: 'demo_basic_client',
    company_name: 'Demo Company (Basic)',
    plan_tier: 'basic',
    closers: [
      { closer_id: 'demo_closer_1', name: 'Sarah Johnson' },
    ],
  },
  'demo-insight': {
    client_id: 'demo_insight_client',
    company_name: 'Demo Company (Insight)',
    plan_tier: 'insight',
    closers: [
      { closer_id: 'demo_closer_1', name: 'Sarah Johnson' },
      { closer_id: 'demo_closer_2', name: 'Mike Chen' },
      { closer_id: 'demo_closer_3', name: 'Alex Rivera' },
    ],
  },
  'demo-executive': {
    client_id: 'demo_exec_client',
    company_name: 'Demo Company (Executive)',
    plan_tier: 'executive',
    closers: [
      { closer_id: 'demo_closer_1', name: 'Sarah Johnson' },
      { closer_id: 'demo_closer_2', name: 'Mike Chen' },
      { closer_id: 'demo_closer_3', name: 'Alex Rivera' },
      { closer_id: 'demo_closer_4', name: 'Jordan Kim' },
      { closer_id: 'demo_closer_5', name: 'Taylor Brooks' },
    ],
  },
};

/**
 * Validate an access token.
 * Returns the client record if valid, null if invalid/expired/revoked.
 *
 * For demo tokens (demo-basic, demo-insight, demo-executive):
 *   Returns hardcoded demo data without hitting BigQuery.
 *
 * For real tokens:
 *   1. Looks up token in AccessTokens table
 *   2. Checks not revoked, not expired
 *   3. Joins with Clients table for company_name and plan_tier
 *   4. Joins with Closers table for the closer list
 *   5. Updates last_accessed_at
 *
 * @param {string} tokenId - The token from the URL
 * @returns {Promise<object|null>} Client record or null
 */
async function validateToken(tokenId) {
  if (!tokenId) return null;

  // Demo tokens — always work, no BQ needed
  if (tokenId.startsWith('demo')) {
    const demoRecord = DEMO_CLIENTS[tokenId];
    if (demoRecord) {
      logger.debug('Demo token validated', { token: tokenId });
      return { ...demoRecord };
    }
    return null;
  }

  // Real token — requires BigQuery
  if (!bq.isAvailable()) {
    logger.warn('Token validation skipped — BigQuery unavailable', { token: tokenId.slice(0, 8) });
    return null;
  }

  try {
    // Look up token + client data in one query
    const tokenRows = await bq.runAdminQuery(
      `SELECT
        t.token_id,
        t.client_id,
        t.token_type,
        t.expires_at,
        t.revoked_at,
        c.company_name,
        c.plan_tier
      FROM ${bq.table('AccessTokens')} t
      JOIN ${bq.table('Clients')} c ON t.client_id = c.client_id
      WHERE t.token_id = @tokenId`,
      { tokenId }
    );

    if (tokenRows.length === 0) {
      logger.warn('Token not found', { token: tokenId.slice(0, 8) });
      return null;
    }

    const token = tokenRows[0];

    // Check if revoked
    if (token.revoked_at) {
      logger.warn('Token is revoked', { token: tokenId.slice(0, 8) });
      return null;
    }

    // Check if expired
    if (token.expires_at && new Date(token.expires_at) < new Date()) {
      logger.warn('Token is expired', { token: tokenId.slice(0, 8) });
      return null;
    }

    // Fetch closers for this client
    const closerRows = await bq.runQuery(
      `SELECT closer_id, name
       FROM ${bq.table('Closers')}
       WHERE client_id = @clientId AND status = 'Active'
       ORDER BY name`,
      { clientId: token.client_id }
    );

    // Update last_accessed_at (fire-and-forget — don't block the response)
    bq.runAdminQuery(
      `UPDATE ${bq.table('AccessTokens')}
       SET last_accessed_at = CURRENT_TIMESTAMP()
       WHERE token_id = @tokenId`,
      { tokenId }
    ).catch((err) => {
      logger.error('Failed to update last_accessed_at', { error: err.message });
    });

    return {
      client_id: token.client_id,
      company_name: token.company_name,
      plan_tier: token.plan_tier,
      closers: closerRows.map((r) => ({ closer_id: r.closer_id, name: r.name })),
    };
  } catch (err) {
    logger.error('Token validation failed', { error: err.message, token: tokenId.slice(0, 8) });
    return null;
  }
}

/**
 * Validate a partner token.
 * Returns the partner record with assigned client_ids if valid.
 *
 * @param {string} tokenId - The partner token from the URL
 * @returns {Promise<object|null>} Partner record or null
 */
async function validatePartnerToken(tokenId) {
  if (!tokenId || !bq.isAvailable()) return null;

  try {
    const rows = await bq.runAdminQuery(
      `SELECT token_id, partner_id, assigned_client_ids, revoked_at, expires_at
       FROM ${bq.table('AccessTokens')}
       WHERE token_id = @tokenId AND token_type = 'partner'`,
      { tokenId }
    );

    if (rows.length === 0) return null;

    const token = rows[0];
    if (token.revoked_at) return null;
    if (token.expires_at && new Date(token.expires_at) < new Date()) return null;

    // Parse assigned_client_ids JSON string
    let clientIds = [];
    try {
      clientIds = JSON.parse(token.assigned_client_ids || '[]');
    } catch {
      logger.error('Invalid assigned_client_ids JSON', { tokenId: tokenId.slice(0, 8) });
    }

    return {
      partner_id: token.partner_id,
      assigned_client_ids: clientIds,
    };
  } catch (err) {
    logger.error('Partner token validation failed', { error: err.message });
    return null;
  }
}

/**
 * Generate a new access token for a client.
 * Creates a UUID token and stores it in the AccessTokens table.
 *
 * @param {string} clientId - The client_id to grant access to
 * @param {string} tokenType - 'client' or 'partner'
 * @param {string} [label] - Human-readable label
 * @param {object} [options] - Additional options
 * @param {string} [options.partnerId] - Partner ID (for partner tokens)
 * @param {string[]} [options.assignedClientIds] - Client IDs (for partner tokens)
 * @param {Date} [options.expiresAt] - Expiration date (null = never)
 * @returns {Promise<string>} The generated token_id
 */
async function generateToken(clientId, tokenType = 'client', label = '', options = {}) {
  const tokenId = uuidv4();

  if (!bq.isAvailable()) {
    logger.warn('Token generation skipped — BigQuery unavailable. Token:', { tokenId });
    return tokenId;
  }

  try {
    await bq.runAdminQuery(
      `INSERT INTO ${bq.table('AccessTokens')}
       (token_id, client_id, token_type, label, partner_id, assigned_client_ids, expires_at, created_by)
       VALUES (@tokenId, @clientId, @tokenType, @label, @partnerId, @assignedClientIds, @expiresAt, 'admin')`,
      {
        tokenId,
        clientId,
        tokenType,
        label: label || null,
        partnerId: options.partnerId || null,
        assignedClientIds: options.assignedClientIds
          ? JSON.stringify(options.assignedClientIds)
          : null,
        expiresAt: options.expiresAt || null,
      }
    );

    logger.info('Token generated', { tokenId: tokenId.slice(0, 8), clientId, tokenType });
    return tokenId;
  } catch (err) {
    logger.error('Token generation failed', { error: err.message, clientId });
    throw err;
  }
}

/**
 * Revoke an access token (soft delete — sets revoked_at timestamp).
 *
 * @param {string} tokenId - Token to revoke
 * @returns {Promise<boolean>} True if revoked, false if not found
 */
async function revokeToken(tokenId) {
  if (!bq.isAvailable()) {
    logger.warn('Token revocation skipped — BigQuery unavailable');
    return false;
  }

  try {
    await bq.runAdminQuery(
      `UPDATE ${bq.table('AccessTokens')}
       SET revoked_at = CURRENT_TIMESTAMP()
       WHERE token_id = @tokenId AND revoked_at IS NULL`,
      { tokenId }
    );
    logger.info('Token revoked', { tokenId: tokenId.slice(0, 8) });
    return true;
  } catch (err) {
    logger.error('Token revocation failed', { error: err.message });
    throw err;
  }
}

/**
 * List all active tokens (admin use).
 * @returns {Promise<Array<object>>} Active token records
 */
async function listTokens() {
  if (!bq.isAvailable()) return [];

  try {
    return await bq.runAdminQuery(
      `SELECT
        t.token_id, t.client_id, t.token_type, t.label,
        t.created_at, t.expires_at, t.last_accessed_at,
        c.company_name
       FROM ${bq.table('AccessTokens')} t
       LEFT JOIN ${bq.table('Clients')} c ON t.client_id = c.client_id
       WHERE t.revoked_at IS NULL
       ORDER BY t.created_at DESC`
    );
  } catch (err) {
    // Return empty if table doesn't exist yet (common during initial setup)
    if (err.message && err.message.includes('Not found')) {
      logger.warn('AccessTokens table not found — returning empty list');
      return [];
    }
    logger.error('List tokens failed', { error: err.message });
    throw err;
  }
}

/**
 * Look up a client record by client_id (not by token).
 * Used by admin view mode — when an admin wants to view a client's dashboard,
 * they provide the client_id directly (not a token).
 *
 * In demo mode: maps demo client IDs to the DEMO_CLIENTS records.
 * In BQ mode: queries the Clients + Closers tables.
 *
 * @param {string} clientId - The client_id to look up
 * @returns {Promise<object|null>} Client record with closers, or null
 */
async function getClientById(clientId) {
  if (!clientId) return null;

  // Demo clients — look up by client_id instead of by token
  const DEMO_BY_ID = {
    'demo_basic_client': DEMO_CLIENTS['demo-basic'],
    'demo_insight_client': DEMO_CLIENTS['demo-insight'],
    'demo_exec_client': DEMO_CLIENTS['demo-executive'],
  };

  if (DEMO_BY_ID[clientId]) {
    logger.debug('Demo client looked up by ID', { clientId });
    return { ...DEMO_BY_ID[clientId] };
  }

  // Real client — requires BigQuery
  if (!bq.isAvailable()) {
    logger.warn('getClientById skipped — BigQuery unavailable', { clientId });
    return null;
  }

  try {
    const rows = await bq.runAdminQuery(
      `SELECT client_id, company_name, plan_tier
       FROM ${bq.table('Clients')}
       WHERE client_id = @clientId`,
      { clientId }
    );

    if (rows.length === 0) {
      logger.warn('Client not found by ID', { clientId });
      return null;
    }

    const client = rows[0];

    // Fetch closers for this client
    const closerRows = await bq.runQuery(
      `SELECT closer_id, name
       FROM ${bq.table('Closers')}
       WHERE client_id = @clientId AND status = 'Active'
       ORDER BY name`,
      { clientId }
    );

    return {
      client_id: client.client_id,
      company_name: client.company_name,
      plan_tier: client.plan_tier,
      closers: closerRows.map((r) => ({ closer_id: r.closer_id, name: r.name })),
    };
  } catch (err) {
    logger.error('getClientById failed', { error: err.message, clientId });
    return null;
  }
}

module.exports = {
  validateToken,
  validatePartnerToken,
  generateToken,
  revokeToken,
  listTokens,
  getClientById,
  DEMO_CLIENTS,
};
