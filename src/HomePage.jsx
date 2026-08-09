import { motion, useReducedMotion } from 'framer-motion'
import StarBorder from './components/StarBorder'
import { INTEGRATIONS } from './components/IntegrationMarks'
import { useDemoModal } from './hooks/useDemoModal'
import { useDocumentTitle } from './hooks/useDocumentTitle'
import './styles/home.css'

/*
 * On the server we drop every entrance animation. framer-motion writes its
 * `initial` state to inline styles, and prerendered HTML full of opacity:0
 * is text a crawler is entitled to treat as hidden.
 */
const SSR = import.meta.env.SSR

const AUDIT_URL = '/preview/'

/* 1 — Hero flow strip. Exists so a visitor who reads nothing else still
   knows what the product does. The last node is the deliverable. */
const flow = ['Call ends', 'We review it', 'CRM updated, team alerted', 'Monthly report']

/* 2 — Decisions. The four functions that get measured, and what each one is
   guessing at without the call. No figures here on purpose: every real
   number on the page lives in Proof. */
const decisions = [
  { dept: 'Marketing', blind: 'Guesses which message actually landed' },
  { dept: 'Revenue', blind: 'Sees the close rate, never the cause' },
  { dept: 'Finance', blind: 'Hears about the refund once it clears' },
  { dept: 'Operations', blind: 'Builds for a customer nobody described' },
]

/* 3 — The Gap. Every row states the old world before the new one.
   Never add a third column: this is not a comparison page. */
const gap = [
  ['Recordings pile up in a folder', 'Every call reviewed, same day'],
  ['Notes typed from memory between calls', 'Notes taken from what was actually said'],
  ['Your best manager reviews one call in ten', 'Every call gets reviewed'],
  ['You know your best closer by revenue', 'You know how each one actually sells'],
  ['You hear about the bad promise at the refund', 'You hear about it Tuesday afternoon'],
  ['You guess what buyers want', 'You know, in their words, every month'],
]

/*
 * 4 — Objections. A distribution, not a quote wall. No single call matters;
 * the shape across hundreds is the product. Illustrative percentages,
 * labelled as such in the block.
 */
const objectionMix = [
  { pct: 50, label: 'Financial', note: 'Cash flow, timing of the spend, payment terms' },
  { pct: 25, label: 'Spouse or partner', note: 'Has to run it past someone before deciding' },
  { pct: 20, label: '"Let me think about it"', note: 'No stated reason at all' },
  {
    pct: 5,
    label: 'Something nobody on your team had heard before',
    note: 'Memorable because it is rare. Rare because it almost never costs you a deal.',
    accent: true,
  },
]

/* 5 — Compliance. No regulator is named anywhere on this page, by design. */
const flagChips = [
  'Income claims',
  'Guarantees',
  'Cancellation terms',
  'Financing advice',
  'Anything you tell us',
]

/*
 * 6 — Proof. Every real figure on the page lives here and nowhere else,
 * with the scope stated: one client, 90 days. Scattered across sections
 * they read as decoration; together they read as a record.
 */
const proof = [
  { stat: '1,020', line: 'calls reviewed end to end' },
  { stat: '1,322', line: "objections captured in the buyer's own words" },
  { stat: '425', line: 'risky promises flagged for review', flag: true },
  { stat: '1 in 10', line: 'calls had a promise the closer should not have made', flag: true },
]

/* 7 — CRM. The output nobody expects a review service to produce, so it
   gets shown as the record itself rather than described. */
const crmRecord = [
  {
    field: 'Call summary',
    value:
      'Wants to start before their Q1 push. Partner has to sign off on anything over $10k. Burned by a similar program last year.',
  },
  { field: 'Pipeline stage', value: 'Follow-up scheduled', tag: true },
  { field: 'Next step', value: 'Send March start dates + partner-facing one-pager' },
  { field: 'Objections', value: 'Timing · Spouse or partner · Prior bad experience' },
  { field: 'Goals stated', value: 'Replace $180k of agency revenue by June' },
  { field: 'Call score', value: '82 / 100 — discovery strong, close rushed' },
  { field: 'Risk flags', value: '1 — income claim at 34:12', flag: true },
]

