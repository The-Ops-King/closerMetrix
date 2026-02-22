/**
 * SCORECARD ROW — Full-Width Grid of Scorecard Cards
 *
 * Renders a responsive grid of <Scorecard> components that fills the entire width.
 * Cards are equal height and evenly distributed across columns.
 * Used for the "At a Glance" sections at the top of dashboard pages.
 *
 * Props:
 *   title: string|null    — Optional section title with colored accent bar
 *   metrics: object — Keyed object of metric data
 *   glowColor: string     — Default glow color for all cards in this row (defaults to cyan)
 *   sectionColor: string  — Color for the section title accent bar (defaults to glowColor)
 *   lockedKeys: string[]  — Array of metric keys that should render as locked (tier upsell)
 *   onLockedClick: func   — Handler called when a locked card is clicked (receives metric key)
 *
 * Renders nothing if metrics is null, undefined, or an empty object.
 */

import React from 'react';
import Box from '@mui/material/Box';
import { COLORS } from '../../theme/constants';
import Scorecard from './Scorecard';
import SectionHeader from '../SectionHeader';

export default function ScorecardRow({
  title = null,
  metrics,
  glowColor = COLORS.neon.cyan,
  sectionColor,
  lockedKeys = [],
  onLockedClick = null,
}) {
  // Guard: render nothing if no metrics provided
  if (!metrics || typeof metrics !== 'object' || Object.keys(metrics).length === 0) {
    return null;
  }

  // Convert lockedKeys array to a Set for O(1) lookup
  const lockedSet = new Set(lockedKeys);

  // Accent bar color defaults to the section's glowColor
  const accentColor = sectionColor || glowColor;

  const count = Object.keys(metrics).length;

  return (
    <Box sx={{ width: '100%' }}>
      {/* Optional section title with colored left accent bar */}
      {title && (
        <Box sx={{ mb: 2 }}>
          <SectionHeader title={title} color={accentColor} />
        </Box>
      )}

      {/* Grid layout — cards fill evenly across the full width with equal height */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: `repeat(${Math.min(count, 2)}, 1fr)`,
            md: `repeat(${Math.min(count, 4)}, 1fr)`,
            lg: `repeat(${Math.min(count, 5)}, 1fr)`,
            xl: `repeat(${Math.min(count, 6)}, 1fr)`,
          },
          gap: '16px',
          width: '100%',
        }}
      >
        {Object.entries(metrics).map(([key, metric]) => {
          const isLocked = lockedSet.has(key);

          return (
            <Scorecard
              key={key}
              label={metric.label || key}
              value={metric.value}
              format={metric.format || 'number'}
              delta={metric.delta != null ? metric.delta : null}
              deltaLabel={metric.deltaLabel || null}
              desiredDirection={metric.desiredDirection || 'up'}
              glowColor={metric.glowColor || glowColor}
              locked={isLocked}
              onClick={isLocked && onLockedClick ? () => onLockedClick(key) : null}
            />
          );
        })}
      </Box>
    </Box>
  );
}
