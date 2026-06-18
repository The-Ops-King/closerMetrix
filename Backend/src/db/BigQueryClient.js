/**
 * BIGQUERY CLIENT
 *
 * Central interface for all BigQuery operations. Every read and write in the
 * system goes through this module.
 *
 * KEY DESIGN DECISIONS:
 * - Every query method that touches client-scoped data REQUIRES client_id.
 *   Calling without it throws an error — this prevents accidental cross-client
 *   data leakage at the lowest level.
 * - All queries use parameterized values (@param syntax) — never string
 *   interpolation — to prevent SQL injection.
 * - Table references use the fully-qualified path:
 *   `closer-automation.CloserAutomation.TableName`
 *
 * USAGE:
 *   const bq = require('./db/BigQueryClient');
 *   const calls = await bq.query('SELECT ...', { clientId: 'xxx' });
 *   await bq.insert('Calls', rowData);
 */

const http = require('http');
const https = require('https');
const { BigQuery } = require('@google-cloud/bigquery');
const config = require('../config');
const logger = require('../utils/logger');

// ── Kill HTTP keep-alive on the BigQuery transport (deterministic) ──
//
// @google-cloud/bigquery talks to BigQuery via teeny-request, which reuses a
// pooled `keepAlive: true` agent whenever the request carries `forever: true`
// (the @google-cloud/common default). On the rebuilt node:22-alpine image a
// Node patch changed idle-socket close timing, so the next request grabs a
// dead socket and fails with "Invalid response body ... Premature close".
// This took down every client lookup and webhook on closermetrix-api.
//
// Setting `forever: false` via the client's request interceptor (below) is NOT
// enough: common v5 bakes the transport defaults in at construction, so the
// per-request flag gets overridden and the pooled keep-alive agent is still
// used. The reliable lever is teeny-request's module-level agent pool:
// getAgent() returns `pool.get('https:forever')` and only *creates* one when
// the key is absent. By seeding that key with a keepAlive:false agent at load
// time, our agent wins no matter what the forever flag ends up as — a fresh
// connection per request, no stale-socket reuse. Wrapped in try/catch so an
// internal teeny-request path change degrades to "keep-alive on", never a crash.
try {
  const teenyAgents = require('teeny-request/build/src/agents');
  teenyAgents.pool.set('https:forever', new https.Agent({ keepAlive: false }));
  teenyAgents.pool.set('http:forever', new http.Agent({ keepAlive: false }));
} catch (err) {
  logger.warn('Could not pre-seed teeny-request agent pool — BigQuery keep-alive may remain active', {
    error: err.message,
  });
}

/** Validates that a column name matches standard SQL identifier pattern */
const VALID_COLUMN_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
function validateColumnNames(columns, context) {
  for (const col of columns) {
    if (!VALID_COLUMN_RE.test(col)) {
      throw new Error(`SECURITY: Invalid column name "${col}" in ${context}. Column names must match /^[a-zA-Z_][a-zA-Z0-9_]*$/.`);
    }
  }
}

/** Fully-qualified table path helper */
function tablePath(tableName) {
  return `\`${config.bigquery.projectId}.${config.bigquery.dataset}.${tableName}\``;
}

class BigQueryClient {
  constructor() {
    this.client = new BigQuery({
      projectId: config.bigquery.projectId,
    });

    // Belt-and-suspenders for the keep-alive fix at module load (see the agent
    // pool note above, which is the actual lever). This mirrors the mitigation
    // @google-cloud/common itself applies for Cloud Functions (service.js sets
    // `forever = false` when FUNCTION_NAME is present); Cloud Run doesn't set
    // that env var. On its own this interceptor proved insufficient on common
    // v5 — kept for intent + defense in depth alongside the pool seed.
    this.client.interceptors.push({
      request(reqOpts) {
        reqOpts.forever = false;
        return reqOpts;
      },
    });

    this.dataset = config.bigquery.dataset;
    this.projectId = config.bigquery.projectId;
  }

  /**
   * Executes a client-scoped parameterized SQL query against BigQuery.
   * REQUIRES clientId in params — throws if missing.
   * This is the default method and enforces tenant isolation.
   *
   * @param {string} sql — SQL string with @param placeholders
   * @param {Object} params — Must include clientId for data isolation
   * @returns {Array} Array of row objects
   * @throws {Error} If clientId is missing or query fails
   */
  async query(sql, params = {}) {
    if (!params.clientId) {
      throw new Error('SECURITY: query() requires clientId parameter for data isolation. Use queryAdmin() for intentional cross-tenant operations.');
    }
    return this._execute(sql, params);
  }

  /**
   * Executes a cross-tenant query WITHOUT client_id enforcement.
   * Use ONLY for operations that intentionally span all clients:
   * - Stuck call recovery (background jobs)
   * - Client listing (admin-only)
   * - Cost reporting (admin-only)
   * - Health checks
   *
   * Callers MUST verify admin auth before using this method.
   *
   * @param {string} sql — SQL string with @param placeholders
   * @param {Object} params — Key-value map of parameter values
   * @returns {Array} Array of row objects
   * @throws {Error} If the query fails
   */
  async queryAdmin(sql, params = {}) {
    return this._execute(sql, params);
  }

