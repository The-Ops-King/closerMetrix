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

import React, { useEffect, useRef } from 'react';
import { Outlet, useParams, Navigate, useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { COLORS } from '../../theme/constants';
import { useAuth } from '../../context/AuthContext';
import { FilterProvider } from '../../context/FilterContext';
import DashboardShell from '../../components/layout/DashboardShell';
import usePageTracking from '../../hooks/usePageTracking';

export default function ClientDashboardLayout() {
  const { token } = useParams();
  const location = useLocation();
  const { isAuthenticated, isLoading, error, tier, companyName, mode, closerScope, validateClientToken } = useAuth();

  // Track page views, session starts, and time on page
  usePageTracking();

  // Track which token we've already validated to prevent double-validation
  // (React StrictMode re-invokes effects, which would flash a loading spinner).
  const validatedTokenRef = useRef(null);

  useEffect(() => {
    if (token && validatedTokenRef.current !== token) {
      validatedTokenRef.current = token;
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

  // Closer-scoped token: redirect to closer-view if not already there
  if (closerScope && !location.pathname.endsWith('/closer-view')) {
    return <Navigate to={`/d/${token}/closer-view`} replace />;
  }

  // Authenticated — render the dashboard
  // Closer-scoped tokens get no sidebar (hideSidebar prop)
  return (
    <FilterProvider>
      <DashboardShell tier={tier} companyName={companyName} basePath={`/d/${token}`} mode={mode} hideSidebar={!!closerScope}>
        <Outlet />
      </DashboardShell>
    </FilterProvider>
  );
}
