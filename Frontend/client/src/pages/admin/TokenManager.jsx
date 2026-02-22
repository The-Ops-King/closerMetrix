/**
 * TOKEN MANAGER — Admin page for generating and revoking access tokens.
 *
 * Features:
 *   - Generate new client/partner access tokens with label
 *   - List all active tokens with client name, type, label, dates
 *   - Copy dashboard URL to clipboard
 *   - Revoke tokens (soft delete)
 *
 * Route: /admin/tokens
 * Auth: Admin API key (from sessionStorage)
 *
 * Data:
 *   GET    /api/admin/tokens                → list active tokens
 *   GET    /api/admin/clients               → client list (for generate dropdown)
 *   POST   /api/admin/tokens                → generate new token
 *   DELETE /api/admin/tokens/:tokenId       → revoke a token
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import CircularProgress from '@mui/material/CircularProgress';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import LogoutIcon from '@mui/icons-material/Logout';
import { COLORS, LAYOUT } from '../../theme/constants';
import { useAuth } from '../../context/AuthContext';
import { apiGet, apiPost, apiDelete } from '../../utils/api';

/**
 * Format an ISO timestamp to a readable date string.
 * Returns '—' for null/undefined.
 */
function fmtDate(isoStr) {
  if (!isoStr) return '\u2014';
  try {
    return new Date(isoStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '\u2014';
  }
}

export default function TokenManager() {
  const navigate = useNavigate();
  const { mode, isAuthenticated, checkAdminSession, logout } = useAuth();

  // Data state
  const [tokens, setTokens] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  // Generate form state
  const [genClientId, setGenClientId] = useState('');
  const [genType, setGenType] = useState('client');
  const [genLabel, setGenLabel] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState(null);

  // Snackbar
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Check admin session on mount
  useEffect(() => {
    if (!isAuthenticated) {
      const hasSession = checkAdminSession();
      if (!hasSession) {
        navigate('/admin/login');
      }
    }
  }, [isAuthenticated, checkAdminSession, navigate]);

  // Fetch tokens and clients independently so one failure doesn't block the other
  const fetchData = useCallback(async () => {
    setLoading(true);

    // Fetch clients (for the dropdown) — independent of tokens
    try {
      const clientsRes = await apiGet('/admin/clients');
      setClients(clientsRes.data || []);
    } catch (err) {
      setSnackbar({ open: true, message: `Clients: ${err.message}`, severity: 'error' });
    }

    // Fetch tokens — may fail if AccessTokens table doesn't exist yet
    try {
      const tokensRes = await apiGet('/admin/tokens');
      setTokens(tokensRes.data || []);
    } catch (err) {
      // Non-fatal — show empty token list, don't block the page
      setTokens([]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    if (mode === 'admin' && isAuthenticated) {
      fetchData();
    }
  }, [mode, isAuthenticated, fetchData]);

  /**
   * Generate a new access token.
   */
  const handleGenerate = async () => {
    if (!genClientId) {
      setSnackbar({ open: true, message: 'Select a client first', severity: 'warning' });
      return;
    }

    try {
      setGenerating(true);
      const res = await apiPost('/admin/tokens', {
        clientId: genClientId,
        tokenType: genType,
        label: genLabel || undefined,
      });
      const dashUrl = `${window.location.origin}${res.data.dashboard_url}`;
      setGeneratedUrl(dashUrl);
      setSnackbar({ open: true, message: 'Token generated!', severity: 'success' });

      // Reset form
      setGenLabel('');

      // Refresh token list
      fetchData();
    } catch (err) {
      setSnackbar({ open: true, message: `Failed: ${err.message}`, severity: 'error' });
    } finally {
      setGenerating(false);
    }
  };

  /**
   * Revoke a token.
   */
  const handleRevoke = async (tokenId) => {
    try {
      await apiDelete(`/admin/tokens/${tokenId}`);
      setTokens((prev) => prev.filter((t) => t.token_id !== tokenId));
      setSnackbar({ open: true, message: 'Token revoked', severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: `Revoke failed: ${err.message}`, severity: 'error' });
    }
  };

  /**
   * Copy a dashboard URL to clipboard.
   */
  const handleCopy = async (tokenId) => {
    const url = `${window.location.origin}/d/${tokenId}`;
    try {
      await navigator.clipboard.writeText(url);
      setSnackbar({ open: true, message: 'Link copied!', severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: 'Copy failed', severity: 'error' });
    }
  };

  // Auth loading guard
  if (!isAuthenticated && mode !== 'admin') {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg.primary }}>
        <CircularProgress sx={{ color: COLORS.neon.cyan }} />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: COLORS.bg.primary }}>
      {/* ── Top Bar ── */}
      <Box
        sx={{
          height: LAYOUT.topBarHeight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 3,
          borderBottom: `1px solid ${COLORS.border.subtle}`,
          backgroundColor: COLORS.bg.secondary,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Button
            size="small"
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/admin')}
            sx={{ color: COLORS.text.secondary, textTransform: 'none', '&:hover': { color: COLORS.neon.cyan } }}
          >
            Admin
          </Button>
          <Typography sx={{ color: COLORS.text.muted }}>|</Typography>
          <Typography
            variant="h6"
            sx={{ fontWeight: 700, color: COLORS.neon.cyan, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.95rem' }}
          >
            Token Manager
          </Typography>
        </Box>
        <IconButton
          onClick={() => { logout(); navigate('/admin/login'); }}
          sx={{ color: COLORS.text.secondary, '&:hover': { color: COLORS.neon.red } }}
        >
          <LogoutIcon />
        </IconButton>
      </Box>

      {/* ── Content ── */}
      <Box sx={{ p: 3, maxWidth: LAYOUT.contentMaxWidth, mx: 'auto' }}>
        {/* ── Generate New Token ── */}
        <Typography variant="h5" sx={{ color: COLORS.text.primary, mb: 2, fontSize: '1.1rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Generate Access Link
        </Typography>
        <Box
          sx={{
            p: 3,
            borderRadius: `${LAYOUT.cardBorderRadius}px`,
            border: `1px solid ${COLORS.border.subtle}`,
            backgroundColor: COLORS.bg.secondary,
            mb: 4,
          }}
        >
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {/* Client Select */}
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel sx={{ color: COLORS.text.secondary }}>Client</InputLabel>
              <Select
                value={genClientId}
                onChange={(e) => setGenClientId(e.target.value)}
                label="Client"
              >
                {clients.map((c) => (
                  <MenuItem key={c.client_id} value={c.client_id}>
                    {c.company_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Type Select */}
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel sx={{ color: COLORS.text.secondary }}>Type</InputLabel>
              <Select
                value={genType}
                onChange={(e) => setGenType(e.target.value)}
                label="Type"
              >
                <MenuItem value="client">Client</MenuItem>
                <MenuItem value="partner">Partner</MenuItem>
              </Select>
            </FormControl>

            {/* Label Input */}
            <TextField
              size="small"
              label="Label (optional)"
              value={genLabel}
              onChange={(e) => setGenLabel(e.target.value)}
              placeholder="e.g. Main dashboard link"
              sx={{ minWidth: 200, flexGrow: 1 }}
            />

            {/* Generate Button */}
            <Button
              variant="contained"
              startIcon={generating ? <CircularProgress size={16} /> : <AddIcon />}
              onClick={handleGenerate}
              disabled={generating || !genClientId}
              sx={{ fontWeight: 600, textTransform: 'none', px: 3 }}
            >
              Generate
            </Button>
          </Box>

          {/* Generated URL display */}
          {generatedUrl && (
            <Box
              sx={{
                mt: 2,
                p: 2,
                borderRadius: 1,
                backgroundColor: COLORS.bg.primary,
                border: `1px solid ${COLORS.neon.cyan}30`,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Typography
                sx={{
                  flex: 1,
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  color: COLORS.neon.cyan,
                  wordBreak: 'break-all',
                }}
              >
                {generatedUrl}
              </Typography>
              <Button
                size="small"
                startIcon={<ContentCopyIcon />}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(generatedUrl);
                    setSnackbar({ open: true, message: 'Copied!', severity: 'success' });
                  } catch {
                    setSnackbar({ open: true, message: 'Copy failed', severity: 'error' });
                  }
                }}
                sx={{ color: COLORS.neon.cyan, textTransform: 'none', whiteSpace: 'nowrap' }}
              >
                Copy
              </Button>
            </Box>
          )}
        </Box>

        {/* ── Active Tokens ── */}
        <Typography variant="h5" sx={{ color: COLORS.text.primary, mb: 2, fontSize: '1.1rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Active Tokens
        </Typography>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress sx={{ color: COLORS.neon.cyan }} />
          </Box>
        ) : (
          <Box
            sx={{
              borderRadius: `${LAYOUT.cardBorderRadius}px`,
              border: `1px solid ${COLORS.border.subtle}`,
              backgroundColor: COLORS.bg.secondary,
              overflow: 'hidden',
            }}
          >
            {/* Table Header */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: '180px 1.5fr 80px 1fr 100px 100px 70px 70px',
                gap: 1.5,
                px: 3,
                py: 1.5,
                borderBottom: `1px solid ${COLORS.border.subtle}`,
                backgroundColor: COLORS.bg.tertiary,
              }}
            >
              {['Token', 'Client', 'Type', 'Label', 'Created', 'Last Used', 'Copy', 'Revoke'].map((h) => (
                <Typography
                  key={h}
                  variant="caption"
                  sx={{ color: COLORS.text.muted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.6rem' }}
                >
                  {h}
                </Typography>
              ))}
            </Box>

            {/* Token Rows */}
            {tokens.map((token) => (
              <Box
                key={token.token_id}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '180px 1.5fr 80px 1fr 100px 100px 70px 70px',
                  gap: 1.5,
                  px: 3,
                  py: 1.5,
                  alignItems: 'center',
                  borderBottom: `1px solid ${COLORS.border.subtle}`,
                  '&:last-child': { borderBottom: 'none' },
                  '&:hover': { backgroundColor: COLORS.bg.elevated },
                  transition: 'background-color 0.15s ease',
                }}
              >
                {/* Token ID (truncated) */}
                <Typography
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    color: COLORS.text.secondary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {token.token_id.slice(0, 12)}...
                </Typography>

                {/* Client Name */}
                <Typography sx={{ color: COLORS.text.primary, fontSize: '0.85rem' }}>
                  {token.company_name || token.client_id}
                </Typography>

                {/* Type */}
                <Typography
                  sx={{
                    color: token.token_type === 'partner' ? COLORS.neon.purple : COLORS.neon.cyan,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                  }}
                >
                  {token.token_type}
                </Typography>

                {/* Label */}
                <Typography sx={{ color: COLORS.text.secondary, fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {token.label || '\u2014'}
                </Typography>

                {/* Created */}
                <Typography sx={{ color: COLORS.text.muted, fontSize: '0.75rem' }}>
                  {fmtDate(token.created_at)}
                </Typography>

                {/* Last Accessed */}
                <Typography sx={{ color: COLORS.text.muted, fontSize: '0.75rem' }}>
                  {fmtDate(token.last_accessed_at)}
                </Typography>

                {/* Copy Link */}
                <IconButton
                  onClick={() => handleCopy(token.token_id)}
                  sx={{ color: COLORS.text.secondary, '&:hover': { color: COLORS.neon.cyan } }}
                  title="Copy dashboard link"
                >
                  <ContentCopyIcon fontSize="small" />
                </IconButton>

                {/* Revoke */}
                <IconButton
                  onClick={() => handleRevoke(token.token_id)}
                  sx={{ color: COLORS.text.secondary, '&:hover': { color: COLORS.neon.red } }}
                  title="Revoke token"
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}

            {tokens.length === 0 && (
              <Box sx={{ py: 4, textAlign: 'center' }}>
                <Typography sx={{ color: COLORS.text.muted, fontSize: '0.85rem' }}>
                  No active tokens. Generate one above to create a dashboard link.
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* ── Snackbar ── */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          sx={{ backgroundColor: COLORS.bg.elevated, color: COLORS.text.primary }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
