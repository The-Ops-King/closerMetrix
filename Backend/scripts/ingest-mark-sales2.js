#!/usr/bin/env node
/**
 * INGEST — Mark Bolter "SALES 2.csv" → Calls (The Listings Lab)
 *
 *   node scripts/ingest-mark-sales2.js [csvPath]           # dry run (default)
 *   node scripts/ingest-mark-sales2.js [csvPath] --apply   # write to BigQuery
 *
 * Defaults csvPath to ~/Downloads/SALES 2.csv. Filters to Collaborator='Mark Bolter'.
 *
 * SEMANTICS (confirmed with Tyler 2026-06-30):
 *   • Every CSV row is a call that SHOWED → force attendance='Show'.
 *   • Close test: "Did They Purchase?" == Yes  (equivalently, a Program is present).
 *   • WON rows write the authoritative sales outcome + revenue:
 *       call_outcome='Closed - Won', revenue_generated="Total Amount",
 *       cash_collected = initial_cash_collected = "Upfront CC",
 *       product_purchased="Program", date_closed="Join Date".
 *   • NON-WON rows touch attendance ONLY — call_outcome/revenue left as-is
 *     (BQ already carries richer Follow Up/Lost state than this CSV).
 *   • Closes are counted in the app by call_outcome='Closed - Won'; revenue by
 *     revenue_generated, cash by cash_collected (f_closed / close_amount are unused).
 *   • This CSV is the AUTHORITATIVE, COMPLETE close list (Tyler 2026-06-30):
 *     any BQ record marked 'Closed - Won' whose prospect is NOT a "Yes" here is a
 *     FALSE close → DOWNGRADED: call_outcome set to DOWNGRADE_OUTCOME and all
 *     revenue/cash/product/date_closed fields cleared. (e.g. the manual-only Wons
 *     Dan Jones, Israel Nuno, Amanda Kunze, Alyse Savage, and Jaswinder Matharu,
 *     who is in the sheet but as "No".)
 *   • Won rows prefer the existing Won record (idempotent, no duplicate Wons).
 *   • Multi-row prospects (e.g. an earlier non-buy strategy call + a later close)
 *     are zipped onto DISTINCT records, Won-first.
 *
 * Every query is scoped by client_id (isolation) and fully parameterized.
 */
const fs = require('fs');
const path = require('path');
const bq = require('../src/db/BigQueryClient');

const CLIENT_ID = '57ca1217-ac81-49ad-98ba-e6b5d789b59a';
const CLOSER_ID = 'e5ebfb21-c596-4612-af0f-200773758dcc';
const CALLS_TABLE = bq.table('Calls');
const INGESTION_SOURCE = 'csv:sales2';
const COLLABORATOR = 'Mark Bolter';

// Outcome to set on a BQ "Closed - Won" that the authoritative CSV says is NOT a close.
const DOWNGRADE_OUTCOME = 'Follow Up';
// Revenue-ish columns wiped to NULL on a downgrade (literals — no user input).
const CLEAR_ON_DOWNGRADE = ['revenue_generated', 'cash_collected', 'initial_cash_collected',
  'close_amount', 'total_payment_amount', 'product_purchased', 'payment_plan', 'date_closed'];

// BQ records that this CSV can't reach by email/name (typo'd name + different email).
//   csv email -> BQ call_id
const CALLID_ALIAS = {
  'sudha904fl@gmail.com': '6a036a00-975a-4028-a649-55b713b507db', // BQ: "Sudha Kanatarti" <sksetti@aol.com>
};

const APPLY = process.argv.includes('--apply');
const csvPath =
  process.argv.slice(2).find(a => !a.startsWith('--')) ||
  path.join(process.env.HOME, 'Downloads', 'SALES 2.csv');

const DATE_COLS = new Set(['date_closed']);
const placeholder = col => (DATE_COLS.has(col) ? `DATE(@${col})` : `@${col}`);
const dstr = ts => (ts ? String(ts.value || ts).slice(0, 10) : '?');

