# Product

<!-- impeccable:product-schema 1 -->

Scope: the public marketing site (`closermetrix.com`) served from this repo root (`index.html`, `src/`). The client dashboard under `Frontend/` and the pipeline under `Backend/` are product truth referenced here, but are not the surface this record governs.

Authoritative content + structure for the homepage: `docs/page-spec-v5.md` (v5, supersedes v4).

## Platform

web

## Users

Primary, in order:

1. **Founder / owner** of a high-ticket coaching, consulting, or service business — 2–20 closers, significant monthly revenue driven by 1-on-1 sales calls. Currently deciding on gut feel and self-reported closer numbers. Arrives skeptical, evaluating on a laptop between calls, and is the buyer.
2. **Sales manager** who coaches the team daily and lives in objection trends, closer comparisons, and call quality. Often the person who champions the tool internally and validates it before the founder signs.

Closers are affected parties, not the audience of this surface — the site must not make them feel surveilled, because founder objections come from anticipated closer pushback.

## Product Purpose

CloserMetrix reviews every sales call a team runs and turns it into a record: CRM notes in the client's own language, pipeline stage and next step, extracted objections/goals/promises, risk flags with timestamps, team alerts, and a monthly **Integrity Audit**.

Success for this surface: a qualified founder or sales manager books a demo. Secondary success: a visitor not yet ready leaves understanding the category — that unread calls are a measurable business problem, not a coaching preference.

## Positioning

**You bought a recorder. You needed a reader.** CloserMetrix is the review layer on top of the recording stack a team already runs — not a CRM, not a call recorder, not a coaching service, not an enterprise revenue-intelligence suite.

**The verb is "we review every call."** Not "we read the words," not "we keep the language." The claim is completeness — every call, not a sample — and what completeness makes visible across hundreds of calls. Copy that centers on words or reading understates it and points at the wrong asset.

Two claims a neighbor cannot truthfully copy:

- **Patterns over tags.** A tag gives a category; reviewing every call shows which problems actually sit behind that category and how often each one appears. "Price objection" collapses three different problems into one label, and only volume separates them.
- **A record that compounds.** Month twelve beats month one because the record keeps growing and never resets. This is the switching cost and the renewal argument at once.

**The position is different, not better.** Never build a competitor comparison column, table, or cost-versus-X block on this surface — the moment one appears, the page argues superiority instead of category.

## Operating Context

- Buyers evaluate between sales calls; sessions are short and interruption-prone.
- Integrations: **CRM** GoHighLevel · HubSpot · Close. **Recordings** Zoom · Fathom. **Alerts** Slack · Discord · Email. Optional CloserMetrix fields written into GHL so clients can automate off objections, goals, and next steps.
- Delivery clock: first audit inside 24 hours, measured from receipt of call data, not from signature.
- Onboarding starts from the client's existing back-catalog of recordings — they begin with a year of conversations already had, not an empty dashboard.
- Comparison set visitors bring: Gong (enterprise, priced and scoped past them), spreadsheets, and "my manager watches calls."

## Capabilities and Constraints

Per reviewed call, all confirmed and claimable:

- Read end to end
- CRM notes written in the client's language
- Pipeline stage updated, next step logged
- Scored against the client's rubric
- Objections, goals, and promises extracted and stored
- Risky promises flagged with timestamps
- Alert sent to the team
- Added permanently to the record

Monthly Integrity Audit: what buyers actually said, movement versus last month, resolution rates, flag concentration by closer, and language shifts.

Flag categories: income claims, guarantees, cancellation terms, financing advice, plus client-defined phrases.

**Pricing (current model — supersedes the old tier table):** `$3` per reviewed call · `$500` monthly minimum · `$2,000` implementation. Billed only for customer-facing sales calls over five minutes.

Site-specific constraints:

