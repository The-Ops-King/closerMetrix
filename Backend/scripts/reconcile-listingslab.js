#!/usr/bin/env node
/**
 * RECONCILE — The Listing Slab: merge VTT transcripts into backfilled calendar
 * appointments, then classify the rest.
 *
 * Run backfill-listingslab.js --apply FIRST (creates calendar records).
 *
 *   node scripts/reconcile-listingslab.js           # dry run (report only)
 *   node scripts/reconcile-listingslab.js --apply   # apply changes
 *
 * Rules (per user):
 *   - Keep the 19 VTT transcript records as the canonical "Show" calls.
 *   - For each VTT record, find its matching calendar appointment
 *     (same day + fuzzy prospect name); stamp the VTT record with the real
 *     calendar appointment_id / prospect_email, then DELETE the duplicate
 *     calendar record.
 *   - Unmatched PAST confirmed calendar appointments (no transcript) → No-Show.
 *   - Unmatched FUTURE calendar appointments → leave as upcoming (Scheduled/null).
 *   - Unmatched VTT records → leave as Show; log for manual review.
 */
const bq = require('../src/db/BigQueryClient');
const callQueries = require('../src/db/queries/calls');

const CLIENT_ID = '57ca1217-ac81-49ad-98ba-e6b5d789b59a';
const NO_SHOW = 'Ghosted - No Show';
const APPLY = process.argv.includes('--apply');
const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

const T = '`closer-automation.CloserAutomation.Calls`';
const AUDIT = '`closer-automation.CloserAutomation.AuditLog`';

const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const nameMatch = (a, b) => {
  a = norm(a); b = norm(b);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
};

async function load(source) {
  return bq.queryAdmin(
    `SELECT call_id, appointment_id, prospect_name, prospect_email,
            FORMAT_TIMESTAMP('%Y-%m-%d', appointment_date) AS day,
            CAST(appointment_date AS STRING) AS appt_ts,
            CAST(appointment_end_date AS STRING) AS appt_end,
            attendance, call_outcome
     FROM ${T}
     WHERE client_id = @clientId AND ingestion_source = @src
     ORDER BY appointment_date`,
    { clientId: CLIENT_ID, src: source });
}

async function main() {
  console.log(`=== Reconcile Listing Slab  (${APPLY ? 'APPLY' : 'DRY RUN'})  today=${TODAY} ===`);
  const vtt = await load('transcript');
  const calRecs = await load('calendar');
  console.log(`VTT transcript records: ${vtt.length} | calendar records: ${calRecs.length}\n`);

  const usedCal = new Set();
  const matches = [];        // { vtt, cal }
  const unmatchedVtt = [];

  for (const v of vtt) {
    const cal = calRecs.find(c => !usedCal.has(c.call_id) && c.day === v.day && nameMatch(v.prospect_name, c.prospect_name));
    if (cal) { usedCal.add(cal.call_id); matches.push({ vtt: v, cal }); }
    else unmatchedVtt.push(v);
  }

  const unmatchedCal = calRecs.filter(c => !usedCal.has(c.call_id));
  const pastNoShow = unmatchedCal.filter(c => c.day < TODAY && (c.attendance === null || c.attendance === 'Scheduled' || c.attendance === 'Waiting for Outcome'));
  const futureUpcoming = unmatchedCal.filter(c => c.day >= TODAY);
  const otherCal = unmatchedCal.filter(c => !pastNoShow.includes(c) && !futureUpcoming.includes(c));

  console.log('-- MATCHES (VTT transcript -> calendar appointment) --');
  matches.forEach(m => console.log(`  ${m.vtt.day}  ${m.vtt.prospect_name}  ->  appt ${m.cal.appointment_id.slice(0,24)}  (cal name: ${m.cal.prospect_name})`));
  console.log(`\nmatched: ${matches.length}`);
  console.log(`unmatched VTT (stay Show, review): ${unmatchedVtt.length}`);
  unmatchedVtt.forEach(v => console.log(`   - ${v.day}  ${v.prospect_name}`));
  console.log(`unmatched calendar PAST -> No-Show: ${pastNoShow.length}`);
  console.log(`unmatched calendar FUTURE -> upcoming: ${futureUpcoming.length}`);
  if (otherCal.length) console.log(`other calendar (already classified): ${otherCal.length}`);

  // Projected end-state show rate (held = shows + no-shows; shows = transcript-backed)
  const shows = vtt.length;                       // 19 transcripts stay Show
  const noShows = pastNoShow.length;
  const held = shows + noShows;
  console.log(`\nPROJECTED: shows=${shows}, no-shows=${noShows}, held=${held}, show-rate=${held ? (100*shows/held).toFixed(1) : '—'}%`);

  if (!APPLY) { console.log('\nDRY RUN — nothing written. Re-run with --apply.'); return; }

  console.log('\n-- APPLYING --');
  // 1. Merge matched: stamp VTT with real appt id/email, then delete cal dup
  const calDupIds = [];
  for (const { vtt: v, cal } of matches) {
    const updates = {
      appointment_id: cal.appointment_id,
      appointment_date: cal.appt_ts,
      appointment_end_date: cal.appt_end || null,
    };
    if (cal.prospect_email && cal.prospect_email !== 'unknown') updates.prospect_email = cal.prospect_email;
    await callQueries.update(v.call_id, CLIENT_ID, updates);
    calDupIds.push(cal.call_id);
  }
  if (calDupIds.length) {
    await bq.queryAdmin(`DELETE FROM ${T} WHERE client_id=@clientId AND call_id IN UNNEST(@ids)`, { clientId: CLIENT_ID, ids: calDupIds });
    await bq.queryAdmin(`DELETE FROM ${AUDIT} WHERE client_id=@clientId AND entity_id IN UNNEST(@ids)`, { clientId: CLIENT_ID, ids: calDupIds });
    console.log(`merged ${matches.length} transcripts; deleted ${calDupIds.length} duplicate calendar records`);
  }
  // 2. No-show unmatched past confirmed
  for (const c of pastNoShow) {
    await callQueries.update(c.call_id, CLIENT_ID, { attendance: NO_SHOW });
  }
  console.log(`marked ${pastNoShow.length} unmatched past appointments as '${NO_SHOW}'`);
  console.log('DONE.');
}

main().then(() => process.exit(0)).catch(err => { console.error('FATAL:', err.message); process.exit(1); });
