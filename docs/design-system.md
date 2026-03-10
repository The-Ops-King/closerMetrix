# Design System Reference

## Colors (`COLORS` from `Frontend/client/src/theme/constants.js`)

### Backgrounds
`bg.primary` `#0a0e17` · `bg.secondary` `#111827` · `bg.tertiary` `#1a2332` · `bg.elevated` `#1e293b`

### Neon Accents
| Token | Hex | Semantic |
|-------|-----|----------|
| `neon.cyan` | `#4DD4E8` | Primary accent, borders, active |
| `neon.green` | `#6BCF7F` | Success, positive deltas |
| `neon.amber` | `#FFD93D` | Warnings, Insight tier |
| `neon.red` | `#FF4D6D` | Danger, negative deltas |
| `neon.blue` | `#4D7CFF` | Info, Basic tier |
| `neon.purple` | `#B84DFF` | Special, projections, AI |
| `neon.teal` | `#06b6d4` | Cash metrics |
| `neon.magenta` | `#ff00e5` | Secondary accent |

### Text
`text.primary` `#f1f5f9` · `text.secondary` `#94a3b8` · `text.muted` `#64748b` · `text.inverse` `#0a0e17`

### Borders
`border.subtle` `#1e293b` · `border.default` `#334155` · `border.glow` `rgba(77,212,232,0.3)`

### Chart Palette (ordered): cyan → green → amber → purple → blue → red → teal → magenta
### Tier: `basic` `#3B82F6` · `insight` `#F59E0B` · `executive` `#EF4444`
### Palettes: `rank` = [green,cyan,blue,purple,amber] · `funnel` = [cyan,blue,purple,amber,green]

## Layout
Sidebar: 240px (64 collapsed) · TopBar: 64px · Max width: 1400px · Card radius: 12px
Spacing: xs=4 sm=8 md=16 lg=24 xl=32

## Typography (font: `"Inter", "Roboto", "Helvetica", sans-serif`)
| Variant | Size | Weight | Notes |
|---------|------|--------|-------|
| h2 | 2.5rem | 700 | Scorecard numbers; -0.02em tracking |
| h4 | 1.5rem | 700 | Page titles |
| h5 | 1.25rem | 600 | Section headers; uppercase; 0.05em tracking |
| h6 | 1rem | 600 | Sub-section headers |
| caption | 0.75rem | 500 | Scorecard labels; uppercase; 0.1em tracking |
| body2 | 0.875rem | — | Body text (secondary color) |

## MUI Overrides (tronTheme.js)
- **MuiCard**: bg=secondary, border=subtle, radius=12, hover glow
- **MuiPaper**: backgroundImage=none
- **MuiButton.containedPrimary**: bg=cyan, text=bg.primary, hover glow
- **MuiChip**: weight=600, tracking=0.05em
- **MuiTooltip**: bg=elevated, border=default, 0.75rem

## Chart Defaults (chartTheme.js)
Height: 350px · Margins: {top:20, right:20, bottom:40, left:60} · Grid: horizontal only
Axis labels: `text.secondary`, 12px, Inter · Tooltip: bg=elevated, border=cyan

## Color Utilities (`colors.js`)
- `COLOR_MAP`: `{ cyan, green, amber, magenta, purple, red, blue, teal, muted }` → hex values
- `resolveColor(color, index)`: name → hex via COLOR_MAP; `#hex` passthrough; fallback to chart palette
- `hexToRgba(hex, alpha)`: hex → `rgba()` string
- **Rule**: Never hardcode hex. Use `COLORS.neon.*` in frontend, name strings in backend data

## Component Props

### Scorecard
`label` `value` `format('percent'|'currency'|'number'|'score'|'decimal')` `delta` `deltaLabel` `desiredDirection('up'|'down')` `glowColor` `locked` `onClick` `subtitle` `hoverText` `kpiTarget({value,format})`

### ScorecardGrid
`title` `metrics(object)` `glowColor` `columns(default:4)` `lockedKeys(string[])` `onLockedClick`

### ChartWrapper
`loading` `error` `isEmpty` `title` `subtitle` `accentColor` `height(350)` `locked` `children`

### TronLineChart
`data([{date,...}])` `series([{key,label,color}])` `height` `yAxisFormat` `showArea(true)` `areaOpacity` `stacked` `referenceLines`

### TronBarChart
`data` `series` `height` `layout('vertical'|'horizontal')` `stacked` `yAxisFormat` `referenceLines`

### TronPieChart
`data([{label,value,color}])` `height(300)` `innerRadius(60)` `showLabels` `legendPosition`

### TronFunnelChart
`data([{label,count,color?}])` `title`

### TronRadarChart
`axes(string[])` `datasets([{label,values[],color}])` `maxValue(10)` `height(400)`
