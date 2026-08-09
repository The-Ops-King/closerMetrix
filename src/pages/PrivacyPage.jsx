import LegalPage from './LegalPage'

/*
 * Structure only. Every clause that carries a legal commitment is left
 * pending on purpose — this page must be written or reviewed by counsel
 * before it goes live, and an invented privacy policy is a liability, not
 * a placeholder.
 */
const sections = [
  {
    heading: 'Scope',
    body: [
      'This policy covers closermetrix.com and the CloserMetrix dashboard. Operational detail about call recordings — what we receive, what we produce, who can see it — lives on the Data Handling page and is referenced here rather than repeated.',
    ],
  },
  {
    heading: 'Information we collect',
    body: null,
    pending:
      'Enumerate every category: demo-request contact details, calendar and recording data, CRM records, dashboard account data, and site analytics if any are running.',
  },
  {
    heading: 'How we use it',
    body: null,
    pending:
      'State each purpose and its lawful basis. Include whether contact details from a demo request are used for any marketing beyond scheduling.',
  },
  {
    heading: 'Sharing and subprocessors',
    body: null,
    pending:
      'List every subprocessor by name and function, including hosting, email delivery, scheduling, and any model provider that processes transcripts.',
  },
  {
    heading: 'Your rights',
    body: null,
    pending:
      'Access, correction, deletion, portability and objection, plus the mechanism and response time for each. Confirm which regimes you are asserting compliance with before naming any.',
  },
  {
    heading: 'Cookies and tracking',
    body: null,
    pending:
      'State exactly what the site sets. If nothing beyond what is strictly necessary is set, say that — it is a stronger claim than a generic cookie notice.',
  },
  {
    heading: 'Security',
    body: null,
    pending:
      'Describe the controls actually in place. Do not list aspirational ones.',
  },
  {
    heading: 'Changes to this policy',
    body: null,
    pending: 'State how changes are announced and whether prior versions remain available.',
  },
]

const PrivacyPage = () => (
  <LegalPage
    title="Privacy policy"
    standfirst="How CloserMetrix handles personal information."
    updated="This policy is being finalised with counsel. Sections marked Not yet published are not yet in force; ask us directly in the meantime."
    sections={sections}
  />
)

export default PrivacyPage
