/**
 * MIGRATION 004: Payment Enhancement Schema
 *
 * SCHM-01: cash_collected is semantically redefined to mean first-payment-only.
 * No DDL change needed — the column already exists as FLOAT64. The semantic
 * change is enforced by PaymentService logic in Phase 3.
 *
 * SCHM-02: Adds total_payment_amount (FLOAT64) to Calls table.
 * SCHM-03: Adds attribution_mode (STRING) to Clients table, defaults to 'all_installments'.
 * SCHM-04: Updates v_calls_joined_flat_prefixed view to include total_payment_amount.
 *
 * Run once against the closer-automation.CloserAutomation dataset.
 * Safe to run multiple times — uses INFORMATION_SCHEMA guards for idempotency.
 */

// TODO: Tyler decision pending — historical cash_collected may need backfill. See STATE.md.

const { BigQuery } = require('@google-cloud/bigquery');
const config = require('../../config');

/**
 * Checks if a column exists on a table, and adds it if not.
 *
 * Uses INFORMATION_SCHEMA.COLUMNS to guard against duplicate ADD COLUMN,
 * since BigQuery does not support IF NOT EXISTS on ALTER TABLE ADD COLUMN.
 *
 * @param {BigQuery} bq - BigQuery client instance
 * @param {string} dataset - Dataset name (e.g. 'CloserAutomation')
 * @param {string} tableName - Table to check (e.g. 'Calls')
 * @param {string} columnName - Column to add (e.g. 'total_payment_amount')
 * @param {string} columnType - BigQuery type (e.g. 'FLOAT64')
 */
async function addColumnIfNotExists(bq, dataset, tableName, columnName, columnType) {
  const projectId = config.bigquery.projectId;

  // Check if column already exists
  const [rows] = await bq.query({
    query: `
      SELECT column_name
      FROM \`${projectId}.${dataset}.INFORMATION_SCHEMA.COLUMNS\`
      WHERE table_name = @tableName
        AND column_name = @columnName
    `,
    params: { tableName, columnName },
    location: 'US',
  });

  if (rows.length > 0) {
    console.log(`  Column already exists, skipping: ${tableName}.${columnName}`);
    return;
  }

  // Add the column
  await bq.query({
    query: `ALTER TABLE \`${projectId}.${dataset}.${tableName}\` ADD COLUMN ${columnName} ${columnType}`,
    location: 'US',
  });
  console.log(`  Added column: ${tableName}.${columnName} (${columnType})`);
}

/**
 * Runs the payment enhancement migration.
 *
 * Steps (in order):
 * 1. SCHM-02: Add total_payment_amount to Calls
 * 2. SCHM-03: Add attribution_mode to Clients
 * 3. SCHM-03: Set default attribution_mode for existing rows
 * 4. SCHM-04: Update the view to include the new column
 * 5. SCHM-01: Log semantic redefinition (no DDL)
 */
async function up() {
  const bq = new BigQuery({ projectId: config.bigquery.projectId });
  const dataset = config.bigquery.dataset;
  const projectId = config.bigquery.projectId;

  console.log('Running migration 004: Payment Enhancement Schema...');

  // Step 1 (SCHM-02): Add total_payment_amount to Calls
  await addColumnIfNotExists(bq, dataset, 'Calls', 'total_payment_amount', 'FLOAT64');

  // Step 2 (SCHM-03): Add attribution_mode to Clients
  await addColumnIfNotExists(bq, dataset, 'Clients', 'attribution_mode', 'STRING');

  // Step 3 (SCHM-03): Set default for existing rows
  const [updateResult] = await bq.query({
    query: `
      UPDATE \`${projectId}.${dataset}.Clients\`
      SET attribution_mode = 'all_installments'
      WHERE attribution_mode IS NULL
    `,
    location: 'US',
  });
  const rowsUpdated = updateResult ? updateResult.length : 0;
  console.log(`  Set attribution_mode default: ${rowsUpdated} rows updated`);

  // Step 4 (SCHM-04): Update the view to include total_payment_amount
  await updateView(bq, dataset, projectId);

  // Step 5 (SCHM-01): Semantic redefinition — no DDL change
  console.log('  SCHM-01: cash_collected semantics redefined to first-payment-only (no DDL change)');

  console.log('Migration 004 complete.');
}

/**
 * Reads the existing view DDL from INFORMATION_SCHEMA.VIEWS, injects the
 * new total_payment_amount column, and recreates the view.
 *
 * If the view does not exist (fresh environment), logs a warning and skips.
 * The full view column list is not in the codebase, so creating it from
 * scratch would produce an incomplete view that breaks Frontend queries.
 *
 * @param {BigQuery} bq - BigQuery client instance
 * @param {string} dataset - Dataset name
 * @param {string} projectId - GCP project ID
 */
async function updateView(bq, dataset, projectId) {
  const viewName = 'v_calls_joined_flat_prefixed';

  // Read existing view DDL
  const [viewRows] = await bq.query({
    query: `
      SELECT view_definition
      FROM \`${projectId}.${dataset}.INFORMATION_SCHEMA.VIEWS\`
      WHERE table_name = @viewName
    `,
    params: { viewName },
    location: 'US',
  });

  if (viewRows.length === 0) {
    console.log(`  WARNING: View ${viewName} does not exist — skipping view update.`);
    console.log('  The view must be created manually or by the Frontend deployment.');
    return;
  }

  const existingDDL = viewRows[0].view_definition;
  console.log(`  Retrieved existing view DDL (${existingDDL.length} chars)`);

  // Check if the column is already in the view
  if (existingDDL.includes('total_payment_amount')) {
    console.log(`  View already includes total_payment_amount, skipping update.`);
    return;
  }

  // Inject the new column before the FROM clause.
  // The view uses aliased columns like "c.column_name AS calls_column_name".
  // We insert our new column right before the FROM keyword that follows the SELECT list.
  //
  // Strategy: find the last SELECT column line before FROM and append after it.
  // We look for the pattern where FROM appears at the start of a line or after whitespace
  // following the column list.
  const fromMatch = existingDDL.match(/(\n\s*FROM\s)/i);
  if (!fromMatch) {
    console.log('  WARNING: Could not locate FROM clause in view DDL — skipping view update.');
    console.log('  Manual intervention required to add total_payment_amount to the view.');
    return;
  }

  const insertPos = existingDDL.indexOf(fromMatch[0]);
  const newColumn = ',\n  c.total_payment_amount AS calls_total_payment_amount';
  const modifiedDDL = existingDDL.slice(0, insertPos) + newColumn + existingDDL.slice(insertPos);

  // Recreate the view
  await bq.query({
    query: `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.${viewName}\` AS\n${modifiedDDL}`,
    location: 'US',
  });
  console.log(`  Updated view ${viewName}: added calls_total_payment_amount`);
}

module.exports = { up };
