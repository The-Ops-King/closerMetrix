/**
 * SIDEBAR NAVIGATION
 *
 * Shows ALL nav items regardless of tier. Items the user's tier
 * can't access show a subtle lock icon — clicking them navigates
 * to the page where blurred content + upgrade overlay is displayed.
 *
 * Admin viewing a client: sees same locks as the client's tier.
 */

import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { COLORS, LAYOUT } from '../../theme/constants';
import { NAV_ITEMS, meetsMinTier } from '../../utils/tierConfig';

export default function Sidebar({ tier, basePath }) {
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * Check if a nav item is currently active.
   * Matches exact path or path prefix for nested routes.
   */
  const isActive = (item) => {
    const fullPath = `${basePath}${item.path}`;
    if (item.path === '') {
      return location.pathname === basePath || location.pathname === `${basePath}/`;
    }
    return location.pathname.startsWith(fullPath);
  };

  return (
    <Box
      sx={{
        width: LAYOUT.sidebarWidth,
        height: '100%',
        overflowY: 'auto',
        backgroundColor: COLORS.bg.tertiary,
        borderRight: `1px solid ${COLORS.border.subtle}`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* Logo / Brand */}
      <Box
        sx={{
          height: LAYOUT.topBarHeight,
          display: 'flex',
          alignItems: 'center',
          px: 2.5,
          borderBottom: `1px solid ${COLORS.border.subtle}`,
        }}
      >
        <Typography
          variant="h6"
          sx={{
            fontWeight: 700,
            letterSpacing: '0.1em',
            color: COLORS.neon.cyan,
            textTransform: 'uppercase',
            fontSize: '0.95rem',
          }}
        >
          CloserMetrix
        </Typography>
      </Box>

      {/* Navigation Items — show ALL items, lock icon on restricted ones */}
      <List sx={{ px: 1, py: 2, flex: 1 }}>
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          const locked = !meetsMinTier(tier, item.minTier);

          return (
            <ListItemButton
              key={item.key}
              onClick={() => navigate(`${basePath}${item.path}`)}
              sx={{
                borderRadius: 1.5,
                mb: 0.5,
                py: 1.2,
                px: 2,
                backgroundColor: active ? 'rgba(77, 212, 232, 0.08)' : 'transparent',
                borderLeft: active ? `3px solid ${COLORS.neon.cyan}` : '3px solid transparent',
                '&:hover': {
                  backgroundColor: active
                    ? 'rgba(77, 212, 232, 0.12)'
                    : 'rgba(255, 255, 255, 0.04)',
                },
              }}
            >
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{
                  fontSize: '0.85rem',
                  fontWeight: active ? 600 : 400,
                  color: active
                    ? COLORS.neon.cyan
                    : locked
                      ? COLORS.text.muted
                      : COLORS.text.secondary,
                  letterSpacing: '0.02em',
                }}
              />
              {locked && (
                <LockOutlinedIcon
                  sx={{
                    fontSize: '0.9rem',
                    color: COLORS.text.muted,
                    ml: 0.5,
                    opacity: 0.6,
                  }}
                />
              )}
            </ListItemButton>
          );
        })}
      </List>

      {/* Footer — subtle branding */}
      <Box sx={{ p: 2, borderTop: `1px solid ${COLORS.border.subtle}` }}>
        <Typography
          variant="caption"
          sx={{ color: COLORS.text.muted, fontSize: '0.65rem', display: 'block', textAlign: 'center' }}
        >
          Powered by CloserMetrix
        </Typography>
      </Box>
    </Box>
  );
}
