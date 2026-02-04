import { motion } from 'framer-motion'
import { GradualBlurText } from './GradualBlur'
import Dashboard from './Dashboard'
import StarBorder from './StarBorder'

const Hero = () => {
  return (
    <section className="hero">
      <div className="hero-content">
        <motion.div
          className="hero-badge"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <span className="pulse"></span>
          AI-Powered Sales Intelligence
        </motion.div>

        <h1>
          <motion.span
            className="hero-title-line"
            initial={{ opacity: 0, y: 30, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            Stop Making
          </motion.span>
          <motion.span
            className="hero-title-line gradient-text"
            initial={{ opacity: 0, y: 30, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            $100K+ Decisions
          </motion.span>
          <motion.span
            className="hero-title-line"
            initial={{ opacity: 0, y: 30, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            Based on Feelings
          </motion.span>
        </h1>

        <motion.p
          className="hero-subtitle"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <GradualBlurText
            text="CloserMetrix automatically analyzes every one of your sales calls, and gives you actionable insights within 24 hours. Without changes to your existing setup."
            delay={0.5}
          />
        </motion.p>

        <motion.p
          className="hero-target"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          Built for high-ticket sales teams doing $50k–$2M+/month.
        </motion.p>

        <motion.div
          className="hero-cta"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <StarBorder color="#00ff88" speed={4} borderRadius="12px">
            <motion.a
              href="https://calendar.app.google/FBHCJbBbxhR1YP9V6"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <span>Book a Demo</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </motion.a>
          </StarBorder>

          <motion.a
            href="#how-it-works"
            className="btn btn-secondary"
            whileHover={{ scale: 1.02, borderColor: 'rgba(255,255,255,0.4)' }}
            whileTap={{ scale: 0.98 }}
          >
            See How It Works
          </motion.a>
        </motion.div>

        <motion.div
          className="hero-stats"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.8 }}
        >
          <Stat number="45" suffix=" min" label="Saved daily per closer" delay={0.9} />
          <div className="stat-divider" />
          <Stat number="24" suffix=" hrs" label="To first insights" delay={1.0} />
          <div className="stat-divider" />
          <Stat number="100" suffix="%" label="Automatic analysis" delay={1.1} />
        </motion.div>

        <motion.p
          className="hero-tagline"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.2 }}
        >
          Increase show rate, close rate, or both — without more leads.
        </motion.p>
      </div>

      <motion.div
        className="hero-visual"
        initial={{ opacity: 0, scale: 0.9, x: 50 }}
        animate={{ opacity: 1, scale: 1, x: 0 }}
        transition={{ duration: 0.8, delay: 0.3 }}
      >
        <Dashboard />
      </motion.div>
    </section>
  )
}

const Stat = ({ number, suffix, label, delay = 0 }) => (
  <motion.div
    className="stat"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay }}
  >
    <motion.span
      className="stat-number"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: delay + 0.2 }}
    >
      {number}{suffix}
    </motion.span>
    <span className="stat-label">{label}</span>
  </motion.div>
)

export default Hero
