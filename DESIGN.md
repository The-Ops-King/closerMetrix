---
name: CloserMetrix
description: Sales integrity audits for high-ticket teams — aurora signal over a night-sky field.
colors:
  aurora-green: "#00ff88"
  aurora-green-deep: "#00cc6a"
  aurora-cyan: "#00d4ff"
  aurora-blue: "#0066ff"
  aurora-purple: "#6366f1"
  night-void: "#020617"
  night-deep: "#0f172a"
  night-mid: "#1e293b"
  night-light: "#334155"
  text-primary: "#f1f5f9"
  text-secondary: "#cbd5e1"
  text-muted: "#64748b"
  flag-red: "#ef4444"
  flag-red-light: "#f87171"
  rule-hairline: "rgba(255, 255, 255, 0.08)"
  surface-wash: "rgba(255, 255, 255, 0.03)"
  signal-wash: "rgba(0, 255, 136, 0.10)"
  shadow-ink: "rgba(0, 0, 0, 0.6)"
  slack-aubergine: "#3f0e40"
  slack-rail-dim: "#6b3f6c"
typography:
  display:
    fontFamily: "Archivo, Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "clamp(2.5rem, 5vw, 4rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Archivo, Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "clamp(2rem, 4vw, 3rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline-compact:
    fontFamily: "Archivo, Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "clamp(1.75rem, 2.6vw, 2.25rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Archivo, Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "clamp(1.25rem, 2vw, 1.5rem)"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 400
    lineHeight: 1.6
  figure-sum:
    fontFamily: "Archivo, Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "clamp(3rem, 8vw, 5.5rem)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.03em"
  data:
    fontFamily: "Archivo, Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "clamp(2.5rem, 6vw, 4rem)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
  figure-hero:
    fontFamily: "Archivo, Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "clamp(4.5rem, 14vw, 10rem)"
    fontWeight: 700
    lineHeight: 0.9
    letterSpacing: "-0.04em"
  control:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.2
  label:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.02em"
  annotation:
    fontFamily: "Caveat, cursive"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.3
rounded:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  pill: "50px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  block: "96px"
components:
  button-primary:
    backgroundColor: "{colors.aurora-green}"
    textColor: "{colors.night-void}"
    rounded: "{rounded.md}"
    padding: "14px 28px"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.aurora-green-deep}"
    textColor: "{colors.night-void}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "14px 28px"
  button-outline-hover:
    textColor: "{colors.aurora-green}"
  badge:
    backgroundColor: "rgba(0, 255, 136, 0.1)"
    textColor: "{colors.aurora-green}"
    rounded: "{rounded.pill}"
    padding: "8px 20px"
    typography: "{typography.label}"
  chip:
    backgroundColor: "rgba(255, 255, 255, 0.04)"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.pill}"
    padding: "6px 14px"
  nav-link:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    padding: "0"
  nav-link-hover:
    textColor: "{colors.text-primary}"
---

# Design System: CloserMetrix

## Overview

**Creative North Star: "The Night Watch"**

Something is awake while the team sleeps. The field is a deep, unlit night sky and almost all of it stays empty — the page is not decorated, it is watched. Aurora light does not wash over the composition; it appears in the specific places where the system found something, the way a monitoring surface only lights up when there is something to report. The atmosphere is calm and slightly cold, never anxious, because the product's promise is that the watching already happened and nothing was missed.

Structurally the system is flat and ruled. Content sits directly on the night field, separated by hairline rules and shifts in background tone rather than by cards, borders, and shadows. This is deliberate: the page has to carry six different block shapes in ten blocks — a comparison table, a split quote composition, a Slack mockup, a big-number row, a timeline, a checklist — and card containers would flatten all six into the same rectangle. The absence of chrome is what lets the shapes be legible as shapes.

The confirmed anti-reference is the site's own previous build: a gradient headline over two paragraphs of grey body copy, centered, ten times in a row. Nothing varied, so the eye never landed and the page read as an essay with headers. Icons were everywhere and read as decoration. Both are now prohibited. Anywhere the old page would have reached for an icon, this system reaches for the product's actual output.

**Key Characteristics:**
- Near-empty night field; content is sparse and the emptiness is load-bearing
- Aurora accent as signal, never as surface treatment
- Flat and ruled — no cards, no content shadows
- Layout shape varies block to block; no two adjacent blocks share a composition
- Type does the hierarchy work; there are no icons anywhere
- Motion is atmospheric and slow, never announcing itself

## Colors

