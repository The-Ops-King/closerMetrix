/**
 * INSIGHT CARD — AI Data Analytics
 *
 * Full-width card that displays AI-generated insights for a dashboard page.
 * Amber/yellow background with amber left border, "AI DATA ANALYTICS" label.
 *
 * States:
 *   Loading (initial): Pulse skeleton animation
 *   Loading (on-demand): Skeleton overlay replaces text, button shows "Analyzing..."
 *   Error/empty: Hidden entirely (returns null)
 *   Success: Shows insight text + generated timestamp + analyze button
 *   Rate limited: Button disabled with "X left this hour" label
 */

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import { COLORS, LAYOUT } from '../theme/constants';
import { hexToRgba } from '../utils/colors';

/**
 * Format a timestamp into a human-readable relative string.
 */
function formatGeneratedAt(timestamp) {
  if (!timestamp) return null;
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return 'Generated just now';
    if (diffHours < 24) return `Generated ${diffHours}h ago`;
    if (diffDays === 1) return 'Generated yesterday';
    return `Generated ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  } catch {
    return null;
  }
}

/** Skeleton bars shown during loading */
function SkeletonBars() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      {[90, 70, 50].map((width, i) => (
        <Box
          key={i}
          sx={{
            height: 12,
            width: `${width}%`,
            borderRadius: 1,
            backgroundColor: 'rgba(255, 217, 61, 0.12)',
            animation: 'insightPulse 1.5s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`,
            '@keyframes insightPulse': {
              '0%, 100%': { opacity: 0.4 },
              '50%': { opacity: 0.8 },
            },
          }}
        />
      ))}
    </Box>
  );
}

/**
 * @param {object} props
 * @param {string|null} props.text - AI insight text to display
 * @param {boolean} props.isLoading - Whether daily insight is being fetched
 * @param {string|null} [props.generatedAt] - Timestamp of when the insight was generated
 * @param {boolean} [props.isOnDemandLoading] - Whether on-demand generation is in progress
 * @param {function} [props.onAnalyze] - Callback to trigger on-demand analysis with current filters
 * @param {number} [props.remainingAnalyses] - How many on-demand analyses left this hour
 */
export default function InsightCard({ text, isLoading, generatedAt, isOnDemandLoading, onAnalyze, remainingAnalyses }) {
  // Hide entirely when there's no text and not loading
  if (!text && !isLoading && !isOnDemandLoading) return null;

  const timestampLabel = formatGeneratedAt(generatedAt);
  const isRateLimited = typeof remainingAnalyses === 'number' && remainingAnalyses <= 0;
  const showSkeleton = (isLoading && !text) || isOnDemandLoading;

  return (
    <Box
      sx={{
        mb: 2,
        p: 2,
        pl: 2.5,
        borderRadius: `${LAYOUT.cardBorderRadius}px`,
        background: `radial-gradient(circle at center, ${hexToRgba(COLORS.neon.amber, 0.03)} 0%, ${hexToRgba(COLORS.neon.amber, 0.3)} 100%)`,
        border: `1px solid ${hexToRgba(COLORS.neon.amber, 0.5)}`,
        boxShadow: `0 0 30px ${hexToRgba(COLORS.neon.amber, 0.3)}, inset 0 0 20px ${hexToRgba(COLORS.neon.amber, 0.15)}`,
        minHeight: 72,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      {/* Header row: label + timestamp + analyze button */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
        <Typography
          sx={{
            fontSize: '0.65rem',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: COLORS.neon.amber,
            lineHeight: 1,
          }}
        >
          AI Data Analytics
        </Typography>

        {timestampLabel && !isOnDemandLoading && (
          <Typography
            sx={{
              fontSize: '0.6rem',
              color: COLORS.text.muted,
              lineHeight: 1,
            }}
          >
            {timestampLabel}
          </Typography>
        )}

        {isOnDemandLoading && (
          <Typography
            sx={{
              fontSize: '0.6rem',
              color: COLORS.neon.amber,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
            }}
          >
            <CircularProgress size={8} sx={{ color: COLORS.neon.amber }} />
            Generating fresh analysis...
          </Typography>
        )}

        {/* Spacer */}
        <Box sx={{ flex: 1 }} />

        {/* Analyze with current filters button */}
        {onAnalyze && !isOnDemandLoading && (
          <ButtonBase
            onClick={onAnalyze}
            disabled={isRateLimited}
            sx={{
              fontSize: '0.6rem',
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: isRateLimited ? COLORS.text.muted : COLORS.neon.amber,
              px: 1,
              py: 0.25,
              borderRadius: 1,
              border: `1px solid ${hexToRgba(COLORS.neon.amber, isRateLimited ? 0.15 : 0.3)}`,
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              cursor: isRateLimited ? 'not-allowed' : 'pointer',
              '&:hover': isRateLimited ? {} : {
                background: hexToRgba(COLORS.neon.amber, 0.1),
                borderColor: hexToRgba(COLORS.neon.amber, 0.5),
              },
            }}
          >
            {isRateLimited
              ? 'Limit reached'
              : 'Analyze with filters'}
          </ButtonBase>
        )}

        {/* Remaining count */}
        {typeof remainingAnalyses === 'number' && !isOnDemandLoading && (
          <Typography
            sx={{
              fontSize: '0.55rem',
              color: COLORS.text.muted,
              lineHeight: 1,
            }}
          >
            {remainingAnalyses}/10 left
          </Typography>
        )}
      </Box>

      {/* Content: skeleton or text */}
      {showSkeleton ? (
        <SkeletonBars />
      ) : (
        <Typography
          sx={{
            color: COLORS.text.primary,
            fontSize: '0.85rem',
            lineHeight: 1.5,
          }}
        >
          {text}
        </Typography>
      )}
    </Box>
  );
}
