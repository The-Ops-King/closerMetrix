/**
 * CLIENT DETAIL — Admin views a specific client's full dashboard.
 *
 * Renders the client's dashboard exactly as the client would see it,
 * but with an admin toolbar at the top (tier badge, link generation).
 *
 * Route: /admin/clients/:clientId/*
 * Auth: Admin API key (from sessionStorage)
 *
 * How it works:
 *   1. Fetches client info via GET /api/admin/clients/:clientId
 *   2. Calls viewAsClient() on AuthContext to set up admin view mode
 *   3. Renders DashboardShell with the client's tier + nested page routes (Outlet)
 *   4. Dashboard pages use useMetrics() which detects admin view mode
 *      and sends X-Admin-Key + X-View-Client-Id headers
 *   5. On unmount (navigate away), calls exitClientView() to clean up
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Outlet } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LinkIcon from '@mui/icons-material/Link';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { COLORS } from '../../theme/constants';
import { useAuth } from '../../context/AuthContext';
import { FilterProvider } from '../../context/FilterContext';
import { apiGet, apiPost } from '../../utils/api';
import DashboardShell from '../../components/layout/DashboardShell';
import TierBadge from '../../components/layout/TierBadge';
import Tooltip from '@mui/material/Tooltip';

export default function ClientDetail() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const {
    mode,
    isAuthenticated,
    checkAdminSession,
    viewAsClient,
    exitClientView,
    adminViewTier,
    adminViewCompanyName,
  } = useAuth();

  // Client data state
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Snackbar for feedback (link generation)
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Generated link state (shown in toolbar after generation)
  const [generatedLink, setGeneratedLink] = useState(null);

  // Check admin session on mount
  useEffect(() => {
    if (!isAuthenticated) {
      const hasSession = checkAdminSession();
      if (!hasSession) {
        navigate('/admin/login');
      }
    }
  }, [isAuthenticated, checkAdminSession, navigate]);

  // Fetch client info and set up admin view mode
  const fetchClient = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiGet(`/admin/clients/${clientId}`);
      const clientData = res.data;
      setClient(clientData);

      // Set up admin view mode in AuthContext so pages fetch data for this client
      viewAsClient({
        client_id: clientData.client_id,
        company_name: clientData.company_name,
        plan_tier: clientData.plan_tier,
        closers: clientData.closers || [],
      });

      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [clientId, viewAsClient]);

  useEffect(() => {
    if (mode === 'admin' && isAuthenticated && clientId) {
      fetchClient();
    }
  }, [mode, isAuthenticated, clientId, fetchClient]);

  // Clean up admin view mode on unmount
  useEffect(() => {
    return () => {
      exitClientView();
    };
  }, [exitClientView]);

  /**
   * Generate a new dashboard link for this client.
   */
  const handleGenerateLink = async () => {
    try {
      const res = await apiPost('/admin/tokens', {
        clientId: client.client_id,
        tokenType: 'client',
        label: `${client.company_name} dashboard link`,
      });
      const dashUrl = `${window.location.origin}${res.data.dashboard_url}`;
      setGeneratedLink(dashUrl);
      setSnackbar({ open: true, message: 'Dashboard link generated!', severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: `Failed: ${err.message}`, severity: 'error' });
    }
  };

  /**
   * Copy generated link to clipboard.
   */
  const handleCopyLink = async () => {
    if (generatedLink) {
      try {
        await navigator.clipboard.writeText(generatedLink);
        setSnackbar({ open: true, message: 'Link copied!', severity: 'success' });
      } catch {
        setSnackbar({ open: true, message: 'Copy failed — use the text field', severity: 'error' });
      }
    }
  };

  // Loading state
  if (loading || !client) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: COLORS.bg.primary,
          gap: 2,
        }}
      >
        <CircularProgress sx={{ color: COLORS.neon.cyan }} />
        <Typography variant="body2" sx={{ color: COLORS.text.secondary }}>
          Loading client dashboard...
        </Typography>
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: COLORS.bg.primary,
          gap: 2,
        }}
      >
        <Typography sx={{ color: COLORS.neon.red }}>{error}</Typography>
        <Button variant="outlined" onClick={() => navigate('/admin')}>
          Back to Admin
        </Button>
      </Box>
    );
  }

  // Use the view context tier if available, otherwise use the fetched client tier
  const displayTier = adminViewTier || client.plan_tier;
  const displayName = adminViewCompanyName || client.company_name;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: COLORS.bg.primary }}>
      {/* ── Admin Toolbar ── sticky bar above the client dashboard */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1,
          backgroundColor: COLORS.bg.tertiary,
          borderBottom: `1px solid ${COLORS.border.default}`,
          flexShrink: 0,
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        {/* Left: Back button + client name + tier */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Button
            size="small"
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/admin')}
            sx={{ color: COLORS.text.secondary, textTransform: 'none', '&:hover': { color: COLORS.neon.cyan } }}
          >
            Admin
          </Button>

          <Typography sx={{ color: COLORS.text.muted, mx: 0.5 }}>|</Typography>

          <Typography sx={{ color: COLORS.text.primary, fontWeight: 600, fontSize: '0.9rem' }}>
            {displayName}
          </Typography>

          {/* Tier badge (read-only — change tiers via API Console) */}
          <Tooltip title="Change tier via API Console">
            <span>
              <TierBadge tier={displayTier} />
            </span>
          </Tooltip>
        </Box>

        {/* Right: Admin actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* Generated link display */}
          {generatedLink && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                backgroundColor: COLORS.bg.secondary,
                border: `1px solid ${COLORS.border.subtle}`,
                borderRadius: 1,
                px: 1,
                py: 0.5,
              }}
            >
              <Typography
                sx={{
                  color: COLORS.neon.cyan,
                  fontSize: '0.7rem',
                  fontFamily: 'monospace',
                  maxWidth: 250,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {generatedLink}
              </Typography>
              <Button
                size="small"
                onClick={handleCopyLink}
                startIcon={<ContentCopyIcon sx={{ fontSize: '0.8rem' }} />}
                sx={{ color: COLORS.neon.cyan, textTransform: 'none', fontSize: '0.7rem', minWidth: 'auto', px: 0.5 }}
              >
                Copy
              </Button>
            </Box>
          )}

          <Button
            size="small"
            startIcon={<LinkIcon />}
            onClick={handleGenerateLink}
            sx={{
              color: COLORS.text.secondary,
              textTransform: 'none',
              fontSize: '0.8rem',
              '&:hover': { color: COLORS.neon.cyan },
            }}
          >
            Generate Link
          </Button>
        </Box>
      </Box>

      {/* ── Client Dashboard ── fills remaining space */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <FilterProvider>
          <DashboardShell
            tier={displayTier}
            companyName={displayName}
            basePath={`/admin/clients/${clientId}`}
            mode="admin"
          >
            <Outlet />
          </DashboardShell>
        </FilterProvider>
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
