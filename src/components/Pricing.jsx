import { motion } from 'framer-motion'
import { useDemoModal } from '../hooks/useDemoModal'

const included = [
  'Unlimited call processing',
  'CRM updates',
  'Weekly reports',
  'Monthly Integrity Audit',
]

const optional = [
  'Done For You Setup',
  'Historical Call Import',
]

const Pricing = () => {
  const { openModal } = useDemoModal()

  return (
    <section id="pricing" className="pricing-section">
      <div className="container">
        <motion.div
          className="section-header"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <span className="badge cyan">Pricing</span>
          <h2>One Price. <span className="gradient-text">Everything Included.</span></h2>
        </motion.div>

        <motion.div
          className="price-card"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="price-amount">
            <span className="price-value">$1,000</span>
            <span className="price-period">/ month</span>
          </div>

          <div className="price-lists">
            <div className="price-list">
              <span className="price-list-title">Includes</span>
              <ul>
                {included.map((item) => (
                  <li key={item}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--aurora-green)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="price-list">
              <span className="price-list-title">Optional</span>
              <ul>
                {optional.map((item) => (
                  <li key={item}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--aurora-cyan)" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <motion.button
            className="btn btn-primary price-cta"
            onClick={openModal}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            Book a Demo
          </motion.button>
        </motion.div>
      </div>
    </section>
  )
}

export default Pricing
