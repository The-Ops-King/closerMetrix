/**
 * TIMEOUT SERVICE — Background Two-Phase Ghost/No-Show Detection
 *
 * Periodically scans for calls and transitions them through two phases:
 *
 * PHASE 1: null/Scheduled → Waiting for Outcome
 *   Triggered when the appointment END TIME has passed (no offset).
 *   This removes the call from "upcoming" and signals it's in limbo.
 *
 * PHASE 2: Waiting for Outcome → Ghosted - No Show
 *   Triggered after TRANSCRIPT_TIMEOUT_MINUTES have passed since the
 *   appointment end time. If no transcript arrived, it's a ghost.
 *
 * HOW IT WORKS:
 * 1. start() is called once at server startup
 * 2. Runs the check immediately (10s delay for BigQuery to connect)
 * 3. Then runs on a configurable interval (default: every 5 minutes)
 * 4. Phase 1 query: attendance IS NULL or 'Scheduled', end time < now
 * 5. Phase 2 query: attendance = 'Waiting for Outcome', end time < (now - timeout)
 *
 * CONFIGURATION (via .env):
 * - TRANSCRIPT_TIMEOUT_MINUTES: How long to wait for a transcript (default 120)
 * - GHOST_CHECK_INTERVAL_MINUTES: How often to run this check (default 5)
 *
 * CAN ALSO BE TRIGGERED MANUALLY:
 * - POST /admin/jobs/check-timeouts (calls checkAllClients directly)
 *
 * NOTE: If a transcript arrives AFTER a call is marked Waiting or Ghosted,
 * the transcript pipeline can override it (both → Show are valid transitions).
 */

const callQueries = require('../db/queries/calls');
const closerQueries = require('../db/queries/closers');
const callStateManager = require('./CallStateManager');
const transcriptService = require('./transcript/TranscriptService');
const fathomAPI = require('./transcript/FathomAPI');
const alertService = require('../utils/AlertService');
const config = require('../config');
const logger = require('../utils/logger');

class TimeoutService {
  constructor() {
    this._intervalHandle = null;
    this._initialTimeout = null;
    this._running = false;
  }

  /**
   * Starts the periodic ghost check timer.
   *
   * Called once at server startup from index.js. Runs the first check
   * after a 10-second delay (to let BigQuery warm up), then repeats
   * on the configured interval.
   */
  start() {
    const intervalMinutes = config.timeouts.ghostCheckIntervalMinutes || 5;
    const intervalMs = intervalMinutes * 60 * 1000;

    logger.info('TimeoutService started', {
      checkIntervalMinutes: intervalMinutes,
      transcriptTimeoutMinutes: config.timeouts.transcriptTimeoutMinutes,
    });

    // Run once immediately (small delay for BigQuery to be ready)
    this._initialTimeout = setTimeout(() => this.checkAllClients(), 10_000);

    // Then repeat on interval
    this._intervalHandle = setInterval(() => this.checkAllClients(), intervalMs);
  }

  /**
   * Stops the periodic check. Used for graceful shutdown and testing.
   */
  stop() {
    if (this._initialTimeout) {
      clearTimeout(this._initialTimeout);
      this._initialTimeout = null;
    }
    if (this._intervalHandle) {
      clearInterval(this._intervalHandle);
      this._intervalHandle = null;
    }
    logger.info('TimeoutService stopped');
  }

