#!/usr/bin/env node
/**
 * BACKFILL TRANSCRIPTS — The Listing Slab (Mark Bolter) from Vimeo
 *
 * Lists Mark's Vimeo recordings, matches each to its backfilled calendar
 * appointment (by prospect name + date), pulls the transcript, and runs it
 * through the normal generic transcript pipeline — flipping the call to Show
 * (+ AI scoring) or No-Show, exactly like a live webhook would.
 *
 *   node scripts/backfill-transcripts-listingslab.js              # dry run (list+match+classify, no writes/AI/VTT)
 *   node scripts/backfill-transcripts-listingslab.js --apply      # ingest all
 *   node scripts/backfill-transcripts-listingslab.js --apply --limit 1   # ingest first match only (test)
 *
 * Requires: .vimeo-token file; for --apply, ANTHROPIC_API_KEY in env (for AI scoring).
 */
process.env.GOOGLE_CALENDAR_SA_EMAIL =
  process.env.GOOGLE_CALENDAR_SA_EMAIL || 'closermetrix@closer-automation.iam.gserviceaccount.com';

const fs = require('fs');
const path = require('path');
const bq = require('../src/db/BigQueryClient');
const transcriptService = require('../src/services/transcript/TranscriptService');
const callQueries = require('../src/db/queries/calls');

const CLIENT_ID = '57ca1217-ac81-49ad-98ba-e6b5d789b59a';
const CLOSER_EMAIL = 'markbolter@thelistingslab.com';
const VIMEO_OWNER = '168473035';
const VIMEO_FOLDER = '29091299';
const TOKEN = fs.readFileSync(path.resolve(__dirname, '../.vimeo-token'), 'utf8').trim();

const SHOW_MIN_WORDS = 200;        // >= this many transcript words => Show
const SHOW_MIN_DURATION = 600;     // OR >= 10 min recording => Show (dry-run uses duration only)
const APPLY = process.argv.includes('--apply');
const SURVEY = process.argv.includes('--survey');
const FINALIZE = process.argv.includes('--finalize');
const LIMIT = (() => { const i = process.argv.indexOf('--limit'); return i >= 0 ? parseInt(process.argv[i + 1], 10) : Infinity; })();

