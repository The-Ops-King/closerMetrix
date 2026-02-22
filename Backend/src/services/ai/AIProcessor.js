/**
 * AI PROCESSOR — Orchestrates AI Analysis of Sales Call Transcripts
 *
 * This is the main entry point for Phase 4. When a call has been marked
 * as "Show" with processing_status="queued", this processor:
 *
 * 1. Fetches the client record (for mini-prompts)
 * 2. Builds the two-layer prompt (PromptBuilder)
 * 3. Calls the Anthropic API
 * 4. Parses and validates the response (ResponseParser)
 * 5. Updates the call record with outcome and scores
 * 6. Extracts and stores objections in BigQuery
 * 7. Records the cost (CostTracker)
 * 8. Transitions the call state (Show → outcome)
 *
 * Error handling: If any step fails, the call's processing_status is set
 * to 'error' and the error is logged. The call stays in 'Show' state so
 * it can be reprocessed later.
 */

const Anthropic = require('@anthropic-ai/sdk');
const promptBuilder = require('./PromptBuilder');
const responseParser = require('./ResponseParser');
const costTracker = require('../../utils/CostTracker');
const callQueries = require('../../db/queries/calls');
const clientQueries = require('../../db/queries/clients');
const objectionQueries = require('../../db/queries/objections');
const callStateManager = require('../CallStateManager');
const auditLogger = require('../../utils/AuditLogger');
const logger = require('../../utils/logger');
const config = require('../../config');
const { generateId } = require('../../utils/idGenerator');

class AIProcessor {
  constructor() {
    this._client = null;
  }

  /**
   * Lazily initializes the Anthropic client.
   * Only created when actually needed (avoids errors in test/dev without API key).
   */
  _getAnthropicClient() {
    if (!this._client) {
      if (!config.ai.apiKey) {
        throw new Error('ANTHROPIC_API_KEY is not configured');
      }
      this._client = new Anthropic({ apiKey: config.ai.apiKey });
    }
    return this._client;
  }

  /**
   * Processes a single call through the AI pipeline.
   *
   * @param {string} callId — The call to process
   * @param {string} clientId — Client scope
   * @param {string} transcript — The full transcript text
   * @returns {Object} { success, outcome, scores, objectionCount, costUsd }
   */
  async processCall(callId, clientId, transcript) {
    const startTime = Date.now();

    try {
      // Step 1: Fetch the call record
      const call = await callQueries.findById(callId, clientId);
      if (!call) {
        throw new Error(`Call not found: ${callId}`);
      }

      // Step 2: Fetch the client record (for mini-prompts)
      const client = await clientQueries.findById(clientId);
      if (!client) {
        throw new Error(`Client not found: ${clientId}`);
      }

      // Step 3: Mark as processing
      await callQueries.update(callId, clientId, { processing_status: 'processing' });

      // Step 4: Build the prompt
      const callMetadata = {
        call_id: call.call_id,
        call_type: call.call_type,
        closer_name: call.closer,
        prospect_name: call.prospect_name,
        prospect_email: call.prospect_email,
        duration_minutes: call.duration_minutes,
      };

      const { systemPrompt, userMessage } = promptBuilder.buildPrompt(
        client, callMetadata, transcript
      );

      // Step 5: Call the Anthropic API
      const apiResponse = await this._callAnthropic(systemPrompt, userMessage);

      // Step 6: Parse and validate the response
      const parseResult = responseParser.parse(apiResponse.text);

      if (!parseResult.success) {
        throw new Error(`AI response parsing failed: ${parseResult.error}`);
      }

      const { data } = parseResult;

      // Step 7: Update the call record with AI results
      await this._updateCallWithAIResults(call, data, clientId);

      // Step 8: Extract and store objections
      const objectionCount = await this._storeObjections(
        call.call_id, clientId, call.closer_id, data.objections
      );

      // Step 9: Record cost
      const processingTimeMs = Date.now() - startTime;
      const costEntry = await costTracker.record({
        clientId,
        callId,
        model: config.ai.model,
        inputTokens: apiResponse.inputTokens,
        outputTokens: apiResponse.outputTokens,
        processingTimeMs,
      });

      // Step 10: Audit log
      await auditLogger.log({
        clientId,
        entityType: 'call',
        entityId: callId,
        action: 'ai_processed',
        fieldChanged: 'call_outcome',
        oldValue: null,
        newValue: data.call_outcome,
        triggerSource: 'ai_processing',
        triggerDetail: config.ai.model,
        metadata: {
          scores: data.scores,
          objection_count: objectionCount,
          cost_usd: costEntry.total_cost_usd,
          processing_time_ms: processingTimeMs,
        },
      });

      logger.info('AI processing complete', {
        callId,
        clientId,
        outcome: data.call_outcome,
        objectionCount,
        costUsd: costEntry.total_cost_usd,
        processingTimeMs,
      });

      return {
        success: true,
        outcome: data.call_outcome,
        scores: data.scores,
        summary: data.summary,
        coachingNotes: data.coaching_notes,
        objectionCount,
        costUsd: costEntry.total_cost_usd,
        processingTimeMs,
      };

    } catch (error) {
      const processingTimeMs = Date.now() - startTime;

      logger.error('AI processing failed', {
        callId,
        clientId,
        error: error.message,
        processingTimeMs,
      });

      // Mark call as errored
      try {
        await callQueries.update(callId, clientId, {
          processing_status: 'error',
          processing_error: error.message,
        });
      } catch (updateErr) {
        logger.error('Failed to mark call as errored', { callId, error: updateErr.message });
      }

      // Audit log the error
      await auditLogger.log({
        clientId,
        entityType: 'call',
        entityId: callId,
        action: 'error',
        triggerSource: 'ai_processing',
        metadata: { error: error.message, processing_time_ms: processingTimeMs },
      });

      return {
        success: false,
        error: error.message,
        processingTimeMs,
      };
    }
  }

