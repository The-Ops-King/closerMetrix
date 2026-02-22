/**
 * TRANSCRIPT SERVICE — Orchestrator
 *
 * Orchestrates the full transcript processing pipeline:
 * 1. Select the right adapter based on provider
 * 2. Normalize the webhook payload into StandardTranscript
 * 3. Identify the client (from closer's work_email)
 * 4. Match the transcript to an existing call record
 * 5. Evaluate transcript quality (Show vs Ghosted)
 * 6. Update the call record state
 * 7. Queue for AI processing if it's a Show
 *
 * This is the bridge between "a transcript provider sent us a webhook" and
 * "a call record is updated and ready for AI analysis."
 */

const fathomAdapter = require('./adapters/FathomAdapter');
const tldvAdapter = require('./adapters/TLDVAdapter');
const genericAdapter = require('./adapters/GenericAdapter');
const callStateManager = require('../CallStateManager');
const aiProcessor = require('../ai/AIProcessor');
const callQueries = require('../../db/queries/calls');
const closerQueries = require('../../db/queries/closers');
const auditLogger = require('../../utils/AuditLogger');
const alertService = require('../../utils/AlertService');
const logger = require('../../utils/logger');
const config = require('../../config');

/**
 * Maps provider keys to their adapter instances.
 * Tier 2 providers (readai, otter, grain, gong) use the GenericAdapter
 * since they don't have dedicated adapters yet — their webhook payloads
 * should be sent in the generic format, or a dedicated adapter can be
 * added later without changing this service.
 */
const ADAPTERS = {
  fathom: fathomAdapter,
  tldv: tldvAdapter,
  readai: genericAdapter,
  otter: genericAdapter,
  grain: genericAdapter,
  gong: genericAdapter,
  generic: genericAdapter,
};

class TranscriptService {
  /**
   * Processes an incoming transcript webhook.
   *
   * @param {string} provider — Provider key (from URL param)
   * @param {Object} rawPayload — Raw webhook body
   * @param {Object} [options] — Optional processing hints
   * @param {string} [options.callIdHint] — If provided, skip matching and use this call directly.
   *   Used by TimeoutService Fathom polling, which already matched the recording to a call.
   * @param {string} [options.clientIdHint] — Client ID hint (avoids re-lookup when callIdHint is set)
   * @returns {Object} { action, callRecord, transcript }
   */
  async processTranscriptWebhook(provider, rawPayload, options = {}) {
    const adapter = ADAPTERS[provider];
    if (!adapter) {
      throw new Error(`No adapter found for provider: ${provider}`);
    }

    // Step 1: Normalize the payload
    const transcript = adapter.normalizePayload(rawPayload);

    // Step 2: Check if transcript content is present
    if (!transcript.transcript) {
      logger.info('Transcript webhook received without transcript content', {
        provider,
        meetingId: transcript.providerMeetingId,
        closerEmail: transcript.closerEmail,
      });

      // For Tier 1 providers, we could poll — for now, return needs_polling
      return {
        action: 'needs_polling',
        callRecord: null,
        transcript,
        provider,
        meetingId: transcript.providerMeetingId,
      };
    }

    // Step 3: Identify the client from the closer's email
    // When callIdHint + clientIdHint are provided (from Fathom polling),
    // use the hinted client to avoid ambiguity when a closer has records
    // under multiple clients with the same work_email.
    let clientId, closer;

    if (options.callIdHint && options.clientIdHint) {
      // Trusted hint from polling — look up closer under the specific client
      closer = await closerQueries.findByWorkEmail(transcript.closerEmail, options.clientIdHint);
      if (closer) {
        clientId = options.clientIdHint;
      }
    }

    if (!clientId) {
      const clientInfo = await this._identifyClient(transcript.closerEmail);
      if (!clientInfo) {
        logger.error('Cannot identify client from closer email', {
          closerEmail: transcript.closerEmail,
          provider,
        });

        await alertService.send({
          severity: 'high',
          title: 'Unknown Closer on Transcript Webhook',
          details: `Closer email ${transcript.closerEmail} doesn't match any active closer`,
          provider,
        });

        return { action: 'unidentified', callRecord: null, transcript };
      }

      clientId = clientInfo.clientId;
      closer = clientInfo.closer;
    }

    // Step 4: Match transcript to an existing call record
    // If a callIdHint was provided (e.g., from Fathom polling), use that call directly
    // instead of doing independent matching that might find a different call or create a duplicate.
    const callRecord = options.callIdHint
      ? await this._fetchHintedCall(options.callIdHint, clientId, transcript, closer)
      : await this._matchToCallRecord(transcript, clientId, closer);

    // Step 5: Evaluate transcript quality
    const evaluation = this.evaluateTranscript(transcript);

    // Step 6: Update the call record
    const result = await this._updateCallWithTranscript(
      callRecord, transcript, evaluation, clientId
    );

    return {
      action: result.action,
      callRecord: result.callRecord,
      transcript,
      evaluation,
    };
  }

