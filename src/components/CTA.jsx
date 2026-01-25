import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import StarBorder from './StarBorder'

const CTA = () => {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle, loading, success

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!email) return

    setStatus('loading')

    // Simulate API call
    setTimeout(() => {
      setStatus('success')
      setTimeout(() => {
        setStatus('idle')
        setEmail('')
      }, 3000)
    }, 1500)
  }

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

          {/* Primary CTA */}
          <div className="cta-buttons">
            <StarBorder color="#00ff88" speed={4} borderRadius="12px">
              <motion.a
                href="#book-demo"
                className="btn btn-primary"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Book a Demo
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </motion.a>
            </StarBorder>

            <motion.a
              href="#how-it-works"
              className="btn btn-secondary"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              See How It Works
            </motion.a>
          </div>

          {/* Secondary - Email signup */}
          <div className="cta-email-section">
            <p className="cta-email-label">Or sign up for the email list:</p>
            <form className="cta-form" onSubmit={handleSubmit}>
              <motion.div
                className="input-wrapper"
                whileFocus={{ scale: 1.02 }}
              >
                <input
                  type="email"
                  placeholder="Enter your work email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={status !== 'idle'}
                  required
                />
              </motion.div>

              <AnimatePresence mode="wait">
                {status === 'idle' && (
                  <motion.button
                    key="submit"
                    type="submit"
                    className="btn btn-outline"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    Get Early Access
                  </motion.button>
                )}

                {status === 'loading' && (
                  <motion.button
                    key="loading"
                    className="btn btn-outline"
                    disabled
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                  >
                    <motion.div
                      className="spinner"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    />
                    Processing...
                  </motion.button>
                )}

                {status === 'success' && (
                  <motion.button
                    key="success"
                    className="btn btn-success"
                    disabled
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 13l4 4L19 7"/>
                    </svg>
                    You're on the list!
                  </motion.button>
                )}
              </AnimatePresence>
            </form>
          </div>

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
