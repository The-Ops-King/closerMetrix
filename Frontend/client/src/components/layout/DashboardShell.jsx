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

import React, { useState, useRef, useEffect } from 'react';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useLocation } from 'react-router-dom';
import { COLORS, LAYOUT } from '../../theme/constants';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

export default function DashboardShell({ tier, companyName, basePath, mode, hideSidebar, children }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const contentRef = useRef(null);
  const location = useLocation();

  // Scroll content area to top whenever the route changes (tab switch)
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTo(0, 0);
    }
  }, [location.pathname]);

  const handleDrawerToggle = () => setMobileOpen((prev) => !prev);
  const handleNavigate = () => setMobileOpen(false);

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden', backgroundColor: COLORS.bg.primary }}>
      {/* Sidebar — fixed on desktop, temporary drawer on mobile. Hidden for closer-scoped tokens. */}
      {!hideSidebar && (isMobile ? (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': {
              width: LAYOUT.sidebarWidth,
              backgroundColor: COLORS.bg.tertiary,
              borderRight: `1px solid ${COLORS.border.subtle}`,
            },
          }}
        >
          <Sidebar tier={tier} basePath={basePath} mode={mode} onNavigate={handleNavigate} />
        </Drawer>
      ) : (
        <Sidebar tier={tier} basePath={basePath} mode={mode} />
      ))}

      {/* Main content area — fills remaining width */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top bar with company name, tier badge, filters */}
        <TopBar
          companyName={companyName}
          tier={tier}
          onMenuClick={isMobile && !hideSidebar ? handleDrawerToggle : undefined}
        />

        {/* Scrollable content */}
        <Box
          ref={contentRef}
          sx={{
            flex: 1,
            overflow: 'auto',
            p: { xs: 1.5, sm: 2, md: 3 },
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}
