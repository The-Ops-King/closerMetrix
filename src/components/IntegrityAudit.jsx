import { useState } from 'react'
import { motion } from 'framer-motion'
import { useDemoModal } from '../hooks/useDemoModal'

/*
 * Drop a real audit screenshot at public/integrity-audit.png and it replaces
 * the mock automatically. If the file is missing, the mock renders instead.
 */
const SCREENSHOT_SRC = '/integrity-audit.png'

const bullets = [
  'Script adherence',
  'Rep comparison',
  'Buyer psychology',
  'Pain points',
  'Goals',
  'Objections',
  'Winning patterns',
  'Lost deal analysis',
  'CRM health',
  'Historical trends',
]

const AuditMock = () => {
  const bars = [72, 88, 61, 94, 55, 79, 68]
  const reps = [
    { name: 'Rep A', score: '92', tone: 'good' },
    { name: 'Rep B', score: '84', tone: 'good' },
    { name: 'Rep C', score: '67', tone: 'warn' },
    { name: 'Rep D', score: '51', tone: 'bad' },
  ]

  return (
    <div className="audit-mock">
      <div className="audit-mock-header">
        <div className="dashboard-dots">
          <span style={{ background: '#ff5f57' }}></span>
          <span style={{ background: '#febc2e' }}></span>
          <span style={{ background: '#28c840' }}></span>
        </div>
        <span className="dashboard-title">Monthly Sales Integrity Audit</span>
      </div>

      <div className="audit-mock-body">
        <div className="audit-mock-stats">
          <div className="audit-stat">
            <span className="audit-stat-label">Script Adherence</span>
            <span className="audit-stat-value">78%</span>
            <span className="audit-stat-change positive">+6 pts</span>
          </div>
          <div className="audit-stat">
            <span className="audit-stat-label">CRM Accuracy</span>
            <span className="audit-stat-value">94%</span>
            <span className="audit-stat-change positive">+21 pts</span>
          </div>
          <div className="audit-stat">
            <span className="audit-stat-label">Top Lost Reason</span>
            <span className="audit-stat-value sm">Price</span>
            <span className="audit-stat-change">38% of losses</span>
          </div>
        </div>

        <div className="audit-mock-panels">
          <div className="audit-panel">
            <span className="audit-panel-title">Adherence Trend</span>
            <div className="audit-chart">
              {bars.map((h, i) => (
                <motion.span
                  key={i}
                  className="audit-bar"
                  initial={{ height: 0 }}
                  whileInView={{ height: `${h}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: i * 0.06 }}
                />
              ))}
            </div>
          </div>

          <div className="audit-panel">
            <span className="audit-panel-title">Rep Comparison</span>
            <div className="audit-reps">
              {reps.map((rep) => (
                <div key={rep.name} className="audit-rep">
                  <span className="audit-rep-name">{rep.name}</span>
                  <span className="audit-rep-track">
                    <motion.span
                      className={`audit-rep-fill ${rep.tone}`}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${rep.score}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.7 }}
                    />
                  </span>
                  <span className="audit-rep-score">{rep.score}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const IntegrityAudit = () => {
  const { openModal } = useDemoModal()
  const [hasScreenshot, setHasScreenshot] = useState(true)

  return (
    <section id="integrity-audit" className="audit-section">
      <div className="container">
        <motion.div
          className="section-header"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <span className="badge">The Integrity Audit</span>
          <h2>See What's Actually Happening <span className="gradient-text">Across Your Sales Team</span></h2>
        </motion.div>

        <motion.div
          className="audit-visual"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
        >
          {hasScreenshot ? (
            <img
              src={SCREENSHOT_SRC}
              alt="Sample monthly Sales Integrity Audit"
              className="audit-screenshot"
              onError={() => setHasScreenshot(false)}
            />
          ) : (
            <AuditMock />
          )}
        </motion.div>

        <motion.ul
          className="audit-bullets"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {bullets.map((bullet) => (
            <li key={bullet}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 13l4 4L19 7" />
              </svg>
              {bullet}
            </li>
          ))}
        </motion.ul>

        <motion.div
          className="audit-cta"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <motion.button
            className="btn btn-primary"
            onClick={openModal}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
          >
            See Sample Audit
          </motion.button>
        </motion.div>
      </div>
    </section>
  )
}

export default IntegrityAudit
