-- ============================================================
-- MIGRATION 001: AccessTokens Table
-- ============================================================
-- Stores dashboard access tokens for clients, partners, and admin.
-- Each token maps to a client_id and plan_tier, enabling:
--   - Client links: /d/:token → single client's dashboard
--   - Partner links: /partner/:token → multiple assigned clients
--   - Token management: generate, revoke, track last access
--
-- Run this in BigQuery console or via `bq query`:
--   bq query --use_legacy_sql=false < 001_access_tokens.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS `closer-automation.CloserAutomation.AccessTokens` (
  -- The actual token value used in URLs (UUID v4, 36 chars)
  token_id STRING NOT NULL,

  -- Which client this token grants access to
  client_id STRING NOT NULL,

  -- Token type determines access scope
  -- 'client' = single client dashboard access
  -- 'partner' = access to multiple assigned clients
  token_type STRING NOT NULL,

  -- Human-readable label for the admin UI ("Acme main dashboard link")
  label STRING,

  -- For partner tokens: which partner this belongs to
  partner_id STRING,

  -- For partner tokens: JSON array of client_ids they can see
  -- e.g. '["client_abc", "client_xyz"]'
  assigned_client_ids STRING,

  -- When this token was created
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),

  -- When this token expires (NULL = never expires)
  expires_at TIMESTAMP,

  -- When this token was revoked (NULL = still active)
  -- Set this instead of deleting — keeps audit trail
  revoked_at TIMESTAMP,

  -- Updated each time the token is used to access the dashboard
  last_accessed_at TIMESTAMP,

  -- Who created this token ('admin' or 'system')
  created_by STRING DEFAULT 'admin'
);
