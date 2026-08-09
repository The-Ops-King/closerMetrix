---
target: homepage
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
timestamp: 2026-08-08T23-36-02Z
slug: src-homepage-jsx
---
Method: dual-agent (A: a7b8c0888005386e4 · B: a3137392feb69c559)

Target: CloserMetrix marketing homepage — `src/HomePage.jsx` · Mode: Persuade · 1440×900 and 390×844, demo modal opened and submitted with invalid input, all three legal routes followed.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Validation fires with `role="alert"`, but no busy/disabled state on the submit button while EmailJS is in flight, and no step indicator for a two-step booking. |
| 2 | Match System / Real World | 3 | Copy is excellent operator language; the visuals aren't. The "Slack message" doesn't look like Slack and the "timeline" doesn't look like a timeline. |
| 3 | User Control and Freedom | 4 | Modal opens focus on the first field, traps Tab across 7 stops, Escape closes, focus returns to the exact trigger, body scroll locks and unlocks. Genuinely well built. |
| 4 | Consistency and Standards | 2 | Two primary-button identities — solid green on desktop, a cyan→blue gradient bar in the mobile menu. The "Data Handling page" link in the modal is unstyled UA blue `rgb(0,0,238)`. |
| 5 | Error Prevention | 2 | The either-or contact rule is only discoverable by failing; the helper line sits under PHONE so it reads as a phone caption. No `autocomplete` on any field. |
| 6 | Recognition Rather Than Recall | 2 | On mobile the `TODAY` / `WITH CLOSERMETRIX` headers collapse to `height: 0`, so the comparison block's meaning rests entirely on text colour with nothing naming either side. |
| 7 | Flexibility and Efficiency | 3 | Anchor nav is correct (`scroll-margin-top: 96px` clears an 85px header). But on mobile `.nav-cta` is hidden and there is a ~6,000px stretch with no visible CTA. |
| 8 | Aesthetic and Minimalist Design | 2 | Half of every viewport is empty starfield. Restraint and vacancy are not the same thing. |
| 9 | Error Recovery | 2 | "Email or phone number is required" names two fields and marks neither — both keep the same border, neither gets `aria-invalid`. |
| 10 | Help and Documentation | 1 | 21 of 24 legal sections are red "Not yet published." placeholders, including all five data-handling questions PRODUCT.md says every serious buyer asks. |
| **Total** | | **24/40** | **Acceptable (60%)** |

## Design Specificity Verdict

**LLM assessment.** Could an unrelated B2B SaaS ship this composition unchanged? **Mostly yes — and that is the headline failure.** Strip the words and what remains is dark navy, aurora sweep, starfield, neon green, one gradient headline, big green numbers, a rounded card, a checklist, a big price. Nothing in the *shape* of the page comes from the product. A company whose entire pitch is "we read the actual words humans said" has decorated itself with outer space.

The composition also fails its own brief where it matters most. The spec demands six shapes in ten blocks, no two adjacent alike. What shipped is **one shape repeated eight times**: left-aligned H2 in a ~730px column, content beneath, 570px of empty starfield to the right. §3, §5, §6, §7, §9 and §10 are structurally identical. Only the comparison table and the Slack card earn their own geometry. The page swapped centered-monotony for left-monotony.

§5, §6 and §7 run consecutively and are effectively the same block three times — green figures on near-black. By the third the eye reads them as wallpaper, not evidence.

Four accent hues with no consistent semantics: green (CTA, all statistics, checklist bullets), cyan (integration labels **and** the `$3`), blue-purple (wordmark), red (flag). Cyan means "integration category" in one block and "the price" in another.

Where product character was available and thrown away:

- **§3 Depth** is the one ownable image on the page, and the spec calls the *size difference* the argument. Built, the pill and the quotes sit at roughly 1:1.2. The point is now made in words, not in picture — and the added caption `1 TAG · 3 PROBLEMS` explains the joke before the reader gets it.
- **§4 Flags** was specced as real Slack chrome so the visitor recognises it instantly. What shipped is a generic dark card. It reads as a mockup the site drew of itself, which proves nothing.
- **§6 Twenty-four hours** was a three-node timeline. It shipped as two nodes and a hairline — the middle node, `We read every one`, the only node describing the product, was deleted. The remaining diagram describes a service that receives files and returns a report with nothing in between.
- **§5 Integrity Audit** inverts its own hierarchy. The three percentages are 64px; the number-less language finding — the one thing a tag-based competitor cannot produce — is 24px. The block sizes commodity over moat at 2.7:1.

