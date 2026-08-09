import LegalPage from './LegalPage'

/*
 * Structure only. Commercial terms that are already public on the pricing
 * block are restated here; everything that binds either party is left
 * pending for counsel.
 */
const sections = [
  {
    heading: 'The service',
    body: [
      'CloserMetrix reviews recorded sales calls and returns structured records: CRM notes, pipeline stage and next step, a score against your rubric, extracted objections, goals and promises, risk flags with timestamps, alerts to your team, and a monthly Integrity Audit.',
      'We report what the calls contain. Acting on it is yours. Nothing we flag is a legal determination, and we do not provide legal advice.',
    ],
  },
  {
    heading: 'Fees and billing',
    body: [
      'Three dollars per reviewed call, with a five hundred dollar monthly minimum and a two thousand dollar implementation fee.',
      'Only customer-facing sales calls longer than five minutes are billable.',
    ],
  },
  {
    heading: 'Billing mechanics',
    body: null,
    pending:
      'Invoice cadence, payment terms, what happens when usage falls under the monthly minimum, late payment, and whether the implementation fee is refundable if the first audit is not delivered.',
  },
  {
    heading: 'Delivery commitment',
    body: null,
    pending:
      'The site promises a first audit inside 24 hours of receiving call data. Write the contractual version of that: what starts the clock, what counts as delivery, and what happens if it is missed.',
  },
  {
    heading: 'Your responsibilities',
    body: null,
    pending:
      'Consent to record, lawful basis for sharing recordings containing third-party speech, accuracy of the rubric and flag phrases you supply, and account security.',
  },
  {
    heading: 'Confidentiality and derived data',
    body: null,
    pending:
      'Define derived data explicitly and state what rights each party has in it. This clause is the one most likely to be missing from the current client agreement.',
  },
  {
    heading: 'Term and termination',
    body: null,
    pending:
      'Notice period, effect of termination on stored recordings and derived records, and whether the founding-client rate survives renewal — decide permanent or fixed-term before the first contract.',
  },
  {
    heading: 'Liability',
    body: null,
    pending: 'Caps, exclusions, and indemnities. Counsel writes this one.',
  },
]

const TermsPage = () => (
  <LegalPage
    title="Terms of service"
    standfirst="What we deliver, what it costs, and what each side is responsible for."
    updated="These terms are being finalised with counsel. Sections marked Not yet published are not yet in force; the signed client agreement governs until they are."
    sections={sections}
  />
)

export default TermsPage
