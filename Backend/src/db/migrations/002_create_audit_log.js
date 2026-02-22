/**
 * MIGRATION 002: Create AuditLog Table
 *
 * Records every meaningful state change in the system.
 * Append-only — entries are never updated or deleted.
 *
 * Run once against the closer-automation.CloserAutomation dataset.
 */

const { BigQuery } = require('@google-cloud/bigquery');
const config = require('../../config');

const SQL = `
CREATE TABLE IF NOT EXISTS \`${config.bigquery.projectId}.${config.bigquery.dataset}.AuditLog\` (
  audit_id STRING NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  client_id STRING,
  entity_type STRING NOT NULL,
  entity_id STRING NOT NULL,
  action STRING NOT NULL,
  field_changed STRING,
  old_value STRING,
  new_value STRING,
  trigger_source STRING NOT NULL,
  trigger_detail STRING,
  metadata STRING,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)`;

async function up() {
  const bq = new BigQuery({ projectId: config.bigquery.projectId });
  console.log('Running migration 002: Create AuditLog table...');
  await bq.query({ query: SQL, location: 'US' });
  console.log('Migration 002 complete.');
}

module.exports = { up, SQL };
