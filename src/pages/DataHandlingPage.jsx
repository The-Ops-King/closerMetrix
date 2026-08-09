import LegalPage from './LegalPage'

/*
 * The five questions every serious buyer asks. Sections with real answers
 * describe what the product demonstrably does; the rest carry an explicit
 * pending note naming exactly what still has to be decided and written.
 */
const sections = [
  {
    heading: 'What we receive',
    body: [
      'Calendar events from the Google Calendars your team connects, including attendee names and email addresses.',
      'Recordings and transcripts of sales calls from your recording platform — Zoom or Fathom — and the metadata attached to them, such as duration, participants and timestamps.',
      'CRM records from GoHighLevel, HubSpot or Close, limited to the contacts and opportunities tied to the calls we review.',
      'Contact details you give us directly, such as the name and email on a demo request.',
    ],
  },
  {
    heading: 'What we produce from it',
    body: [
      'Structured records of each reviewed call: notes, pipeline stage and next step, a score against your rubric, extracted objections, goals and promises, and any risk flags with their timestamps.',
      'Those records are written back into your CRM, sent to your alerting channel, and kept in your account so the monthly Integrity Audit can compare one month against the next.',
    ],
  },
  {
    heading: 'Third parties on the call',
    body: [
      'Recordings contain speech from people who never signed anything with us — your prospects. Consent to record is captured by you and your recording platform under your own policies, before anything reaches us.',
    ],
  },
  {
    heading: 'Where the data is stored',
    body: null,
    pending:
      'Hosting region, storage provider, encryption at rest and in transit, and the retention clock all need to be stated here exactly as they are configured in production. Do not publish a general claim in place of the specific one.',
  },
  {
    heading: 'Who can access it',
    body: null,
    pending:
      'Name the internal roles with access to client recordings, whether access is logged, and every subprocessor that touches call content — including any model provider used to analyse transcripts.',
  },
  {
    heading: 'How long we keep it',
    body: null,
    pending:
      'State the retention period for recordings, for transcripts, and for the derived records, and say whether they differ. Confirm what happens at the end of a contract.',
  },
  {
    heading: 'Deletion on request',
    body: null,
    pending:
      'State how a client requests deletion, what is deleted, how long it takes, and what is retained afterwards for legal or billing reasons.',
  },
  {
    heading: 'Whether we train on client data',
    body: null,
    pending:
      'Answer plainly, yes or no, for both your own models and any third-party model provider in the pipeline. This is the question buyers ask most and the one an evasive answer loses.',
  },
]

const DataHandlingPage = () => (
  <LegalPage
    title="Data handling"
    standfirst="What enters CloserMetrix, what we do with it, and what happens when you ask us to stop."
    updated="Sections marked Not yet published are still being finalised. Nothing on this page is a placeholder for a commitment we have already made elsewhere."
    sections={sections}
  />
)

export default DataHandlingPage