  /**
   * Calls the Anthropic API with the assembled prompt.
   *
   * @param {string} systemPrompt — System message
   * @param {string} userMessage — User message (metadata + transcript)
   * @returns {Object} { text, inputTokens, outputTokens }
   */
  async _callAnthropic(systemPrompt, userMessage) {
    const client = this._getAnthropicClient();

    const response = await client.messages.create({
      model: config.ai.model,
      max_tokens: config.ai.maxTokens,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userMessage },
      ],
    });

    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    return {
      text,
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
    };
  }

  /**
   * Updates the call record with AI analysis results and transitions state.
   */
  async _updateCallWithAIResults(call, aiData, clientId) {
    const updates = {
      call_outcome: aiData.call_outcome,
      processing_status: 'complete',
      processing_error: null,
      ai_summary: aiData.summary,
      ai_feedback: aiData.coaching_notes,
      lost_reason: aiData.disqualification_reason,
    };

    // Add individual scores
    for (const [key, value] of Object.entries(aiData.scores)) {
      if (value != null) {
        updates[key] = value;
      }
    }

    // Transition state: Show → outcome state
    const outcomeState = aiData.call_outcome;
    const transitioned = await callStateManager.transitionState(
      call.call_id,
      clientId,
      outcomeState,
      'ai_outcome',
      updates
    );

    if (!transitioned) {
      // State transition failed but we still have AI results.
      // Save the results even if state didn't transition (e.g., call was already in an outcome state)
      logger.warn('State transition failed after AI processing, saving results directly', {
        callId: call.call_id,
        currentState: call.attendance,
        targetState: outcomeState,
      });

      await callQueries.update(call.call_id, clientId, updates);
    }
  }

  /**
   * Extracts objections from AI response and writes them to BigQuery.
   *
   * @param {string} callId — Call these objections belong to
   * @param {string} clientId — Client scope
   * @param {string} closerId — Closer who handled these objections
   * @param {Array} objections — Normalized objection array from ResponseParser
   * @returns {number} Number of objections stored
   */
  async _storeObjections(callId, clientId, closerId, objections) {
    if (!objections || objections.length === 0) return 0;

    // Delete any existing objections for this call (in case of reprocessing)
    await objectionQueries.deleteByCallId(callId, clientId);

    // Build objection records — map ResponseParser fields to BigQuery column names
    const records = objections.map((obj, index) => {
      // Parse timestamp_approximate (e.g. "00:12:30" or "12:30") into seconds/minutes
      let timestampSeconds = null;
      let timestampMinutes = null;
      if (obj.timestamp_approximate) {
        const parts = obj.timestamp_approximate.split(':').map(Number);
        if (parts.length === 3) {
          timestampSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
          timestampSeconds = parts[0] * 60 + parts[1];
        }
        if (timestampSeconds != null) {
          timestampMinutes = Math.round((timestampSeconds / 60) * 100) / 100;
        }
      }

      return {
        objection_id: generateId(),
        call_id: callId,
        client_id: clientId,
        closer_id: closerId,
        objection_type: obj.objection_type,
        objection_text: obj.objection_text,
        resolved: obj.was_overcome || false,
        resolution_text: obj.closer_response || null,
        resolution_method: obj.was_overcome ? 'handled' : null,
        timestamp_seconds: timestampSeconds,
        timestamp_minutes: timestampMinutes,
        created_at: new Date().toISOString(),
        last_modified: new Date().toISOString(),
      };
    });

    await objectionQueries.createMany(records);

    logger.debug('Objections stored', {
      callId,
      clientId,
      count: records.length,
      types: records.map(r => r.objection_type),
    });

    return records.length;
  }

  /**
   * Allows overriding the Anthropic client (for testing).
   */
  _setAnthropicClient(client) {
    this._client = client;
  }
}

module.exports = new AIProcessor();
