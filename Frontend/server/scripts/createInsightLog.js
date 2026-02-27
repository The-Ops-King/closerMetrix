/**
 * One-time script: Create the InsightLog BigQuery table.
 * Run with: node server/scripts/createInsightLog.js
 */

const bq = require('../db/BigQueryClient');

async function main() {
  const sql = `
    CREATE TABLE IF NOT EXISTS \`closer-automation.CloserAutomation.InsightLog\` (
      insight_id STRING NOT NULL,
      client_id STRING NOT NULL,
      section STRING NOT NULL,
      insight_text STRING NOT NULL,
      metrics_snapshot STRING,
      prior_insight_text STRING,
      date_range_start STRING,
      date_range_end STRING,
      model_used STRING,
      tokens_used INT64,
      generation_type STRING NOT NULL,
      generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
      generated_date DATE
    )
  `;

  try {
    await bq.runAdminQuery(sql);
    console.log('InsightLog table created successfully');
  } catch (err) {
    console.error('Failed to create table:', err.message);
    process.exit(1);
  }

  // Verify it exists
  try {
    const rows = await bq.runAdminQuery(
      'SELECT COUNT(*) as cnt FROM `closer-automation.CloserAutomation.InsightLog`'
    );
    console.log('Verification - row count:', rows[0]?.cnt);
  } catch (err) {
    console.error('Verification failed:', err.message);
    process.exit(1);
  }

  process.exit(0);
}

// Wait a moment for BQ client to verify connectivity
setTimeout(main, 2000);
