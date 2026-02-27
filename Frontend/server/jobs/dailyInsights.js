/**
 * DAILY INSIGHTS JOB
 *
 * Pre-generates AI insights for each active client's tier-accessible
 * sections and stores them in the InsightLog BigQuery table.
 *
 * Triggered by: POST /api/jobs/daily-insights (Cloud Scheduler at 2am UTC)
 *
 * Flow per client:
 *   1. Read plan_tier → determine which sections to generate
 *   2. For each section: call existing query file with last-30-day range
 *   3. Fetch last 3 prior insights from InsightLog for trend context
 *   4. Call generateInsight() with metrics + prior insights
 *   5. INSERT result into InsightLog
 *
 * Sequential per client (not parallel) to avoid Anthropic rate limits.
 * Graceful error handling: if one section fails, continue to next.
 */

const crypto = require('crypto');
const bq = require('../db/BigQueryClient');
const insightEngine = require('../services/insightEngine');
const insightConfig = require('../config/insightEngine');
const { getLatestInsight, getPriorInsights, insertInsight } = require('../db/queries/insightLog');
const logger = require('../utils/logger');

// Section → query function mapping
const SECTION_QUERY_MAP = {
  'overview': () => require('../db/queries/overview').getOverviewData,
  'financial': () => require('../db/queries/financial').getFinancialData,
  'attendance': () => require('../db/queries/attendance').getAttendanceData,
  'call-outcomes': () => require('../db/queries/callOutcomes').getCallOutcomesData,
  'sales-cycle': () => require('../db/queries/salesCycle').getSalesCycleData,
  'objections': () => require('../db/queries/objections').getObjectionsData,
  'projections': () => require('../db/queries/projections').getProjectionsData,
  'closer-scoreboard': () => require('../db/queries/overview').getOverviewData, // Scoreboard uses overview data
  'violations': () => require('../db/queries/violations').getViolationsData,
  'adherence': () => require('../db/queries/adherence').getAdherenceData,
};

/**
 * Build a compact metrics snapshot from query result for the AI.
 * Extracts section values and table rows (capped at 10 per table).
 */
function extractMetricsSnapshot(result, dateRange) {
  const metrics = {};

  if (dateRange) {
    metrics.dateRange = `${dateRange.start} to ${dateRange.end}`;
  }

  // Extract section metric values (team-level aggregates)
  if (result.sections) {
    const team = {};
    for (const [sectionKey, sectionMetrics] of Object.entries(result.sections)) {
      if (typeof sectionMetrics === 'object' && sectionMetrics !== null) {
        for (const [metricKey, metric] of Object.entries(sectionMetrics)) {
          if (metric && typeof metric === 'object' && 'value' in metric) {
            team[metricKey] = metric.value;
          }
        }
      }
    }
    if (Object.keys(team).length > 0) metrics.team = team;
  }

  // Extract table rows (compact, capped at 10 per table)
  if (result.tables) {
    for (const [tableKey, table] of Object.entries(result.tables)) {
      if (table?.rows && Array.isArray(table.rows) && table.rows.length > 0) {
        metrics[tableKey] = table.rows.slice(0, 10).map(row => {
          const compact = {};
          for (const [k, v] of Object.entries(row)) {
            if (typeof v === 'number' || (typeof v === 'string' && v.length < 50)) {
              compact[k] = v;
            }
          }
          return compact;
        });
      }
    }
  }

  return metrics;
}

/**
 * Build cross-section closer profiles for a client via a single BigQuery query.
 * Pulls show rate, close rate, revenue, cash, script adherence, objection handling,
 * and sales cycle metrics per closer — all from v_calls_joined_flat_prefixed + objections.
 *
 * @param {string} clientId
 * @param {string} tier
 * @param {object} filters - { dateStart, dateEnd }
 * @returns {Promise<object|null>} closerProfiles keyed by closer name, or null on failure
 */
