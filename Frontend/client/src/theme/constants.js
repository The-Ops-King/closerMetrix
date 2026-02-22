/**
 * TRON THEME CONSTANTS
 *
 * The complete color system for CloserMetrix.
 * Every color in the app references this file — no magic hex values anywhere else.
 *
 * Design evolution from Tyler's existing apps:
 *   Old #212022 bg → New #0a0e17 (near-black with blue undertone)
 *   Old #2c3139 cards → New #111827 (darker with subtle border glow)
 *   Old #2579c0 accent → New #4DD4E8 (soft neon cyan)
 */

export const COLORS = {
  // Backgrounds — darkest to lightest
  bg: {
    primary: '#0a0e17',       // Main page background — near-black with blue undertone
    secondary: '#111827',     // Card backgrounds
    tertiary: '#1a2332',      // Sidebar, panel backgrounds
    elevated: '#1e293b',      // Hover states, elevated cards
  },

  // Neon Accents — Softer neon palette (OV standard)
  neon: {
    cyan: '#4DD4E8',          // Primary accent — borders, active states, key metrics
    magenta: '#ff00e5',       // Secondary accent — alerts, negative deltas
    amber: '#FFD93D',         // Tertiary — warnings, Insight tier badge
    green: '#6BCF7F',         // Success — positive deltas, closed deals
    red: '#FF4D6D',           // Danger — negative deltas, risk flags
    blue: '#4D7CFF',          // Info — Basic tier, links
    purple: '#B84DFF',        // Special — projections, AI insights
    teal: '#06b6d4',            // Cash-related metrics
  },

  // Text hierarchy
  text: {
    primary: '#f1f5f9',       // Headings, large numbers
    secondary: '#94a3b8',     // Labels, descriptions
    muted: '#64748b',         // Timestamps, less important info
    inverse: '#0a0e17',       // Dark text on light backgrounds
  },

  // Borders & dividers
  border: {
    subtle: '#1e293b',        // Section dividers (barely visible)
    default: '#334155',       // Normal borders
    glow: 'rgba(77, 212, 232, 0.3)',  // Cyan glow for active/hover
  },

  // Chart series colors — ordered palette
  chart: [
    '#4DD4E8',  // Cyan
    '#ff00e5',  // Magenta
    '#FFD93D',  // Amber
    '#6BCF7F',  // Green
    '#B84DFF',  // Purple
    '#4D7CFF',  // Blue
    '#FF4D6D',  // Red
    '#06b6d4',  // Teal (matches neon.teal)
  ],

  // Gradients for chart area fills (top → bottom)
  gradients: {
    cyan: ['rgba(77, 212, 232, 0.4)', 'rgba(77, 212, 232, 0)'],
    magenta: ['rgba(255, 0, 229, 0.4)', 'rgba(255, 0, 229, 0)'],
    green: ['rgba(107, 207, 127, 0.4)', 'rgba(107, 207, 127, 0)'],
    amber: ['rgba(255, 217, 61, 0.3)', 'rgba(255, 217, 61, 0)'],
  },

  // Tier badge colors
  tier: {
    basic: '#3B82F6',
    insight: '#F59E0B',
    executive: '#EF4444',
  },
};

// Ordered color palettes for specific UI patterns
export const PALETTES = {
  // Rank position colors (TopPerformers leaderboard): #1=green, #2=cyan, #3=blue, #4=purple, #5=amber
  rank: [COLORS.neon.green, COLORS.neon.cyan, COLORS.neon.blue, COLORS.neon.purple, COLORS.neon.amber],
  // Funnel stage colors: cyan → blue → purple → amber → green
  funnel: [COLORS.neon.cyan, COLORS.neon.blue, COLORS.neon.purple, COLORS.neon.amber, COLORS.neon.green],
};

// Layout constants
export const LAYOUT = {
  sidebarWidth: 240,
  sidebarCollapsedWidth: 64,
  topBarHeight: 64,
  contentMaxWidth: 1400,
  cardBorderRadius: 12,
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
};