  /**
   * Evaluates a transcript to determine if it represents a real conversation
   * (Show) or a no-show (Ghosted).
   *
   * Rules from CLAUDE.md:
   * 1. transcript is null or empty → Ghosted
   * 2. transcript length < 50 chars → Ghosted
   * 3. Only one speaker → Ghosted (closer talked to themselves)
   * 4. Non-closer speaker has < 3 utterances totaling < 50 words → Ghosted
   * 5. Otherwise → Show
   *
   * @param {Object} transcript — StandardTranscript
   * @returns {Object} { isShow, reason, trigger }
   */
  evaluateTranscript(transcript) {
    const thresholds = config.transcriptThresholds;

    // Rule 1: No transcript
    if (!transcript.transcript) {
      return {
        isShow: false,
        reason: 'no_transcript',
        trigger: 'transcript_received_empty_or_one_speaker',
      };
    }

    // Rule 2: Too short
    if (transcript.transcript.length < thresholds.minLength) {
      return {
        isShow: false,
        reason: 'transcript_too_short',
        trigger: 'transcript_received_empty_or_one_speaker',
      };
    }

    // Rule 3: Only one speaker
    if (transcript.speakerCount != null && transcript.speakerCount < 2) {
      return {
        isShow: false,
        reason: 'single_speaker',
        trigger: 'transcript_received_empty_or_one_speaker',
      };
    }

    // Rule 4: 2+ speakers = Show, always. Let the AI determine the outcome
    // (Follow Up, Disqualified, Not Pitched, etc.) even if the prospect
    // barely spoke. A short "let's cancel" conversation is still a Show —
    // the AI will classify the outcome appropriately.
    return {
      isShow: true,
      reason: 'valid_conversation',
      trigger: 'transcript_received_valid',
    };
  }

  /**
   * Identifies the client by looking up the closer's work email.
   * The closer record contains client_id which tells us who this belongs to.
   *
   * @param {string} closerEmail — Closer's email from the transcript
   * @returns {Object|null} { clientId, closer } or null
   */
  async _identifyClient(closerEmail) {
    if (!closerEmail) return null;

    // Look up across all clients (transcript doesn't tell us the client)
    const closer = await closerQueries.findByWorkEmailAnyClient(closerEmail);
    if (!closer) return null;

    return {
      clientId: closer.client_id,
      closer,
    };
  }