A cold, high-contrast palette: four steps of unlit night sky carrying an aurora accent that behaves like instrumentation rather than branding.

### Primary
- **Aurora Green** (`#00ff88`): The signal color. Marks a finding, a flag, a captured number, an extracted quote, and the primary action. Its rarity is the entire point — it is the light that appears because the system found something.
- **Aurora Green Deep** (`#00cc6a`): The pressed and hover state of anything green, and the darker stop in green-to-green gradients. Never used to introduce a second green surface.

### Secondary
- **Aurora Cyan** (`#00d4ff`): The second stop in the aurora gradient and the accent for informational, non-finding emphasis — process steps, timeline nodes, integration names. Cool enough to read as a different register from green.
- **Aurora Blue** (`#0066ff`): Terminal stop of the aurora gradient only. Not used as a standalone accent; it exists so the gradient resolves into depth rather than staying neon across its whole length.

### Tertiary
- **Aurora Purple** (`#6366f1`): Reserved for atmospheric background field effects (Aurora canvas, ambient blur). Never applied to text, borders, or interactive elements.

### Neutral
- **Night Void** (`#020617`): The page ground. Everything sits on this by default.
- **Night Deep** (`#0f172a`): Tonal step for a block that needs separation from its neighbors without a rule or a card.
- **Night Mid** (`#1e293b`): Inset surfaces that must read as a real object — the Slack mockup body, code and transcript blocks.
- **Night Light** (`#334155`): Hairline rules, table dividers, muted column fills, and disabled states.
- **Paper** (`#f1f5f9`): Headlines and body copy at reading size.
- **Ash** (`#cbd5e1`): Secondary prose, captions, and the muted "Today" column of the comparison table. Lifted from `#94a3b8` — it still reads as secondary, but stopped looking switched-off against the night field.
- **Slate Dim** (`#64748b`): Non-text only — disabled affordances and inactive marks. It measures 3.9:1 on the night field and fails contrast at every size.

### Flag
- **Flag Red** (`#ef4444`): The single non-aurora accent, permitted only on risk-flag indicators. It is the one color allowed to feel like an alarm.
- **Flag Red Light** (`#f87171`): The same alarm on a raised surface. Flag Red only reaches 3.9:1 on Night Mid, so flag text inside an artifact uses this step.

### Named Rules

**The Finding Rule.** Aurora Green only ever marks something the system found or something the visitor should do. A number the product extracted, a flag, a quoted buyer phrase, the primary CTA. It never becomes a border, a background wash, a decorative rule, or an accent on copy that makes no claim. Audit test: point at any green pixel and name the finding it represents. If you cannot, remove it.

**The Four Gradient Rule.** The aurora gradient appears on at most four moments per page — the hero, the depth block, the 24-hour promise, and the price reveal. When every headline is gradient, none of them are emphasized.

**The Muted Floor Rule.** Slate Dim (`#64748b`) is banned as a text color at any size — it measures 3.9:1 against Night Void. Body copy uses Paper; secondary prose, captions, and legal small type bottom out at Ash (`#94a3b8`, 6.9:1). Grey-on-near-black was a real legibility defect on the previous build, not a style.

## Typography

**Display Font:** Archivo (variable weight, self-hosted at `/fonts/archivo-latin-var.woff2`, 34 kB latin subset), falling back to Inter
**Body Font:** Inter (with `-apple-system`, `BlinkMacSystemFont`, sans-serif)
**Annotation Font:** Caveat (cursive) — handwritten marginalia only

**Character:** Archivo carries every headline and every extracted figure: square counters, flat terminals, a grotesque built closer to instrument-panel lettering than to a startup landing page. Tightened at display sizes (`-0.02em`) so headlines read as statements rather than as marketing. Inter runs everything at reading size and below, which keeps the seam invisible — the two faces are structurally close, and the distinction the reader feels is authority, not decoration. Caveat exists as one deliberate human hand in an otherwise machine-read page — a margin note, never a headline.

**The Display Line.** Archivo stops at the figure. Headings (`h1`–`h6`) and Data get it; body, labels, chips, nav, and every UI control stay Inter. A page where both faces appear at the same size has lost the distinction that justifies the second file.

