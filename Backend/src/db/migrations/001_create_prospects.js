/**
 * MIGRATION 001: Create Prospects Table
 *
 * Tracks prospect lifecycle across calls and payments.
 * Identified by prospect_email + client_id (unique composite).
 *
 * Run once against the closer-automation.CloserAutomation dataset.
 */

const { BigQuery } = require('@google-cloud/bigquery');
const config = require('../../config');

const SQL = `
CREATE TABLE IF NOT EXISTS \`${config.bigquery.projectId}.${config.bigquery.dataset}.Prospects\` (
  prospect_id STRING NOT NULL,
  client_id STRING NOT NULL,
  prospect_email STRING NOT NULL,
  prospect_name STRING,
  first_call_date DATE,
  last_call_date DATE,
  total_calls INT64 DEFAULT 0,
  total_shows INT64 DEFAULT 0,
  status STRING DEFAULT 'active',
  deal_status STRING,
  total_revenue_generated FLOAT64 DEFAULT 0,
  total_cash_collected FLOAT64 DEFAULT 0,
  last_payment_date DATE,
  payment_count INT64 DEFAULT 0,
  product_purchased STRING,
  assigned_closer_id STRING,
  notes STRING,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)`;

async function up() {
  const bq = new BigQuery({ projectId: config.bigquery.projectId });
  console.log('Running migration 001: Create Prospects table...');
  await bq.query({ query: SQL, location: 'US' });
  console.log('Migration 001 complete.');
}

module.exports = { up, SQL };