const VH = { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/vnd.vimeo.*+json;version=3.4' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const nameMatch = (a, b) => { a = norm(a); b = norm(b); return !!a && !!b && (a === b || a.includes(b) || b.includes(a)); };

async function vimeo(url) {
  const res = await fetch(`https://api.vimeo.com${url}`, { headers: VH });
  if (res.status === 429) { await sleep(60000); return vimeo(url); }
  if (!res.ok) throw new Error(`Vimeo ${res.status} on ${url}`);
  return res.json();
}

async function listVideos() {
  const out = [];
  let page = 1;
  for (;;) {
    const d = await vimeo(`/users/${VIMEO_OWNER}/projects/${VIMEO_FOLDER}/videos?fields=uri,name,duration,created_time&per_page=100&page=${page}&sort=date&direction=asc`);
    for (const v of (d.data || [])) {
      const id = v.uri.split('/')[2].split(':')[0];
      const m = (v.name || '').match(/Mark Bolter\s+(\d{4}-\d{2}-\d{2})\s+(.+)$/i);
      out.push({ id, title: v.name, duration: v.duration, created: v.created_time,
                 day: m ? m[1] : null, prospect: m ? m[2].trim() : null });
    }
    if (!d.paging || !d.paging.next) break;
    page++;
    await sleep(800);
  }
  return out;
}

async function vttText(videoId) {
  const d = await vimeo(`/videos/${videoId}/texttracks`);
  const track = (d.data || [])[0];
  if (!track || !track.link) return null;
  const res = await fetch(track.link);
  const raw = await res.text();
  // Strip WEBVTT header, cue numbers, timestamps, blanks -> plain text
  return raw.split('\n')
    .filter(l => l.trim() && !/^WEBVTT/.test(l) && !/^\d+$/.test(l.trim()) && !/-->/.test(l))
    .join(' ').replace(/\s+/g, ' ').trim();
}

async function main() {
  console.log(`=== Transcript backfill (Vimeo -> pipeline)  ${APPLY ? 'APPLY' : 'DRY RUN'}${LIMIT !== Infinity ? ' limit=' + LIMIT : ''} ===`);
  const appts = await bq.queryAdmin(
    `SELECT call_id, prospect_name, FORMAT_TIMESTAMP('%Y-%m-%d', appointment_date) AS day, attendance
     FROM \`closer-automation.CloserAutomation.Calls\`
     WHERE client_id=@clientId AND ingestion_source='calendar'`, { clientId: CLIENT_ID });
  console.log(`calendar appointments available to match: ${appts.length}`);

  const videos = await listVideos();
  console.log(`Vimeo recordings in folder: ${videos.length}`);
  console.log(`date range: ${videos[0]?.day} .. ${videos[videos.length - 1]?.day}`);

  if (SURVEY) {
    const TODAY = new Date().toISOString().slice(0, 10);
    const usedX = new Set();
    const rows = [];
    for (const v of videos) {
      const d = await vimeo(`/videos/${v.id}/texttracks`);
      const hasT = (d.total || 0) > 0;
      const appt = appts.find(a => !usedX.has(a.call_id) && a.day === v.day && nameMatch(v.prospect, a.prospect_name));
      if (appt) usedX.add(appt.call_id);
      rows.push({ v, hasT, appt, long: v.duration >= SHOW_MIN_DURATION });
      await sleep(700);
    }
    const withT = rows.filter(r => r.hasT).length;
    const estShow = rows.filter(r => r.long).length;
    const estNoShowRec = rows.filter(r => !r.long).length;
    const flagged = rows.filter(r => r.long && !r.hasT);
    const pastAppts = appts.filter(a => a.day < TODAY);
    const apptsWithRec = new Set(rows.filter(r => r.appt).map(r => r.appt.call_id));
    const apptsNoRec = pastAppts.filter(a => !apptsWithRec.has(a.call_id));
    console.log(`\n========== CROSS-REFERENCE: Mark's calendar  vs  Vimeo ==========`);
    console.log(`Vimeo recordings: ${rows.length}  | with transcript: ${withT} | WITHOUT transcript: ${rows.length - withT}`);
    console.log(`By duration:  >=10min (est SHOW): ${estShow}   <10min (est no-show/short): ${estNoShowRec}`);
    console.log(`Recordings matched to a calendar appt: ${rows.filter(r => r.appt).length} | unmatched: ${rows.filter(r => !r.appt).length}`);
    console.log(`Past calendar appts: ${pastAppts.length} | with a recording: ${apptsWithRec.size} | NO recording (=no-show): ${apptsNoRec.length}`);
    const estShows = estShow;                 // recordings >=10min => shows
    const heldEst = estShows + apptsNoRec.length;
    console.log(`\nESTIMATED show rate = shows(${estShows}) / held(${heldEst}) = ${heldEst ? (100*estShows/heldEst).toFixed(1) : '—'}%`);
    console.log(`\n--- FLAGGED: >=10min recording with NO transcript (treat as Show, but unscored) : ${flagged.length} ---`);
    flagged.sort((a,b)=>(a.v.day||'').localeCompare(b.v.day||'')).forEach(r =>
      console.log(`   ${r.v.day}  ${String(Math.round(r.v.duration/60)).padStart(3)}m  ${r.v.prospect}  ${r.appt ? '[matched]' : '[NO appt]'}`));
    console.log(`\n--- short recordings <10min (likely no-show / quick cancel) ---`);
    rows.filter(r=>!r.long).sort((a,b)=>(a.v.day||'').localeCompare(b.v.day||'')).forEach(r =>
      console.log(`   ${r.v.day}  ${String(Math.round(r.v.duration/60)).padStart(3)}m  ${r.v.prospect}  ${r.hasT?'(has transcript)':''}`));
    return;
  }

  const used = new Set();
  let matched = 0, unmatched = 0, projShow = 0, projNoShow = 0;
  const plan = [];
  for (const v of videos) {
    const appt = appts.find(a => !used.has(a.call_id) && a.day === v.day && nameMatch(v.prospect, a.prospect_name));
    if (appt) { used.add(appt.call_id); matched++; } else unmatched++;
    const isShowGuess = v.duration >= SHOW_MIN_DURATION;
    if (appt) (isShowGuess ? projShow++ : projNoShow++);
    plan.push({ v, appt, isShowGuess });
  }
  console.log(`matched to appointment: ${matched} | unmatched: ${unmatched}`);
  console.log(`projected (by duration>=${SHOW_MIN_DURATION}s): show=${projShow}, no-show=${projNoShow}`);
  console.log('\nunmatched recordings (no calendar appointment):');
  plan.filter(p => !p.appt).slice(0, 30).forEach(p => console.log(`   - ${p.v.day}  ${p.v.prospect}  (${Math.round(p.v.duration/60)}m)`));

  if (FINALIZE) {
    // Deterministic attendance pass — direct updates, immune to the prod no-show timer.
    // Show = matched recording >= 10min (per user's rule). Everything else past = No-Show.
    const TODAY = new Date().toISOString().slice(0, 10);
    const showIds = new Set();
    for (const { v, appt } of plan) {
      if (appt && v.duration >= SHOW_MIN_DURATION) showIds.add(appt.call_id);
    }
    let setShow = 0, setNoShow = 0;
    for (const id of showIds) {
      await callQueries.update(id, CLIENT_ID, { attendance: 'Show', source: 'Vimeo' });
      setShow++;
    }
    const pastNonShow = appts.filter(a => a.day < TODAY && !showIds.has(a.call_id));
    for (const a of pastNonShow) {
      await callQueries.update(a.call_id, CLIENT_ID, { attendance: 'Ghosted - No Show' });
      setNoShow++;
    }
    const held = setShow + setNoShow;
    console.log(`\nFINALIZE: set Show=${setShow}, No-Show=${setNoShow} | held(past)=${held} | show-rate=${held ? (100*setShow/held).toFixed(1) : '—'}%`);
    console.log('(future appointments left as upcoming; AI scoring of transcripted calls handled separately)');
    return;
  }

  if (!APPLY) { console.log('\nDRY RUN — no writes, no AI. Re-run with --apply.'); return; }

  let done = 0, scored = 0, showNoScore = 0, shortNoShow = 0, errors = 0, skipped = 0;
  for (const { v, appt } of plan) {
    if (done >= LIMIT) break;
    if (!appt) { skipped++; continue; }
    try {
      const text = await vttText(v.id);
      await sleep(600);
      const words = text ? text.split(' ').length : 0;
      const hasT = words > 0;
      // Duration-primary: >=10min => Show; OR a substantial 2-way transcript even if short.
      const isShow = v.duration >= SHOW_MIN_DURATION || (hasT && words >= SHOW_MIN_WORDS);

      if (isShow && hasT) {
        // Real transcript -> run pipeline (Show + AI scoring)
        const apptTs = await bq.queryAdmin(
          `SELECT CAST(appointment_date AS STRING) ts FROM \`closer-automation.CloserAutomation.Calls\` WHERE client_id=@c AND call_id=@id`,
          { c: CLIENT_ID, id: appt.call_id });
        const payload = {
          closer_email: CLOSER_EMAIL, prospect_name: v.prospect,
          scheduled_start_time: apptTs[0] && apptTs[0].ts,
          transcript: text, duration_seconds: v.duration, title: v.title,
          meeting_id: `vimeo-${v.id}`, share_url: `https://vimeo.com/${v.id}`,
          speakers: [{ name: 'Mark' }, { name: v.prospect }],
        };
        const r = await transcriptService.processTranscriptWebhook('generic', payload, { callIdHint: appt.call_id, clientIdHint: CLIENT_ID });
        scored++;
        console.log(`  ${v.day} ${v.prospect} ${Math.round(v.duration/60)}m (${words}w) -> ${r.action}${r.callRecord?.call_outcome ? ' / ' + r.callRecord.call_outcome : ''} [AI]`);
      } else if (isShow && !hasT) {
        // Long recording, no transcript -> mark Show directly (no AI score)
        await callQueries.update(appt.call_id, CLIENT_ID, {
          attendance: 'Show', processing_status: 'no_transcript',
          recording_url: `https://vimeo.com/${v.id}`, source: 'Vimeo',
          duration_minutes: Math.round(v.duration / 60),
        });
        showNoScore++;
        console.log(`  ${v.day} ${v.prospect} ${Math.round(v.duration/60)}m -> show (no transcript, unscored)`);
      } else {
        // Short / one-sided -> leave as pre-outcome; reconcile marks it No-Show.
        shortNoShow++;
        console.log(`  ${v.day} ${v.prospect} ${Math.round(v.duration/60)}m -> (short -> no-show)`);
      }
    } catch (err) {
      errors++;
      console.error(`  ERR ${v.day} ${v.prospect}: ${err.message}`);
    }
    done++;
  }
  console.log(`\nprocessed: ${done} | shows scored(AI): ${scored} | shows unscored(no transcript): ${showNoScore} | short->no-show: ${shortNoShow} | skipped(unmatched): ${skipped} | errors: ${errors}`);
}

main().then(() => process.exit(0)).catch(e => { console.error('FATAL:', e.message); process.exit(1); });