  /**
   * Matches a transcript to an existing call record.
   *
   * Matching priority (from CLAUDE.md):
   * 1. closer_email + prospect_email + scheduled_start_time (±30 min)
   * 2. closer_email + scheduled_start_time (±30 min)
   * 3. No match → create a new call record
   *
   * @param {Object} transcript — StandardTranscript
   * @param {string} clientId — Client scope
   * @param {Object} closer — Closer record
   * @returns {Object} Existing or newly created call record
   */
  async _matchToCallRecord(transcript, clientId, closer) {
    // Try high-confidence match (closer + prospect + time)
    if (transcript.prospectEmail && transcript.scheduledStartTime) {
      const match = await callQueries.findForTranscriptMatchWithProspect(
        clientId,
        closer.work_email,
        transcript.prospectEmail,
        transcript.scheduledStartTime
      );
      if (match) {
        logger.info('Transcript matched to call (high confidence)', {
          callId: match.call_id,
          matchType: 'closer+prospect+time',
        });
        return match;
      }
    }

    // Try medium-confidence match (closer + time)
    if (transcript.scheduledStartTime) {
      const match = await callQueries.findForTranscriptMatch(
        clientId,
        closer.work_email,
        transcript.scheduledStartTime
      );
      if (match) {
        logger.info('Transcript matched to call (medium confidence)', {
          callId: match.call_id,
          matchType: 'closer+time',
        });
        return match;
      }
    }

    // No match — transcript arrived before calendar webhook, or calendar event missing
    logger.warn('No matching call record for transcript, creating new record', {
      closerEmail: closer.work_email,
      clientId,
      scheduledTime: transcript.scheduledStartTime,
    });

    return this._createCallFromTranscript(transcript, clientId, closer);
  }

  /**
   * Fetches the specific call record identified by the callIdHint.
   * Used when the caller (e.g., Fathom polling) has already matched
   * the recording to a specific call and we should update THAT call
   * rather than doing independent matching.
   *
   * Falls back to normal matching if the hinted call can't be found
   * or is already in a terminal state.
   *
   * @param {string} callId — The call_id to fetch
   * @param {string} clientId — Client scope
   * @param {Object} transcript — StandardTranscript (for fallback matching)
   * @param {Object} closer — Closer record (for fallback matching)
   * @returns {Object} Call record
   */
  async _fetchHintedCall(callId, clientId, transcript, closer) {
    const call = await callQueries.findById(callId, clientId);

    if (!call) {
      logger.warn('Hinted call not found, falling back to normal matching', {
        callId,
        clientId,
      });
      return this._matchToCallRecord(transcript, clientId, closer);
    }

    // Don't update calls that already have a transcript (Show, Ghosted, or any outcome)
    const preOutcomeStates = [null, 'Scheduled', 'Waiting for Outcome'];
    if (!preOutcomeStates.includes(call.attendance)) {
      logger.info('Hinted call already processed, skipping', {
        callId,
        attendance: call.attendance,
      });
      return call;
    }

    logger.info('Using hinted call from Fathom polling', {
      callId: call.call_id,
      attendance: call.attendance,
    });

    return call;
  }

  /**
   * Creates a new call record when a transcript arrives without a matching
   * calendar event. This handles the case where:
   * - Calendar webhook hasn't fired yet
   * - Calendar event was missing/filtered out
   * - Manual upload or catch-up processing
   *
   * @param {Object} transcript — StandardTranscript
   * @param {string} clientId — Client scope
   * @param {Object} closer — Closer record
   * @returns {Object} New call record
   */
  async _createCallFromTranscript(transcript, clientId, closer) {
    const { generateId } = require('../../utils/idGenerator');
    const { nowISO } = require('../../utils/dateUtils');

    const callType = await callStateManager.determineCallType(
      transcript.prospectEmail || 'unknown',
      clientId
    );

    const now = nowISO();
    const callRecord = {
      call_id: generateId(),
      appointment_id: `transcript_${transcript.providerMeetingId || generateId()}`,
      client_id: clientId,
      closer_id: closer.closer_id,
      prospect_name: transcript.prospectName || null,
      prospect_email: transcript.prospectEmail || 'unknown',
      appointment_date: transcript.scheduledStartTime || transcript.recordingStartTime || now,
      timezone: 'UTC',
      call_type: callType,
      attendance: null,
      call_outcome: null,
      source: `Transcript (${transcript.provider})`,
      transcript_status: 'Received',
      transcript_provider: transcript.provider,
      transcript_link: transcript.shareUrl || null,
      recording_url: transcript.shareUrl || null,
      call_url: transcript.transcriptUrl || null,
      duration_minutes: transcript.durationSeconds
        ? Math.round(transcript.durationSeconds / 60)
        : null,
      processing_status: 'pending',
      processing_error: null,
      ingestion_source: 'transcript',
      created: now,
      last_modified: now,
      client: clientId,
      closer: closer.name,
    };

    await callQueries.create(callRecord);

    await auditLogger.log({
      clientId,
      entityType: 'call',
      entityId: callRecord.call_id,
      action: 'created',
      newValue: null,
      triggerSource: 'transcript_webhook',
      triggerDetail: transcript.provider,
      metadata: {
        reason: 'no_matching_calendar_event',
        closer_name: closer.name,
        prospect_email: transcript.prospectEmail,
      },
    });

    return callRecord;
  }