### Hierarchy
- **Display** (Archivo 700, `clamp(2.5rem, 5vw, 4rem)`, 1.2, `-0.02em`): The H1. One per page.
- **Headline** (700, `clamp(2rem, 4vw, 3rem)`, 1.2): Block H2s. Every block headline states rather than asks — a question invites "no."
- **Headline Compact** (Archivo 700, `clamp(1.75rem, 2.6vw, 2.25rem)`, 1.2): A block headline in a narrow column beside an artifact. Headline at full size ran to six lines there and swamped the thing it was describing.
- **Title** (700, `clamp(1.25rem, 2vw, 1.5rem)`, 1.2): Sub-structure inside a block.
- **Body** (400, `1.05rem`, 1.6): Two sentences maximum per block. Measure capped at 65 characters.
- **Control** (600, `1rem`, 1.2): Button labels and input text. The one step between Label and Body, and it exists because a control is neither a caption nor prose.
- **Label** (600, `0.85rem`, `0.02em`): Eyebrows, badges, chips, table headers, flow-strip nodes.
- **Figure Hero** (Archivo 700, `clamp(4.5rem, 14vw, 10rem)`, 0.9, `-0.04em`): Exactly one per page — the number the whole page is arguing toward. On the homepage that is `$3`. It must be larger than the H1; if it isn't, the reveal it exists for does not fire.
- **Figure Sum** (Archivo 700, `clamp(3rem, 8vw, 5.5rem)`, 1, `-0.03em`): A total that adds up the Data figures above it. One step larger than its parts and always smaller than Figure Hero, so the page still has exactly one biggest number.
- **Data** (Archivo 700, `clamp(2.5rem, 6vw, 4rem)`, 1): Big-number findings — the audit percentages and the proof counts. Set at display weight so a number reads as a headline, because on this page it is one.
- **Annotation** (Caveat, 500, `1.25rem`): Rare handwritten aside. Never load-bearing information.

### Named Rules

**The Two Sentence Rule.** No block carries more than two sentences of body copy. A block that needs a third needed a picture instead. This is a hard structural constraint, not a preference.

**The One Figure Rule.** Exactly one Figure Hero per page — the number the whole page argues toward, larger than the H1. A second one means neither is the point.

**The Number Is A Headline Rule.** Extracted figures are set in Data, not in body copy with bold. `1,020 calls read` is a headline that happens to be numeric.

## Layout

Centered container at `1200px` max width with `24px` gutters; reading blocks narrow further to `~65ch` regardless of container width. Vertical rhythm runs on a `96px` block interval, compressing to roughly `64px` under `768px`.

Composition varies by block on purpose. Across a ten-block page the system expects at least six distinct shapes — two-column comparison table, split asymmetric composition, inset artifact mockup, big-number row, horizontal timeline, checklist-plus-figure. **No two adjacent blocks may share a layout.** Centered single-column stacking is available but may not run more than twice consecutively, and never for the whole page.

Breakpoints observed: `1024px`, `900px`, `768px` (primary), `480px`. Multi-column compositions collapse to stacked order at `768px`, preserving reading order; the comparison table becomes stacked pairs rather than a scrolling grid.

**The Emptiness Rule.** The hero carries no dashboard image and no illustration. Space around a claim is what makes the claim legible; do not fill a quiet region because it looks unfinished.

## Elevation & Depth

The system is flat. Content does not sit on cards and does not cast shadows. Separation comes from hairline rules in Night Light, from stepped background tone (`#020617` → `#0f172a` → `#1e293b`), and from empty space.

Two exceptions, both narrow. Ambient glow is an atmospheric property of the background field (the Aurora canvas and blurred shapes), never a property of a content block. And a genuine artifact mockup — the Slack message, a sample audit page — may take real elevation, because it is depicting an object that exists somewhere else and should read as pasted onto the page rather than composed into it.

### Shadow Vocabulary
- **Artifact lift** (`box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6)`): Mockups of real external objects only.
- **Signal glow** (`box-shadow: 0 0 12px rgba(0, 255, 136, 0.4)`): Focus and active states on green interactive elements.
- **Flag glow** (`box-shadow: 0 0 8px rgba(239, 68, 68, 0.5)`): Risk-flag indicators only.

### Named Rules

**The No Card Rule.** Content blocks have no container. If a block feels like it needs a card to hold together, its layout is wrong — change the shape, don't add a box.

**The Flat At Rest Rule.** Nothing glows until it is hovered, focused, or is itself a flag. Glow is a response, not a finish.

## Shapes

Corner language is soft but not round: `12px` on interactive elements (buttons, inputs), `16–24px` on inset artifact surfaces, `50px` pills on badges and chips, `4–8px` on tight utility elements. Perfect circles are reserved for avatars and timeline nodes.

