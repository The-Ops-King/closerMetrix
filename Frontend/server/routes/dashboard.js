/**
 * DASHBOARD ROUTES — /api/dashboard/*
 *
 * Client-facing dashboard data endpoints.
 * All routes require X-Client-Token header (clientIsolation middleware).
 *
 * Tier gating is handled on the FRONTEND via the TierGate component,
 * which blurs restricted content and shows an "Upgrade to X" overlay.
 * The API returns data for all tiers so the frontend can render blurred
 * previews as upgrade teasers. Client isolation still prevents cross-client access.
 *
 * Routes:
 *   GET /api/dashboard/overview         — All tiers
 *   GET /api/dashboard/financial        — All tiers (blurred for Basic)
 *   GET /api/dashboard/attendance       — All tiers (blurred for Basic)
 *   GET /api/dashboard/call-outcomes    — All tiers (blurred for Basic)
 *   GET /api/dashboard/sales-cycle      — All tiers (blurred for Basic)
 *   GET /api/dashboard/objections       — All tiers (blurred for Basic)
 *   GET /api/dashboard/projections      — All tiers (blurred for Basic)
 *   GET /api/dashboard/violations       — All tiers (blurred for Basic/Insight)
 *   GET /api/dashboard/adherence        — All tiers (blurred for Basic/Insight)
 *
 * Query params (all optional):
 *   dateStart, dateEnd — ISO date strings for filtering
 *   closerId — Filter by specific closer (Insight+ only, ignored for Basic)
 */

const express = require('express');
const clientIsolation = require('../middleware/clientIsolation');
const bq = require('../db/BigQueryClient');
const logger = require('../utils/logger');
const { getOverviewData } = require('../db/queries/overview');
const { getFinancialData } = require('../db/queries/financial');
const { getAttendanceData } = require('../db/queries/attendance');
const { getCallOutcomesData } = require('../db/queries/callOutcomes');
const { getSalesCycleData } = require('../db/queries/salesCycle');
const { getObjectionsData } = require('../db/queries/objections');
const { getProjectionsData } = require('../db/queries/projections');
const { getViolationsData } = require('../db/queries/violations');
const { getAdherenceData } = require('../db/queries/adherence');
const { getCallExportData } = require('../db/queries/callExport');
const { getRawData } = require('../db/queries/rawData');
const { getSettingsData } = require('../db/queries/settings');
const marketPulse = require('../services/marketPulse');
const insightEngine = require('../services/insightEngine');
const { getLatestInsight } = require('../db/queries/insightLog');

const router = express.Router();

// All dashboard routes require client authentication
router.use(clientIsolation);

/**
 * Build the standard response envelope.
 * Every dashboard endpoint returns this shape.
 */
function buildResponse(sections, charts, tables, meta) {
  return {
    success: true,
    data: { sections, charts: charts || {}, tables: tables || {} },
    meta,
  };
}

/**
 * Build metadata from the request context.
 * Included in every response for debugging/display.
 */
function buildMeta(req) {
  return {
    client_id: req.clientId,
    tier: req.tier,
    dateRange: {
      start: req.query.dateStart || null,
      end: req.query.dateEnd || null,
    },
    filters: {
      closerId: req.query.closerId || null,
    },
    bqConnected: bq.isAvailable(),
    isDemo: req.isDemo || false,
  };
}

// ── Overview (All Tiers) ──────────────────────────────────────────

router.get('/overview', async (req, res) => {
  try {
    const { dateStart, dateEnd, closerId } = req.query;
    const result = await getOverviewData(req.clientId, { dateStart, dateEnd, closerId }, req.tier);
    res.json(buildResponse(result.sections, result.charts, {}, buildMeta(req)));
  } catch (err) {
    logger.error('Overview endpoint error', { error: err.message, clientId: req.clientId });
    res.status(500).json({ success: false, error: 'Failed to load overview data' });
  }
});

// ── Financial (Insight+) ─────────────────────────────────────────

router.get('/financial', async (req, res) => {
  try {
    const { dateStart, dateEnd, closerId } = req.query;
    const result = await getFinancialData(req.clientId, { dateStart, dateEnd, closerId }, req.tier);
    res.json(buildResponse(result.sections, result.charts, result.tables || {}, buildMeta(req)));
  } catch (err) {
    logger.error('Financial endpoint error', { error: err.message, clientId: req.clientId });
    res.status(500).json({ success: false, error: 'Failed to load financial data' });
  }
});