async function buildCloserProfiles(clientId, tier, filters) {
  try {
    const VIEW = bq.table('v_calls_joined_flat_prefixed');
    const OBJ_VIEW = bq.table('v_objections_joined');
    const CYCLE_VIEW = bq.table('v_close_cycle_stats_dated');

    const params = {
      clientId,
      dateStart: filters.dateStart,
      dateEnd: filters.dateEnd,
    };

    // Single query: per-closer core metrics from the main calls view
    const coreQuery = `
      SELECT
        closers_name as name,
        COUNT(CASE WHEN calls_call_type = 'First Call' THEN 1 END) as scheduled,
        COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END) as held,
        SAFE_DIVIDE(
          COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END),
          COUNT(CASE WHEN calls_call_type = 'First Call' THEN 1 END)
        ) as show_rate,
        SAFE_DIVIDE(
          COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END),
          COUNT(CASE WHEN calls_attendance = 'Show' THEN 1 END)
        ) as close_rate,
        COUNT(CASE WHEN calls_call_outcome = 'Closed - Won' THEN 1 END) as closed_deals,
        SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_revenue_generated AS FLOAT64) ELSE 0 END) as revenue,
        SUM(CASE WHEN calls_call_outcome = 'Closed - Won' THEN CAST(calls_cash_collected AS FLOAT64) ELSE 0 END) as cash,
        AVG(CASE WHEN calls_attendance = 'Show' AND calls_script_adherence_score IS NOT NULL
            THEN CAST(calls_script_adherence_score AS FLOAT64) END) as adherence,
        AVG(CASE WHEN calls_attendance = 'Show' AND calls_objection_handling_score IS NOT NULL
            THEN CAST(calls_objection_handling_score AS FLOAT64) END) as obj_handling,
        AVG(CASE WHEN calls_attendance = 'Show' AND calls_overall_call_score IS NOT NULL
            THEN CAST(calls_overall_call_score AS FLOAT64) END) as overall_score
      FROM ${VIEW}
      WHERE calls_client_id = @clientId
        AND calls_appointment_date >= @dateStart
        AND calls_appointment_date <= @dateEnd
      GROUP BY closers_name
      HAVING closers_name IS NOT NULL
      ORDER BY revenue DESC`;

    // Objection resolution rate per closer
    const objQuery = `
      SELECT
        closers_name as name,
        COUNT(*) as total_objections,
        COUNTIF(obj_resolved = true) as resolved,
        SAFE_DIVIDE(COUNTIF(obj_resolved = true), COUNT(*)) as res_rate
      FROM ${OBJ_VIEW}
      WHERE obj_client_id = @clientId
        AND calls_appointment_date >= @dateStart
        AND calls_appointment_date <= @dateEnd
      GROUP BY closers_name
      HAVING closers_name IS NOT NULL`;

    // Avg calls to close per closer (join Closers table for name)
    const CLOSERS_TABLE = bq.table('Closers');
    const cycleQuery = `
      SELECT
        cl.name as name,
        AVG(v.calls_to_close) as avg_calls_to_close,
        AVG(v.days_to_close) as avg_days_to_close
      FROM ${CYCLE_VIEW} v
      JOIN ${CLOSERS_TABLE} cl
        ON v.closer_id = cl.closer_id AND v.client_id = cl.client_id
      WHERE v.client_id = @clientId
        AND v.close_date >= @dateStart
        AND v.close_date <= @dateEnd
      GROUP BY cl.name
      HAVING cl.name IS NOT NULL`;

    // Run all three in parallel
    const [coreRows, objRows, cycleRows] = await Promise.all([
      bq.runQuery(coreQuery, params, clientId).catch(() => []),
      bq.runQuery(objQuery, params, clientId).catch(() => []),
      bq.runQuery(cycleQuery, params, clientId).catch(() => []),
    ]);

    if (!coreRows || coreRows.length === 0) return null;

    // Build profiles from core data
    const profiles = {};
    const round = (v, d = 2) => v != null ? Math.round(v * (10 ** d)) / (10 ** d) : null;

    for (const r of coreRows) {
      if (!r.name) continue;
      profiles[r.name] = {
        closeRate: round(r.close_rate),
        showRate: round(r.show_rate),
        closedDeals: Number(r.closed_deals) || 0,
        revenue: round(Number(r.revenue) || 0, 0),
        cashCollected: round(Number(r.cash) || 0, 0),
        adherence: round(r.adherence, 1),
        objHandling: round(r.obj_handling, 1),
        overallScore: round(r.overall_score, 1),
      };
    }

    // Merge objection resolution rates
    for (const r of (objRows || [])) {
      if (!r.name || !profiles[r.name]) continue;
      profiles[r.name].objResRate = round(r.res_rate);
    }

    // Merge sales cycle data
    for (const r of (cycleRows || [])) {
      if (!r.name || !profiles[r.name]) continue;
      profiles[r.name].avgCallsToClose = round(r.avg_calls_to_close, 1);
      profiles[r.name].avgDaysToClose = round(r.avg_days_to_close, 1);
    }

    logger.info('Built closer profiles', {
      clientId,
      closerCount: Object.keys(profiles).length,
    });

    return profiles;
  } catch (err) {
    logger.warn('Failed to build closer profiles', { clientId, error: err.message });
    return null;
  }
}

