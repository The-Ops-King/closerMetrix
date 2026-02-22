/**
 * MOCK BIGQUERY CLIENT
 *
 * Replaces the real BigQueryClient in tests with an in-memory store.
 * All query/insert/update operations work against local arrays.
 *
 * Usage in tests:
 *   jest.mock('../../src/db/BigQueryClient', () => require('../helpers/mockBigQuery'));
 */

const tables = {};

function reset() {
  for (const key of Object.keys(tables)) {
    delete tables[key];
  }
}

function getTable(name) {
  if (!tables[name]) tables[name] = [];
  return tables[name];
}

function seedTable(name, rows) {
  tables[name] = [...rows];
}

const mockBigQuery = {
  /**
   * Mock query — supports basic WHERE matching for parameterized queries.
   * Not a full SQL parser, but handles the patterns used in our queries.
   */
  async query(sql, params = {}) {
    // Health check
    if (sql.includes('SELECT 1 as ok')) {
      return [{ ok: 1 }];
    }

    // COUNT queries
    if (sql.includes('COUNT(*)')) {
      const tableName = extractTableName(sql);
      const rows = getTable(tableName);
      const filtered = filterRows(rows, params, sql);
      return [{ show_count: filtered.length }];
    }

    // DELETE queries
    if (sql.trimStart().startsWith('DELETE')) {
      const tableName = extractTableName(sql);
      const rows = getTable(tableName);
      const toDelete = filterRows(rows, params, sql);
      tables[tableName] = rows.filter(r => !toDelete.includes(r));
      return [];
    }

    // UPDATE queries
    if (sql.trimStart().startsWith('UPDATE')) {
      const tableName = extractTableName(sql);
      const rows = getTable(tableName);

      // Extract SET and WHERE params
      const updateParams = {};
      const whereParams = {};
      for (const [key, value] of Object.entries(params)) {
        if (key.startsWith('update_')) {
          updateParams[key.replace('update_', '')] = value;
        } else if (key.startsWith('where_')) {
          whereParams[key.replace('where_', '')] = value;
        }
      }

      for (const row of rows) {
        const matches = Object.entries(whereParams).every(([k, v]) => row[k] === v);
        if (matches) {
          Object.assign(row, updateParams);
        }
      }

      return [];
    }

    // SELECT queries
    const tableName = extractTableName(sql);
    const rows = getTable(tableName);
    const filtered = filterRows(rows, params, sql);

    // Handle ORDER BY ... DESC
    if (sql.includes('ORDER BY') && sql.includes('DESC')) {
      filtered.reverse();
    }

    // Handle LIMIT
    const limitMatch = sql.match(/LIMIT\s+(\d+|@\w+)/i);
    if (limitMatch) {
      const limitVal = limitMatch[1].startsWith('@')
        ? params[limitMatch[1].slice(1)]
        : parseInt(limitMatch[1], 10);
      return filtered.slice(0, limitVal);
    }

    return filtered;
  },

  async insert(tableName, row) {
    getTable(tableName).push({ ...row });
  },

  async insertMany(tableName, rows) {
    const table = getTable(tableName);
    for (const row of rows) {
      table.push({ ...row });
    }
  },

  async update(tableName, updates, where) {
    const rows = getTable(tableName);
    for (const row of rows) {
      const matches = Object.entries(where).every(([k, v]) => row[k] === v);
      if (matches) {
        Object.assign(row, updates);
      }
    }
  },

  table(tableName) {
    return `\`closer-automation.CloserAutomation.${tableName}\``;
  },

  async healthCheck() {
    return true;
  },

  // Test utilities
  _reset: reset,
  _getTable: getTable,
  _seedTable: seedTable,
};

/**
 * Extracts literal string equality comparisons from SQL WHERE clause.
 * Matches patterns like: field = 'SomeValue' (not @param-based).
 * Excludes fields already handled by IS NULL OR patterns.
 */
function extractLiteralEqualities(sql) {
  const results = [];
  // Match: optional_alias.field = 'literal_value' where the value is NOT an @param
  // Negative lookahead ensures we don't match field = @param
  const regex = /(?:\w+\.)?(\w+)\s*=\s*'([^']+)'/g;
  let match;
  while ((match = regex.exec(sql)) !== null) {
    // Skip if this is inside an IS NULL OR pattern (already handled)
    const before = sql.substring(Math.max(0, match.index - 40), match.index);
    if (before.includes('IS NULL OR')) continue;
    // Skip if this is inside an ON clause (JOIN condition)
    if (before.includes(' ON ')) continue;
    results.push({ field: match[1], value: match[2] });
  }
  return results;
}

/**
 * Extracts standalone literal IN clauses from SQL WHERE clause.
 * Matches patterns like: field IN ('a', 'b', 'c') that are NOT inside IS NULL OR patterns.
 * Returns array of { field, values: string[] }
 */