**Deterministic scan.** CLI clean: `src/HomePage.jsx`, `index.html`, and all four files in `src/pages` return **0 findings, exit 0**. (With `--no-config` a single `overused-font` fires on Inter, correctly suppressed by the documented exception.) Runtime overlay: **20 findings, 7 rules** — `ai-color-palette` ×7, `gradient-text` ×3, `clipped-overflow-container` ×3, `nested-cards` ×3, `all-caps-body` ×2, `hero-eyebrow-chip` ×1, `overused-font` ×1.

What the detector proved, with numbers:

- **Page contrast: 28 distinct text styles at 1440, 25 at 390, zero failures.** Lowest passing is the artifact flag at 5.29:1. Gradient text stops measure 15.04 / 11.39 / 4.17:1 against a 3:1 requirement for large text — passes.
- **Tap targets under 44px on the page: zero, both widths.** Two remain inside the modal.
- **`prefers-reduced-motion`: 100 running animations → 0.** Verified after reload; no JS-driven motion either.
- **Fonts resolve correctly**: Archivo on h1/h2/h3 and the `$3` figure, Inter on body, buttons and eyebrow.
- **Heading order clean**: one h1, eight h2, two h3, no skipped levels.
- **No horizontal scroll at either width** (`scrollWidth === clientWidth`).

Six regressions the detector caught that the design review could not:

1. **The primary button's focus ring is invisible.** All three `.btn-primary` elements compute `outline: solid 3px rgb(2,6,23)` at offset 0 — `outline-color` resolving to `currentColor`, which equals the page background. **1.00:1.** The global `:focus-visible` rule never reaches them. Every other control measures 7.87–18.41:1.
2. **Modal contrast: six failures.** The "Data Handling page" link is unstyled UA blue at **1.90:1**; both note paragraphs are **3.75:1**; all three placeholders are **4.24:1**. Input borders measure **1.72:1** against a 3:1 non-text requirement.
3. **`button.mobile-menu-toggle` has no accessible name** — no text, no `aria-label`, no `aria-expanded`, three bare spans. A screen reader announces "button."
4. **The `/preview` footer link is broken.** No route exists in `App.jsx` and there is no catch-all, so React Router renders nothing — 225 chars, no h1. The real artifact lives at `/preview/`; the fix is a trailing slash.
5. **No route sets `document.title` client-side.** All four routes report the homepage title during SPA navigation; only the prerendered HTML carries the right one.
6. **The modal background is not `inert`**, so 16 focusables stay in the accessibility tree behind it. Tab is trapped correctly — this is a screen-reader gap, not a keyboard gap.

**False positives** (dismissed): `overused-font` on Inter — documented decision, Archivo carries display. `gradient-text` / `ai-color-palette` ×10 — measured at 4.17:1 minimum against a 3:1 requirement; brand signature, not accident. `div.star` at +1.4px and `blur-shape` at +121px on mobile — decorative, clipped, no sideways scroll. `nested-cards` ×3 — `.star-border-content` is the animated-border wrapper for a button.

**Visual overlays.** Injection succeeded, overlay ran in-page, findings read from console. Live server on port 8400 stopped; no overlay tab remains.

## Overall Impression

The mechanics got fixed and the composition did not. Every measurable defect from the last pass is gone — contrast, touch targets, reduced motion, focus rings, heading order, dialog semantics all pass now, and the modal's interaction engineering is better than most funded startups ship. Score moved 47% → 60%.

But the review found the structural problem underneath, and it is the one thing the last pass didn't touch: **eight of ten blocks share one layout, and half of every viewport is empty.** The brief was written to kill exactly this failure and it simply migrated from center to left. That is now the biggest lever on the page, bigger than anything on the defect list.

## What's Working