// ── Attendance (Insight+) ────────────────────────────────────────

router.get('/attendance', async (req, res) => {
  try {
    const { dateStart, dateEnd, closerId } = req.query;
    const result = await getAttendanceData(req.clientId, { dateStart, dateEnd, closerId }, req.tier);
    res.json(buildResponse(result.sections, result.charts, result.tables || {}, buildMeta(req)));
  } catch (err) {
    logger.error('Attendance endpoint error', { error: err.message, clientId: req.clientId });
    res.status(500).json({ success: false, error: 'Failed to load attendance data' });
  }
});

// ── Call Outcomes (Insight+) ─────────────────────────────────────

router.get('/call-outcomes', async (req, res) => {
  try {
    const { dateStart, dateEnd, closerId } = req.query;
    const result = await getCallOutcomesData(req.clientId, { dateStart, dateEnd, closerId }, req.tier);
    const response = buildResponse(result.sections, result.charts, result.tables || {}, buildMeta(req));
    // Funnel data is a separate top-level key for Call Outcomes
    if (result.funnel) response.data.funnel = result.funnel;
    res.json(response);
  } catch (err) {
    logger.error('Call outcomes endpoint error', { error: err.message, clientId: req.clientId });
    res.status(500).json({ success: false, error: 'Failed to load call outcomes data' });
  }
});

// ── Sales Cycle (Insight+) ──────────────────────────────────────

router.get('/sales-cycle', async (req, res) => {
  try {
    const { dateStart, dateEnd, closerId } = req.query;
    const result = await getSalesCycleData(req.clientId, { dateStart, dateEnd, closerId }, req.tier);
    res.json(buildResponse(result.sections, result.charts, result.tables || {}, buildMeta(req)));
  } catch (err) {
    logger.error('Sales cycle endpoint error', { error: err.message, clientId: req.clientId });
    res.status(500).json({ success: false, error: 'Failed to load sales cycle data' });
  }
});

// ── Objections (Insight+) ───────────────────────────────────────

router.get('/objections', async (req, res) => {
  try {
    const { dateStart, dateEnd, closerId, objectionType } = req.query;
    const result = await getObjectionsData(
      req.clientId,
      { dateStart, dateEnd, closerId, objectionType },
      req.tier
    );
    res.json(buildResponse(result.sections, result.charts, result.tables || {}, buildMeta(req)));
  } catch (err) {
    logger.error('Objections endpoint error', { error: err.message, clientId: req.clientId });
    res.status(500).json({ success: false, error: 'Failed to load objections data' });
  }
});

// ── Projections (Insight+) ──────────────────────────────────────

router.get('/projections', async (req, res) => {
  try {
    const { dateStart, dateEnd, closerId } = req.query;
    const result = await getProjectionsData(req.clientId, { dateStart, dateEnd, closerId }, req.tier);
    const response = buildResponse(result.sections, result.charts, {}, buildMeta(req));
    // Add projection baseline data to the response -- the frontend projection
    // engine needs these raw numbers for its ratio-based calculations
    response.data.projectionBaseline = result.projectionBaseline;
    res.json(response);
  } catch (err) {
    logger.error('Projections endpoint error', { error: err.message, clientId: req.clientId });
    res.status(500).json({ success: false, error: 'Failed to load projections data' });
  }
});

// ── Goals Save (Insight+) ───────────────────────────────────────

router.put('/goals', async (req, res) => {
  try {
    const { monthly_goal, quarterly_goal, yearly_goal } = req.body;

    // Validate input — all must be non-negative numbers
    const goals = { monthly_goal, quarterly_goal, yearly_goal };
    for (const [key, val] of Object.entries(goals)) {
      if (val == null || typeof val !== 'number' || val < 0) {
        return res.status(400).json({
          success: false,
          error: `Invalid ${key}: must be a non-negative number`,
        });
      }
    }

    if (bq.isAvailable()) {
      const clientsTable = bq.table('Clients');
      await bq.runQuery(
        `UPDATE ${clientsTable}
         SET monthly_goal = @monthlyGoal,
             quarterly_goal = @quarterlyGoal,
             yearly_goal = @yearlyGoal,
             last_modified = CURRENT_TIMESTAMP()
         WHERE client_id = @clientId`,
        {
          clientId: req.clientId,
          monthlyGoal: monthly_goal,
          quarterlyGoal: quarterly_goal,
          yearlyGoal: yearly_goal,
        }
      );
      logger.info('Goals saved to BigQuery', { clientId: req.clientId, goals });
    } else {
      // Demo mode: log and return success without persisting
      logger.debug('Goals save (demo mode)', { clientId: req.clientId, goals });
    }

    res.json({
      success: true,
      data: { monthly_goal, quarterly_goal, yearly_goal },
    });
  } catch (err) {
    logger.error('Goals save error', { error: err.message, clientId: req.clientId });
    res.status(500).json({ success: false, error: 'Failed to save goals' });
  }
});