Borders are hairlines at `1px` in Night Light or `rgba(255,255,255,0.1)`; the only `2px` stroke in the system is the outline button. Rules are the primary structural device — horizontal hairlines separate table rows, block boundaries, and list items, and they should read as ruled paper, not as table chrome.

Recurring silhouettes: the **horizontal flow strip** (small label nodes separated by arrows), the **big-number row**, and the **ruled two-column comparison**. These three shapes are the system's signature and are reusable across surfaces.

## Components

### Buttons
- **Shape:** Softly rounded (`12px`), `14px 28px` padding, weight 600, inline-flex with `8px` gap.
- **Primary:** Aurora Green fill with Night Void text — the highest-contrast pairing in the system, which is why it is reserved for the single most important action in view.
- **Hover / Focus:** Deepens to Aurora Green Deep with a signal glow; transitions run `0.3s ease`. Focus-visible must be a visible ring, not a color swap alone.
- **Outline:** Transparent with a `2px rgba(255,255,255,0.2)` stroke; on hover the stroke and label both go Aurora Green. Used for the secondary CTA ("See a sample Integrity Audit").
- **Never** put two primary buttons in one view.

### Chips
- **Style:** Pill (`50px`), faint white wash, Ash label at `0.85rem`. No border unless the chip is selectable.
- **Use:** Enumerating a set the visitor should scan, not read — flag categories, integration names. Chips replaced a bulleted list precisely because the list was four lines of reading.

### Containers
Content has none. The only legitimate bounded surfaces are **artifacts**: a mockup depicting something that exists elsewhere (a Slack message, an audit page, a CRM record). Artifacts use Night Mid, `16–24px` radius, artifact lift, and internal padding at `24px`.

### Inputs / Fields
- **Style:** Night Deep fill, `1px rgba(255,255,255,0.1)` stroke, `12px` radius, Paper text.
- **Focus:** Stroke goes Aurora Green with a signal glow; `0.2s` transition.
- **Error:** Flag Red stroke with flag glow.

### Navigation
Transparent at rest; on scroll it becomes `rgba(2,6,23,0.9)` with `20px` backdrop blur and a hairline bottom border. Links are Ash at `0.9rem` weight 500, `40px` apart, going Paper on hover. Only the demo CTA is a button. Mobile collapses to a drawer over the night field. Nav labels track PRODUCT.md: **What You Get · Pricing · Book a Demo**.

### Flow Strip (signature)
A horizontal sequence of Label-sized nodes joined by arrow glyphs, set directly on the night field with no container. It exists so that a visitor who reads nothing else still understands the product. Nodes are Ash; the final node may take Aurora Green when it names the deliverable. Wraps to two rows under `768px`, never becomes a vertical list on desktop.

### Big-Number Row (signature)
Two to four figures in Data type with a Label-sized caption underneath, on a shared baseline, no dividers and no decoration. A row may carry one non-numeric finding set in the same weight as the numbers — the asymmetry is intentional and communicates that the finding is of a kind the numbers cannot produce.

## Do's and Don'ts

### Do:
- **Do** make every green pixel name a finding or an action. Aurora Green stays under ~10% of any viewport.
- **Do** cap body copy at two sentences per block and measure at ~65 characters.
- **Do** vary the composition every block; six distinct shapes across a ten-block page, no two adjacent alike.
- **Do** separate with hairline rules (`1px`, Night Light) and tonal steps, not with cards.
- **Do** set extracted figures in Data type at display weight — a number is a headline here.
- **Do** give artifact mockups real elevation so they read as objects lifted from somewhere real.
- **Do** honor `prefers-reduced-motion`; the aurora field, blur, and scroll effects must all have a still state.

### Don't:
- **Don't** use icons as decoration, as section ornament, or as a stand-in for evidence. The one carve-out is a mark that performs a function no type can: the pricing checklist's check, which confirms a delivered output rather than labelling a topic. If a glyph could be deleted without losing information, it was decoration.
- **Don't** put a gradient on more than three headlines per page.
- **Don't** set body copy in Slate Dim (`#64748b`) — it is legal-small-type only.
- **Don't** wrap content in cards, and don't add a shadow to anything that isn't an artifact, a focus state, or a flag.
- **Don't** center-stack more than two consecutive blocks.
- **Don't** hardcode a hex. Every value in this file exists as a CSS custom property in `src/styles/index.css`.
- **Don't** build a competitor comparison column, table, or cost-versus-X block — the position is different, not better.
- **Don't** name a regulator, and don't invent a finding, quote, testimonial, logo, or metric inside a visual. This product sells evidence.
