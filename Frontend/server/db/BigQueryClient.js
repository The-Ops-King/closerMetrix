/**
 * BIGQUERY CLIENT — Singleton
 *
 * EVERY query in this application goes through this module.
 * EVERY client-scoped query MUST include client_id as a parameter.
 * This is the single enforcement point for data isolation.
 *
 * RULES:
 * 1. All queries use parameterized queries (@clientId). NEVER string interpolation.
 * 2. runQuery() REQUIRES clientId param. It throws if missing.
 * 3. runAdminQuery() spans multiple clients — caller MUST verify admin auth first.
 * 4. If BQ credentials are not configured, methods return empty arrays
 *    so the app is usable during development without a service account.
 *
 * Usage:
 *   const bq = require('./db/BigQueryClient');
 *   const rows = await bq.runQuery(
 *     `SELECT * FROM ${bq.table('Calls')} WHERE client_id = @clientId`,
 *     { clientId: 'abc123' }
 *   );
 */

const { BigQuery } = require('@google-cloud/bigquery');
const config = require('../config');
const logger = require('../utils/logger');

/** Fully-qualified dataset prefix for all table/view references */
const DATASET = `${config.gcpProjectId}.${config.bqDataset}`;

/** Whether BigQuery is available (credentials configured) */
let bqAvailable = false;

/** The BigQuery client instance (null if credentials missing) */
let bqClient = null;

/**
 * Initialize the BigQuery client.
 * Tries multiple credential strategies in order:
 * 1. GCP_SERVICE_ACCOUNT_KEY env var (base64-encoded JSON)
 * 2. GOOGLE_APPLICATION_CREDENTIALS env var (file path — SDK reads automatically)
 * 3. Default credentials (Cloud Run SA or local `gcloud auth application-default login`)
 * 4. Falls back gracefully if none available (demo mode)
 */
function initClient() {
  try {
    const options = { projectId: config.gcpProjectId };

    // Strategy 1: Base64-encoded key (Cloud Run secret)
    if (config.gcpServiceAccountKey) {
      const keyJson = JSON.parse(
        Buffer.from(config.gcpServiceAccountKey, 'base64').toString('utf8')
      );
      options.credentials = keyJson;
      logger.info('BigQuery: using base64-encoded service account key');
    }
    // Strategy 2 & 3: GOOGLE_APPLICATION_CREDENTIALS or default creds
    else if (config.googleCredentials) {
      logger.info('BigQuery: using key file via GOOGLE_APPLICATION_CREDENTIALS');
    } else {
      logger.info('BigQuery: attempting default credentials (Cloud Run SA or gcloud auth)');
    }

    bqClient = new BigQuery(options);
    bqAvailable = true;
    logger.info('BigQuery client initialized', {
      project: config.gcpProjectId,
      dataset: config.bqDataset,
    });
  } catch (err) {
    logger.warn('BigQuery client init failed — running without BQ (demo mode)', {
      error: err.message,
    });
    bqAvailable = false;
    bqClient = null;
  }
}

// Initialize on module load
initClient();

/**
 * Verify BigQuery connectivity with a lightweight test query.
 * Called once at startup — if it fails, we switch to demo mode.
 * This is an async IIFE so it doesn't block server startup.
 */
(async () => {
  if (!bqAvailable) return;
  try {
    await bqClient.query({ query: 'SELECT 1', location: 'US' });
    logger.info('BigQuery connectivity verified');
  } catch (err) {
    logger.warn('BigQuery connectivity check failed — switching to demo mode', {
      error: err.message,
    });
    bqAvailable = false;
  }
})();

/**
 * Run a parameterized query scoped to a single client.
 * Enforces client_id isolation — throws if clientId is missing.
 *
 * @param {string} sql - SQL with @-prefixed params (e.g. @clientId, @dateStart)
 * @param {object} params - Query parameters (MUST include clientId)
 * @returns {Promise<Array<object>>} Result rows
 */
async function runQuery(sql, params = {}) {
  if (!params.clientId) {
    throw new Error('SECURITY: runQuery requires clientId parameter for data isolation');
  }

  if (!bqAvailable) {
    logger.debug('BigQuery unavailable — returning empty results', {
      sql: sql.slice(0, 80),
    });
    return [];
  }

  try {
    const [rows] = await bqClient.query({ query: sql, params, location: 'US' });
    logger.debug('Query executed', { rows: rows.length, clientId: params.clientId });
    return rows;
  } catch (err) {
    logger.error('BigQuery query failed', {
      error: err.message,
      clientId: params.clientId,
      sql: sql.slice(0, 200),
    });
    throw err;
  }
}

/**
 * Run a query that spans multiple clients (admin-only).
 * Caller MUST verify admin auth before calling this.
 *
 * @param {string} sql - SQL query
 * @param {object} [params] - Optional query parameters
 * @returns {Promise<Array<object>>} Result rows
 */
async function runAdminQuery(sql, params = {}) {
  if (!bqAvailable) {
    logger.debug('BigQuery unavailable — returning empty results for admin query');
    return [];
  }

  try {
    const [rows] = await bqClient.query({ query: sql, params, location: 'US' });
    logger.debug('Admin query executed', { rows: rows.length });
    return rows;
  } catch (err) {
    logger.error('Admin BigQuery query failed', {
      error: err.message,
      sql: sql.slice(0, 200),
    });
    throw err;
  }
}

/**
 * Check if BigQuery is connected and available.
 * @returns {boolean}
 */
function isAvailable() {
  return bqAvailable;
}

/**
 * Get the fully-qualified backtick-quoted table/view name.
 * @param {string} name - e.g. 'Calls', 'v_calls_joined_flat_prefixed'
 * @returns {string} e.g. '`closer-automation.CloserAutomation.Calls`'
 */
function table(name) {
  return `\`${DATASET}.${name}\``;
}

module.exports = { runQuery, runAdminQuery, isAvailable, table, DATASET };