  /**
   * Runs the two-phase timeout check across all active clients.
   *
   * Phase 1: null/Scheduled → Waiting for Outcome (end time has passed)
   * Phase 2: Waiting for Outcome → Ghosted - No Show (timeout elapsed)
   *
   * Prevents overlapping runs — if a previous sweep is still in progress,
   * the new one is skipped.
   *
   * @returns {Object} Summary with phase breakdowns
   */
  async checkAllClients() {
    // Prevent overlapping runs
    if (this._running) {
      logger.debug('TimeoutService — skipping, previous run still in progress');
      return { total_checked: 0, total_waiting: 0, total_polled: 0, total_timed_out: 0, errors: 0 };
    }

    this._running = true;
    const startTime = Date.now();

    try {
      const timeoutMinutes = config.timeouts.transcriptTimeoutMinutes;
      const now = new Date().toISOString();
      const timeoutCutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();

      logger.debug('TimeoutService — running two-phase sweep', {
        now,
        timeoutCutoff,
        timeoutMinutes,
      });

      let totalWaiting = 0;
      let totalTimedOut = 0;
      let totalPolled = 0;
      let errors = 0;

      // ── PHASE 1: null/Scheduled → Waiting for Outcome ──
      const pendingCalls = await callQueries.findPendingPastEndTime(now);

      for (const call of pendingCalls) {
        try {
          const transitioned = await callStateManager.transitionState(
            call.call_id,
            call.client_id,
            'Waiting for Outcome',
            'appointment_time_passed'
          );

          if (transitioned) {
            totalWaiting++;
            logger.info('Call moved to Waiting for Outcome', {
              callId: call.call_id,
              clientId: call.client_id,
              appointmentDate: call.appointment_date,
              prospectEmail: call.prospect_email,
            });
          }
        } catch (error) {
          errors++;
          logger.error('TimeoutService — Phase 1 error', {
            callId: call.call_id,
            clientId: call.client_id,
            error: error.message,
          });
        }
      }

      // ── PHASE 1.5: Poll Fathom for missing transcripts ──
      try {
        const pollResult = await this._pollFathomForMissingTranscripts();
        totalPolled = pollResult.matched;
        if (pollResult.errors > 0) {
          errors += pollResult.errors;
        }
      } catch (error) {
        logger.error('TimeoutService — Phase 1.5 (Fathom polling) failed entirely', {
          error: error.message,
        });
      }

      // ── PHASE 2: Waiting for Outcome → Ghosted - No Show ──
      const waitingCalls = await callQueries.findWaitingPastTimeout(timeoutCutoff);

      for (const call of waitingCalls) {
        try {
          const transitioned = await callStateManager.transitionState(
            call.call_id,
            call.client_id,
            'Ghosted - No Show',
            'transcript_timeout',
            {
              transcript_status: 'No Transcript',
            }
          );

          if (transitioned) {
            totalTimedOut++;
            logger.info('Call timed out — marked as Ghosted', {
              callId: call.call_id,
              clientId: call.client_id,
              closerId: call.closer_id,
              appointmentDate: call.appointment_date,
              prospectEmail: call.prospect_email,
            });
          }
        } catch (error) {
          errors++;
          logger.error('TimeoutService — Phase 2 error', {
            callId: call.call_id,
            clientId: call.client_id,
            error: error.message,
          });
        }
      }

      const totalChecked = pendingCalls.length + waitingCalls.length;
      const durationMs = Date.now() - startTime;

      logger.info('TimeoutService — sweep complete', {
        totalChecked,
        totalWaiting,
        totalPolled,
        totalTimedOut,
        errors,
        durationMs,
      });

      // Alert if there were errors
      if (errors > 0) {
        await alertService.send({
          severity: 'medium',
          title: 'TimeoutService Errors',
          details: `${errors} of ${totalChecked} calls failed to transition`,
          suggestedAction: 'Check logs for individual call errors',
        });
      }

      return { total_checked: totalChecked, total_waiting: totalWaiting, total_polled: totalPolled, total_timed_out: totalTimedOut, errors };
    } catch (error) {
      logger.error('TimeoutService — sweep failed entirely', {
        error: error.message,
        stack: error.stack,
      });

      await alertService.send({
        severity: 'high',
        title: 'TimeoutService Sweep Failed',
        details: 'The ghost detection background job failed completely',
        error: error.message,
        suggestedAction: 'Check BigQuery connectivity and query permissions',
      });

      return { total_checked: 0, total_waiting: 0, total_polled: 0, total_timed_out: 0, errors: 1 };
    } finally {
      this._running = false;
    }
  }

  /**
   * Checks a single client for stuck calls (two-phase).
   * Useful for manual/admin triggers on a specific client.
   *
   * @param {string} clientId — Client to check
   * @returns {Object} { checked, waiting, timed_out, call_ids }
   */
  async checkClient(clientId) {
    const timeoutMinutes = config.timeouts.transcriptTimeoutMinutes;
    const now = new Date().toISOString();
    const timeoutCutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();

    const result = {
      checked: 0,
      waiting: 0,
      timed_out: 0,
      call_ids: [],
    };

    // Phase 1: null/Scheduled → Waiting for Outcome
    const pendingCalls = await callQueries.findPendingPastEndTimeForClient(clientId, now);
    result.checked += pendingCalls.length;

    for (const call of pendingCalls) {
      const transitioned = await callStateManager.transitionState(
        call.call_id,
        clientId,
        'Waiting for Outcome',
        'appointment_time_passed'
      );

      if (transitioned) {
        result.waiting += 1;
        result.call_ids.push(call.call_id);

        logger.info('Call moved to Waiting for Outcome', {
          callId: call.call_id,
          clientId,
          appointmentDate: call.appointment_date,
          prospectEmail: call.prospect_email,
        });
      }
    }

    // Phase 2: Waiting for Outcome → Ghosted - No Show
    const waitingCalls = await callQueries.findWaitingPastTimeoutForClient(clientId, timeoutCutoff);
    result.checked += waitingCalls.length;

    for (const call of waitingCalls) {
      const transitioned = await callStateManager.transitionState(
        call.call_id,
        clientId,
        'Ghosted - No Show',
        'transcript_timeout',
        {
          transcript_status: 'No Transcript',
        }
      );

      if (transitioned) {
        result.timed_out += 1;
        result.call_ids.push(call.call_id);

        logger.info('Call timed out — marked as Ghosted', {
          callId: call.call_id,
          clientId,
          appointmentDate: call.appointment_date,
          prospectEmail: call.prospect_email,
        });
      }
    }

    return result;
  }

