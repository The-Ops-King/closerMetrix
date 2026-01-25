import { motion } from 'framer-motion'
import SpotlightCard from './SpotlightCard'
import StarBorder from './StarBorder'

const CallBreakdown = () => {
  return (
    <section className="call-breakdown-section">
      <div className="container">
        <motion.div
          className="section-header"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <span className="badge">How It Works</span>
          <h2>Every Call, <span className="gradient-text">Fully Analyzed</span></h2>
          <p>Every recorded sales call — first calls, follow-ups, and closing calls — automatically analyzed using transcripts and AI.</p>
        </motion.div>

        <div className="breakdown-grid">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <SpotlightCard className="breakdown-card">
              <div className="breakdown-card-content">
                <div className="breakdown-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                    <path d="M9 12h6M9 16h6"/>
                  </svg>
                </div>
                <h3>Call Component Scoring</h3>
                <p>Every call is broken down into component parts — opening, discovery, pitch, objection handling, close — each judged and scored individually.</p>
              </div>
            </SpotlightCard>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <SpotlightCard className="breakdown-card">
              <div className="breakdown-card-content">
                <div className="breakdown-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                </div>
                <h3>Objection Tracking by Closer</h3>
                <p>Track every individual objection down to the specific closer. See who handles what objections best, and who needs coaching on which areas.</p>
              </div>
            </SpotlightCard>
          </motion.div>
        </div>

        <motion.div
          className="risk-notice"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <StarBorder color="#00d4ff" speed={12} thickness={50} borderRadius="16px">
            <div className="risk-notice-content">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
              </svg>
              <span>Quietly monitors risk language before it becomes a problem</span>
            </div>
          </StarBorder>
        </motion.div>
      </div>
    </section>
  )
}

export default CallBreakdown
