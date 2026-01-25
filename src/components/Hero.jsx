import { motion } from 'framer-motion'
import AnimatedText from './AnimatedText'
import Dashboard from './Dashboard'

const Hero = () => {
  return (
    <section className="hero">
      <div className="hero-content">
        <motion.div
          className="hero-badge"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <span className="pulse"></span>
          AI-Powered Sales Intelligence
        </motion.div>

        <h1>
          <AnimatedText
            text="Stop Making"
            className="hero-title-line"
            delay={0.2}
          />
          <AnimatedText
            text="$100K+ Decisions"
            className="hero-title-line gradient-text"
            delay={0.4}
          />
          <AnimatedText
            text="Based on Feelings"
            className="hero-title-line"
            delay={0.6}
          />
        </h1>

        <motion.p
          className="hero-subtitle"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.6 }}
        >
          CloserMetrix automatically analyzes your sales calls and delivers
          actionable insights within 24 hours. No manual input required.
        </motion.p>

        <motion.div
          className="hero-cta"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.6 }}
        >
          <motion.a
            href="#cta"
            className="btn btn-primary"
            whileHover={{ scale: 1.05, boxShadow: '0 20px 60px rgba(0, 255, 136, 0.4)' }}
            whileTap={{ scale: 0.95 }}
          >
            <span>Start Analyzing Calls</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </motion.a>
          <motion.a
            href="#how-it-works"
            className="btn btn-secondary"
            whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,255,255,0.15)' }}
            whileTap={{ scale: 0.95 }}
          >
            See How It Works
          </motion.a>
        </motion.div>

        <motion.div
          className="hero-stats"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.6 }}
        >
          <Stat number="45" suffix=" min" label="Saved daily per closer" />
          <div className="stat-divider" />
          <Stat number="24" suffix=" hrs" label="To first insights" />
          <div className="stat-divider" />
          <Stat number="100" suffix="%" label="Automatic analysis" />
        </motion.div>
      </div>

      <motion.div
        className="hero-visual"
        initial={{ opacity: 0, x: 100 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.5, duration: 0.8, ease: 'easeOut' }}
      >
        <Dashboard />
      </motion.div>
    </section>
  )
}

const Stat = ({ number, suffix, label }) => (
  <div className="stat">
    <motion.span
      className="stat-number"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {number}{suffix}
    </motion.span>
    <span className="stat-label">{label}</span>
  </div>
)

export default Hero
