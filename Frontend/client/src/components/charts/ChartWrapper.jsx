/**
 * ChartWrapper — Wraps every chart with consistent loading/error/empty states.
 *
 * This component handles the three non-happy-path states so that individual
 * chart components only need to worry about rendering data. Every chart in
 * the dashboard is wrapped with this component.
 *
 * Visual: Dark card container with subtle colored accent bar on the title,
 * matching the overall Tron/Sales Command Center theme.
 *
 * States:
 *   loading  -> Pulsing skeleton rectangles (dark gray, Tron-style)
 *   error    -> Red-tinted card with the error message
 *   isEmpty  -> "No data for selected period" centered message
 *   success  -> Renders children (the actual chart)
 *
 * Usage:
 *   <ChartWrapper loading={isLoading} error={error} isEmpty={!data?.length} title="Revenue Over Time">
 *     <TronLineChart data={data} series={series} />
 *   </ChartWrapper>
 */

import React from 'react';
import { Box, Typography, Skeleton } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { COLORS, LAYOUT } from '../../theme/constants';
import { hexToRgba } from '../../utils/colors';
import SectionHeader from '../SectionHeader';

/**
 * @param {Object} props
 * @param {boolean} props.loading - Whether data is still being fetched
 * @param {string|null} props.error - Error message string, or null if no error
 * @param {boolean} props.isEmpty - Whether the data set is empty after loading
 * @param {string} props.title - Chart title displayed above the chart
 * @param {string} [props.subtitle] - Optional subtitle / description
 * @param {string} [props.accentColor] - Color for the title accent bar (defaults to cyan)
 * @param {number} [props.height=350] - Height of the chart area in pixels
 * @param {boolean} [props.locked=false] - When true, renders children blurred with lock overlay (for tier gating)
 * @param {React.ReactNode} props.children - The chart component to render on success
 */
export default function ChartWrapper({
  loading = false,
  error = null,
  isEmpty = false,
  title,
  subtitle,
  accentColor = COLORS.neon.cyan,
  height = 350,
  locked = false,
  children,
}) {
  return (
    <Box
      sx={{
        backgroundColor: COLORS.bg.secondary,
        border: `1px solid ${COLORS.border.subtle}`,
        borderTop: `2px solid ${hexToRgba(accentColor, 0.3)}`,
        borderRadius: `${LAYOUT.cardBorderRadius}px`,
        padding: { xs: 2, md: 3 },
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        overflow: 'hidden',
        transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
        '&:hover': {
          borderColor: 'rgba(255, 255, 255, 0.06)',
          borderTopColor: hexToRgba(accentColor, 0.3),
          boxShadow: `0 0 25px rgba(0, 0, 0, 0.4)`,
        },
      }}
    >
      {/* Chart title with colored accent bar */}
      {title && (
        <Box sx={{ mb: subtitle ? 0.5 : 2 }}>
          <SectionHeader title={title} color={accentColor} size="sm" />
        </Box>
      )}
      {subtitle && (
        <Typography
          variant="body2"
          sx={{
            color: COLORS.text.muted,
            fontSize: '0.8rem',
            mb: 2,
            pl: '22px', // align with title text (past accent bar)
          }}
        >
          {subtitle}
        </Typography>
      )}

      {/* ── LOCKED STATE ── render children blurred with lock overlay */}
      {locked && (
        <Box sx={{ position: 'relative', height }}>
          <Box
            sx={{
              filter: 'blur(8px)',
              pointerEvents: 'none',
              userSelect: 'none',
              opacity: 0.6,
              height: '100%',
            }}
          >
            {children}
          </Box>
          <Box
            sx={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2,
            }}
          >
            <LockOutlinedIcon sx={{ color: COLORS.text.muted, fontSize: '2rem' }} />
          </Box>
        </Box>
      )}

      {/* ── LOADING STATE — animated bar skeleton with staggered pulse ── */}
      {!locked && loading && (
        <Box sx={{ height, display: 'flex', flexDirection: 'column' }}>
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              gap: '6px',
              px: 4,
              pb: 4,
            }}
          >
            {[40, 65, 50, 80, 55, 70, 45, 75, 60, 85, 50, 68].map((h, i) => (
              <Box
                key={i}
                sx={{
                  flex: 1,
                  maxWidth: 32,
                  height: `${h}%`,
                  borderRadius: '3px 3px 0 0',
                  background: `linear-gradient(180deg, ${hexToRgba(accentColor, 0.2)} 0%, ${hexToRgba(accentColor, 0.05)} 100%)`,
                  border: `1px solid ${hexToRgba(accentColor, 0.1)}`,
                  borderBottom: 'none',
                  animation: 'chart-bar-pulse 2s ease-in-out infinite',
                  animationDelay: `${i * 0.1}s`,
                  '@keyframes chart-bar-pulse': {
                    '0%, 100%': { opacity: 0.3, transform: 'scaleY(1)' },
                    '50%': { opacity: 0.7, transform: 'scaleY(1.05)' },
                  },
                  transformOrigin: 'bottom',
                }}
              />
            ))}
          </Box>
          {/* Fake x-axis line */}
          <Box
            sx={{
              height: '1px',
              mx: 4,
              background: `linear-gradient(90deg, transparent, ${hexToRgba(accentColor, 0.15)}, transparent)`,
            }}
          />
          <Typography
            sx={{
              color: COLORS.text.muted,
              fontSize: '0.8rem',
              textAlign: 'center',
              mt: 1.5,
              letterSpacing: '0.05em',
              animation: 'chart-bar-pulse 2s ease-in-out infinite',
              '@keyframes chart-bar-pulse': {
                '0%, 100%': { opacity: 0.3 },
                '50%': { opacity: 0.7 },
              },
            }}
          >
            Loading data...
          </Typography>
        </Box>
      )}

      {/* ── ERROR STATE ── */}
      {!locked && !loading && error && (
        <Box
          sx={{
            height,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255, 51, 102, 0.05)',
            border: `1px solid rgba(255, 51, 102, 0.2)`,
            borderRadius: '8px',
          }}
        >
          <Typography
            sx={{
              color: COLORS.neon.red,
              fontSize: '1rem',
              fontWeight: 600,
              mb: 1,
            }}
          >
            Failed to load chart
          </Typography>
          <Typography
            sx={{
              color: COLORS.text.muted,
              fontSize: '0.85rem',
              textAlign: 'center',
              maxWidth: '400px',
              px: 2,
            }}
          >
            {error}
          </Typography>
        </Box>
      )}

      {/* ── EMPTY STATE ── */}
      {!locked && !loading && !error && isEmpty && (
        <Box
          sx={{
            height,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              border: `2px solid ${COLORS.border.default}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 2,
            }}
          >
            <Typography sx={{ color: COLORS.text.muted, fontSize: '1.5rem' }}>
              --
            </Typography>
          </Box>
          <Typography
            sx={{
              color: COLORS.text.secondary,
              fontSize: '0.9rem',
            }}
          >
            No data for selected period
          </Typography>
        </Box>
      )}

      {/* ── SUCCESS STATE ── */}
      {!locked && !loading && !error && !isEmpty && (
        <Box sx={{ flex: 1, height, overflow: 'hidden' }}>
          {children}
        </Box>
      )}
    </Box>
  );
}
