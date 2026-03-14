/**
 * CHATBOT TOOLS
 *
 * Defines all tools available to the CloserMetrix AI chatbot.
 * Each tool has a Claude-compatible definition (name, description, input_schema)
 * and an execute function that runs the actual BigQuery operation.
 *
 * Security:
 * - All read queries enforce client_id via bq.query() (which requires clientId)
 * - UUID params validated before use
 * - Enum params checked against hardcoded allowlists
 * - Write tools force client_id and ingestion_source server-side
 * - client_id stripped from all result rows before returning
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');

// ── Daily write limit ──

const DAILY_WRITE_LIMIT = 50;
const DAY_MS = 24 * 60 * 60 * 1000;
const writeCountMap = new Map(); // clientId → { count, resetAt }

function checkWriteLimit(clientId) {
  const now = Date.now();
  let entry = writeCountMap.get(clientId);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + DAY_MS };
    writeCountMap.set(clientId, entry);
  }
  if (entry.count >= DAILY_WRITE_LIMIT) {
    throw new Error(`Daily write limit reached (${DAILY_WRITE_LIMIT}/day). Try again tomorrow.`);
  }
  entry.count++;
}

// ── Validation helpers ──

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_OUTCOMES = ['Closed - Won', 'Deposit', 'Follow Up', 'Lost', 'Disqualified', 'Not Pitched', 'Refunded'];
const VALID_STATUSES = ['Active', 'Inactive'];
const VALID_METRICS = [
  'close_rate', 'show_rate', 'revenue', 'avg_deal_size', 'call_volume',
  'dq_rate', 'avg_calls_to_close', 'avg_days_to_close', 'not_pitched_rate', 'deposit_rate',
];
const VALID_TABLES = ['Prospects', 'Objections'];
const TABLE_PK_MAP = { Prospects: 'prospect_id', Objections: 'objection_id' };

// Allowlisted fields for update_call_record — only these can be modified
const UPDATABLE_CALL_FIELDS = [
  'call_outcome', 'revenue_generated', 'payment_plan', 'closer_id',
  'prospect_name', 'lost_reason', 'date_closed', 'cash_collected', 'attendance',
];
const VALID_PAYMENT_PLANS = ['PIF', 'Payment Plan', 'Financing'];

function validateUUID(value, fieldName) {
  if (!UUID_RE.test(value)) {
    throw new Error(`Invalid ${fieldName}: must be a valid UUID`);
  }
}

function validateEnum(value, allowed, fieldName) {
  if (!allowed.includes(value)) {
    throw new Error(`Invalid ${fieldName}: must be one of ${allowed.join(', ')}`);
  }
}

function stripClientId(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(row => {
    const clean = { ...row };
    delete clean.client_id;
    delete clean.calls_client_id;
    delete clean.clients_client_id;
    return clean;
  });
}

function clampLimit(value, defaultVal, max) {
  const n = parseInt(value, 10);
  if (isNaN(n) || n < 1) return defaultVal;
  return Math.min(n, max);
}

// ── Tool definitions ──

const tools = [
  // ─── READ TOOLS ───

  {
    name: 'query_calls',
    description: 'Search and filter sales calls. Returns summary fields for matching calls. Use this to find calls by date range, closer, outcome, or prospect name. Supports fuzzy/partial prospect name matching.',
    input_schema: {
      type: 'object',
      properties: {
        dateStart: { type: 'string', description: 'Start date (ISO 8601). Optional.' },
        dateEnd: { type: 'string', description: 'End date (ISO 8601). Optional.' },
        closerName: { type: 'string', description: 'Filter by closer name (exact match). Optional.' },
        prospectName: { type: 'string', description: 'Filter by prospect name (partial/fuzzy match, case-insensitive). Optional.' },
        outcome: {
          type: 'string',
          description: 'Filter by call outcome. Optional.',
          enum: VALID_OUTCOMES,
        },
        attendance: {
          type: 'string',
          description: 'Filter by attendance status (show, ghosted, canceled, rescheduled, scheduled, etc.). Optional.',
        },
        limit: { type: 'integer', description: 'Max rows to return (1-100, default 25). Optional.' },
      },
      required: [],
    },
    async execute(params, clientId, bq) {
      const conditions = ['calls_client_id = @clientId'];
      const queryParams = { clientId };

      if (params.dateStart) {
        conditions.push('calls_appointment_date >= @dateStart');
        queryParams.dateStart = params.dateStart;
      }
      if (params.dateEnd) {
        conditions.push('calls_appointment_date <= @dateEnd');
        queryParams.dateEnd = params.dateEnd;
      }
      if (params.closerName) {
        conditions.push('closers_name = @closerName');
        queryParams.closerName = params.closerName;
      }
      if (params.prospectName) {
        conditions.push('LOWER(calls_prospect_name) LIKE @prospectSearch');
        queryParams.prospectSearch = `%${params.prospectName.toLowerCase()}%`;
      }
      if (params.outcome) {
        validateEnum(params.outcome, VALID_OUTCOMES, 'outcome');
        conditions.push('calls_call_outcome = @outcome');
        queryParams.outcome = params.outcome;
      }
      if (params.attendance) {
        conditions.push('calls_attendance = @attendance');
        queryParams.attendance = params.attendance;
      }

      const limit = clampLimit(params.limit, 25, 100);
      queryParams.rowLimit = limit;

      const sql = `
        SELECT calls_call_id AS call_id, closers_name AS closer_name,
               calls_prospect_name AS prospect_name, calls_appointment_date AS appointment_date,
               calls_attendance AS attendance, calls_call_outcome AS outcome,
               calls_overall_call_score AS overall_call_score, calls_revenue_generated AS revenue_generated,
               calls_cash_collected AS cash_collected, calls_payment_plan AS payment_plan,
               calls_lost_reason AS lost_reason, calls_call_source AS call_source
        FROM ${bq.table('v_calls_joined_flat_prefixed')}
        WHERE ${conditions.join(' AND ')}
        ORDER BY calls_appointment_date DESC
        LIMIT @rowLimit
      `;

      const rows = await bq.query(sql, queryParams);
      return stripClientId(rows);
    },
  },

  {
    name: 'query_closers',
    description: 'List closers with their call count and close count. Use this to see the team roster and basic performance stats.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by closer status. Default: Active.',
          enum: VALID_STATUSES,
        },
      },
      required: [],
    },
    async execute(params, clientId, bq) {
      const status = params.status || 'Active';
      validateEnum(status, VALID_STATUSES, 'status');

      const sql = `
        SELECT
          c.closer_id,
          c.name AS closer_name,
          c.status,
          c.created_at,
          COALESCE(stats.call_count, 0) AS call_count,
          COALESCE(stats.close_count, 0) AS close_count
        FROM ${bq.table('Closers')} c
        LEFT JOIN (
          SELECT
            closers_name,
            COUNT(*) AS call_count,
            COUNTIF(calls_call_outcome = 'Closed - Won') AS close_count
          FROM ${bq.table('v_calls_joined_flat_prefixed')}
          WHERE calls_client_id = @clientId
          GROUP BY closers_name
        ) stats ON c.name = stats.closers_name
        WHERE c.client_id = @clientId AND c.status = @status
        ORDER BY c.name
      `;

      const rows = await bq.query(sql, { clientId, status });
      return stripClientId(rows);
    },
  },

  {
    name: 'query_prospects',
    description: 'Search prospects by name, email, or phone. Use this to look up specific people.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Partial match on name, email, or phone. Optional.' },
        limit: { type: 'integer', description: 'Max rows (1-50, default 25). Optional.' },
      },
      required: [],
    },
    async execute(params, clientId, bq) {
      const conditions = ['client_id = @clientId', "status = 'Active'"];
      const queryParams = { clientId };

      if (params.search) {
        conditions.push('(LOWER(prospect_name) LIKE @search OR LOWER(prospect_email) LIKE @search OR prospect_phone LIKE @search)');
        queryParams.search = `%${params.search.toLowerCase()}%`;
      }

      const limit = clampLimit(params.limit, 25, 50);
      queryParams.rowLimit = limit;

      const sql = `
        SELECT prospect_id, prospect_name AS name, prospect_email AS email, prospect_phone AS phone, status, created_at
        FROM ${bq.table('Prospects')}
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT @rowLimit
      `;

      const rows = await bq.query(sql, queryParams);
      return stripClientId(rows);
    },
  },

  {
    name: 'query_objections',
    description: 'Query objection data. Use this to analyze what objections prospects raise, optionally filtered by date, closer, or category.',
    input_schema: {
      type: 'object',
      properties: {
        dateStart: { type: 'string', description: 'Start date (ISO 8601). Optional.' },
        dateEnd: { type: 'string', description: 'End date (ISO 8601). Optional.' },
        closerName: { type: 'string', description: 'Filter by closer name. Optional.' },
        objectionType: { type: 'string', description: 'Filter by objection type (e.g. Financial, Spouse/Partner, Timing, Competition). Optional.' },
      },
      required: [],
    },
    async execute(params, clientId, bq) {
      const conditions = ['ca.calls_client_id = @clientId'];
      const queryParams = { clientId };

      if (params.dateStart) {
        conditions.push('ca.calls_appointment_date >= @dateStart');
        queryParams.dateStart = params.dateStart;
      }
      if (params.dateEnd) {
        conditions.push('ca.calls_appointment_date <= @dateEnd');
        queryParams.dateEnd = params.dateEnd;
      }
      if (params.closerName) {
        conditions.push('ca.closers_name = @closerName');
        queryParams.closerName = params.closerName;
      }
      if (params.objectionType) {
        conditions.push('o.objection_type = @objectionType');
        queryParams.objectionType = params.objectionType;
      }

      const sql = `
        SELECT o.objection_id, o.objection_type, o.objection_text,
               o.was_resolved, ca.closers_name AS closer_name, ca.calls_appointment_date AS appointment_date
        FROM ${bq.table('Objections')} o
        JOIN ${bq.table('v_calls_joined_flat_prefixed')} ca ON o.call_id = ca.calls_call_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY ca.calls_appointment_date DESC
        LIMIT 50
      `;

      const rows = await bq.query(sql, queryParams);
      return stripClientId(rows);
    },
  },

  {
    name: 'query_aggregate_stats',
    description: 'Compute aggregate metrics like close rate, show rate, revenue, average deal size, call volume, DQ rate, and more. Use this for summary statistics.',
    input_schema: {
      type: 'object',
      properties: {
        metric: {
          type: 'string',
          description: 'The metric to compute.',
          enum: VALID_METRICS,
        },
        dateStart: { type: 'string', description: 'Start date (ISO 8601). Optional.' },
        dateEnd: { type: 'string', description: 'End date (ISO 8601). Optional.' },
      },
      required: ['metric'],
    },
    async execute(params, clientId, bq) {
      validateEnum(params.metric, VALID_METRICS, 'metric');

      const dateConditions = [];
      const queryParams = { clientId };

      if (params.dateStart) {
        dateConditions.push('calls_appointment_date >= @dateStart');
        queryParams.dateStart = params.dateStart;
      }
      if (params.dateEnd) {
        dateConditions.push('calls_appointment_date <= @dateEnd');
        queryParams.dateEnd = params.dateEnd;
      }

      const baseWhere = `calls_client_id = @clientId${dateConditions.length ? ' AND ' + dateConditions.join(' AND ') : ''}`;
      const viewTable = bq.table('v_calls_joined_flat_prefixed');

      // Each metric maps to a fixed SQL template — no interpolation of metric name
      const metricQueries = {
        close_rate: `
          SELECT
            COUNTIF(calls_call_outcome = 'Closed - Won') AS closes,
            COUNTIF(calls_attendance = 'show') AS showed,
            SAFE_DIVIDE(COUNTIF(calls_call_outcome = 'Closed - Won'), COUNTIF(calls_attendance = 'show')) AS close_rate
          FROM ${viewTable} WHERE ${baseWhere}`,

        show_rate: `
          SELECT
            COUNT(*) AS total_calls,
            COUNTIF(calls_attendance = 'show') AS showed,
            SAFE_DIVIDE(COUNTIF(calls_attendance = 'show'), COUNT(*)) AS show_rate
          FROM ${viewTable} WHERE ${baseWhere}`,

        revenue: `
          SELECT
            SUM(COALESCE(CAST(calls_revenue_generated AS FLOAT64), 0)) AS total_revenue,
            COUNTIF(calls_call_outcome = 'Closed - Won') AS total_closes,
            SAFE_DIVIDE(SUM(COALESCE(CAST(calls_revenue_generated AS FLOAT64), 0)), COUNTIF(calls_call_outcome = 'Closed - Won')) AS avg_deal_size
          FROM ${viewTable} WHERE ${baseWhere}`,

        avg_deal_size: `
          SELECT
            SAFE_DIVIDE(SUM(COALESCE(CAST(calls_revenue_generated AS FLOAT64), 0)), COUNTIF(calls_call_outcome = 'Closed - Won')) AS avg_deal_size,
            COUNTIF(calls_call_outcome = 'Closed - Won') AS total_closes
          FROM ${viewTable} WHERE ${baseWhere}`,

        call_volume: `
          SELECT COUNT(*) AS total_calls
          FROM ${viewTable} WHERE ${baseWhere}`,

        dq_rate: `
          SELECT
            COUNTIF(calls_call_outcome = 'Disqualified') AS dq_count,
            COUNTIF(calls_attendance = 'show') AS showed,
            SAFE_DIVIDE(COUNTIF(calls_call_outcome = 'Disqualified'), COUNTIF(calls_attendance = 'show')) AS dq_rate
          FROM ${viewTable} WHERE ${baseWhere}`,

        avg_calls_to_close: `
          SELECT AVG(calls_to_close) AS avg_calls_to_close
          FROM (
            SELECT calls_prospect_name, COUNT(*) AS calls_to_close
            FROM ${viewTable}
            WHERE ${baseWhere} AND calls_call_outcome = 'Closed - Won' AND calls_prospect_name IS NOT NULL
            GROUP BY calls_prospect_name
          )`,

        avg_days_to_close: `
          SELECT AVG(days_to_close) AS avg_days_to_close
          FROM (
            SELECT calls_prospect_name,
              TIMESTAMP_DIFF(MAX(calls_appointment_date), MIN(calls_appointment_date), DAY) AS days_to_close
            FROM ${viewTable}
            WHERE ${baseWhere} AND calls_prospect_name IS NOT NULL
              AND calls_prospect_name IN (
                SELECT calls_prospect_name FROM ${viewTable}
                WHERE ${baseWhere} AND calls_call_outcome = 'Closed - Won'
              )
            GROUP BY calls_prospect_name
          )`,

        not_pitched_rate: `
          SELECT
            COUNTIF(calls_call_outcome = 'Not Pitched') AS not_pitched_count,
            COUNTIF(calls_attendance = 'show') AS showed,
            SAFE_DIVIDE(COUNTIF(calls_call_outcome = 'Not Pitched'), COUNTIF(calls_attendance = 'show')) AS not_pitched_rate
          FROM ${viewTable} WHERE ${baseWhere}`,

        deposit_rate: `
          SELECT
            COUNTIF(calls_call_outcome = 'Deposit') AS deposit_count,
            COUNTIF(calls_attendance = 'show') AS showed,
            SAFE_DIVIDE(COUNTIF(calls_call_outcome = 'Deposit'), COUNTIF(calls_attendance = 'show')) AS deposit_rate
          FROM ${viewTable} WHERE ${baseWhere}`,
      };

      const sql = metricQueries[params.metric];
      const rows = await bq.query(sql, queryParams);
      return rows[0] || {};
    },
  },

  {
    name: 'get_call_detail',
    description: 'Get full details for a single call, including AI analysis, scores, and wrapup. Use this when a user asks about a specific call.',
    input_schema: {
      type: 'object',
      properties: {
        callId: { type: 'string', description: 'The call_id to look up. Must be an exact call_id from query_calls results.' },
      },
      required: ['callId'],
    },
    async execute(params, clientId, bq) {
      // Validate call_id is a reasonable string (not SQL injection)
      if (!params.callId || typeof params.callId !== 'string' || params.callId.length > 200) {
        throw new Error('Invalid callId: must be a non-empty string');
      }

      const sql = `
        SELECT calls_call_id AS call_id, closers_name AS closer_name,
               calls_prospect_name AS prospect_name, calls_appointment_date AS appointment_date,
               calls_attendance AS attendance, calls_call_outcome AS outcome,
               calls_revenue_generated AS revenue_generated, calls_cash_collected AS cash_collected,
               calls_payment_plan AS payment_plan,
               calls_intro_score AS intro_score, calls_pain_score AS pain_score,
               calls_goal_score AS goal_score, calls_transition_score AS transition_score,
               calls_pitch_score AS pitch_adherence_score, calls_close_attempt_score AS close_adherence_score,
               calls_objection_handling_score AS objection_adherence_score,
               calls_script_adherence_score AS script_adherence_score,
               calls_overall_call_score AS overall_call_score, calls_prospect_fit_score AS prospect_fit_score,
               calls_call_source AS call_source, calls_key_moments AS key_moments,
               calls_lost_reason AS lost_reason, calls_duration_minutes AS duration_minutes
        FROM ${bq.table('v_calls_joined_flat_prefixed')}
        WHERE calls_client_id = @clientId AND calls_call_id = @callId
      `;

      const rows = await bq.query(sql, { clientId, callId: params.callId });
      if (rows.length === 0) {
        return { error: 'Call not found' };
      }
      return stripClientId(rows)[0];
    },
  },

  {
    name: 'query_audit_log',
    description: 'View recent activity and changes in the audit log. Use this to see what actions have been taken recently.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Max rows (1-50, default 25). Optional.' },
        action: { type: 'string', description: 'Filter by action type. Optional.' },
      },
      required: [],
    },
    async execute(params, clientId, bq) {
      const conditions = ['client_id = @clientId'];
      const queryParams = { clientId };

      if (params.action) {
        conditions.push('action = @action');
        queryParams.action = params.action;
      }

      const limit = clampLimit(params.limit, 25, 50);
      queryParams.rowLimit = limit;

      const sql = `
        SELECT audit_id, action, entity_type, entity_id, details, created_at
        FROM ${bq.table('AuditLog')}
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT @rowLimit
      `;

      const rows = await bq.query(sql, queryParams);
      return stripClientId(rows);
    },
  },

  // ─── WRITE TOOLS ───

  {
    name: 'add_call_record',
    description: 'Add a manual call record. Use this when a user wants to log a call that was not automatically captured. Supports all attendance types: Show (default), Canceled, Ghosted - No Show, Rescheduled. For calls that showed, provide a callOutcome. For canceled/no-show calls, just set attendance — no outcome needed.',
    input_schema: {
      type: 'object',
      properties: {
        closerName: { type: 'string', description: 'Name of the closer who took the call.' },
        prospectName: { type: 'string', description: 'Name of the prospect.' },
        prospectEmail: { type: 'string', description: 'Prospect email. If unknown, use firstname.lastname@unknown.com.' },
        appointmentDate: { type: 'string', description: 'Date/time of the call (ISO 8601).' },
        attendance: {
          type: 'string',
          description: 'Attendance status. Default: Show. Use "Canceled" for canceled calls, "Ghosted - No Show" for no-shows, "Rescheduled" for rescheduled.',
          enum: ['Show', 'Ghosted - No Show', 'Canceled', 'Rescheduled'],
        },
        callOutcome: {
          type: 'string',
          description: 'Outcome of the call. Required for Show attendance, not needed for canceled/no-show/rescheduled.',
          enum: VALID_OUTCOMES,
        },
        revenue: { type: 'number', description: 'Revenue amount if applicable. Optional.' },
        callType: {
          type: 'string',
          description: 'Call type. Default: First Call.',
          enum: ['First Call', 'Follow Up'],
        },
      },
      required: ['closerName', 'prospectName', 'appointmentDate'],
    },
    async execute(params, clientId, bq) {
      checkWriteLimit(clientId);
      const attendance = params.attendance || 'Show';

      // Validate outcome if provided
      if (params.callOutcome) {
        validateEnum(params.callOutcome, VALID_OUTCOMES, 'callOutcome');
      }

      // Show calls should have an outcome
      if (attendance === 'Show' && !params.callOutcome) {
        return { error: 'Calls with Show attendance need a callOutcome. What was the outcome?' };
      }

      // Look up closer_id from Closers table
      const closerRows = await bq.query(
        `SELECT closer_id FROM ${bq.table('Closers')} WHERE client_id = @clientId AND name = @closerName LIMIT 1`,
        { clientId, closerName: params.closerName }
      );
      if (closerRows.length === 0) {
        return { error: `Closer "${params.closerName}" not found. Check the name and try again.` };
      }

      const now = new Date().toISOString();
      const row = {
        call_id: crypto.randomUUID(),
        client_id: clientId,
        closer_id: closerRows[0].closer_id,
        closer: params.closerName,
        prospect_name: params.prospectName,
        prospect_email: params.prospectEmail || `${(params.prospectName || 'unknown').toLowerCase().replace(/\s+/g, '.')}@unknown.com`,
        appointment_date: params.appointmentDate,
        call_outcome: params.callOutcome || null,
        attendance,
        call_type: params.callType || 'First Call',
        ingestion_source: 'manually_added',
        processing_status: 'complete',
        created: now,
        last_modified: now,
      };

      if (params.revenue !== undefined && params.revenue !== null) {
        row.revenue_generated = params.revenue;
      }

      await bq.insert('Calls', row);
      logger.info('Chatbot added call record', { callId: row.call_id, clientId });
      return { success: true, call_id: row.call_id, message: 'Call record added successfully.' };
    },
  },

  {
    name: 'add_prospect',
    description: 'Add a new prospect record. Use this when a user wants to manually log a new prospect. Email is required by the system — if the user doesn\'t have one, ask them, and if they don\'t know it, generate a placeholder.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Prospect full name.' },
        email: { type: 'string', description: 'Prospect email. If unknown, use format: firstname.lastname@unknown.com' },
        phone: { type: 'string', description: 'Prospect phone number. Optional.' },
      },
      required: ['name', 'email'],
    },
    async execute(params, clientId, bq) {
      checkWriteLimit(clientId);
      const row = {
        prospect_id: crypto.randomUUID(),
        client_id: clientId,
        prospect_name: params.name,
        prospect_email: params.email,
        status: 'Active',
        created_at: new Date().toISOString(),
      };

      if (params.phone) row.prospect_phone = params.phone;

      await bq.insert('Prospects', row);
      logger.info('Chatbot added prospect', { prospectId: row.prospect_id, clientId });
      return { success: true, prospect_id: row.prospect_id, message: 'Prospect added successfully.' };
    },
  },

  {
    name: 'add_objection',
    description: 'Add an objection to an existing call. Use this when a user wants to manually log an objection that came up during a call. Requires a call_id — use query_calls first to find the right call.',
    input_schema: {
      type: 'object',
      properties: {
        callId: { type: 'string', description: 'The call_id to attach this objection to. Find via query_calls first.' },
        objectionType: {
          type: 'string',
          description: 'Category of the objection.',
          enum: ['Financial', 'Spouse/Partner', 'Think About It', 'Timing', 'Trust/Credibility', 'Already Tried', 'DIY', 'Not Ready', 'Competitor', 'Authority', 'Value', 'Commitment', 'Program Not a Fit', 'Other'],
        },
        objectionText: { type: 'string', description: 'What the prospect actually said.' },
        wasResolved: { type: 'boolean', description: 'Was the objection resolved/overcome? Default: false.' },
        resolutionText: { type: 'string', description: 'How the closer resolved it, if applicable. Optional.' },
      },
      required: ['callId', 'objectionType', 'objectionText'],
    },
    async execute(params, clientId, bq) {
      checkWriteLimit(clientId);
      // Verify the call exists and belongs to this client
      const callRows = await bq.query(
        `SELECT calls_call_id, calls_closer_id FROM ${bq.table('v_calls_joined_flat_prefixed')} WHERE calls_client_id = @clientId AND calls_call_id = @callId LIMIT 1`,
        { clientId, callId: params.callId }
      );
      if (callRows.length === 0) {
        return { error: 'Call not found. Use query_calls to find the right call_id first.' };
      }

      const now = new Date().toISOString();
      const row = {
        objection_id: crypto.randomUUID(),
        call_id: params.callId,
        client_id: clientId,
        closer_id: callRows[0].calls_closer_id,
        objection_type: params.objectionType,
        objection_text: params.objectionText,
        resolved: params.wasResolved || false,
        resolution_text: params.resolutionText || null,
        resolution_method: params.wasResolved ? 'handled' : null,
        created_at: now,
        last_modified: now,
      };

      await bq.insert('Objections', row);
      logger.info('Chatbot added objection', { objectionId: row.objection_id, callId: params.callId, clientId });
      return { success: true, objection_id: row.objection_id, message: `Objection (${params.objectionType}) added to call.` };
    },
  },

  {
    name: 'hide_record',
    description: 'Soft-delete a record by setting its status to Inactive. Use this when a user wants to hide/remove a prospect or objection record. The record is NOT permanently deleted.',
    input_schema: {
      type: 'object',
      properties: {
        table: {
          type: 'string',
          description: 'Which table the record is in.',
          enum: VALID_TABLES,
        },
        recordId: { type: 'string', description: 'The UUID of the record to hide.' },
      },
      required: ['table', 'recordId'],
    },
    async execute(params, clientId, bq) {
      checkWriteLimit(clientId);
      validateEnum(params.table, VALID_TABLES, 'table');
      validateUUID(params.recordId, 'recordId');

      const pkColumn = TABLE_PK_MAP[params.table];

      // Verify record belongs to this client before updating
      const checkSql = `
        SELECT ${pkColumn}
        FROM ${bq.table(params.table)}
        WHERE client_id = @clientId AND ${pkColumn} = @recordId
      `;
      const existing = await bq.query(checkSql, { clientId, recordId: params.recordId });

      if (existing.length === 0) {
        return { error: 'Record not found or does not belong to this client.' };
      }

      await bq.update(params.table, { status: 'Inactive' }, { [pkColumn]: params.recordId, client_id: clientId });
      logger.info('Chatbot hid record', { table: params.table, recordId: params.recordId, clientId });
      return { success: true, message: `Record set to Inactive in ${params.table}.` };
    },
  },

  {
    name: 'unhide_record',
    description: 'Restore a previously hidden (Inactive) record back to Active. Use this when a user wants to undo a hide/delete, restore a record, or says "bring it back" / "undo that".',
    input_schema: {
      type: 'object',
      properties: {
        table: {
          type: 'string',
          description: 'Which table the record is in.',
          enum: VALID_TABLES,
        },
        recordId: { type: 'string', description: 'The UUID of the record to restore.' },
      },
      required: ['table', 'recordId'],
    },
    async execute(params, clientId, bq) {
      checkWriteLimit(clientId);
      validateEnum(params.table, VALID_TABLES, 'table');
      validateUUID(params.recordId, 'recordId');

      const pkColumn = TABLE_PK_MAP[params.table];

      // Verify record exists and belongs to this client
      const checkSql = `
        SELECT ${pkColumn}, status
        FROM ${bq.table(params.table)}
        WHERE client_id = @clientId AND ${pkColumn} = @recordId
      `;
      const existing = await bq.query(checkSql, { clientId, recordId: params.recordId });

      if (existing.length === 0) {
        return { error: 'Record not found or does not belong to this client.' };
      }
      if (existing[0].status === 'Active') {
        return { message: 'Record is already Active — no change needed.' };
      }

      await bq.update(params.table, { status: 'Active' }, { [pkColumn]: params.recordId, client_id: clientId });
      logger.info('Chatbot restored record', { table: params.table, recordId: params.recordId, clientId });
      return { success: true, message: `Record restored to Active in ${params.table}.` };
    },
  },

  {
    name: 'update_call_record',
    description: 'Update specific fields on an existing call record. Use this to change a call\'s outcome (e.g. mark as refunded, change from Follow Up to Closed - Won), update revenue, change payment plan, correct the closer or prospect name, record a lost reason, or update attendance. Only allowlisted fields can be updated. To change the closer, provide closer_id (look up via query_closers first).',
    input_schema: {
      type: 'object',
      properties: {
        callId: { type: 'string', description: 'The call_id (UUID) of the call to update.' },
        updates: {
          type: 'object',
          description: 'Fields to update. Allowed fields: call_outcome, revenue_generated, payment_plan, closer_id, prospect_name, lost_reason, date_closed, cash_collected, attendance. Note: to change closer, use closer_id (UUID from query_closers), not closer_name.',
          properties: {
            call_outcome: { type: 'string', description: 'New call outcome.', enum: VALID_OUTCOMES },
            revenue_generated: { type: 'number', description: 'New revenue amount (set to 0 for pro-bono).' },
            payment_plan: { type: 'string', description: 'Payment plan type.', enum: VALID_PAYMENT_PLANS },
            closer_id: { type: 'string', description: 'Closer UUID (look up via query_closers). Use this to reassign a call to a different closer.' },
            prospect_name: { type: 'string', description: 'Corrected prospect name.' },
            lost_reason: { type: 'string', description: 'Reason the deal was lost.' },
            date_closed: { type: 'string', description: 'Date the deal was closed (ISO 8601).' },
            cash_collected: { type: 'number', description: 'Cash collected amount.' },
            attendance: { type: 'string', description: 'Attendance status (show, ghosted, canceled, rescheduled, etc.).' },
          },
        },
      },
      required: ['callId', 'updates'],
    },
    async execute(params, clientId, bq) {
      checkWriteLimit(clientId);
      validateUUID(params.callId, 'callId');

      if (!params.updates || typeof params.updates !== 'object') {
        return { error: 'Updates object is required.' };
      }

      // Filter to only allowlisted fields
      const safeUpdates = {};
      for (const [key, value] of Object.entries(params.updates)) {
        if (!UPDATABLE_CALL_FIELDS.includes(key)) {
          return { error: `Field '${key}' is not allowed. Allowed: ${UPDATABLE_CALL_FIELDS.join(', ')}` };
        }
        // Validate enum fields
        if (key === 'call_outcome') validateEnum(value, VALID_OUTCOMES, 'call_outcome');
        if (key === 'payment_plan') validateEnum(value, VALID_PAYMENT_PLANS, 'payment_plan');
        if (key === 'closer_id') validateUUID(value, 'closer_id');
        safeUpdates[key] = value;
      }

      if (Object.keys(safeUpdates).length === 0) {
        return { error: 'No valid fields to update.' };
      }

      // Verify record exists and belongs to this client (read from VIEW)
      const checkSql = `
        SELECT calls_call_id AS call_id, closers_name AS closer_name,
               calls_prospect_name AS prospect_name, calls_call_outcome AS outcome,
               calls_attendance AS attendance, calls_revenue_generated AS revenue_generated
        FROM ${bq.table('v_calls_joined_flat_prefixed')}
        WHERE calls_client_id = @clientId AND calls_call_id = @callId
      `;
      const existing = await bq.query(checkSql, { clientId, callId: params.callId });

      if (existing.length === 0) {
        return { error: 'Call not found or does not belong to this client.' };
      }

      await bq.update('Calls', safeUpdates, { call_id: params.callId, client_id: clientId });
      logger.info('Chatbot updated call record', {
        callId: params.callId,
        fields: Object.keys(safeUpdates),
        clientId,
      });

      return {
        success: true,
        message: `Call record updated: ${Object.keys(safeUpdates).join(', ')}.`,
        previous: stripClientId([existing[0]])[0],
      };
    },
  },

  {
    name: 'log_feedback',
    description: 'Log product feedback, feature requests, or suggestions from the user. Use this whenever a user says things like "I wish...", "It would be nice if...", "Can you add...", "I want it to...", or expresses any desire for a feature or improvement. Captures their exact words for the product team.',
    input_schema: {
      type: 'object',
      properties: {
        feedback: { type: 'string', description: 'The user\'s feedback or feature request, captured in their own words.' },
        category: {
          type: 'string',
          description: 'Category of feedback.',
          enum: ['feature_request', 'bug_report', 'improvement', 'question', 'other'],
        },
        context: { type: 'string', description: 'What the user was doing or asking about when they gave feedback. Optional.' },
      },
      required: ['feedback', 'category'],
    },
    async execute(params, clientId, bq) {
      await bq.insert('ChatConversations', {
        conversation_id: 'feedback',
        client_id: clientId,
        message_id: crypto.randomUUID(),
        role: 'feedback',
        content: params.feedback,
        tool_name: params.category,
        tool_input: params.context ? JSON.stringify({ context: params.context }) : null,
        input_tokens: 0,
        output_tokens: 0,
        model: 'user_feedback',
        created_at: new Date().toISOString(),
        status: 'Active',
      });

      logger.info('Chatbot logged feedback', { category: params.category, clientId });
      return { success: true, message: 'Feedback logged — thank you! The product team will review it.' };
    },
  },
];

// ── Exports ──

/**
 * Returns tool definitions in Claude tool_use format (no execute functions).
 * @returns {Array<{name: string, description: string, input_schema: object}>}
 */
function getToolDefinitions() {
  return tools.map(({ name, description, input_schema }) => ({
    name,
    description,
    input_schema,
  }));
}

/**
 * Dispatches a tool call to the appropriate execute function.
 * @param {string} toolName — Name of the tool to execute
 * @param {object} params — Tool parameters from Claude
 * @param {string} clientId — Client ID for data isolation
 * @param {object} bq — BigQueryClient instance
 * @returns {Promise<any>} Tool result
 */
async function executeToolCall(toolName, params, clientId, bq) {
  const tool = tools.find(t => t.name === toolName);
  if (!tool) {
    throw new Error(`Unknown tool: ${toolName}`);
  }
  return tool.execute(params, clientId, bq);
}

module.exports = { getToolDefinitions, executeToolCall };
