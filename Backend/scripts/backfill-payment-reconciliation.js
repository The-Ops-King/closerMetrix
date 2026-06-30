#!/usr/bin/env node
/**
 * BACKFILL — reconcile historical 'payment_no_match' payments to their calls.
 *
 * The payment webhook frequently fired BEFORE a call's matchable 'Show' record
 * existed (the transcript creates it minutes later), logging 'payment_no_match'
 * and never retrying. This sweep replays every unmatched payment now that the
 * calls exist, marking the real closes 'Closed - Won' with revenue.
 *
 *   node scripts/backfill-payment-reconciliation.js [clientId]            # dry run
 *   node scripts/backfill-payment-reconciliation.js [clientId] --apply    # write
 *
 * Omit clientId to sweep ALL clients. Safe + idempotent: PaymentService skips
 * payments already reconciled and never re-applies cash to an already-won call.
 */
const bq = require('../src/db/BigQueryClient');
const paymentService = require('../src/services/PaymentService');

const APPLY = process.argv.includes('--apply');
const clientId = process.argv.slice(2).find(a => !a.startsWith('--')) || null;

async function main() {
  console.log(`=== Backfill payment reconciliation  (${APPLY ? 'APPLY' : 'DRY RUN'}) ===`);
  console.log(`scope: ${clientId ? `client ${clientId}` : 'ALL clients'}\n`);

  const rows = await bq.queryAdmin(
    `SELECT client_id, entity_id, metadata
       FROM ${bq.table('AuditLog')}
      WHERE action = 'payment_no_match'
        ${clientId ? 'AND client_id = @clientId' : ''}`,
    clientId ? { clientId } : {}
  );

  // Group by prospect (client_id + email) — reconcile dedups per prospect internally.
  const groups = new Map();
  for (const r of rows) {
    let meta;
    try { meta = JSON.parse(r.metadata || '{}'); } catch (_) { continue; }
    const p = meta.original_payload || {};
    const email = (p.prospect_email || '').trim().toLowerCase();
    if (!email) continue;
    const key = `${r.client_id}|${email}`;
    if (!groups.has(key)) {
      groups.set(key, { clientId: r.client_id, email, name: p.prospect_name || null, rows: 0 });
    }
    groups.get(key).rows++;
  }

  console.log(`${rows.length} payment_no_match rows across ${groups.size} distinct prospects\n`);

  const totals = { reconciled: 0, alreadyClosed: 0, stillUnmatched: 0 };
  for (const g of groups.values()) {
    let res;
    try {
      res = await paymentService.reconcileProspectPayments(g.clientId, g.email, g.name, { dryRun: !APPLY });
    } catch (e) {
      console.error(`  ERR ${g.email} <${g.clientId}>: ${e.message}`);
      continue;
    }
    totals.reconciled += res.reconciled;
    totals.alreadyClosed += res.alreadyClosed;
    totals.stillUnmatched += res.stillUnmatched;
    if (res.reconciled || res.alreadyClosed) {
      const tag = res.reconciled ? `${APPLY ? 'RECONCILED' : 'WOULD RECONCILE'} ${res.reconciled}` : '';
      const ac = res.alreadyClosed ? `already-won ${res.alreadyClosed}` : '';
      console.log(`  ${g.email.padEnd(38)} ${[tag, ac].filter(Boolean).join(' | ')}`);
    }
  }

  console.log('\n  ' + '-'.repeat(70));
  console.log(`${APPLY ? 'reconciled' : 'would reconcile'}: ${totals.reconciled}  |  already-won (no change): ${totals.alreadyClosed}  |  still unmatched (no call): ${totals.stillUnmatched}`);
  if (!APPLY) console.log(`\nDRY RUN — nothing written. Re-run with --apply to commit.`);
}

main().then(() => process.exit(0)).catch(err => { console.error('FATAL:', err.message); process.exit(1); });
