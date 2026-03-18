#!/usr/bin/env node
/**
 * BACKFILL CALENDAR CALLS
 *
 * Fetches all "Strategy Call" events from Google Calendar since March 6, 2026
 * for the NMM client and processes them through CalendarService._processOneEvent().
 *
 * Usage:
 *   cd Backend && node scripts/backfill-calendar-calls.js
 *
 * This uses domain-wide delegation (service account impersonation) to read
 * each closer's calendar directly.
 */

// Set credentials BEFORE any Google SDK imports
process.env.GOOGLE_APPLICATION_CREDENTIALS = '/Users/user/CloserMetrix/Backend/service-account.json';

const { google } = require('googleapis');
const path = require('path');

// Load .env for BigQuery credentials
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const calendarService = require('../src/services/calendar/CalendarService');
const clientQueries = require('../src/db/queries/clients');
const closerQueries = require('../src/db/queries/closers');

const CLIENT_ID = 'b0be6e07-f9d7-46c6-a8c8-60c228f43036';
const TIME_MIN = '2026-03-06T00:00:00Z';

async function main() {
  console.log('=== Backfill Calendar Calls ===');
  console.log(`Client: ${CLIENT_ID}`);
  console.log(`Since:  ${TIME_MIN}`);
  console.log('');

  // 1. Load client record (needed by _processOneEvent for filter_word, settings_json)
  const client = await clientQueries.findById(CLIENT_ID);
  if (!client) {
    console.error('ERROR: Client not found in BigQuery');
    process.exit(1);
  }
  console.log(`Client: ${client.company_name} (tier: ${client.plan_tier})`);

  // 2. Load active closers
  const closers = await closerQueries.listByClient(CLIENT_ID);
  console.log(`Active closers: ${closers.length}`);
  closers.forEach(c => console.log(`  - ${c.name} <${c.work_email}>`));
  console.log('');

  // 3. For each closer, fetch calendar events since March 6
  let totalEvents = 0;
  let totalStrategyCall = 0;
  let processed = 0;
  let skipped = 0;
  let errors = 0;
  const errorDetails = [];

  for (const closer of closers) {
    if (!closer.work_email) {
      console.log(`Skipping ${closer.name} — no work_email`);
      continue;
    }

    console.log(`\nFetching calendar for ${closer.name} <${closer.work_email}>...`);

    let calApi;
    try {
      // Use domain-wide delegation to impersonate each closer
      const auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
        clientOptions: { subject: closer.work_email },
      });
      const authClient = await auth.getClient();
      calApi = google.calendar({ version: 'v3', auth: authClient });
    } catch (err) {
      console.error(`  ERROR: Could not auth as ${closer.work_email}: ${err.message}`);
      errors++;
      errorDetails.push({ closer: closer.name, error: `Auth failed: ${err.message}` });
      continue;
    }

    // Paginate through all events
    let pageToken = null;
    let closerEvents = [];

    do {
      try {
        const response = await calApi.events.list({
          calendarId: closer.work_email,
          timeMin: TIME_MIN,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 500,
          showDeleted: false,
          ...(pageToken ? { pageToken } : {}),
        });

        const items = response.data.items || [];
        closerEvents.push(...items);
        pageToken = response.data.nextPageToken || null;
      } catch (err) {
        console.error(`  ERROR fetching events: ${err.message}`);
        errors++;
        errorDetails.push({ closer: closer.name, error: `Fetch failed: ${err.message}` });
        pageToken = null;
      }
    } while (pageToken);

    console.log(`  Total events: ${closerEvents.length}`);
    totalEvents += closerEvents.length;

    // Filter to "Strategy Call" events (case-insensitive)
    const strategyCallEvents = closerEvents.filter(e =>
      e.summary && e.summary.toLowerCase().includes('strategy call')
    );
    console.log(`  Strategy Call events: ${strategyCallEvents.length}`);
    totalStrategyCall += strategyCallEvents.length;

    // Process each event through CalendarService._processOneEvent
    for (const rawEvent of strategyCallEvents) {
      try {
        // Clear dedup cache so backfill events aren't blocked
        calendarService._resetDedup();

        const result = await calendarService._processOneEvent(rawEvent, client);
        if (result.action === 'skipped') {
          skipped++;
        } else {
          processed++;
        }

        // Throttle slightly to avoid BQ rate limits
        if (processed % 50 === 0 && processed > 0) {
          console.log(`    ... ${processed} processed so far`);
        }
      } catch (err) {
        errors++;
        const eventDate = rawEvent.start?.dateTime || rawEvent.start?.date || 'unknown';
        const detail = `${rawEvent.summary} (${eventDate}): ${err.message}`;
        errorDetails.push({ closer: closer.name, event: rawEvent.id, error: detail });
        console.error(`    ERROR processing event ${rawEvent.id}: ${err.message}`);
      }
    }
  }

  // Summary
  console.log('\n=== BACKFILL COMPLETE ===');
  console.log(`Total calendar events scanned: ${totalEvents}`);
  console.log(`Strategy Call events found:    ${totalStrategyCall}`);
  console.log(`Processed (created/updated):   ${processed}`);
  console.log(`Skipped (dedup/no closer):     ${skipped}`);
  console.log(`Errors:                        ${errors}`);

  if (errorDetails.length > 0) {
    console.log('\nError details:');
    errorDetails.forEach((e, i) => {
      console.log(`  ${i + 1}. [${e.closer}] ${e.error}`);
    });
  }

  process.exit(0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
