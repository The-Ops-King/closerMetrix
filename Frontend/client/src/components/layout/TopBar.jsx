/**
 * TOP BAR
 *
 * Horizontal bar at the top of the content area.
 * Shows: company name, tier badge, and filter controls.
 * Filters shown depend on the current tier.
 */

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import { COLORS, LAYOUT } from '../../theme/constants';
import { meetsMinTier } from '../../utils/tierConfig';
import TierBadge from './TierBadge';
import DateRangeFilter from '../filters/DateRangeFilter';
import CloserFilter from '../filters/CloserFilter';

export default function TopBar({ companyName, tier }) {
  return (
    <Box
      sx={{
        height: LAYOUT.topBarHeight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 3,
        borderBottom: `1px solid ${COLORS.border.subtle}`,
        backgroundColor: COLORS.bg.secondary,
        flexShrink: 0,
        zIndex: 10,
      }}
    >
      {/* Left: Company name + tier badge */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography
          variant="h6"
          sx={{
            fontWeight: 600,
            color: COLORS.text.primary,
            fontSize: '1rem',
          }}
        >
          {companyName || 'Dashboard'}
        </Typography>
        {tier && <TierBadge tier={tier} size="sm" />}
      </Box>

      {/* Right: Filter controls — CloserFilter always visible, disabled for Basic */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {meetsMinTier(tier, 'insight') ? (
          <CloserFilter />
        ) : (
          <Tooltip title="Upgrade to Insight to filter by closer" arrow>
            <span>
              <CloserFilter disabled />
            </span>
          </Tooltip>
        )}
        <DateRangeFilter />
      </Box>
    </Box>
  );
}
