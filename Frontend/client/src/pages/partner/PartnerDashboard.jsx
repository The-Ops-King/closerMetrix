/**
 * PARTNER DASHBOARD — Assigned clients list, view-only access.
 *
 * Partners see only their assigned clients. Cannot change tiers or manage tokens.
 * Data: GET /api/partner/clients
 */

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { COLORS } from '../../theme/constants';

export default function PartnerDashboard() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        backgroundColor: COLORS.bg.primary,
        p: 4,
      }}
    >
      <Typography variant="h4" sx={{ color: COLORS.neon.cyan, mb: 1 }}>
        Partner Portal
      </Typography>
      <Typography variant="body2" sx={{ color: COLORS.text.secondary, mb: 4 }}>
        Your assigned clients.
      </Typography>

      <Box
        sx={{
          p: 4, borderRadius: 2, border: `1px solid ${COLORS.border.subtle}`,
          backgroundColor: COLORS.bg.secondary, textAlign: 'center',
        }}
      >
        <Typography variant="h5" sx={{ color: COLORS.neon.cyan, mb: 1 }}>
          Partner View
        </Typography>
        <Typography variant="body2" sx={{ color: COLORS.text.muted }}>
          Assigned client list and dashboards — coming in Phase 7.
        </Typography>
      </Box>
    </Box>
  );
}
