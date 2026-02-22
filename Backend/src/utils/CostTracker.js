/**
 * COST TRACKER
 *
 * Records AI processing costs per call, per client.
 * After every Anthropic API call, extracts token counts from the response
 * and calculates cost using configurable per-token rates.
 *
 * Queryable aggregations:
 * - Total spend today / this week / this month
 * - Average cost per call
 * - Cost per client
 * - Highest-cost calls (long transcripts)
 *
 * Usage:
 *   const costTracker = require('./utils/CostTracker');
 *   await costTracker.record({
 *     clientId: 'xxx',
 *     callId: 'yyy',
 *     model: 'claude-sonnet-4-5-20250929',
 *     inputTokens: 4500,
 *     outputTokens: 1200,
 *     processingTimeMs: 3200,
 *   });
 */

const bq = require('../db/BigQueryClient');
const config = require('../config');
const { generateId } = require('./idGenerator');
const logger = require('./logger');

class CostTracker {
  /**
   * Records a single AI processing cost entry.
   *
   * @param {Object} params
   * @param {string} params.clientId — Client this cost is for
   * @param {string} params.callId — Call this cost is for
   * @param {string} params.model — Model used (e.g., 'claude-sonnet-4-5-20250929')
   * @param {number} params.inputTokens — Input token count from API response
   * @param {number} params.outputTokens — Output token count from API response
   * @param {number} [params.processingTimeMs] — How long the API call took
   */
  async record({ clientId, callId, model, inputTokens, outputTokens, processingTimeMs = null }) {
    const inputCost = (inputTokens / 1_000_000) * config.ai.inputCostPerMillion;
    const outputCost = (outputTokens / 1_000_000) * config.ai.outputCostPerMillion;
    const totalCost = inputCost + outputCost;

    const entry = {
      cost_id: generateId(),
      timestamp: new Date().toISOString(),
      client_id: clientId,
      call_id: callId,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      input_cost_usd: Math.round(inputCost * 1_000_000) / 1_000_000,
      output_cost_usd: Math.round(outputCost * 1_000_000) / 1_000_000,
      total_cost_usd: Math.round(totalCost * 1_000_000) / 1_000_000,
      processing_time_ms: processingTimeMs,
    };

    try {
      await bq.insert('CostTracking', entry);
      logger.debug('Cost recorded', {
        callId,
        clientId,
        totalCost: entry.total_cost_usd,
        inputTokens,
        outputTokens,
      });
    } catch (error) {
      // Cost tracking should not crash the main flow
      logger.error('Failed to record cost', { entry, error: error.message });
    }

    return entry;
  }

  /**
   * Gets cost summary for a time period, optionally filtered by client.
   *
   * @param {string} period — 'today', 'week', 'month'
   * @param {string|null} clientId — Optional client filter
   * @returns {Object} Cost summary with totals and per-client breakdown
   */
  async getSummary(period = 'today', clientId = null) {
    const periodFilter = {
      today: 'TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY)',
      week: 'TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)',
      month: 'TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)',
    };

    const since = periodFilter[period] || periodFilter.today;
    const clientFilter = clientId ? 'AND client_id = @clientId' : '';

    const totals = await bq.query(
      `SELECT
         COUNT(*) as total_calls_processed,
         ROUND(SUM(total_cost_usd), 2) as total_cost_usd,
         ROUND(AVG(total_cost_usd), 4) as avg_cost_per_call_usd
       FROM ${bq.table('CostTracking')}
       WHERE timestamp >= ${since} ${clientFilter}`,
      clientId ? { clientId } : {}
    );

    const byClient = await bq.query(
      `SELECT
         ct.client_id,
         cl.company_name,
         COUNT(*) as calls,
         ROUND(SUM(ct.total_cost_usd), 2) as cost_usd
       FROM ${bq.table('CostTracking')} ct
       LEFT JOIN ${bq.table('Clients')} cl ON ct.client_id = cl.client_id
       WHERE ct.timestamp >= ${since} ${clientFilter}
       GROUP BY ct.client_id, cl.company_name
       ORDER BY cost_usd DESC`,
      clientId ? { clientId } : {}
    );

    return {
      period,
      ...(totals[0] || { total_calls_processed: 0, total_cost_usd: 0, avg_cost_per_call_usd: 0 }),
      by_client: byClient,
    };
  }
}

module.exports = new CostTracker();