// ── Violations (Executive Only) ─────────────────────────────────

router.get('/violations', async (req, res) => {
  try {
    const { dateStart, dateEnd, closerId } = req.query;
    const result = await getViolationsData(req.clientId, { dateStart, dateEnd, closerId }, req.tier);
    res.json(buildResponse(result.sections, result.charts, result.tables || {}, buildMeta(req)));
  } catch (err) {
    logger.error('Violations endpoint error', { error: err.message, clientId: req.clientId });
    res.status(500).json({ success: false, error: 'Failed to load violations data' });
  }
});

// ── Adherence (Executive Only) ──────────────────────────────────

router.get('/adherence', async (req, res) => {
  try {
    const { dateStart, dateEnd, closerId } = req.query;
    const result = await getAdherenceData(req.clientId, { dateStart, dateEnd, closerId }, req.tier);
    res.json(buildResponse(result.sections, result.charts, result.tables || {}, buildMeta(req)));
  } catch (err) {
    logger.error('Adherence endpoint error', { error: err.message, clientId: req.clientId });
    res.status(500).json({ success: false, error: 'Failed to load adherence data' });
  }
});

// ── Call Export (CSV Download — All Tiers) ──────────────────

router.get('/export-calls', async (req, res) => {
  try {
    const { dateStart, dateEnd, closerId } = req.query;
    // Basic tier clients cannot filter by closer
    const effectiveCloserId = req.tier === 'basic' ? null : closerId;
    const result = await getCallExportData(
      req.clientId,
      { dateStart, dateEnd, closerId: effectiveCloserId },
      req.tier
    );
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Call export endpoint error', { error: err.message, clientId: req.clientId });
    res.status(500).json({ success: false, error: 'Failed to export call data' });
  }
});

// ── Raw Data (All Tiers — Bulk Fetch for Client-Side Computation) ──

router.get('/raw-data', async (req, res) => {
  try {
    const result = await getRawData(req.clientId);
    res.json({
      success: true,
      data: result,
      meta: buildMeta(req),
    });
  } catch (err) {
    logger.error('Raw data endpoint error', { error: err.message, clientId: req.clientId });
    res.status(500).json({ success: false, error: 'Failed to load raw data' });
  }
});

// ── Market Pulse (AI Theme Condensing — Insight+) ───────────────

router.post('/market-pulse', async (req, res) => {
  try {
    if (!marketPulse.isAvailable()) {
      return res.status(503).json({
        success: false,
        error: 'Market Pulse AI is not configured',
      });
    }

    const { texts, type, force } = req.body;

    // Validate type
    if (!type || !['pains', 'goals'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'type must be "pains" or "goals"',
      });
    }

    // Validate texts
    if (!Array.isArray(texts) || texts.length === 0) {
      return res.json({
        success: true,
        data: { themes: [] },
      });
    }

    // Cap at 500
    const capped = texts.slice(0, 500);
    const themes = await marketPulse.condenseTexts(req.clientId, type, capped, { force: !!force });

    res.json({
      success: true,
      data: { themes },
    });
  } catch (err) {
    logger.error('Market Pulse endpoint error', {
      error: err.message,
      clientId: req.clientId,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to generate market pulse themes',
    });
  }
});

// ── AI Insights — Pre-Generated Daily (GET) ──────────────────

router.get('/insights', async (req, res) => {
  try {
    const { section } = req.query;

    if (!section || typeof section !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'section query parameter is required',
      });
    }

    const insight = await getLatestInsight(req.clientId, section);

    if (!insight) {
      return res.json({
        success: true,
        data: { text: null, generatedAt: null },
      });
    }

    res.json({
      success: true,
      data: {
        text: insight.text,
        generatedAt: insight.generatedAt,
      },
    });
  } catch (err) {
    // Degrade gracefully — return empty rather than 500.
    // This handles InsightLog table not existing yet, BQ errors, etc.
    // The frontend will fall back to on-demand generation.
    logger.warn('GET insight unavailable, returning empty', {
      error: err.message,
      clientId: req.clientId,
      section: req.query?.section,
    });
    res.json({
      success: true,
      data: { text: null, generatedAt: null },
    });
  }
});