/*
 * 6 — Audit findings. The fourth is deliberately a sentence rather than a
 * fourth percentage: it is the only finding a tag-based product cannot
 * generate. Do not set it smaller than the three above it.
 */
const findings = [
  { stat: '21%', line: 'more price objections than last month' },
  { stat: '31%', line: 'of objections got resolved. The rest walked.' },
  { stat: '82%', line: 'of flagged promises came from one closer' },
]

const languageFinding = 'Know when "I can\'t afford it" turns into "it\'s too expensive."'

/* 7 — Twenty-four hours. Three nodes: the middle one is the company. */
const timeline = [
  { label: 'You send your recordings', note: 'Clock starts here' },
  { label: 'We review every one', note: 'Every call, not a sample' },
  { label: 'Your first audit lands', note: 'Inside 24 hours' },
]

/* 9 — Pricing. The list is scope, not price justification. Last thing to cut. */
const unitOfWork = [
  'Reviewed end to end',
  'Notes written into your CRM in your language',
  'Pipeline stage updated, next step logged',
  'Scored against your rubric',
  'Objections, goals, and promises extracted and stored',
  'Risky promises flagged with timestamps',
  'Alert sent to your team',
  'Added permanently to your record',
]

/*
 * 9b — Cost of inaction. Every figure is arithmetic on the stated example,
 * not a claim about any client's results. The assumption is printed above
 * the numbers so the reader can swap in his own.
 */
const inaction = [
  {
    figure: '$40,000',
    head: 'One deal a quarter, lost to an objection nobody named',
    line: 'It came up all quarter on calls nobody listened to. Four deals a year, gone to an answer your team never got trained on.',
  },
  {
    figure: '$120,000',
    head: 'One closer, one deal a month behind',
    line: 'Same leads, same offer. Nobody can point at the minute his calls turn, so he closes at the same rate in December as he did in January.',
  },
  {
    figure: '$10,000',
    head: 'One refund you could have caught on the call',
    line: 'The promise that caused it was said out loud, on a recording, weeks before the chargeback landed.',
  },
]

/* The one mark on the page. A square lists; a check confirms, and eight
   confirmations is the whole job of the pricing checklist. */
const CheckMark = () => (
  <svg
    className="home-check"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 6L9 17l-5-5" />
  </svg>
)