  /**
   * Updates a call record with transcript data and transitions its state.
   *
   * @param {Object} callRecord — The matched/created call record
   * @param {Object} transcript — StandardTranscript
   * @param {Object} evaluation — { isShow, reason, trigger }
   * @param {string} clientId — Client scope
   * @returns {Object} { action, callRecord }
   */
  async _updateCallWithTranscript(callRecord, transcript, evaluation, clientId) {
    const newState = evaluation.isShow ? 'Show' : 'Ghosted - No Show';

    const additionalUpdates = {
      transcript_status: 'Received',
      transcript_provider: transcript.provider,
      transcript_link: transcript.shareUrl || callRecord.transcript_link,
      recording_url: transcript.shareUrl || callRecord.recording_url,
      call_url: transcript.transcriptUrl || callRecord.call_url,
      duration_minutes: transcript.durationSeconds
        ? Math.round(transcript.durationSeconds / 60)
        : callRecord.duration_minutes,
    };

    // If it's a Show, mark for AI processing
    if (evaluation.isShow) {
      additionalUpdates.processing_status = 'queued';
    } else {
      additionalUpdates.processing_status = 'complete';
    }

    // Update prospect info if we have better data from transcript
    if (transcript.prospectEmail && callRecord.prospect_email === 'unknown') {
      additionalUpdates.prospect_email = transcript.prospectEmail;
    }
    if (transcript.prospectName && !callRecord.prospect_name) {
      additionalUpdates.prospect_name = transcript.prospectName;
    }

    const transitioned = await callStateManager.transitionState(
      callRecord.call_id,
      clientId,
      newState,
      evaluation.trigger,
      additionalUpdates
    );

    if (!transitioned) {
      logger.error('Failed to transition call state after transcript', {
        callId: callRecord.call_id,
        currentState: callRecord.attendance,
        targetState: newState,
        trigger: evaluation.trigger,
      });

      return {
        action: 'error',
        callRecord,
      };
    }

    const action = evaluation.isShow ? 'show' : 'ghosted';

    logger.info(`Transcript processed — ${action}`, {
      callId: callRecord.call_id,
      clientId,
      provider: transcript.provider,
      evaluation: evaluation.reason,
      durationSeconds: transcript.durationSeconds,
      speakerCount: transcript.speakerCount,
    });

    // If it's a Show, kick off AI processing with the transcript text.
    // This runs inline (still async relative to HTTP response since the
    // webhook route already returned 200). If AI fails, the call stays
    // as "Show" with processing_status='error' — AIProcessor handles that.
    if (evaluation.isShow && transcript.transcript) {
      try {
        const aiResult = await aiProcessor.processCall(
          callRecord.call_id,
          clientId,
          transcript.transcript
        );

        if (aiResult.success) {
          logger.info('AI processing completed inline after transcript', {
            callId: callRecord.call_id,
            outcome: aiResult.outcome,
            costUsd: aiResult.costUsd,
          });
        } else {
          logger.error('AI processing failed inline after transcript', {
            callId: callRecord.call_id,
            error: aiResult.error,
          });
        }
      } catch (error) {
        // AI failure should never fail the transcript processing.
        // The call is already marked as Show — AI can be retried later.
        logger.error('AI processing threw unexpected error', {
          callId: callRecord.call_id,
          clientId,
          error: error.message,
        });
      }
    }

    return {
      action,
      callRecord: { ...callRecord, attendance: newState, ...additionalUpdates },
    };
  }
}

module.exports = new TranscriptService();