1. **The modal's interaction engineering.** `role="dialog"`, `aria-modal`, `aria-labelledby`, autofocus on the first field, 7-stop Tab trap verified, Escape closes, focus returns to the exact trigger, body scroll locks and unlocks. Craft nobody will notice, which is the definition of craft.
2. **Reading comfort was fixed and it matters.** Body runs 18.41:1 with Ash reserved for captions and measure capped near 65 characters, and 28 text styles pass contrast with zero failures. For a founder skimming between calls that is worth more than any flourish on top of it.
3. **The pricing block executes its brief exactly.** Eight named outputs at even 39px rhythm, heavy vertical space, then `$3` at 160px. Nothing calls it a good deal. Tying `$2,000` to the 24-hour delivery puts the promise inside the largest objection — the one place the page out-performs the spec.

## Priority Issues

**[P0] The mobile menu is broken, and it is the only route to the CTA on mobile.**
- **Why it matters:** At 390px the menu's `Book a Demo` button measures **20px tall** — a stripe, not a target — and it's painted with a gradient used nowhere else for a primary action. The `.mobile-menu` panel declares `rgba(2,6,23,0.98)` with blur, but the hero headline renders *through* it, so the nav items sit on top of white 32px text. `.nav-cta` is `display: none` on mobile, so between the hero CTA and the pricing CTA at y=6634 there are ~6,000px with no way to convert.
- **Fix:** Give the menu CTA `.btn-primary` treatment and `min-height: 48px`. Raise `.mobile-menu` above the section stacking contexts and make its background opaque. Add `aria-label="Menu"` and `aria-expanded` to the toggle. Keep a compact `Book a demo` in the mobile header at all scroll positions.
- **Command:** `/impeccable adapt`

**[P1] Eight of ten sections share one layout and half of every viewport is empty.**
- **Why it matters:** The spec's core structural instruction is what was meant to make the page read alive. Without it the eye never lands — the exact failure v5 was commissioned to fix. §5, §6 and §7 additionally present large green figures three blocks running.
- **Fix:** Give the right half a job in at least three blocks. §3 belongs in a true split with the pill hard-left at ~14px against quotes at ~28px, so scale argues before a word is read. §6 should run full width as a real three-node timeline with `We read every one` restored. §7's four figures should be a 2×2 using the whole measure so it stops rhyming with §5's row of three.
- **Command:** `/impeccable layout`

**[P1] §5 argues against the product.**
- **Why it matters:** `21%` / `31%` / `82%` at 64px are commodity output any dashboard could produce. The language finding at 24px is the moat. The page sizes them 2.7:1 in favour of the commodity, and the spec explicitly says the fourth finding must carry the same weight as the numbers.
- **Fix:** Language finding to 40–48px full width; percentages down to 40px. Move the `SAMPLE FINDINGS — ILLUSTRATIVE` line beneath the findings as a footnote rather than above them as an eyebrow. Restore visible border weight on the section's ghost CTA, which measures ~1.6:1 and vanishes at the page's proof peak.
- **Command:** `/impeccable layout`

**[P1] The primary button has no visible focus ring.**
- **Why it matters:** All three `.btn-primary` elements resolve `outline-color` to `currentColor` — Night Void on the page's own background, **1.00:1**. The global `:focus-visible` never reaches them, so the single most important control on the page is invisible to a keyboard user. This is a regression introduced by the previous fix pass.
- **Fix:** Set an explicit `outline-color` on `.btn-primary:focus-visible` rather than relying on the inherited ring, and give it an offset so it clears the green fill.
- **Command:** `/impeccable audit`

**[P2] Six contrast failures and two undersized targets inside the demo modal.**
- **Why it matters:** The last screen before conversion is the only part of the site that still fails contrast. The "Data Handling page" link is UA-default blue at 1.90:1 — on a page selling meticulous reading, that is the tell. The close button is 28×32px.
- **Fix:** Style the link with the site's link treatment; lift both note paragraphs and all placeholders to Ash; give inputs a 3:1 border; pad the close button to 44px.
- **Command:** `/impeccable polish`

**[P2] The either-or contact rule is discovered by failing.**
- **Why it matters:** The helper line sits under PHONE so it reads as a phone caption; on error the message names two fields and marks neither; no field carries `autocomplete`, so nothing autofills on a phone.
- **Fix:** Move the either-or line under the EMAIL label as shared guidance. On error set `aria-invalid` and a red border on both fields and drop the duplicated grey helper. Add `autocomplete="name|email|tel"` and `inputmode="tel"`.
- **Command:** `/impeccable clarify`

