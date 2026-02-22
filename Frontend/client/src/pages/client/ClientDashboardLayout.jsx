/**
 * CLIENT DASHBOARD LAYOUT
 *
 * Wraps all client dashboard pages with the DashboardShell (sidebar + topbar).
 * Handles token extraction from URL and auth validation.
 *
 * Route: /d/:token/*
 * On load: extracts token from URL, validates via API, sets up AuthContext.
 * If valid: renders DashboardShell with child routes (overview, conversion, etc.)
 * If invalid: shows error state.
 */

import React, { useEffect } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { COLORS } from '../../theme/constants';
import { useAuth } from '../../context/AuthContext';
import { FilterProvider } from '../../context/FilterContext';
import DashboardShell from '../../components/layout/DashboardShell';

export default function ClientDashboardLayout() {
  const { token } = useParams();
  const { isAuthenticated, isLoading, error, tier, companyName, mode, validateClientToken } = useAuth();

  // Validate token on mount — works for both real and demo tokens.
  // The server handles demo tokens (demo-basic, demo-insight, demo-executive)
  // and returns proper client records for them.
  useEffect(() => {
    if (token) {
      validateClientToken(token);
    }
  }, [token, validateClientToken]);

  // Loading state
  if (isLoading) {
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
          Loading dashboard...
        </Typography>
      </Box>
    );
  }

  // Error state — invalid or expired token
  if (error || !isAuthenticated) {
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
          p: 4,
        }}
      >
        <Typography variant="h5" sx={{ color: COLORS.neon.red }}>
          Access Denied
        </Typography>
        <Typography variant="body2" sx={{ color: COLORS.text.secondary, textAlign: 'center' }}>
          {error || 'This dashboard link is invalid or has expired. Contact your account manager for a new link.'}
        </Typography>
      </Box>
    );
  }

  // Authenticated — render the dashboard
  return (
    <FilterProvider>
      <DashboardShell tier={tier} companyName={companyName} basePath={`/d/${token}`} mode={mode}>
        <Outlet />
      </DashboardShell>
    </FilterProvider>
  );
}
