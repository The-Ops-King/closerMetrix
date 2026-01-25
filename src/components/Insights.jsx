import { motion } from 'framer-motion'
import SpotlightCard from './SpotlightCard'

const insights = [
  'Why deals are being lost',
  'Which objections matter most',
  'What top closers do differently',
  'Where to focus coaching this week',
  'Where compliance risk is coming from',
]

const Insights = () => {
  return (
    <section className="insights-section">
      <div className="container">
        <motion.div
          className="insights-content"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <h2>You'll finally know:</h2>
          <ul className="insights-list">
            {insights.map((insight, index) => (
              <motion.li
                key={insight}
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <span className="insight-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 13l4 4L19 7"/>
                  </svg>
                </span>
                <span className="insight-text">{insight}</span>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      </div>
    </section>
  )
}

export default Insights