**[P2] The `/preview` footer link is broken and no route sets its own title.**
- **Why it matters:** "Sample Integrity Audit" is the page's secondary CTA in two places. The link renders nothing — no route matches and there's no catch-all. Separately, SPA navigation leaves the homepage `<title>` on every route, so a buyer forwarding `/data-handling` to their lawyer produces a preview card reading "Sales Integrity Audits for High-Ticket Teams."
- **Fix:** Trailing slash on the `/preview` href. Set `document.title` per route on mount.
- **Command:** `/impeccable harden`

## Persona Red Flags

**Jordan (confused first-timer).** On mobile §2 loses its `TODAY` / `WITH CLOSERMETRIX` headers (`height: 0`) — alternating grey and white sentences with no key, on the block that teaches him what the product is. `1 TAG · 3 PROBLEMS` is jargon-shaped and appears before the quotes he'd need to decode it. §6's two-node hairline gives him no model of what happens between sending recordings and getting an audit. His first tap on the site opens a menu whose panel lets the hero headline show through.

**Riley (stress tester).** Clicks Privacy first, finds eight red boxes — one containing instructions to the writer: "Enumerate every category: demo-request contact details, calendar and recording data…" shipped live. Checks Data Handling for the training question: not yet published. Submits with name only, gets an error naming two fields and marking neither. Notices the modal's data link is default browser blue. Clicks "Sample Integrity Audit" in the footer and gets a blank page.

**Casey (distracted mobile).** 8,525px of scroll, ~10 screens. `.nav-cta` hidden; ~6,000px between the hero CTA and the next one. The only CTA in that gap is behind a 20px stripe in a transparent menu. No `autocomplete` on any field, so she hand-types name, email and phone one-handed. §5 spends about 1.5 screens on three stacked percentages and opens with a two-line all-caps line telling her they aren't real.

**The skeptical founder (pitched by three "AI sales tools" this quarter).** Aurora, starfield, neon green, gradient headline — he has seen this skin three times this quarter, and the positioning claim is *different, not better*, which means the design has to carry the difference and currently doesn't. §4 was his one chance to see the product exist outside a marketing page; it isn't Slack, it's a card the site drew of itself. §5's disclaimer confirms his prior that the most concrete-looking thing on the page is invented. He reaches pricing, likes the checklist and the `$3`, goes looking for terms — fees and billing, delivery commitment, confidentiality and derived data all not yet published. Tool number four.

## Minor Observations

- The §9 checklist uses small green squares, not checks. A square lists; a check confirms. Eight confirmations is the block's whole job.
- §8's integration strip bunches left — `CRM` starts at x=144, the strip ends at x=1035, leaving 260px of dead margin.
- The modal background is not `inert`; 16 focusables remain in the a11y tree behind it.
- No busy/disabled state on the submit button while EmailJS is in flight — a double-tap on a slow connection is unguarded.
- No skip link.
- The aurora sweep passes behind §2's first two comparison rows and §6's hairline — the two blocks whose meaning depends on reading fine detail.
- 13.6px is the most-declared size on the page (17 occurrences). For a 45-year-old founder on a laptop that is a lot of squinting across chips, captions, disclaimers and eyebrows.
- Both `1 TAG · 3 PROBLEMS` and the `SAMPLE FINDINGS` eyebrow are additions not in the spec, and both explain a visual instead of letting it work.

## Questions to Consider

1. Your entire pitch is "we read the words." Why does the page contain no words from a real call you actually read? §3's quotes are generic, §4's flag is invented, §5's findings are stamped illustrative. Four real anonymised sentences out of your 1,020 calls would out-argue every visual on this page, and it's the one asset a competitor cannot fake.
2. The starfield. What does outer space have to do with reading sales conversations — and what would the background be if it were made of the product?
3. `We read every one` was cut from the 24-hour block. That node *is* the company. Did anyone notice the remaining diagram describes a service that receives files and returns a report with nothing in between?
4. Half of every screen is empty in §3, §5, §6, §7 and §9. If the reason is the same in all five, that isn't composition — it's a default.
5. You won't fabricate a testimonial, correctly. But you shipped 21 placeholder legal sections. Which does a careful buyer read as the bigger integrity signal?
