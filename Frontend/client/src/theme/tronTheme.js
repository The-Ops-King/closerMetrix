/**
 * MUI THEME — TRON DARK PALETTE
 *
 * This theme is applied via <ThemeProvider> at the root of the app.
 * Every MUI component automatically picks up these colors, typography, and overrides.
 * No inline color values needed — use theme.palette.* or the sx prop.
 */

import { createTheme } from '@mui/material/styles';
import { COLORS } from './constants';

export const tronTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: COLORS.neon.cyan },
    secondary: { main: COLORS.neon.magenta },
    warning: { main: COLORS.neon.amber },
    success: { main: COLORS.neon.green },
    error: { main: COLORS.neon.red },
    info: { main: COLORS.neon.blue },
    background: {
      default: COLORS.bg.primary,
      paper: COLORS.bg.secondary,
    },
    text: {
      primary: COLORS.text.primary,
      secondary: COLORS.text.secondary,
    },
    divider: COLORS.border.subtle,
  },

  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", sans-serif',

    // Scorecard large number
    h2: {
      fontSize: '2.5rem',
      fontWeight: 700,
      letterSpacing: '-0.02em',
      lineHeight: 1.1,
    },
    // Page title
    h4: {
      fontSize: '1.5rem',
      fontWeight: 700,
      letterSpacing: '-0.01em',
    },
    // Section header
    h5: {
      fontSize: '1.25rem',
      fontWeight: 600,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
    },
    // Sub-section header
    h6: {
      fontSize: '1rem',
      fontWeight: 600,
      letterSpacing: '0.02em',
    },
    // Scorecard label
    caption: {
      fontSize: '0.75rem',
      fontWeight: 500,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: COLORS.text.secondary,
    },
    // Small body text
    body2: {
      fontSize: '0.875rem',
      color: COLORS.text.secondary,
    },
  },

  components: {
    // Cards — dark with subtle glow on hover
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: COLORS.bg.secondary,
          border: `1px solid ${COLORS.border.subtle}`,
          borderRadius: 12,
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
          '&:hover': {
            borderColor: COLORS.border.glow,
            boxShadow: `0 0 20px ${COLORS.border.glow}`,
          },
        },
      },
    },

    // Paper — remove MUI's default gradient overlay
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },

    // Buttons — neon cyan with glow
    MuiButton: {
      styleOverrides: {
        containedPrimary: {
          backgroundColor: COLORS.neon.cyan,
          color: COLORS.bg.primary,
          fontWeight: 600,
          '&:hover': {
            backgroundColor: COLORS.neon.cyan,
            boxShadow: `0 0 15px rgba(77, 212, 232, 0.4)`,
          },
        },
      },
    },

    // Chip — for tier badges, filter tags
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          letterSpacing: '0.05em',
        },
      },
    },

    // Tooltip
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: COLORS.bg.elevated,
          border: `1px solid ${COLORS.border.default}`,
          fontSize: '0.75rem',
        },
      },
    },
  },
});
