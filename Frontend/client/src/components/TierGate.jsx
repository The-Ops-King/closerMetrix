/**
 * TIER GATE — Blur + Upgrade Overlay
 *
 * Wraps content that requires a minimum tier. If the user's tier doesn't
 * meet the requirement, children render blurred with an overlay prompting
 * them to upgrade.
 *
 * - Admin viewing a client sees the same gates as the client's tier.
 * - The children still render (with real data) so the blurred preview
 *   acts as a teaser — the user can see shapes/colors but not read values.
 *
 * Usage:
 *   <TierGate requiredTier="insight">
 *     <SomeInsightOnlyChart />
 *   </TierGate>
 *
 *   <TierGate requiredTier="executive" label="violation details">
 *     <ViolationsTable />
 *   </TierGate>
 */

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useAuth } from '../context/AuthContext';
import { COLORS, LAYOUT } from '../theme/constants';
import { TIER_LABELS } from '../../../shared/tierDefinitions';
import { meetsMinTier } from '../utils/tierConfig';

/**
 * @param {Object} props
 * @param {'basic'|'insight'|'executive'} props.requiredTier - Minimum tier to view ungated
 * @param {string} [props.label] - Optional description of what's locked (e.g. "per-closer breakdowns")
 * @param {React.ReactNode} props.children - The content to gate
 */
export default function TierGate({ requiredTier, label, children }) {
  const { tier } = useAuth();

  // If the user's tier meets the requirement, render children normally
  if (meetsMinTier(tier, requiredTier)) {
    return <>{children}</>;
  }

  // User's tier is too low — show blurred content with upgrade overlay
  const tierLabel = TIER_LABELS[requiredTier] || requiredTier;
  const tierColor = COLORS.tier[requiredTier] || COLORS.text.muted;

  return (
    <Box sx={{ position: 'relative', borderRadius: `${LAYOUT.cardBorderRadius}px`, overflow: 'hidden' }}>
      {/* Blurred content — still renders with real data as a teaser */}
      <Box
        sx={{
          filter: 'blur(8px)',
          pointerEvents: 'none',
          userSelect: 'none',
          // Slight dimming to make overlay more readable
          opacity: 0.6,
        }}
      >
        {children}
      </Box>

      {/* Upgrade overlay — centered on top of blurred content */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // Subtle dark gradient so text is always readable against any blurred content
          background: 'radial-gradient(ellipse at center, rgba(10, 14, 23, 0.7) 0%, rgba(10, 14, 23, 0.3) 70%, transparent 100%)',
          zIndex: 2,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1.5,
            padding: '28px 40px',
            borderRadius: `${LAYOUT.cardBorderRadius}px`,
            backgroundColor: 'rgba(10, 14, 23, 0.85)',
            border: `1px solid ${tierColor}40`,
            boxShadow: `0 0 30px ${tierColor}20, 0 8px 32px rgba(0, 0, 0, 0.5)`,
            backdropFilter: 'blur(4px)',
          }}
        >
          <LockOutlinedIcon sx={{ color: tierColor, fontSize: '2rem' }} />

          <Typography
            sx={{
              color: COLORS.text.primary,
              fontSize: '1.1rem',
              fontWeight: 700,
              letterSpacing: '0.02em',
              textAlign: 'center',
            }}
          >
            Upgrade to{' '}
            <Box component="span" sx={{ color: tierColor }}>
              {tierLabel}
            </Box>
          </Typography>

          <Typography
            sx={{
              color: COLORS.text.secondary,
              fontSize: '0.85rem',
              textAlign: 'center',
              maxWidth: 260,
              lineHeight: 1.4,
            }}
          >
            {label
              ? `to view ${label}`
              : 'to access this data'}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
