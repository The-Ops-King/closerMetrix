import { motion } from 'framer-motion'
import { useDemoModal } from '../hooks/useDemoModal'

const CTA = () => {
  const { openModal } = useDemoModal()

  return (
    <section id="cta" className="cta-section">
      <div className="container">
        <motion.div
          className="cta-content"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <motion.div
            className="cta-glow"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />

          <h2>Ready to Make <span className="gradient-text">Data-Driven</span> Decisions?</h2>
          <p>Join the sales teams that stopped guessing and started knowing.</p>

          <motion.button
            className="btn btn-primary"
            onClick={openModal}
            whileHover={{ scale: 1.05, boxShadow: '0 20px 60px rgba(0, 255, 136, 0.4)' }}
            whileTap={{ scale: 0.95 }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginTop: '24px' }}
          >
            Book a Demo
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </motion.button>

          <motion.p
            className="cta-note"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
          >
            Limited spots available. Be first to get access when we launch.
          </motion.p>

          <div className="cta-particles">
            {Array.from({ length: 20 }).map((_, i) => (
              <motion.div
                key={i}
                className="particle"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                }}
                animate={{
                  y: [0, -30, 0],
                  opacity: [0, 1, 0],
                }}
                transition={{
                  duration: 3 + Math.random() * 2,
                  repeat: Infinity,
                  delay: Math.random() * 2,
                }}
              />
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}

export default CTA
