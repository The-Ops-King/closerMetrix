---
target: homepage
total_score: 17
max_score: 36
na_heuristics: 7
p0_count: 1
p1_count: 4
timestamp: 2026-08-08T22-15-49Z
slug: src-homepage-jsx
---
Method: dual-agent (A: a2a397130494fe20f · B: a0277636dde34780a)

Target: CloserMetrix marketing homepage — `src/HomePage.jsx` · Mode: Persuade · Inspected at 1440×900 and 390×844.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 1 | Nav pill has "What You Get" permanently green-active — a selected state that is never true. No inline form validation. |
| 2 | Match System / Real World | 3 | Copy is excellent operator language. Docked for modal CTA "Continue to Booking" vs "Book a demo" everywhere else, and a Slack mockup that doesn't read as Slack. |
| 3 | User Control and Freedom | 2 | Demo modal has no `role="dialog"`, no `aria-modal`, no focus trap — `document.activeElement` stays `BODY`. Tab walks behind the overlay. |
| 4 | Consistency and Standards | 1 | `.btn-primary` renders in **Arial** (buttons don't inherit `font-family`); `.btn-outline` is Inter. Primary CTA is 46.5px tall, secondary is 57.6px — the secondary is 24% larger. |
| 5 | Error Prevention | 1 | Modal marks `NAME *` but no input has `required`; the footnote says "Email or phone number required" — the asterisk marks the one field the stated rule doesn't govern. |
| 6 | Recognition Rather Than Recall | 3 | Flow strip and Gap table are strong. Docked because the flow arrows are `--night-light` (#334155) at **1.9:1** — invisible, so the strip reads as four unrelated fragments. |
| 7 | Flexibility and Efficiency | n/a | Single-path Persuade surface; no expert/novice divergence to serve. |
| 8 | Aesthetic and Minimalist Design | 3 | Genuinely restrained. Docked for gradient monoculture and ~230px dead zones between blocks 6–8. |
| 9 | Error Recovery | 2 | No visible error state on the only form. The footnote is pre-emptive, not recovery. |
| 10 | Help and Documentation | 1 | Privacy Policy and Terms of Service are both `href="#"`. No data-handling page, on a product that ingests recordings of third parties' financial conversations. |
| **Total** | | **17/36** | **Poor (47%)** |

## Design Specificity Verdict

**LLM assessment.** Partly ownable — but the character lives in the copy and the block *interiors*, not in the surface. The shapes are genuinely CloserMetrix: the ruled Today/With table, the pill-versus-quotes size argument, the numberless fourth finding. The treatment is fully interchangeable, and it fights the brief:

- **Gradient monoculture.** One `linear-gradient(135deg, #00ff88, #00d4ff, #0066ff)` runs the H1, the primary button, the nav CTA, `$3`, and the modal submit. That is the 2021 dev-tool gradient, and it destroys the system's own Finding Rule — when the price, the CTA and the headline share one gradient, green stops meaning "we found something" and starts meaning "brand."
- **Seven of ten blocks open with a left-aligned 48px H2 at the same x.** Interiors vary; entrances don't. The eye learns the rhythm by block 4 — the anti-reference failure at a coarser grain.
- **Blocks 3 and 4 are adjacent and share a layout** (left copy / right object). Violates the no-two-adjacent rule the page was built on.
- **The logo is a purple→blue PNG** — off-palette, reads like another company's mark.
- **Biggest missed character opportunity:** the 24-hour block. Three green dots on a hairline. Nothing says *24 hours*. The product's own artifact vocabulary — a timestamped record — was right there.
- **The Slack mockup doesn't read as Slack**, so it fails the "proves the product exists" job the spec assigned it.

**Deterministic scan.** CLI: `src/HomePage.jsx` clean (0 findings, exit 0); `index.html:13` one `overused-font` (Google Fonts Inter). Runtime overlay: **29 findings across 21 elements**, 9 rule types — `ai-color-palette` ×10, `low-contrast` ×8, `gradient-text` ×3, `clipped-overflow-container` ×2, `nested-cards` ×2, `all-caps-body` ×1, `hero-eyebrow-chip` ×1, `overused-font` ×1, `skipped-heading` ×1.

The detector caught five things the design review missed:
- `.btn-primary` / `.nav-cta`: dark text on the gradient falls to **4.18:1** over its right third (fails 4.5:1)
- `.home-artifact-avatar` "CM": **1.20:1** — effectively invisible
- `.home-artifact-tag` "APP": **4.00:1**; `.home-artifact-flag` red on Night Mid: **3.90:1**
- Footer text `#64748b`: **4.24:1** — Slate Dim, which DESIGN.md bans as text
- **`prefers-reduced-motion` is not respected.** 149 animations still running under emulated `reduce`: 145 `DIV.star` (Aurora), 2 `blur-shape`, 2 `star-border-animation`. Root cause: `index.css:2209` only overrides `animation-duration`/`transition-duration`, which does nothing to Web Animations API objects. `HomePage.jsx` guards its own `motion.*` with `useReducedMotion()`, but the background components mounted in `App.jsx:192-193` sit outside that guard.

Touch targets under 44×44: 8 at desktop, 6 at mobile — worst is `button.mobile-menu-toggle` at **34×26**, the primary mobile nav control. Keyboard focus: 14 focusable elements, all receive a UA-default ring, but **no custom `:focus-visible` is defined anywhere**; five get Chrome blue at ~3.37:1 on near-black. Heading order skips `h2` → `h4` (Footer.jsx:84). One `<svg>` in the gooey nav has no `aria-hidden` or label.

**False positives** (dismissed): `clipped-overflow-container` and `nested-cards` on StarBorder — the clipping *is* the border mechanism and the inner surface is one control rendered as two elements. Three mobile `div.blur-shape` overflows — decorative, `scrollWidth === clientWidth === 390`, no scroll. `overused-font` double-counted. `hero-eyebrow-chip` + `all-caps-body` both fire on the same 45-character eyebrow.

**Visual overlays.** Injection succeeded, overlay ran in the page, findings read from console. The server has since been stopped, so no overlay tab remains open.

## Overall Impression

The argument is excellent and the frame is broken. Blocks 2, 3 and 7 are genuinely persuasive — the Gap table, the pill-versus-quotes composition, and the proof numbers do work almost no competitor page does. Then the visitor clicks Privacy Policy and gets `#`, tabs into a modal that never receives focus, and reads a price with no action next to it.

Biggest single opportunity: **the page peaks at Proof and then decays.** Pricing breaks its own reveal, offers no CTA, and leaves an unexplained `$2,000` as the last number before the close. Fix the ending and the page converts.

## What's Working

1. **The Gap table (block 2).** Six ruled rows, no cards, no icons, no explanatory paragraph. It hands the visitor the argument instead of making it for him, and "one call in ten" is calibrated so the diligent owner can't opt out. Zero body copy is a discipline most pages can't hold.
2. **The Depth block's size argument.** A 0.85rem grey `price objection` pill against three 1.5rem full-contrast quotes with green rules. The point lands by scale before a word is read. This is the one composition on the page a competitor genuinely cannot copy, because it's the product's thesis rendered as geometry.
3. **Restraint in the field.** Night ground, sparse starfield, 96px rhythm. No stock illustration, no dashboard hero shot, no icon grid. That absence is doing real work.

## Priority Issues

**[P0] Privacy Policy and Terms are dead links; no data-handling page exists.**
- **Why it matters:** This product ingests recordings containing third parties' financial details. The exact buyer who converts — a founder with a compliance nerve — clicks Privacy before booking and finds `#`. Every trust gain from the Proof block is erased in one click.
- **Fix:** Ship real Privacy and Terms plus a Data Handling page (storage, access, retention, deletion on request, whether client data trains models). Link Data Handling from the Flags disclaimer and from the demo modal.
- **Suggested command:** `/impeccable harden`

**[P1] The Pricing block breaks its own reveal and offers no action.**
- **Why it matters:** Desktop puts `$3` in a right column vertically level with checklist item 5, so the checklist-then-number gap — the entire pricing mechanism per the spec — never fires. The block has no button, no term language, and `$2,000 implementation` sits unexplained in muted body copy. The highest-anxiety moment on the page has no exit ramp.
- **Fix:** Stack it on desktop the way it already stacks on mobile — full-width checklist, heavy space, then `$3` alone as the largest figure on the page. Tie `$2,000` to the 24-hour delivery in one line. Put `Book a demo` directly beneath the number.
- **Suggested command:** `/impeccable layout`

**[P1] Primary CTA is subordinate to the secondary and renders in Arial.**
- **Why it matters:** `.btn-primary` is 46.5px tall in Arial (buttons don't inherit `font-family`); `.btn-outline` is 57.6px in Inter. The action that defines success is the smallest and typographically foreign. The non-interactive "First audit inside 24 hours" pill sits beside them looking like a third button — five targets in one band, over the ≤4 working-memory limit.
- **Fix:** Add `font-family: inherit` to `.btn`. Make primary the tallest element in the band. Demote the badge to a plain caption line — no pill, no border, no green.
- **Suggested command:** `/impeccable polish`

**[P1] `prefers-reduced-motion` does not work.**
- **Why it matters:** 149 animations keep running under `reduce` — 145 starfield elements, the blur shapes, the StarBorder sweep. For a vestibular-sensitive visitor this page is unusable, and DESIGN.md claims the still state exists.
- **Fix:** The CSS override can't touch Web Animations objects. Guard `Aurora.jsx`, `ShapeBlur.jsx` and `StarBorder.jsx` with `useReducedMotion()` and don't start the animations at all, the way `HomePage.jsx` already does.
- **Suggested command:** `/impeccable audit`

**[P1] Contrast failures on load-bearing elements.**
- **Why it matters:** The primary button's own label fails (4.18:1 over the blue end of the gradient). The flow-strip arrows at 1.9:1 make the ten-second comprehension device read as four disconnected labels. The Slack avatar is at 1.20:1. Footer text uses Slate Dim, which the design system bans.
- **Fix:** Flat `#00ff88` on primary buttons — which also fixes the gradient monoculture. Arrows to Ash. Avatar text to Night Void. Footer to Ash. Artifact flag red lightened or moved off Night Mid.
- **Suggested command:** `/impeccable colorize`

**[P2] Unlabelled invented findings inside the Integrity Audit visual.**
- **Why it matters:** `21%`, `31%`, `82%` render at 64px in signal green with no "sample" label. PRODUCT.md marks these as placeholders that must be labelled or genericized. On a product whose entire pitch is *we sell evidence*, unlabelled invented numbers are the exact tell a skeptical buyer hunts for.
- **Fix:** Label the block "Sample audit" or swap in real anonymized findings. Add a scoping line so nobody tries to reconcile the Audit percentages against the 1,020-call Proof dataset.
- **Suggested command:** `/impeccable clarify`

**[P2] Demo modal has no dialog semantics.**
- **Why it matters:** No `role="dialog"`, no `aria-modal`, focus never enters, no trap, no Escape handling verified. A keyboard or screen-reader user cannot use the only conversion path on the site.
- **Fix:** `role="dialog"` + `aria-modal="true"`, move focus to the first field on open, trap Tab, close on Escape, return focus to the trigger. Add `required` to the fields the copy claims are required.
- **Suggested command:** `/impeccable harden`

## Persona Red Flags

**Jordan (confused first-timer).** The nav pill with `What You Get` locked green reads as a selected tab in a two-tab interface — Jordan may never realize this is one full page. The hero flow strip, his ten-second comprehension device, has invisible arrows, so the four nodes read as unrelated fragments. The "First audit inside 24 hours" pill is his most likely first click; nothing happens.

**Riley (stress tester).** Opens the modal: `NAME *` is asterisked but not `required`; the footnote governs email/phone instead. Submits empty — nothing stops him. Tabs in — focus is still on `BODY`, Tab walks him back through the page behind the overlay. Clicks Privacy — `#`. Clicks Terms — `#`. He concludes this is a landing page in front of a service that doesn't exist yet.

**Casey (distracted mobile).** Three stacked centered pills in the hero, of which the largest is the *secondary* and the third isn't a button. The mobile menu toggle is 34×26 — well under the 44px floor. The page is 8,050px on an 844px viewport (~9.5 screens), Pricing sits at ~72% depth, and there is **no sticky CTA**. Casey who bounces at screen 5 has passed nothing actionable since screen 1.

**The skeptical founder (project-specific — pitched by three "AI sales tools" this quarter).** He scans for what's fabricated. He finds three unlabelled percentages at 64px in signal green inside a block called The Integrity Audit. He reads `$2,000 implementation` with no explanation, looks for a contract term or a data policy, finds two dead links, and leaves. Secondary tell: he'll try to reconcile `1,020 calls read` against `82% of flagged promises came from one closer` and find no scoping line saying they're different datasets.

## Minor Observations

- Heading order skips `h2` → `h4` (Footer.jsx:84). No `h3` anywhere.
- Footer tagline still reads "Sales intelligence for high-ticket teams" — adjacent to the retired positioning. The live position is "You bought a recorder. You needed a reader."
- The Audit block's `See a sample Integrity Audit` sits ~100px below the last text, orphaned from the findings it should be evidencing.
- Eight small green checklist squares in Pricing — not icons, but eight more green pixels that name no finding.
- `#call-review` is the only Slack-specific cue in the mockup: no sidebar, no Slack type ramp, no reaction row.
- The gooey nav `<svg>` has no `aria-hidden`.
- Mobile Gap table stays a two-column grid at ~155px per column, wrapping most cells to two lines. DESIGN.md specifies stacked pairs below 768px.
- Emotional valley: blocks 6–8 (24 Hours → Proof → Fit) run three low-affect strips in a row with the page's largest dead space between them.

## Questions to Consider

1. If you deleted the gradient from all five places it appears and made the primary button flat `#00ff88`, would anything be *less* persuasive — or would the Proof numbers finally be the only bright thing on screen?
2. The Depth block is the best composition you have and the one idea a competitor cannot copy. Why is it block 3 and not the hero?
3. Which is worse: shipping the audit percentages with a "sample findings" label that admits they're illustrative, or shipping without one and letting the skeptical founder decide for himself which of your numbers are real?
4. What changes if `$3` is the largest object on the entire page — bigger than the H1 — with `Book a demo` directly beneath it?
5. The brief says half the page must show the product. Counting honestly: the Slack card, the Gap table, the quote stack. **Is the monthly Integrity Audit — the actual thing they're buying — ever shown anywhere on this page?**
