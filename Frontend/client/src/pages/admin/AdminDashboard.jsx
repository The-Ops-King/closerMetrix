/**
 * ADMIN DASHBOARD — Master view where Tyler sees all clients at a glance.
 *
 * Shows:
 *   - Overview stats (total clients, active clients, total closers, total calls, tier breakdown)
 *   - Client list table with tier badges (read-only), live closer count, status
 *   - Actions per client: view dashboard, soft-delete (deactivate)
 *   - Navigation to token manager and API console
 *
 * Auth: Requires admin session (API key in sessionStorage).
 *        Redirects to /admin/login if not authenticated.
 *
 * Data:
 *   GET /api/admin/overview → overview stats (live counts from Closers + Calls tables)
 *   GET /api/admin/clients  → client list (live closer count via subquery)
 *   DELETE /api/backend/clients/:clientId → soft-delete (set Inactive)
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';
import LogoutIcon from '@mui/icons-material/Logout';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import KeyIcon from '@mui/icons-material/Key';
import TerminalIcon from '@mui/icons-material/Terminal';
import { COLORS, LAYOUT } from '../../theme/constants';
import { useAuth } from '../../context/AuthContext';
import { apiGet, apiDelete } from '../../utils/api';
import TierBadge from '../../components/layout/TierBadge';
import Scorecard from '../../components/scorecards/Scorecard';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { mode, isAuthenticated, checkAdminSession, logout, isLoading: authLoading } = useAuth();

  // Data state
  const [overview, setOverview] = useState(null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Snackbar for action feedback (deactivate, errors, etc.)
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Check admin session on mount
  useEffect(() => {
    if (!isAuthenticated && !authLoading) {
      const hasSession = checkAdminSession();
      if (!hasSession) {
        navigate('/admin/login');
      }
    }
  }, [isAuthenticated, authLoading, checkAdminSession, navigate]);

  // Fetch data once authenticated
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [overviewRes, clientsRes] = await Promise.all([
        apiGet('/admin/overview'),
        apiGet('/admin/clients'),
      ]);
      setOverview(overviewRes.data);
      setClients(clientsRes.data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === 'admin' && isAuthenticated) {
      fetchData();
    }
  }, [mode, isAuthenticated, fetchData]);

  /**
   * Soft-delete (deactivate) a client via the Backend proxy.
   * Sets status to 'Inactive' — all historical data is preserved.
   */
  const handleDeactivateClient = async (client) => {
    const confirmed = window.confirm(
      `Deactivate "${client.company_name}"?\n\nThis will set the client to Inactive. All historical data is preserved.`
    );
    if (!confirmed) return;

    try {
      await apiDelete(`/backend/clients/${client.client_id}`);
      // Update local state
      setClients((prev) =>
        prev.map((c) => (c.client_id === client.client_id ? { ...c, status: 'Inactive' } : c))
      );
      setSnackbar({
        open: true,
        message: `"${client.company_name}" deactivated`,
        severity: 'success',
      });
    } catch (err) {
      setSnackbar({
        open: true,
        message: `Failed to deactivate: ${err.message}`,
        severity: 'error',
      });
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  // Don't render until auth check is complete
  if (authLoading || (!isAuthenticated && mode !== 'admin')) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: COLORS.bg.primary,
        }}
      >
        <CircularProgress sx={{ color: COLORS.neon.cyan }} />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: COLORS.bg.primary }}>
      {/* ── Admin Top Bar ────────────────────────────────────── */}
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
        <Typography
          variant="h6"
          sx={{ fontWeight: 700, color: COLORS.neon.cyan, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.95rem' }}
        >
          CloserMetrix Admin
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button
            size="small"
            startIcon={<TerminalIcon />}
            onClick={() => navigate('/admin/api-console')}
            sx={{ color: COLORS.text.secondary, textTransform: 'none', '&:hover': { color: COLORS.neon.cyan } }}
          >
            API Console
          </Button>
          <Button
            size="small"
            startIcon={<KeyIcon />}
            onClick={() => navigate('/admin/tokens')}
            sx={{ color: COLORS.text.secondary, textTransform: 'none', '&:hover': { color: COLORS.neon.cyan } }}
          >
            Tokens
          </Button>
          <IconButton onClick={handleLogout} sx={{ color: COLORS.text.secondary, '&:hover': { color: COLORS.neon.red } }}>
            <LogoutIcon />
          </IconButton>
        </Box>
      </Box>

      {/* ── Content ──────────────────────────────────────────── */}
      <Box sx={{ p: 3, maxWidth: LAYOUT.contentMaxWidth, mx: 'auto' }}>
        {/* ── Overview Stats — always rendered, shimmer while loading ── */}
        <Typography variant="h5" sx={{ color: COLORS.text.primary, mb: 2, fontSize: '1.1rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Overview
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 2,
            mb: 4,
          }}
        >
          <Scorecard label="Total Clients" value={overview?.totalClients} format="number" glowColor={COLORS.neon.cyan} />
          <Scorecard label="Active Clients" value={overview?.activeClients} format="number" glowColor={COLORS.neon.green} />
          <Scorecard label="Total Closers" value={overview?.totalClosers} format="number" glowColor={COLORS.neon.purple} />
          <Scorecard label="Total Calls" value={overview?.totalCalls} format="number" glowColor={COLORS.neon.amber} />
          <Scorecard label="Basic Tier" value={overview?.tiers?.basic} format="number" glowColor={COLORS.tier.basic} />
          <Scorecard label="Insight Tier" value={overview?.tiers?.insight} format="number" glowColor={COLORS.tier.insight} />
          <Scorecard label="Executive Tier" value={overview?.tiers?.executive} format="number" glowColor={COLORS.tier.executive} />
        </Box>

        {error ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography sx={{ color: COLORS.neon.red, mb: 2 }}>{error}</Typography>
            <Button variant="outlined" onClick={fetchData}>Retry</Button>
          </Box>
        ) : (
          <>
            {/* ── Client List ── */}
            <Typography variant="h5" sx={{ color: COLORS.text.primary, mb: 2, fontSize: '1.1rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Clients
            </Typography>
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
                  gridTemplateColumns: '2fr 100px 80px 100px 90px',
                  gap: 2,
                  px: 3,
                  py: 1.5,
                  borderBottom: `1px solid ${COLORS.border.subtle}`,
                  backgroundColor: COLORS.bg.tertiary,
                }}
              >
                <Typography variant="caption" sx={{ color: COLORS.text.muted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.65rem' }}>
                  Company
                </Typography>
                <Typography variant="caption" sx={{ color: COLORS.text.muted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.65rem' }}>
                  Tier
                </Typography>
                <Typography variant="caption" sx={{ color: COLORS.text.muted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.65rem' }}>
                  Closers
                </Typography>
                <Typography variant="caption" sx={{ color: COLORS.text.muted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.65rem' }}>
                  Status
                </Typography>
                <Typography variant="caption" sx={{ color: COLORS.text.muted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.65rem' }}>
                  Actions
                </Typography>
              </Box>

              {/* Client Rows */}
              {clients.map((client) => {
                const isActive = client.status === 'Active' || client.status === 'active';
                return (
                  <Box
                    key={client.client_id}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 100px 80px 100px 90px',
                      gap: 2,
                      px: 3,
                      py: 1.5,
                      alignItems: 'center',
                      borderBottom: `1px solid ${COLORS.border.subtle}`,
                      '&:last-child': { borderBottom: 'none' },
                      '&:hover': { backgroundColor: COLORS.bg.elevated },
                      transition: 'background-color 0.15s ease',
                      opacity: isActive ? 1 : 0.5,
                    }}
                  >
                    {/* Company Name */}
                    <Typography sx={{ color: COLORS.text.primary, fontWeight: 500, fontSize: '0.9rem' }}>
                      {client.company_name}
                    </Typography>

                    {/* Tier Badge */}
                    <TierBadge tier={client.plan_tier} />

                    {/* Closer Count */}
                    <Typography sx={{ color: COLORS.text.secondary, fontSize: '0.9rem' }}>
                      {client.closer_count ?? '—'}
                    </Typography>

                    {/* Status */}
                    <Typography
                      sx={{
                        color: isActive ? COLORS.neon.green : COLORS.text.muted,
                        fontSize: '0.8rem',
                        fontWeight: 500,
                      }}
                    >
                      {client.status || 'Active'}
                    </Typography>

                    {/* Actions: View + Deactivate */}
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title="View dashboard">
                        <IconButton
                          onClick={() => navigate(`/admin/clients/${client.client_id}`)}
                          sx={{ color: COLORS.text.secondary, '&:hover': { color: COLORS.neon.cyan } }}
                          size="small"
                        >
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {isActive && (
                        <Tooltip title="Deactivate client">
                          <IconButton
                            onClick={() => handleDeactivateClient(client)}
                            sx={{ color: COLORS.text.muted, '&:hover': { color: COLORS.neon.red } }}
                            size="small"
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </Box>
                );
              })}

              {clients.length === 0 && (
                <Box sx={{ py: 4, textAlign: 'center' }}>
                  <Typography sx={{ color: COLORS.text.muted }}>No clients found.</Typography>
                </Box>
              )}
            </Box>
          </>
        )}
      </Box>

      {/* ── Snackbar for Action Feedback ── */}
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
