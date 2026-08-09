import { useDocumentTitle } from '../hooks/useDocumentTitle'
import '../styles/legal.css'

/*
 * Shared shell for /privacy, /terms and /data-handling.
 *
 * Read mode, not Persuade: the visitor is here to understand something and
 * leave. No motion, no accent decoration, one column at reading measure.
 *
 * Sections whose `body` is null render a visible TODO. That is deliberate —
 * a legal page that quietly invents its own terms is worse than one that
 * admits which clauses are still with counsel.
 */
const LegalPage = ({ title, standfirst, updated, sections }) => {
  useDocumentTitle(`${title} — CloserMetrix`)

  return (
  <article className="legal">
    <div className="container legal-inner">
      <header className="legal-header">
        <h1>{title}</h1>
        {standfirst && <p className="legal-standfirst">{standfirst}</p>}
        <p className="legal-updated">{updated}</p>
      </header>

      {sections.map((section) => (
        <section key={section.heading} className="legal-section">
          <h2>{section.heading}</h2>
          {section.body ? (
            section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)
          ) : (
            <p className="legal-todo">
              <strong>Not yet published.</strong> {section.pending}
            </p>
          )}
          {section.list && (
            <ul className="legal-list">
              {section.list.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <footer className="legal-footer">
        <p>
          Questions about anything on this page: <a href="mailto:jt@jtylerray.com">jt@jtylerray.com</a>
        </p>
      </footer>
    </div>
  </article>
  )
}

export default LegalPage
