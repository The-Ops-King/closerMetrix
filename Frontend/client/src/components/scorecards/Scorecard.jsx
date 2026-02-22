/**
 * SCORECARD — Single Metric Display Card
 *
 * Dark card with centered text, trend arrow, and period comparison.
 * Background is near-black with a subtle border. On hover, the border
 * glows with the card's accent color.
 *
 * Props:
 *   label: string              — Metric label (e.g. "Show Rate")
 *   value: number              — Raw numeric value (e.g. 0.73 for 73%)
 *   format: string             — 'percent' | 'currency' | 'number' | 'score' | 'decimal'
 *   delta: number|null         — Percentage change vs previous period (e.g. 12.5 means +12.5%)
 *   deltaLabel: string|null    — Comparison label (e.g. "vs last month")
 *   desiredDirection: string   — 'up' = higher is better, 'down' = lower is better
 *   glowColor: string          — Accent color for the value text and hover glow
 *   locked: boolean            — Blurs value and shows lock icon (tier upsell)
 *   onClick: function          — Optional click handler
 */

import React, { useState, useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { COLORS, LAYOUT } from '../../theme/constants';
import { formatMetric } from '../../utils/formatters';
import { hexToRgba } from '../../utils/colors';

/**
 * Determines delta color based on whether the change is desired.
 * If desiredDirection is 'up', positive deltas are green (good).
 * If desiredDirection is 'down', positive deltas are red (bad).
 */
function getDeltaColor(delta, desiredDirection) {
  if (delta == null || isNaN(delta) || delta === 0) return COLORS.text.muted;
  const isPositive = delta > 0;
  const isDesired = desiredDirection === 'down' ? !isPositive : isPositive;
  return isDesired ? COLORS.neon.green : COLORS.neon.red;
}

/**
 * Simple diagonal arrow icon — up-right for positive, down-right for negative.
 */
function TrendArrow({ delta, color }) {
  if (delta == null || isNaN(delta) || delta === 0) return null;

  if (delta > 0) {
    return (
      <svg width="14" height="14" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
        <path
          d="M2.5 9.5L9.5 2.5M9.5 2.5H5M9.5 2.5V7"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
      <path
        d="M2.5 2.5L9.5 9.5M9.5 9.5H5M9.5 9.5V5"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Animation keyframes — injected once into the document head
const keyframes = `
@keyframes scorecard-shimmer {
  0% { background-position: -200px 0; }
  100% { background-position: 200px 0; }
}
`;

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  const style = document.createElement('style');
  style.textContent = keyframes;
  document.head.appendChild(style);
  stylesInjected = true;
}

export default function Scorecard({
  label,
  value,
  format = 'number',
  delta = null,
  deltaLabel = null,
  desiredDirection = 'up',
  glowColor = COLORS.neon.cyan,
  locked = false,
  onClick = null,
  subtitle = null,
  subtitleColor = null,
}) {
  injectStyles();

  const hasValue = value != null && value !== undefined;
  const [revealed, setRevealed] = useState(hasValue);
  const prevHasValue = useRef(hasValue);

  useEffect(() => {
    if (hasValue && !prevHasValue.current) {
      setRevealed(false);
      const raf = requestAnimationFrame(() => setRevealed(true));
      return () => cancelAnimationFrame(raf);
    }
    if (hasValue) setRevealed(true);
    prevHasValue.current = hasValue;
  }, [hasValue]);

  const displayValue = formatMetric(value, format);
  const deltaColor = getDeltaColor(delta, desiredDirection);

  return (
    <Box
      onClick={onClick}
      sx={{
        background: COLORS.bg.secondary,
        border: `1px solid ${COLORS.border.subtle}`,
        borderRadius: `${LAYOUT.cardBorderRadius}px`,
        padding: '20px 16px',
        minWidth: 0,
        height: '100%',
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'border-color 0.3s ease, box-shadow 0.3s ease, background 0.3s ease',
        '&:hover': locked
          ? {
              borderColor: `${COLORS.text.muted}50`,
              boxShadow: '0 0 20px rgba(100, 116, 139, 0.15)',
            }
          : {
              borderColor: hexToRgba(glowColor, 0.5),
              boxShadow: `0 0 30px ${hexToRgba(glowColor, 0.3)}, inset 0 0 20px ${hexToRgba(glowColor, 0.15)}`,
              background: `radial-gradient(circle at center, ${hexToRgba(glowColor, 0.03)} 0%, ${hexToRgba(glowColor, 0.3)} 100%)`,
            },
      }}
    >
      {/* Label — centered, uppercase, muted gray */}
      <Typography
        sx={{
          color: COLORS.text.secondary,
          fontSize: '0.8rem',
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          mb: '10px',
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </Typography>

      {/* Value — large, colored, centered */}
      <Box sx={{ position: 'relative', minHeight: 36 }}>
        {!hasValue ? (
          <Box
            sx={{
              height: 28,
              width: '60%',
              margin: '0 auto',
              borderRadius: 1,
              background: 'linear-gradient(90deg, #111 0%, #222 50%, #111 100%)',
              backgroundSize: '400px 100%',
              animation: 'scorecard-shimmer 1.5s ease-in-out infinite',
            }}
          />
        ) : (
          <Typography
            sx={{
              color: locked ? COLORS.text.muted : glowColor,
              fontSize: '2.5rem',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
              filter: locked ? 'blur(8px)' : 'none',
              userSelect: locked ? 'none' : 'auto',
              opacity: revealed ? 1 : 0,
              transform: revealed ? 'translateY(0)' : 'translateY(8px)',
              transition: 'opacity 0.4s ease-out, transform 0.4s ease-out',
            }}
          >
            {displayValue}
          </Typography>
        )}

        {/* Lock icon overlay for tier-gated metrics */}
        {locked && hasValue && (
          <Box
            sx={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <LockOutlinedIcon sx={{ color: COLORS.text.muted, fontSize: '1.5rem' }} />
          </Box>
        )}
      </Box>

      {/* Delta indicator — arrow + percentage + comparison label */}
      {delta != null && !isNaN(delta) && hasValue && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            mt: '10px',
            opacity: revealed ? 1 : 0,
            transform: revealed ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity 0.4s ease-out 0.1s, transform 0.4s ease-out 0.1s',
          }}
        >
          <TrendArrow delta={delta} color={deltaColor} />
          <Typography
            sx={{
              color: deltaColor,
              fontSize: '1.1rem',
              fontWeight: 600,
            }}
          >
            {delta > 0 ? '+' : ''}
            {typeof delta === 'number' ? Math.abs(delta).toFixed(1) : delta}%
          </Typography>
          {deltaLabel && (
            <Typography
              sx={{
                color: COLORS.text.muted,
                fontSize: '0.9rem',
                fontWeight: 400,
              }}
            >
              {deltaLabel}
            </Typography>
          )}
        </Box>
      )}

      {/* Subtitle — optional text below value (e.g. "On Pace", "was 73.2%") */}
      {subtitle && hasValue && (
        <Typography
          sx={{
            color: subtitleColor || COLORS.text.muted,
            fontSize: '0.75rem',
            fontWeight: 600,
            mt: '8px',
            opacity: revealed ? 1 : 0,
            transform: revealed ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity 0.4s ease-out 0.1s, transform 0.4s ease-out 0.1s',
          }}
        >
          {subtitle}
        </Typography>
      )}
    </Box>
  );
}