  /**
   * PHASE 1.5: Polls Fathom for recordings that match calls waiting for transcripts.
   *
   * When Fathom webhooks don't arrive (unreliable delivery, misconfiguration, etc.),
   * this fallback polls the Fathom API directly using each closer's API key.
   *
   * For each closer with a Fathom API key:
   * 1. Find their calls in "Waiting for Outcome" (or null/Scheduled) with no transcript
   * 2. Fetch recent meetings from Fathom
   * 3. Match meetings to calls by scheduled time (±30 min tolerance)
   * 4. Process any matched recordings through the normal TranscriptService pipeline
   *
   * @returns {Object} { closers_checked, meetings_found, matched, errors }
   */
  async _pollFathomForMissingTranscripts() {
    const result = { closers_checked: 0, meetings_found: 0, matched: 0, errors: 0 };

    let closers;
    try {
      closers = await closerQueries.findFathomClosersWithApiKey();
    } catch (error) {
      logger.error('TimeoutService — failed to fetch Fathom closers', { error: error.message });
      return result;
    }

    if (closers.length === 0) {
      logger.debug('TimeoutService — no Fathom closers with API keys, skipping polling');
      return result;
    }

    logger.info('TimeoutService — polling Fathom for missing transcripts', {
      closerCount: closers.length,
    });

    for (const closer of closers) {
      result.closers_checked++;

      try {
        // Find calls waiting for transcripts for this closer
        const waitingCalls = await callQueries.findWaitingForTranscript(
          closer.closer_id,
          closer.client_id
        );

        if (waitingCalls.length === 0) {
          continue; // No calls waiting — nothing to poll for
        }

        // Poll Fathom for recent meetings (look back 24 hours)
        const lookbackTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        let meetings;
        try {
          meetings = await fathomAPI.listRecentMeetings(closer.transcript_api_key, lookbackTime);
        } catch (error) {
          logger.error('TimeoutService — Fathom API poll failed for closer', {
            closerId: closer.closer_id,
            closerName: closer.name,
            error: error.message,
          });
          result.errors++;
          continue;
        }

        result.meetings_found += meetings.length;

        if (meetings.length === 0) {
          continue;
        }

        // Try to match meetings to waiting calls by scheduled time
        for (const meeting of meetings) {
          // Skip meetings without a transcript
          if (!meeting.transcript || !Array.isArray(meeting.transcript) || meeting.transcript.length === 0) {
            continue;
          }

          const meetingTime = new Date(meeting.scheduled_start_time || meeting.created_at);

          for (const call of waitingCalls) {
            // Skip if this call already got a transcript from a previous match in this loop
            if (call._matched) continue;

            const callTime = new Date(call.appointment_date);
            const timeDiffMinutes = Math.abs(meetingTime - callTime) / (1000 * 60);

            // Match if within 30 minutes
            if (timeDiffMinutes <= 30) {
              logger.info('TimeoutService — Fathom poll matched recording to call', {
                callId: call.call_id,
                closerName: closer.name,
                recordingId: meeting.recording_id,
                callTime: call.appointment_date,
                meetingTime: meeting.scheduled_start_time || meeting.created_at,
                timeDiffMinutes: Math.round(timeDiffMinutes),
              });

              try {
                // Process through TranscriptService, passing the matched call_id
                // so it updates THIS call instead of creating a duplicate
                await transcriptService.processTranscriptWebhook('fathom', meeting, {
                  callIdHint: call.call_id,
                  clientIdHint: closer.client_id,
                });
                result.matched++;
                call._matched = true; // Prevent double-matching
              } catch (error) {
                logger.error('TimeoutService — failed to process polled Fathom recording', {
                  callId: call.call_id,
                  recordingId: meeting.recording_id,
                  error: error.message,
                });
                result.errors++;
              }

              break; // Move to next meeting
            }
          }
        }
      } catch (error) {
        logger.error('TimeoutService — Fathom polling error for closer', {
          closerId: closer.closer_id,
          error: error.message,
        });
        result.errors++;
      }
    }

    logger.info('TimeoutService — Fathom polling complete', result);
    return result;
  }
}

module.exports = new TimeoutService();