const HomePage = () => {
  const { openModal } = useDemoModal()
  const still = SSR || useReducedMotion()

  useDocumentTitle('CloserMetrix — Sales Integrity Audits for High-Ticket Teams')

  /* Block headers: one quiet lift, shared across the page. */
  const reveal = still
    ? {}
    : {
        initial: { opacity: 0, y: 24 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: '-80px' },
        transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
      }

  /* Sequenced items: rows, bars, nodes. Reads as the system working down a list. */
  const sequence = (index = 0, gapMs = 0.07) =>
    still
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: '-60px' },
          transition: { duration: 0.5, delay: index * gapMs, ease: [0.16, 1, 0.3, 1] },
        }

  /* The one authored moment: the H1 resolving out of blur, the way an
     unreviewed call resolves into a record. Mount, not scroll. */
  const hero = (delay = 0, blur = false) =>
    still
      ? {}
      : {
          initial: blur ? { opacity: 0, y: 24, filter: 'blur(14px)' } : { opacity: 0, y: 14 },
          animate: blur ? { opacity: 1, y: 0, filter: 'blur(0px)' } : { opacity: 1, y: 0 },
          transition: { duration: blur ? 1.1 : 0.6, delay, ease: [0.16, 1, 0.3, 1] },
        }

  /* Bars grow from zero so the 50/25/20/5 shape is the thing that animates. */
  const bar = (pct, index) =>
    still
      ? { style: { width: `${pct}%` } }
      : {
          initial: { width: 0 },
          whileInView: { width: `${pct}%` },
          viewport: { once: true, margin: '-60px' },
          transition: { duration: 0.9, delay: 0.1 + index * 0.12, ease: [0.16, 1, 0.3, 1] },
        }

  return (
    <div className="home-page">
      {/* 1 — Hero. Deliberately empty: no dashboard, no illustration. */}
      <section className="home-hero">
        <div className="container">
          <motion.p className="home-eyebrow" {...hero(0)}>
            Sales call intelligence for high-ticket teams
          </motion.p>

          <motion.h1 {...hero(0.08, true)}>
            Know exactly <span className="gradient-text">why you're losing deals</span>.
          </motion.h1>

          <motion.p className="home-hero-sub" {...hero(0.45)}>
            We review every sales call, write what happened into your CRM, and tell you each month
            what changed.
          </motion.p>

          <motion.div className="home-flow" {...hero(0.6)} aria-label="How it works">
            {flow.map((node, index) => (
              <span key={node} className="home-flow-step">
                <span
                  className={`home-flow-node${index === flow.length - 1 ? ' is-terminal' : ''}`}
                >
                  {node}
                </span>
                {index < flow.length - 1 && (
                  <span className="home-flow-arrow" aria-hidden="true">
                    →
                  </span>
                )}
              </span>
            ))}
          </motion.div>

          <motion.div className="home-hero-cta" {...hero(0.75)}>
            <StarBorder color="#00ff88" speed={4} borderRadius="12px">
              <motion.button
                className="btn btn-primary"
                onClick={openModal}
                whileHover={still ? undefined : { scale: 1.02 }}
                whileTap={still ? undefined : { scale: 0.98 }}
              >
                Book a demo
              </motion.button>
            </StarBorder>

            <motion.a
              href={AUDIT_URL}
              className="btn btn-outline"
              whileHover={still ? undefined : { scale: 1.02 }}
              whileTap={still ? undefined : { scale: 0.98 }}
            >
              See a sample Integrity Audit
            </motion.a>

            <span className="home-hero-note">Actionable insights within 24 hours.</span>
          </motion.div>
        </div>
      </section>

      {/* 2 — Decisions. The stakes block. Four ruled columns, so it does not
          repeat the hero's centered stack above it or the Gap's two-column
          table below it. Solid headline: the gradient budget is spent. */}
      <section id="decisions" className="home-section">
        <div className="container">
          <motion.h2 className="home-h2 is-lead" {...reveal}>
            Every important business decision starts in a sales call.
          </motion.h2>

          <div className="home-decisions">
            {decisions.map((item, index) => (
              <motion.div key={item.dept} className="home-decision" {...sequence(index, 0.08)}>
                <span className="home-decision-dept">{item.dept}</span>
                <span className="home-decision-blind">{item.blind}</span>
              </motion.div>
            ))}
          </div>

          <motion.p className="home-body home-decisions-body" {...reveal}>
            Those calls already hold the answer — what buyers asked for, what stopped them, what
            changed since last month. Almost all of it is thrown out the moment the call ends.
          </motion.p>

          <motion.p className="home-pull" {...reveal}>
            Better information creates better decisions.{' '}
            <span className="home-pull-quiet">
              CloserMetrix doesn't tell you what to do — it tells you what's actually happening.
            </span>
          </motion.p>
        </div>
      </section>

      {/* 3 — The Gap. Ruled table. No body copy: he runs the comparison himself. */}
      <section id="what-you-get" className="home-section">
        <div className="container">
          <motion.h2 className="home-h2" {...reveal}>
            You bought a RECORDER. You need a REVIEWER.
          </motion.h2>

          <div className="home-gap">
            <div className="home-gap-head">
              <span className="home-gap-label is-muted">Today</span>
              <span className="home-gap-label">With CloserMetrix</span>
            </div>
            {gap.map(([today, withUs], index) => (
              <motion.div key={today} className="home-gap-row" {...sequence(index)}>
                <span className="home-gap-old">
                  <span className="home-gap-tag" aria-hidden="true">
                    Today
                  </span>
                  {today}
                </span>
                <span className="home-gap-new">
                  <span className="home-gap-tag is-new" aria-hidden="true">
                    With CloserMetrix
                  </span>
                  {withUs}
                </span>
              </motion.div>
            ))}
          </div>

          <motion.p className="home-gap-note" {...reveal}>
            Nothing here needs a person.
          </motion.p>
        </div>
      </section>

      {/* 4 — Objections. Everything about what buyers say lives here: the
          distribution, the counts, and the month-over-month language shift. */}
      <section id="objections" className="home-section home-objections">
        <div className="container">
          <motion.h2 className="home-h2 is-lead" {...reveal}>
            Your closers tell you what stands out.{' '}
            <span className="gradient-text">We tell you what's actually happening.</span>
          </motion.h2>

          <motion.p className="home-sample-label" {...reveal}>
            Sample month — illustrative of the shape a real audit returns, not a client's data.
          </motion.p>

          <div className="home-mix">
            {objectionMix.map((row, index) => (
              <motion.div key={row.label} className="home-mix-row" {...sequence(index, 0.08)}>
                <span className="home-mix-pct">{row.pct}%</span>
                <div className="home-mix-body">
                  <span className="home-mix-label">
                    {row.label}
                    {row.accent && (
                      <span className="home-mix-tag">the one they ask you to train on</span>
                    )}
                  </span>
                  <span className="home-mix-note">{row.note}</span>
                  <span className="home-mix-track" aria-hidden="true">
                    <motion.span
                      className={`home-mix-fill${row.accent ? ' is-accent' : ''}`}
                      {...bar(row.pct, index)}
                    />
                  </span>
                </div>
              </motion.div>
            ))}
          </div>

          {/* The whole point of the block, and easy to get backwards: the
              rare objection is the memorable one, not the expensive one. */}
          <motion.div className="home-split-note" {...reveal}>
            <span className="home-split-note-item">
              <strong>95%</strong> of your lost deals are in the top three.
            </span>
            <span className="home-split-note-item is-accent">
              <strong>5%</strong> is the one your team wants a script for.
            </span>
          </motion.div>

          <motion.p className="home-language-finding" {...reveal}>
            {languageFinding}
          </motion.p>

          <motion.ul className="home-points" {...reveal}>
            <li>
              <strong>"I can't afford it"</strong> — they don't have the money.
            </li>
            <li>
              <strong>"It's too expensive"</strong> — they have it, and don't think you're worth it.
            </li>
            <li>Counted together, you can't tell which one you're losing to.</li>
          </motion.ul>
        </div>
      </section>

      {/* 5 — Compliance. Everything about risky promises lives here: the
          alert, the categories, and the counts. */}
      <section id="compliance" className="home-section home-flags">
        <div className="container home-flags-grid">
          <motion.figure className="home-slack" {...reveal}>
            <div className="home-slack-rail" aria-hidden="true">
              <span className="home-slack-workspace">C</span>
              <span className="home-slack-dot" />
              <span className="home-slack-dot" />
              <span className="home-slack-dot" />
            </div>

            <div className="home-slack-body">
              <figcaption className="home-slack-header">
                <span className="home-slack-hash" aria-hidden="true">
                  #
                </span>
                call-review
              </figcaption>

              <div className="home-slack-message">
                <div className="home-slack-avatar" aria-hidden="true">
                  CM
                </div>
                <div className="home-slack-content">
                  <div className="home-slack-meta">
                    <span className="home-slack-author">CloserMetrix</span>
                    <span className="home-slack-tag">APP</span>
                    <span className="home-slack-time">2:47 PM</span>
                  </div>
                  <p className="home-slack-flag">
                    <span className="home-slack-flagmark" aria-hidden="true" />
                    Flag on today's call — Discovery Call, 34:12
                  </p>
                  <p className="home-slack-said">
                    Rep said: "You'll totally make your money back in 30 days."
                  </p>
                  <p className="home-slack-category">Category: Income claim</p>
                  <div className="home-slack-actions">
                    <span>Transcript</span>
                    <span>Recording</span>
                    <span>Mark reviewed</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.figure>

          <div className="home-flags-copy">
            <motion.h2 className="home-h2 is-lead" {...reveal}>
              Catch what your closers promised, before it becomes a{' '}
              <span className="home-h2-flag">refund</span>.
            </motion.h2>

            <motion.p className="home-body" {...reveal}>
              They're 1099, paid on close, and the fastest way to close is to say what the prospect
              wants to hear. Every promise gets flagged with the timestamp and the exact words.
            </motion.p>

            <motion.ul className="home-chips" {...reveal}>
              {flagChips.map((chip) => (
                <li key={chip} className="home-chip">
                  {chip}
                </li>
              ))}
            </motion.ul>
          </div>
        </div>

        <div className="container">
          <motion.p className="home-fineprint" {...reveal}>
            We flag what was said. What it means legally is your attorney's call, not ours.
          </motion.p>
        </div>
      </section>

      {/* 6 — Proof. One client, 90 days. Every real number on the page. */}
      <section className="home-section home-proof-section">
        <div className="container">
          <motion.p className="home-proof-scope" {...reveal}>
            One client · 90 days of call history · real numbers
          </motion.p>

          <motion.h2 className="home-h2 is-lead" {...reveal}>
            This is what one quarter of unreviewed calls actually contained.
          </motion.h2>

          <div className="home-proof">
            {proof.map((item, index) => (
              <motion.div key={item.stat} className="home-figure-block" {...sequence(index, 0.09)}>
                <span className={`home-figure${item.flag ? ' is-flag' : ''}`}>{item.stat}</span>
                <span className="home-figure-line">{item.line}</span>
              </motion.div>
            ))}
          </div>

          <motion.p className="home-pull" {...reveal}>
            176 guarantees and 160 income claims in 90 days, and nobody had reviewed a single one of
            those calls before we did.
          </motion.p>
        </div>
      </section>

      {/* 7 — CRM. Shown as the record itself: nobody expects a review
          service to write back into their pipeline, so describing it
          doesn't land. */}
      <section id="crm" className="home-section home-crm">
        <div className="container">
          <motion.h2 className="home-h2 is-lead is-centered" {...reveal}>
            Your CRM fills itself in.
          </motion.h2>

          <motion.p className="home-crm-sub" {...reveal}>
            Every reviewed call is written back into GoHighLevel, HubSpot or Close before your
            closer has finished their next coffee. No tagging, no forms, no end-of-day admin.
          </motion.p>

          <motion.div className="home-record" {...reveal}>
            <div className="home-record-head">
              <span className="home-record-title">Discovery Call — 34:12</span>
              <span className="home-record-stamp">Written back 4 minutes after the call ended</span>
            </div>

            {crmRecord.map((row, index) => (
              <motion.div key={row.field} className="home-record-row" {...sequence(index, 0.05)}>
                <span className="home-record-field">{row.field}</span>
                <span
                  className={`home-record-value${row.tag ? ' is-tag' : ''}${
                    row.flag ? ' is-flag' : ''
                  }`}
                >
                  {row.value}
                </span>
              </motion.div>
            ))}
          </motion.div>

          <motion.p className="home-fineprint" {...reveal}>
            Optional CloserMetrix fields written into your GHL, so you can automate off objections,
            goals, and next steps.
          </motion.p>
        </div>
      </section>

      {/* 8 — The Integrity Audit. The monthly report, and why month twelve
          beats month one. */}
      <section id="integrity-audit" className="home-section home-audit">
        <div className="container">
          <motion.h2 className="home-h2 is-lead" {...reveal}>
            Know what changed with your buyers, every month.
          </motion.h2>

          <motion.p className="home-sample-label" {...reveal}>
            Sample findings — illustrative of what a month looks like, not a client's data.
          </motion.p>

          <div className="home-findings">
            {findings.map((finding, index) => (
              <motion.div key={finding.stat} className="home-finding" {...sequence(index, 0.1)}>
                <span className="home-figure is-secondary">{finding.stat}</span>
                <span className="home-figure-line">{finding.line}</span>
              </motion.div>
            ))}
          </div>

          <motion.p className="home-pull" {...reveal}>
            Every month you know your buyers better than you did the month before, because the
            record keeps growing and it never resets.
          </motion.p>

          <motion.div className="home-actions" {...reveal}>
            <a href={AUDIT_URL} className="btn btn-outline">
              See a sample Integrity Audit
            </a>
          </motion.div>
        </div>
      </section>

      {/* 9 — Twenty-four hours. */}
      <section className="home-section home-clock">
        <div className="container">
          <motion.h2 className="home-h2 is-wide" {...reveal}>
            Actionable insight in <span className="gradient-text">24 hours</span>.
          </motion.h2>

          <ol className="home-timeline">
            {timeline.map((node, index) => (
              <motion.li key={node.label} className="home-timeline-node" {...sequence(index, 0.14)}>
                <span className="home-timeline-mark" aria-hidden="true">
                  <span className="home-timeline-dot" />
                </span>
                <span className="home-timeline-label">{node.label}</span>
                <span className="home-timeline-note">{node.note}</span>
              </motion.li>
            ))}
          </ol>

          <motion.p className="home-clock-foot" {...reveal}>
            The clock starts when your recordings arrive, not at signature. You begin with a year of
            conversations you've already had, not an empty dashboard.
          </motion.p>
        </div>
      </section>

      {/* 10 — Fit. One ruled strip, distributed across the full measure. */}
      <section className="home-fit">
        <div className="container">
          <motion.div className="home-fit-strip" {...reveal}>
            {INTEGRATIONS.map((group) => (
              <div key={group.label} className="home-fit-item">
                <span className="home-fit-label">{group.label}</span>
                <div className="home-marks">
                  {group.items.map((item) => (
                    <span
                      key={item.name}
                      className="home-mark"
                      data-label={item.name}
                      tabIndex={0}
                    >
                      {item.node}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* 11 — Pricing. The cost of missing it comes first, so the number
          lands as relief rather than as a charge. */}
      <section className="home-section home-pricing">
        <div className="container">
          <motion.h2 className="home-h2 is-lead is-centered" {...reveal}>
            Everything that happens to one call.
          </motion.h2>

          <ul className="home-scope-list">
            {unitOfWork.map((line, index) => (
              <motion.li key={line} className="home-scope-item" {...sequence(index, 0.05)}>
                <CheckMark />
                {line}
              </motion.li>
            ))}
          </ul>

          {/* The nav's Pricing link targets this, not the price. The cost
              of not knowing has to be read before the number is. */}
          <div className="home-inaction" id="pricing">
            <motion.p className="home-inaction-head" {...reveal}>
              Now put a number on the calls nobody reviewed.
            </motion.p>

            <motion.p className="home-inaction-assume" {...reveal}>
              Say you run 400 sales calls a month and your average deal is $10,000. Swap in your
              own numbers as you read.
            </motion.p>

            <div className="home-inaction-grid">
              {inaction.map((item, index) => (
                <motion.div key={item.head} className="home-inaction-item" {...sequence(index, 0.1)}>
                  <span className="home-inaction-figure">{item.figure}</span>
                  <span className="home-inaction-title">{item.head}</span>
                  <span className="home-inaction-line">{item.line}</span>
                </motion.div>
              ))}
            </div>

            <motion.div className="home-inaction-close" {...reveal}>
              <span className="home-inaction-close-label">One year, three things nobody caught</span>
              <span className="home-inaction-close-figure">$170,000+</span>
              <span className="home-inaction-close-line">
                gone, from calls that were already recorded and already paid for.
              </span>
            </motion.div>
          </div>

          <motion.div className="home-price" {...reveal}>
            <span className="home-price-lead">And the investment is</span>
            <span className="home-price-figure gradient-text">$3</span>
            <span className="home-price-unit">per reviewed call</span>

            <div className="home-price-terms">
              <span className="home-price-line">$500 monthly minimum</span>
              <span className="home-price-line">
                $2,000 implementation — your first audit lands inside 24 hours of us receiving your
                recordings
              </span>
              <span className="home-price-note">
                Billed only for customer-facing sales calls over five minutes.
              </span>
            </div>

            <div className="home-actions">
              <StarBorder color="#00ff88" speed={4} borderRadius="12px">
                <motion.button
                  className="btn btn-primary"
                  onClick={openModal}
                  whileHover={still ? undefined : { scale: 1.02 }}
                  whileTap={still ? undefined : { scale: 0.98 }}
                >
                  Book a demo
                </motion.button>
              </StarBorder>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 12 — Close */}
      <section className="home-section home-close">
        <div className="container">
          <motion.h2 className="home-h2" {...reveal}>
            Find out what your last hundred calls actually said.
          </motion.h2>

          <motion.div className="home-actions" {...reveal}>
            <StarBorder color="#00ff88" speed={4} borderRadius="12px">
              <motion.button
                className="btn btn-primary"
                onClick={openModal}
                whileHover={still ? undefined : { scale: 1.02 }}
                whileTap={still ? undefined : { scale: 0.98 }}
              >
                Book a demo
              </motion.button>
            </StarBorder>
          </motion.div>
        </div>
      </section>
    </div>
  )
}

export default HomePage