function extractLiteralInClauses(sql) {
  const results = [];
  // Match: optional_alias.field IN ('value1', 'value2', ...)
  const regex = /(?:\w+\.)?(\w+)\s+IN\s*\(([^)]+)\)/gi;
  let match;
  while ((match = regex.exec(sql)) !== null) {
    // Skip if this is inside an IS NULL OR pattern (already handled)
    const before = sql.substring(Math.max(0, match.index - 50), match.index);
    if (before.includes('IS NULL OR')) continue;
    // Only match if values are string literals (contain quotes)
    if (!match[2].includes("'")) continue;
    const values = match[2].split(',').map(v => v.trim().replace(/^'|'$/g, ''));
    results.push({ field: match[1], values });
  }
  return results;
}

/**
 * Extracts (field IS NULL OR field = 'value') and (field IS NULL OR field IN (...)) patterns.
 * Returns array of { field, type: 'single'|'in', value?, values? }
 */
function extractIsNullOrPatterns(sql) {
  const patterns = [];

  // Match: (optional_alias.field IS NULL OR optional_alias.field = 'value')
  const singleRegex = /\((?:\w+\.)?(\w+)\s+IS\s+NULL\s+OR\s+(?:\w+\.)?\1\s*=\s*'([^']+)'\)/gi;
  let match;
  while ((match = singleRegex.exec(sql)) !== null) {
    patterns.push({ field: match[1], type: 'single', value: match[2] });
  }

  // Match: (optional_alias.field IS NULL OR optional_alias.field IN ('a', 'b', 'c'))
  const inRegex = /\((?:\w+\.)?(\w+)\s+IS\s+NULL\s+OR\s+(?:\w+\.)?\1\s+IN\s*\(([^)]+)\)\)/gi;
  while ((match = inRegex.exec(sql)) !== null) {
    const values = match[2].split(',').map(v => v.trim().replace(/^'|'$/g, ''));
    patterns.push({ field: match[1], type: 'in', values });
  }

  return patterns;
}

/**
 * Extracts the table name from a SQL query.
 * Handles both backtick-quoted and plain table references.
 */