// ── AI Insights — On-Demand Generation (POST) ────────────────

router.post('/insights', async (req, res) => {
  try {
    if (!insightEngine.isAvailable()) {
      return res.status(503).json({
        success: false,
        error: 'AI Insights not configured',
      });
    }

    const { section, metrics, force } = req.body;

    // Validate section
    if (!section || typeof section !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'section is required',
      });
    }

    // Validate metrics
    if (!metrics || typeof metrics !== 'object') {
      return res.json({
        success: true,
        data: { text: '' },
      });
    }

    const result = await insightEngine.generateInsight(
      req.clientId,
      section,
      metrics,
      { force: !!force }
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    logger.error('Insight endpoint error', {
      error: err.message,
      clientId: req.clientId,
      section: req.body?.section,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to generate insight',
    });
  }
});

// ── Settings (All Tiers — Client Config) ──────────────────────

router.get('/settings', async (req, res) => {
  try {
    const result = await getSettingsData(req.clientId);
    res.json({
      success: true,
      data: result,
      meta: buildMeta(req),
    });
  } catch (err) {
    logger.error('Settings endpoint error', { error: err.message, clientId: req.clientId });
    res.status(500).json({ success: false, error: 'Failed to load settings data' });
  }
});

// ── Settings Save (All Tiers — Update settings_json) ─────────

router.put('/settings', async (req, res) => {
  try {
    const { settings_json } = req.body;

    if (settings_json == null || typeof settings_json !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'settings_json must be a JSON string',
      });
    }

    // Validate it's valid JSON
    try {
      JSON.parse(settings_json);
    } catch {
      return res.status(400).json({
        success: false,
        error: 'settings_json is not valid JSON',
      });
    }

    if (bq.isAvailable()) {
      await bq.runQuery(
        `UPDATE ${bq.table('Clients')}
         SET settings_json = @settingsJson,
             last_modified = CURRENT_TIMESTAMP()
         WHERE client_id = @clientId`,
        { clientId: req.clientId, settingsJson: settings_json }
      );
      logger.info('Settings JSON saved', { clientId: req.clientId });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('Settings save error', { error: err.message, clientId: req.clientId });
    res.status(500).json({ success: false, error: 'Failed to save settings' });
  }
});

// ── Client-Facing Closer CRUD ─────────────────────────────────
// These routes let authenticated clients manage their own closers.
// clientIsolation already verified the client — we proxy to the Backend
// using the server's admin key so the client doesn't need one.

const config = require('../config');

async function proxyCloserToBackend(req, res, backendPath, method) {
  const httpMethod = method || req.method;
  const url = new URL(backendPath, config.backendApiUrl);

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.adminApiKey}`,
  };

  const fetchOpts = { method: httpMethod, headers };
  if (['POST', 'PUT', 'PATCH'].includes(httpMethod) && req.body) {
    fetchOpts.body = JSON.stringify(req.body);
  }

  try {
    const backendRes = await fetch(url.toString(), fetchOpts);
    const data = await backendRes.json().catch(() => ({}));
    res.status(backendRes.status).json(data);
  } catch (err) {
    logger.error('Closer proxy error', { path: backendPath, error: err.message });
    res.status(502).json({ error: 'Backend unreachable', details: err.message });
  }
}

router.get('/closers', (req, res) => {
  proxyCloserToBackend(req, res, `/admin/clients/${req.clientId}/closers`);
});

router.post('/closers', (req, res) => {
  proxyCloserToBackend(req, res, `/admin/clients/${req.clientId}/closers`);
});

router.put('/closers/:closerId', (req, res) => {
  proxyCloserToBackend(req, res, `/admin/clients/${req.clientId}/closers/${req.params.closerId}`);
});

router.delete('/closers/:closerId', (req, res) => {
  proxyCloserToBackend(req, res, `/admin/clients/${req.clientId}/closers/${req.params.closerId}`);
});

router.patch('/closers/:closerId/reactivate', (req, res) => {
  proxyCloserToBackend(req, res, `/admin/clients/${req.clientId}/closers/${req.params.closerId}/reactivate`);
});

// ── Client-Facing Client Update (AI Prompts, Script) ─────────
// Lets authenticated clients update their own client record fields.

router.put('/client-config', (req, res) => {
  proxyCloserToBackend(req, res, `/admin/clients/${req.clientId}`);
});

module.exports = router;