// ── RFC-4180 CSV parser (quoted fields w/ embedded commas + newlines) ──
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* swallow */ }
    else if (c === '\n') { row.push(field); field = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function money(s) {
  if (s == null) return null;
  const n = parseFloat(String(s).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// 'm/d/yyyy' → 'YYYY-MM-DD'
function toISODate(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
}

const norm = s => (s || '').trim().toLowerCase();

async function main() {
  console.log(`=== Ingest Mark "SALES 2"  (${APPLY ? 'APPLY' : 'DRY RUN'}) ===`);
  console.log(`csv: ${csvPath}`);

  // ── parse + filter to Mark's rows ──
  const raw = parseCSV(fs.readFileSync(csvPath, 'utf8'));
  const headers = raw[0];
  const col = sub => headers.find(h => h.includes(sub));
  const H = {
    name: col('Name'), email: col('Email'), collab: 'Collaborator',
    purchase: col('Did They Purchase'), program: col('Program'),
    upfront: col('Upfront CC'), total: col('Total Amount'),
    join: col('Join Date'), currency: col('Currency'),
  };
  const get = (r, h) => (h ? (r[headers.indexOf(h)] || '').trim() : '');
  const now = new Date().toISOString();

  const rows = raw.slice(1)
    .filter(r => r.some(v => (v || '').trim() !== ''))
    .map(r => {
      const purchase = get(r, H.purchase);
      const program = get(r, H.program);
      const won = norm(purchase) === 'yes';
      const upfront = money(get(r, H.upfront));
      const total = money(get(r, H.total));
      return {
        name: get(r, H.name), email: norm(get(r, H.email)),
        collab: get(r, H.collab), won, program,
        revenue: won ? (total != null ? total : upfront) : null,
        cash: won ? (upfront != null ? upfront : total) : null,
        product: won ? (program || null) : null,
        dateClosed: won ? toISODate(get(r, H.join)) : null,
        currency: get(r, H.currency),
      };
    })
    .filter(r => r.collab === COLLABORATOR);

  const closes = rows.filter(r => r.won).length;
  console.log(`\nMark rows: ${rows.length}  (closes=${closes}, non-closes=${rows.length - closes})`);

  // ── batch-fetch existing records for these prospects (+ aliased call_ids) ──
  const emails = [...new Set(rows.map(r => r.email).filter(Boolean))];
  const names = [...new Set(rows.map(r => norm(r.name)).filter(Boolean))];
  const aliasIds = [...new Set(Object.values(CALLID_ALIAS))];
  const existing = await bq.query(
    `SELECT call_id, LOWER(prospect_email) AS email, LOWER(prospect_name) AS name,
            appointment_date, attendance, call_outcome, revenue_generated, cash_collected
       FROM ${CALLS_TABLE}
      WHERE client_id = @clientId AND closer_id = @closerId
        AND ( LOWER(prospect_email) IN UNNEST(@emails)
              OR LOWER(prospect_name) IN UNNEST(@names)
              OR call_id IN UNNEST(@aliasIds) )`,
    { clientId: CLIENT_ID, closerId: CLOSER_ID, emails, names, aliasIds }
  );

  const byEmail = new Map(), byName = new Map(), byId = new Map();
  const idx = (m, k, rec) => { if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(rec); };
  for (const rec of existing) { idx(byEmail, rec.email, rec); idx(byName, rec.name, rec); byId.set(rec.call_id, rec); }

  // ── group CSV rows by prospect ──
  const groups = new Map();
  for (const r of rows) {
    const key = r.email || `name:${norm(r.name)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const updates = [];                 // { callId, fields, row, rec }
  const unmatched = [];               // { row, reason }
  const used = new Set();

  // ranking: won rows prefer an existing Won (idempotent), then Show, then earliest.
  // non-won rows EXCLUDE existing Won records (never downgrade), then Show, then earliest.
  const rank = (rec, won) => {
    const w = rec.call_outcome === 'Closed - Won' ? 0 : 1;
    const s = rec.attendance === 'Show' ? 0 : 1;
    return (won ? w : 0) * 100 + s * 10; // tie-break by date below
  };
  const pick = (cands, won) => {
    const pool = cands
      .filter(rec => !used.has(rec.call_id))
      .filter(rec => won || rec.call_outcome !== 'Closed - Won');
    pool.sort((a, b) =>
      (rank(a, won) - rank(b, won)) ||
      dstr(a.appointment_date).localeCompare(dstr(b.appointment_date)));
    return pool[0] || null;
  };

  for (const [key, grp] of groups) {
    const aliasId = CALLID_ALIAS[key];
    let cands = key.startsWith('name:') ? (byName.get(key.slice(5)) || []) : (byEmail.get(key) || []);
    if (aliasId && byId.has(aliasId)) cands = [...cands, byId.get(aliasId)];
    // dedup candidates by call_id
    cands = [...new Map(cands.map(c => [c.call_id, c])).values()];

    for (const row of [...grp].sort((a, b) => Number(b.won) - Number(a.won))) { // Won first
      const rec = pick(cands, row.won);
      if (!rec) {
        unmatched.push({ row, reason: cands.length ? 'no eligible record left' : 'no BQ record for prospect' });
        continue;
      }
      used.add(rec.call_id);
      const fields = { attendance: 'Show', ingestion_source: INGESTION_SOURCE, last_modified: now };
      if (row.won) {
        fields.call_outcome = 'Closed - Won';
        fields.revenue_generated = row.revenue;
        fields.cash_collected = row.cash;
        fields.initial_cash_collected = row.cash;
        if (row.product) fields.product_purchased = row.product;
        if (row.dateClosed) fields.date_closed = row.dateClosed;
      }
      updates.push({ callId: rec.call_id, fields, row, rec });
    }
  }

  // ── report ──
  console.log(`\n  TYPE   OUTCOME→        REV     CASH   ATT(was)        DATE        NAME`);
  console.log('  ' + '-'.repeat(92));
  for (const u of updates) {
    const t = u.row.won ? 'WON ' : 'show';
    const oc = u.row.won ? `Closed - Won (${u.rec.call_outcome || 'null'})` : `— (${u.rec.call_outcome || 'null'})`;
    const cur = u.row.currency && u.row.currency !== 'USD' ? ` ${u.row.currency}` : '';
    console.log(
      `  ${t}  ${oc.padEnd(24)} ${String(u.fields.revenue_generated ?? '-').padStart(6)}${cur ? '' : ' '} ` +
      `${String(u.fields.cash_collected ?? '-').padStart(6)}  ${(u.rec.attendance || '?').padEnd(14)} ` +
      `${dstr(u.rec.appointment_date)}  ${u.row.name}${cur}`
    );
  }
  if (unmatched.length) {
    console.log(`\n  UNMATCHED (${unmatched.length}):`);
    for (const m of unmatched) console.log(`    [${m.reason}] ${m.row.won ? 'WON ' : 'show'} ${m.row.name} <${m.row.email}>`);
  }
  const wonN = updates.filter(u => u.row.won).length;
  console.log('\n  ' + '-'.repeat(88));
  console.log(`will update: ${updates.length}  (Won=${wonN}, show-only=${updates.length - wonN})  |  unmatched: ${unmatched.length}`);
  const cadRows = updates.filter(u => u.row.won && u.row.currency && u.row.currency !== 'USD');
  if (cadRows.length) console.log(`  ⚠ non-USD revenue stored as raw number (no currency col): ${cadRows.map(u => `${u.row.name}=${u.row.currency}`).join(', ')}`);

  // ── DOWNGRADE PASS: BQ Wons that the authoritative CSV does NOT list as a close ──
  const wonCallIds = new Set(updates.filter(u => u.row.won).map(u => u.callId));
  const allWon = await bq.query(
    `SELECT call_id, prospect_name, LOWER(prospect_email) AS email, attendance,
            revenue_generated, cash_collected, CAST(date_closed AS STRING) AS date_closed
       FROM ${CALLS_TABLE}
      WHERE client_id = @clientId AND closer_id = @closerId
        AND call_outcome = 'Closed - Won'`,
    { clientId: CLIENT_ID, closerId: CLOSER_ID }
  );
  const downgrades = allWon.filter(r => !wonCallIds.has(r.call_id));
  console.log(`\n  DOWNGRADE — BQ 'Closed - Won' NOT in authoritative CSV (${downgrades.length}) → '${DOWNGRADE_OUTCOME}' + clear revenue:`);
  for (const d of downgrades) {
    console.log(`    ${d.prospect_name.padEnd(22)} <${d.email}>  rev=${d.revenue_generated ?? '-'} cash=${d.cash_collected ?? '-'} closed=${d.date_closed || '-'}`);
  }

  if (!APPLY) { console.log(`\nDRY RUN — nothing written. Re-run with --apply to commit.`); return; }

  let ok = 0, err = 0;
  for (const u of updates) {
    const cols = Object.keys(u.fields);
    const sql = `UPDATE ${CALLS_TABLE} SET ${cols.map(c => `${c} = ${placeholder(c)}`).join(', ')} ` +
                `WHERE client_id = @clientId AND call_id = @callId`;
    try { await bq.query(sql, { ...u.fields, clientId: CLIENT_ID, callId: u.callId }); ok++; }
    catch (e) { err++; console.error(`  ERR ${u.row.name}: ${e.message}`); }
  }
  let dOk = 0, dErr = 0;
  const clearSql = CLEAR_ON_DOWNGRADE.map(c => `${c} = NULL`).join(', ');
  for (const d of downgrades) {
    const sql = `UPDATE ${CALLS_TABLE} SET call_outcome = @outcome, ${clearSql}, ` +
                `ingestion_source = @src, last_modified = @now ` +
                `WHERE client_id = @clientId AND call_id = @callId`;
    try { await bq.query(sql, { outcome: DOWNGRADE_OUTCOME, src: INGESTION_SOURCE, now, clientId: CLIENT_ID, callId: d.call_id }); dOk++; }
    catch (e) { dErr++; console.error(`  ERR downgrade ${d.prospect_name}: ${e.message}`); }
  }
  console.log(`\napplied: ${ok} updated, ${dOk} downgraded (${err + dErr} errors), ${unmatched.length} unmatched.`);
}

main().then(() => process.exit(0)).catch(err => { console.error('FATAL:', err.message); process.exit(1); });
