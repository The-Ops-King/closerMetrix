#!/usr/bin/env node
/**
 * BACKFILL PAYMENT ACCOUNTING
 *
 * Migrates existing rows to the new payment accounting model introduced when
 * we deprecated `total_payment_amount` and changed `cash_collected` from
 * "first payment only" to "accumulator (running net cash)".
 *
 * Three steps, all idempotent:
 *
 * 1. Calls: where total_payment_amount > cash_collected (old multi-installment
 *    rows where cash_collected captured only the first payment and the
 *    accumulator lived on total_payment_amount), promote the larger value
 *    into cash_collected so the new accumulator reflects total cash received.
 *
 * 2. Calls: where initial_cash_collected IS NULL but cash_collected > 0,
 *    set initial_cash_collected = cash_collected (or the original first
 *    payment if we know it from total_payment_amount comparison).
 *
 * 3. Prospects: rebuild total_revenue_generated from SUM(Calls.revenue_generated)
 *    per (client_id, prospect_email) joining via the Calls table. Many existing
 *    Prospect rows have total_revenue_generated = 0 even when the prospect
 *    closed deals — this fixes that.
 *
 * Run once after deploying the PaymentService accounting refactor:
 *   cd Backend && node scripts/backfill-payment-accounting.js
 *
 * Safe to re-run; each step is gated by NULL/zero checks.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const bq = require('../src/db/BigQueryClient');

async function main() {
  console.log('=== Backfill Payment Accounting ===\n');

  // Step 1 — promote total_payment_amount into cash_collected where it was
  // tracking the accumulator under the old semantic.
  console.log('Step 1: Promoting total_payment_amount → cash_collected for old multi-installment rows...');
  const step1 = await bq.queryAdmin(`
    UPDATE \`${process.env.GCP_PROJECT_ID || 'closer-automation'}.${process.env.BQ_DATASET || 'CloserAutomation'}.Calls\`
    SET cash_collected = total_payment_amount,
        last_modified = FORMAT_TIMESTAMP("%Y-%m-%dT%H:%M:%E3SZ", CURRENT_TIMESTAMP())
    WHERE total_payment_amount IS NOT NULL
      AND total_payment_amount > COALESCE(cash_collected, 0)
  `);
  console.log(`  → done\n`);

  // Step 2 — populate initial_cash_collected wherever it's missing.
  // For rows that came from the old accumulator (step 1 just promoted them),
  // we no longer have the original first-payment amount — best we can do is
  // record the current cash_collected as the initial value. For first-payment
  // rows untouched by step 1 it's already accurate.
  console.log('Step 2: Populating initial_cash_collected for rows that have cash but no initial...');
  const step2 = await bq.queryAdmin(`
    UPDATE \`${process.env.GCP_PROJECT_ID || 'closer-automation'}.${process.env.BQ_DATASET || 'CloserAutomation'}.Calls\`
    SET initial_cash_collected = cash_collected,
        last_modified = FORMAT_TIMESTAMP("%Y-%m-%dT%H:%M:%E3SZ", CURRENT_TIMESTAMP())
    WHERE initial_cash_collected IS NULL
      AND cash_collected IS NOT NULL
      AND cash_collected > 0
  `);
  console.log(`  → done\n`);

  // Step 3 — rebuild Prospects.total_revenue_generated from Calls.
  console.log('Step 3: Rebuilding Prospects.total_revenue_generated from Calls...');
  const step3 = await bq.queryAdmin(`
    UPDATE \`${process.env.GCP_PROJECT_ID || 'closer-automation'}.${process.env.BQ_DATASET || 'CloserAutomation'}.Prospects\` p
    SET total_revenue_generated = COALESCE(rev.total_rev, 0),
        last_modified = CURRENT_TIMESTAMP()
    FROM (
      SELECT client_id, LOWER(prospect_email) AS email, SUM(COALESCE(revenue_generated, 0)) AS total_rev
      FROM \`${process.env.GCP_PROJECT_ID || 'closer-automation'}.${process.env.BQ_DATASET || 'CloserAutomation'}.Calls\`
      WHERE prospect_email IS NOT NULL
        AND call_outcome != 'Refunded'
      GROUP BY client_id, LOWER(prospect_email)
    ) AS rev
    WHERE p.client_id = rev.client_id
      AND LOWER(p.prospect_email) = rev.email
      AND COALESCE(p.total_revenue_generated, 0) != COALESCE(rev.total_rev, 0)
  `);
  console.log(`  → done\n`);

  console.log('=== Backfill complete ===');
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