function extractTableName(sql) {
  // Match `project.dataset.TableName`
  const backtickMatch = sql.match(/`[^`]+\.([^`]+)`/);
  if (backtickMatch) return backtickMatch[1];

  // Match FROM/JOIN/UPDATE/DELETE TableName
  const simpleMatch = sql.match(/(?:FROM|JOIN|UPDATE|DELETE\s+FROM|INTO)\s+(\w+)/i);
  if (simpleMatch) return simpleMatch[1];

  return 'unknown';
}

/**
 * Filters rows based on @param placeholders found in the SQL WHERE clause.
 * Simple matcher — handles equality comparisons.
 *
 * NOTE: For JOIN queries, the matched field may belong to a joined table
 * rather than the primary table. If the field doesn't exist on the row,
 * we skip that filter condition (it would have been resolved by the JOIN).
 */
function filterRows(rows, params, sql) {
  if (Object.keys(params).length === 0) return [...rows];

  // Pre-check: handle (field IS NULL OR field = 'value') and (field IS NULL OR field IN (...)) patterns
  // These patterns need to be evaluated per-row before the param-based filtering
  const isNullOrPatterns = extractIsNullOrPatterns(sql);

  // Extract literal string comparisons like: field = 'SomeValue' (not using @params)
  const literalEqualities = extractLiteralEqualities(sql);

  // Extract literal IN clauses like: field IN ('a', 'b', 'c') (not inside IS NULL OR)
  const literalInClauses = extractLiteralInClauses(sql);

  // For JOIN queries, resolve cross-table lookups against seeded data
  const joinLookup = buildJoinLookup(sql, rows);

  return rows.filter(row => {
    // Check IS NULL OR patterns first
    for (const pattern of isNullOrPatterns) {
      const fieldValue = row[pattern.field];
      const isNull = fieldValue === null || fieldValue === undefined;
      if (pattern.type === 'single') {
        if (!isNull && fieldValue !== pattern.value) return false;
      } else if (pattern.type === 'in') {
        if (!isNull && !pattern.values.includes(fieldValue)) return false;
      }
    }

    // Check literal string equality comparisons
    for (const { field, value } of literalEqualities) {
      if (field in row && row[field] !== value) return false;
    }

    // Check literal IN clause comparisons
    for (const { field, values } of literalInClauses) {
      if (field in row && !values.includes(row[field])) return false;
    }

    for (const [paramName, paramValue] of Object.entries(params)) {
      // Skip non-WHERE params (limit, toleranceMinutes, etc.)
      if (paramName === 'limit' || paramName === 'toleranceMinutes') continue;
      if (paramName.startsWith('update_') || paramName.startsWith('where_')) continue;

      // Check if this param is used in a != comparison (inequality)
      const neqPattern = new RegExp(`(?:(\\w+)\\.)?(\\w+)\\s*!=\\s*@${paramName}`, 'i');
      const neqMatch = sql.match(neqPattern);
      if (neqMatch) {
        const fieldName = neqMatch[2];
        if (fieldName in row) {
          if (row[fieldName] === paramValue) return false;
        }
        continue;
      }

      // Check if this param is used in a WHERE clause (equality)
      const wherePattern = new RegExp(`(?:(\\w+)\\.)?(\\w+)\\s*=\\s*@${paramName}`, 'i');
      const match = sql.match(wherePattern);
      if (match) {
        const tableAlias = match[1] || null;
        const fieldName = match[2];

        // If the field exists on this row, filter directly
        if (fieldName in row) {
          if (row[fieldName] !== paramValue) return false;
        } else if (joinLookup && tableAlias) {
          // Field belongs to a JOINed table — use join lookup
          const joinResult = resolveJoinField(row, joinLookup, tableAlias, fieldName, paramValue, sql);
          if (joinResult === false) return false;
          // If joinResult is null (can't resolve), skip this filter
        }
        // If field doesn't exist and no join context, skip (can't evaluate)
        continue;
      }

      // Check if this param is used in a < comparison (e.g., field < @param)
      // Also handles COALESCE(field1, field2) < @param
      const coalescePattern = new RegExp(`COALESCE\\((\\w+),\\s*(\\w+)\\)\\s*<\\s*@${paramName}`, 'i');
      const coalesceMatch = sql.match(coalescePattern);
      if (coalesceMatch) {
        const field1 = coalesceMatch[1];
        const field2 = coalesceMatch[2];
        const fieldValue = (row[field1] != null ? row[field1] : row[field2]);
        if (fieldValue != null && !(fieldValue < paramValue)) return false;
        continue;
      }

      // COALESCE(...) > @param
      const coalesceGtPattern = new RegExp(`COALESCE\\((\\w+),\\s*(\\w+)\\)\\s*>\\s*@${paramName}`, 'i');
      const coalesceGtMatch = sql.match(coalesceGtPattern);
      if (coalesceGtMatch) {
        const field1 = coalesceGtMatch[1];
        const field2 = coalesceGtMatch[2];
        const fieldValue = (row[field1] != null ? row[field1] : row[field2]);
        if (fieldValue != null && !(fieldValue > paramValue)) return false;
        continue;
      }

      const ltPattern = new RegExp(`(?:(\\w+)\\.)?(\\w+)\\s*<\\s*@${paramName}`, 'i');
      const ltMatch = sql.match(ltPattern);
      if (ltMatch) {
        const fieldName = ltMatch[2];
        if (fieldName in row) {
          if (!(row[fieldName] < paramValue)) return false;
        }
        continue;
      }

      // Check if this param is used in a > comparison (e.g., field > @param)
      const gtPattern = new RegExp(`(?:(\\w+)\\.)?(\\w+)\\s*>\\s*@${paramName}`, 'i');
      const gtMatch = sql.match(gtPattern);
      if (gtMatch) {
        const fieldName = gtMatch[2];
        if (fieldName in row) {
          if (!(row[fieldName] > paramValue)) return false;
        }
      }

      // Check IN clause
      const inPattern = new RegExp(`@${paramName}.*?IN\\s*\\(`, 'i');
      if (sql.match(inPattern)) {
        // Complex IN clause — skip for mock
      }
    }
    return true;
  });
}

/**
 * Builds a lookup map for JOINed tables so we can filter across table boundaries.
 * Parses simple `JOIN table alias ON alias.field = alias.field` patterns.
 */
function buildJoinLookup(sql) {
  const joinMatch = sql.match(/JOIN\s+`[^`]+\.([^`]+)`\s+(\w+)\s+ON\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/i);
  if (!joinMatch) return null;

  const joinTable = joinMatch[1];
  const joinAlias = joinMatch[2];
  const leftAlias = joinMatch[3];
  const leftField = joinMatch[4];
  const rightAlias = joinMatch[5];
  const rightField = joinMatch[6];

  const joinRows = getTable(joinTable);

  return {
    joinTable,
    joinAlias,
    joinRows,
    // The ON clause: leftAlias.leftField = rightAlias.rightField
    leftAlias, leftField,
    rightAlias, rightField,
  };
}

/**
 * Resolves a field from a JOINed table by following the JOIN relationship.
 * Returns false if the value doesn't match, null if can't resolve, true if matches.
 */
function resolveJoinField(row, lookup, tableAlias, fieldName, paramValue, sql) {
  if (!lookup || tableAlias !== lookup.joinAlias) return null;

  // Figure out which field on the primary row links to the join
  let primaryField;
  if (lookup.leftAlias === tableAlias) {
    // JOIN table is on the left of ON: joinAlias.leftField = other.rightField
    primaryField = lookup.rightField;
  } else {
    primaryField = lookup.leftField;
  }

  const primaryValue = row[primaryField];
  if (primaryValue == null) return null;

  // Find matching rows in the joined table
  let joinField;
  if (lookup.leftAlias === tableAlias) {
    joinField = lookup.leftField;
  } else {
    joinField = lookup.rightField;
  }

  const joinedRow = lookup.joinRows.find(r => r[joinField] === primaryValue);
  if (!joinedRow) return false;

  // Now check the actual field
  if (joinedRow[fieldName] !== paramValue) return false;
  return true;
}

module.exports = mockBigQuery;