- Primary CTA is **Book a demo** (`DemoModal`, submitted via EmailJS). Secondary CTA is **See a sample Integrity Audit**. No self-serve signup, no trial, no in-page login flow.
- Navigation must be **What You Get · Pricing · Book a Demo**. The incumbent Features / How It Works / FAQ nav points at pages that no longer carry the positioning.
- Meta title: `CloserMetrix — Sales Integrity Audits for High-Ticket Teams`. **"The Sales Intelligence Layer" is retired.**
- Build prerenders for crawlers (`src/entry-server.jsx` + `scripts/prerender.mjs`); anything added must survive SSR — no unguarded `window`/`document` at module scope.
- `public/llms.txt`, `robots.txt`, `sitemap.xml` are maintained and must not regress.
- Footer: Privacy Policy and Terms need real documents before launch. Remove About / Blog / Careers unless they resolve. A **data handling page** is required — storage, access, retention, deletion on request, and whether client data is trained on.

**Open / unresolved — do not present as settled:**

- Whether client-defined flag phrases actually ship. If flagging is locked to fixed categories, the Flags block overpromises.
- Whether the founding-client rate is permanent or fixed-term.
- Whether the metering rule matches the "over five minutes, customer-facing" billing line.

## Brand Commitments

- Name: **CloserMetrix**. Wordmark asset in `Backend/src/public/logo-wide.png`.
- Voice: plain, direct, operator-to-operator. States the problem before the feature. No hype adjectives, no fake urgency, and never names its own price a good deal — the checklist-versus-number gap does that work.
- **Never name a regulator.** Not FTC, not SEC, anywhere on this surface. Naming one implies handling one, which asserts a legal judgment nobody here is licensed to make. Standing disclaimer instead: "We flag what was said. What it means legally is your attorney's call, not ours." The in-product label needs the same rename to "risk flags."
- Copy discipline: two sentences of body copy per block, maximum. A block needing a third needed a picture instead.

## Evidence on Hand

Real and usable, unattributed:

- **1,020** calls read · **1,322** objections captured in the buyer's own words · **425** risky promises flagged · **1 in 10** calls contained at least one · **176** guarantees · **160** income claims. Spans roughly four months. Never attach a client name, a rep name, a client count, or a timeframe to these.
- Working product with real client data behind it; a live demo can be given on the prospect's own recordings.
- Revenue calculator (`src/components/RevenueCalculator.jsx`) — visitor-input math, not a results claim.

**No single call is evidence.** Do not propose, quote, or design around an individual call — not a real one, not an anonymized one. No one call contains anything specifically valuable; the value only appears in aggregate across hundreds. Quotes and flag examples on any surface are illustrations of a recurring pattern and must be generic and labelled as such. This rule stands even when a real quote would be more persuasive.

**Absent — must never be fabricated:**

- No testimonials, quotes, or named customer references cleared for public use. No client logos.
- No case studies and no outcome metrics (no "% lift", no revenue-recovered figures).
- Illustrative Integrity Audit findings and objection quotes on the page are placeholders. Label or genericize them; replace with real anonymized findings when available. **Never invent a finding inside a visual on a product that sells evidence.**
- No product screenshots cleared for public use. Never show real closer names.

## Product Principles

1. **Show, don't describe.** Half the page must display the product or its output rather than explain it. Icons do not count — they are decoration standing where evidence should be.
2. **Name the blind spot before the feature.** The visitor's problem is that nobody reviews the calls — not that nobody reads the words.
3. **Zero-admin is the promise.** Nothing here needs a person. Any implication of rep effort, tagging, or process change contradicts the product.
4. **Proof is demonstration, not testimony.** With no testimonials, credibility comes from specificity, real aggregate counts, and an audit on the prospect's own data before they decide.
5. **Small-team altitude.** 2–20 closers. Enterprise framing, seat math, and procurement language read as the wrong product.
6. **Closers are allies, not suspects.** Surveillance framing kills the founder's willingness to roll it out.

## Accessibility & Inclusion

No product-specific standard established. Baseline applies, and one is a known defect: body copy is grey on near-black at small size and is hard work — lift contrast and cap measure near 65 characters. The site is motion-heavy (Aurora, framer-motion, GradualBlur, ScrollStack) — honor `prefers-reduced-motion`, and never let motion be the only carrier of meaning.