/**
 * Generate insight for a single client + section.
 *
 * @param {string} clientId
 * @param {string} section
 * @param {string} tier
 * @param {object} dateRange - { start, end }
 * @param {object} [closerProfiles] - Cross-section closer profiles
 * @returns {Promise<boolean>} true if successful
 */
async function generateSectionInsight(clientId, section, tier, dateRange, closerProfiles) {
  try {
    // 1. Get the query function for this section
    const getQueryFn = SECTION_QUERY_MAP[section];
    if (!getQueryFn) {
      logger.warn('No query function for section', { section, clientId });
      return false;
    }

    const queryFn = getQueryFn();
    const filters = { dateStart: dateRange.start, dateEnd: dateRange.end };

    // 2. Fetch metrics data
    const result = await queryFn(clientId, filters, tier);
    const metrics = extractMetricsSnapshot(result, dateRange);

    if (!metrics || Object.keys(metrics).length === 0) {
      logger.info('No metrics data for section, skipping', { clientId, section });
      return false;
    }

    // 3. Fetch prior insights for trend context
    const priorInsights = await getPriorInsights(clientId, section, 3);

    // 4. Generate AI insight (with cross-section closer profiles if available)
    const { text, model, tokensUsed } = await insightEngine.generateInsight(
      clientId,
      section,
      metrics,
      { force: true, priorInsights, closerProfiles: closerProfiles || undefined }
    );

    // 5. Store in InsightLog
    const priorText = priorInsights.length > 0 ? priorInsights[0].text : null;
    await insertInsight({
      insightId: crypto.randomUUID(),
      clientId,
      section,
      insightText: text,
      metricsSnapshot: JSON.stringify(metrics),
      priorInsightText: priorText,
      dateRangeStart: dateRange.start,
      dateRangeEnd: dateRange.end,
      modelUsed: model,
      tokensUsed: tokensUsed || 0,
      generationType: 'daily',
    });

    return true;
  } catch (err) {
    logger.error('Failed to generate section insight', {
      clientId,
      section,
      error: err.message,
    });
    return false;
  }
}

/**
 * Main entry point: generate daily insights for all active clients.
 *
 * @returns {Promise<{ clientsProcessed: number, sectionsGenerated: number, errors: number }>}
 */
async function runDailyInsights() {
  if (!insightEngine.isAvailable()) {
    logger.warn('Daily insights skipped — ANTHROPIC_API_KEY not configured');
    return { clientsProcessed: 0, sectionsGenerated: 0, errors: 0 };
  }

  if (!bq.isAvailable()) {
    logger.warn('Daily insights skipped — BigQuery not available');
    return { clientsProcessed: 0, sectionsGenerated: 0, errors: 0 };
  }

  logger.info('Starting daily insights generation');

  // Fetch all active clients with their tiers
  const clients = await bq.runAdminQuery(
    `SELECT client_id, plan_tier FROM ${bq.table('Clients')} WHERE status = 'Active'`
  );

  if (!clients || clients.length === 0) {
    logger.info('No active clients found');
    return { clientsProcessed: 0, sectionsGenerated: 0, errors: 0 };
  }

  // Date range: last N days
  const days = insightConfig.dailyDateRangeDays || 30;
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const dateRange = {
    start: startDate.toISOString().split('T')[0],
    end: endDate.toISOString().split('T')[0],
  };

  let totalGenerated = 0;
  let totalErrors = 0;

  // Process clients sequentially to avoid rate limits
  for (const client of clients) {
    const tier = client.plan_tier || 'basic';
    const sections = insightConfig.tierSections[tier] || insightConfig.tierSections.basic;

    logger.info('Processing client', {
      clientId: client.client_id,
      tier,
      sectionCount: sections.length,
    });

    // Pre-fetch cross-section closer profiles ONCE per client
    const closerProfiles = await buildCloserProfiles(
      client.client_id,
      tier,
      { dateStart: dateRange.start, dateEnd: dateRange.end }
    );

    let clientGenerated = 0;

    for (const section of sections) {
      const success = await generateSectionInsight(
        client.client_id,
        section,
        tier,
        dateRange,
        closerProfiles
      );

      if (success) {
        clientGenerated++;
        totalGenerated++;
      } else {
        totalErrors++;
      }
    }

    logger.info('Client insights complete', {
      clientId: client.client_id,
      generated: `${clientGenerated}/${sections.length}`,
    });
  }

  const summary = {
    clientsProcessed: clients.length,
    sectionsGenerated: totalGenerated,
    errors: totalErrors,
  };

  logger.info('Daily insights generation complete', summary);
  return summary;
}

module.exports = { runDailyInsights };
