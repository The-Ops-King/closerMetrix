/**
 * TIER BADGE
 *
 * Visual indicator showing the client's current plan tier.
 * Displayed in the TopBar and admin client list.
 *
 * Props:
 *   tier: 'basic' | 'insight' | 'executive'
 *   size: 'sm' | 'md' (default 'md')
 */

import React from 'react';
import Chip from '@mui/material/Chip';
import { COLORS } from '../../theme/constants';
import { TIERS } from '../../../../shared/tierDefinitions';

export default function TierBadge({ tier, size = 'md' }) {
  const normalized = (tier || '').toLowerCase();
  const color = TIERS[normalized]?.color || COLORS.text.muted;
  const label = TIERS[normalized]?.label || tier;

  return (
    <Chip
      label={label}
      size={size === 'sm' ? 'small' : 'medium'}
      sx={{
        backgroundColor: `${color}20`,  // 12% opacity background
        color: color,
        border: `1px solid ${color}40`,  // 25% opacity border
        fontWeight: 600,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        fontSize: size === 'sm' ? '0.65rem' : '0.75rem',
      }}
    />
  );
}
