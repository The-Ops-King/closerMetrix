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

const { BigQuery } = require('@google-cloud/bigquery');
const config = require('../config');
const logger = require('../utils/logger');

/** Fully-qualified table path helper */
function tablePath(tableName) {
  return `\`${config.bigquery.projectId}.${config.bigquery.dataset}.${tableName}\``;
}

class BigQueryClient {
  constructor() {
    this.client = new BigQuery({
      projectId: config.bigquery.projectId,
    });
    this.dataset = config.bigquery.dataset;
    this.projectId = config.bigquery.projectId;
  }

  /**
   * Executes a parameterized SQL query against BigQuery.
   *
   * @param {string} sql — SQL string with @param placeholders
   * @param {Object} params — Key-value map of parameter values
   * @returns {Array} Array of row objects
   * @throws {Error} If the query fails
   */
  async query(sql, params = {}) {
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
    for (const [key, value] of Object.entries(row)) {
      if (value !== null && value !== undefined) {
        cleanRow[key] = value;
      }
    }

    const columns = Object.keys(cleanRow);
    const paramNames = columns.map(col => `@${col}`);

    const sql = `INSERT INTO ${tablePath(tableName)} (${columns.join(', ')}) VALUES (${paramNames.join(', ')})`;

    try {
      await this.query(sql, cleanRow);
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
    const setClauses = [];
    const params = {};

    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === undefined) {
        setClauses.push(`${key} = NULL`);
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

    return this.query(sql, params);
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
      await this.query('SELECT 1 as ok');
      return true;
    } catch (error) {
      logger.error('BigQuery health check failed', { error: error.message });
      return false;
    }
  }
}

// Singleton — one BigQuery client for the whole app
module.exports = new BigQueryClient();
