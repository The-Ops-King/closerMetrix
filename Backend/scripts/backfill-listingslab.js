#!/usr/bin/env node
/**
 * BACKFILL — The Listing Slab calendar appointments
 *
 * Reads Mark's Google Calendar (as the closermetrix@ service account, which the
 * calendar is shared with) and processes events through the normal calendar
 * pipeline (CalendarService._processOneEvent) to create Scheduled call records.
 * No-show classification happens afterward in reconcile-listingslab.js.
 *
 *   node scripts/backfill-listingslab.js            # dry run (fetch + report only)
 *   node scripts/backfill-listingslab.js --apply    # create call records
 *
 * Requires: filter_word set on the client (Strategy Call,Enrollment Call) and
 * ADC available (gcloud) with token-creator on closermetrix@.
 */
process.env.GOOGLE_CALENDAR_SA_EMAIL =
  process.env.GOOGLE_CALENDAR_SA_EMAIL || 'closermetrix@closer-automation.iam.gserviceaccount.com';

const { google } = require('googleapis');
const { GoogleAuth, Impersonated } = require('google-auth-library');
const calendarService = require('../src/services/calendar/CalendarService');
const clientQueries = require('../src/db/queries/clients');
const closerQueries = require('../src/db/queries/closers');

const CLIENT_ID = '57ca1217-ac81-49ad-98ba-e6b5d789b59a';
const TIME_MIN = '2026-04-20T00:00:00Z';     // before earliest Vimeo recording (2026-04-29)
const ONLY_CLOSER_EMAIL = 'markbolter@thelistingslab.com'; // Mark only (ignore Mulika)
const APPLY = process.argv.includes('--apply');

async function saCalendar() {
  const source = await new GoogleAuth().getClient();
  const auth = new Impersonated({
    sourceClient: source,
    targetPrincipal: process.env.GOOGLE_CALENDAR_SA_EMAIL,
    lifetime: 3600,
    targetScopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  });
  return google.calendar({ version: 'v3', auth });
}

async function main() {
  console.log(`=== Backfill Listing Slab calendar  (${APPLY ? 'APPLY' : 'DRY RUN'}) ===`);
  const client = await clientQueries.findById(CLIENT_ID);
  if (!client) throw new Error('client not found');
  let callSources = [];
  if (client.settings_json) {
    try {
      const p = typeof client.settings_json === 'string' ? JSON.parse(client.settings_json) : client.settings_json;
      callSources = p.call_sources || [];
    } catch { /* ignore */ }
  }
  console.log(`client: ${client.company_name || client.name} | filter_word: ${JSON.stringify(client.filter_word)} | call_sources: ${callSources.map(s => s.name).join(', ') || '(none)'}`);
  if (!client.filter_word && callSources.length === 0) {
    throw new Error('Neither filter_word nor call_sources is set — events would all be skipped.');
  }

  const closers = await closerQueries.listByClient(CLIENT_ID);
  const mark = closers.find(c => (c.work_email || '').toLowerCase() === ONLY_CLOSER_EMAIL);
  if (!mark) throw new Error(`closer ${ONLY_CLOSER_EMAIL} not found`);
  console.log(`closer: ${mark.name} <${mark.work_email}> (${mark.status})`);

  const cal = await saCalendar();
  let events = [];
  let pageToken = null;
  do {
    const res = await cal.events.list({
      calendarId: mark.work_email.toLowerCase(),
      timeMin: TIME_MIN,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 500,
      showDeleted: false,     // confirmed events only (shows + no-shows); skip cancellations
      ...(pageToken ? { pageToken } : {}),
    });
    events.push(...(res.data.items || []));
    pageToken = res.data.nextPageToken || null;
  } while (pageToken);

  const sales = events.filter(e =>
    e.summary && /strategy call|enrollment call/i.test(e.summary));
  console.log(`fetched ${events.length} events; ${sales.length} match Strategy/Enrollment Call`);

  if (!APPLY) {
    console.log('\n-- sample matched events (dry run, nothing written) --');
    sales.slice(0, 15).forEach(e =>
      console.log(`  ${(e.start?.dateTime || e.start?.date || '?').slice(0,10)}  ${e.summary}`));
    console.log(`\nDRY RUN complete. Re-run with --apply to create ${sales.length} records.`);
    return;
  }

  let processed = 0, skipped = 0, errors = 0;
  const errDetails = [];
  for (const ev of sales) {
    try {
      calendarService._resetDedup();
      const r = await calendarService._processOneEvent(ev, client);
      if (r.action === 'skipped') skipped++; else processed++;
    } catch (err) {
      errors++;
      errDetails.push(`${ev.summary} (${(ev.start?.dateTime||ev.start?.date||'?').slice(0,10)}): ${err.message}`);
    }
  }
  console.log(`\nprocessed (created/updated): ${processed}`);
  console.log(`skipped:                     ${skipped}`);
  console.log(`errors:                      ${errors}`);
  errDetails.slice(0, 20).forEach((d, i) => console.log(`  err ${i+1}: ${d}`));
}

main().then(() => process.exit(0)).catch(err => { console.error('FATAL:', err.message); process.exit(1); });