  /** @private Internal query executor */
  async _execute(sql, params = {}) {
    const options = {
      query: sql,
      params,
      location: 'US',
    };

    try {
      const [rows] = await this.client.query(options);
      return rows;
    } catch (error) {
      logger.error('BigQuery query failed', {
        sql: sql.substring(0, 200),
        params: Object.keys(params),
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Inserts a single row into a BigQuery table using a DML INSERT statement.
   *
   * WHY DML INSTEAD OF STREAMING INSERT:
   * BigQuery streaming inserts place rows in a "streaming buffer" where they
   * CANNOT be updated or deleted via DML for up to 90 minutes. Since our
   * calendar pipeline frequently creates a record then updates it minutes later
   * (e.g., prospect added, event canceled, rescheduled), we must use DML INSERT
   * so that rows are immediately available for UPDATE/DELETE.
   *
   * Trade-off: DML INSERT is slightly slower than streaming insert and counts
   * against BigQuery's DML quota. At our scale (thousands of calls/day) this
   * is well within limits.
   *
   * @param {string} tableName — Table name (not fully-qualified; dataset is added)
   * @param {Object} row — Row data as key-value pairs
   * @throws {Error} If the insert fails
   */
  async insert(tableName, row) {
    // Strip out null/undefined values — BigQuery's parameterized queries
    // require explicit type declarations for null params. Since unspecified
    // columns default to NULL anyway, we simply omit them.
    const cleanRow = {};
    const jsonColumns = [];
    for (const [key, value] of Object.entries(row)) {
      if (value !== null && value !== undefined) {
        // Detect JSON values (arrays and plain objects) — BigQuery JSON columns
        // require PARSE_JSON() wrapper since the Node.js client sends them as STRING
        if (typeof value === 'object' && !(value instanceof Date)) {
          cleanRow[key] = JSON.stringify(value);
          jsonColumns.push(key);
        } else {
          cleanRow[key] = value;
        }
      }
    }

    const columns = Object.keys(cleanRow);
    validateColumnNames(columns, `insert into ${tableName}`);
    const paramNames = columns.map(col =>
      jsonColumns.includes(col) ? `PARSE_JSON(@${col})` : `@${col}`
    );

    const sql = `INSERT INTO ${tablePath(tableName)} (${columns.join(', ')}) VALUES (${paramNames.join(', ')})`;

    try {
      await this._execute(sql, cleanRow);
    } catch (error) {
      logger.error('BigQuery insert failed', {
        table: tableName,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Inserts multiple rows into a BigQuery table using DML INSERT.
   *
   * Same rationale as insert() — avoids the streaming buffer so rows
   * are immediately available for UPDATE/DELETE.
   *
   * @param {string} tableName — Table name
   * @param {Array<Object>} rows — Array of row objects
   * @throws {Error} If the insert fails
   */
  async insertMany(tableName, rows) {
    if (rows.length === 0) return;

    // Insert each row individually to handle mixed null columns cleanly.
    // At our scale (objections per call, audit entries) this is fine.
    for (const row of rows) {
      await this.insert(tableName, row);
    }
  }

  /**
   * Updates rows in a BigQuery table using a DML UPDATE statement.
   *
   * BigQuery streaming inserts are append-only, so updates require DML.
   * This is slower than streaming insert but necessary for mutations.
   *
   * @param {string} tableName — Table name
   * @param {Object} updates — Fields to update { fieldName: newValue }
   * @param {Object} where — WHERE clause conditions { fieldName: value }
   * @returns {Object} Query results metadata
   */
  async update(tableName, updates, where) {
    // For SET clauses: null values use literal NULL instead of params
    // (BigQuery requires type info for null params which we don't have)
    validateColumnNames(Object.keys(updates), `update ${tableName} SET`);
    validateColumnNames(Object.keys(where), `update ${tableName} WHERE`);

    const setClauses = [];
    const params = {};

    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === undefined) {
        setClauses.push(`${key} = NULL`);
      } else if (typeof value === 'object' && !(value instanceof Date)) {
        // JSON columns: serialize to string and use PARSE_JSON() in SQL
        setClauses.push(`${key} = PARSE_JSON(@update_${key})`);
        params[`update_${key}`] = JSON.stringify(value);
      } else {
        setClauses.push(`${key} = @update_${key}`);
        params[`update_${key}`] = value;
      }
    }

    const whereClauses = Object.keys(where)
      .map(key => `${key} = @where_${key}`)
      .join(' AND ');

    for (const [key, value] of Object.entries(where)) {
      params[`where_${key}`] = value;
    }

    const sql = `UPDATE ${tablePath(tableName)} SET ${setClauses.join(', ')} WHERE ${whereClauses}`;

    return this._execute(sql, params);
  }

  /**
   * Returns the fully-qualified table path for use in raw SQL.
   * Convenience method so callers don't need to build paths themselves.
   *
   * @param {string} tableName — Short table name (e.g., 'Calls')
   * @returns {string} Fully-qualified path (e.g., '`closer-automation.CloserAutomation.Calls`')
   */
  table(tableName) {
    return tablePath(tableName);
  }

  /**
   * Health check — verifies BigQuery connectivity by running a trivial query.
   *
   * @returns {boolean} true if connected, false if not
   */
  async healthCheck() {
    try {
      await this.queryAdmin('SELECT 1 as ok');
      return true;
    } catch (error) {
      logger.error('BigQuery health check failed', { error: error.message });
      return false;
    }
  }
}

// Singleton — one BigQuery client for the whole app
module.exports = new BigQueryClient();
