/**
 * DASHBOARD SHELL
 *
 * The main layout wrapper: sidebar + topbar + scrollable content area.
 * Used by ALL dashboard views (client, admin viewing a client, partner viewing a client).
 *
 * Props:
 *   tier: 'basic' | 'insight' | 'executive'
 *   companyName: string
 *   basePath: string — the URL base for nav links (e.g. '/d/abc123' or '/admin/clients/xyz/dashboard')
 *   children: React.ReactNode — the page content
 */

import React from 'react';
import Box from '@mui/material/Box';
import { COLORS } from '../../theme/constants';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

export default function DashboardShell({ tier, companyName, basePath, mode, children }) {
  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden', backgroundColor: COLORS.bg.primary }}>
      {/* Sidebar — fixed left */}
      <Sidebar tier={tier} basePath={basePath} mode={mode} />

      {/* Main content area — fills remaining width */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top bar with company name, tier badge, filters */}
        <TopBar companyName={companyName} tier={tier} />

        {/* Scrollable content */}
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            p: 3,
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}
