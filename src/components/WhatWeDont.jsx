import { motion } from 'framer-motion'

const items = [
  'We don\'t coach your sales team.',
  'We don\'t rebuild your CRM.',
  'We don\'t redesign your sales process.',
  'We don\'t tell you what to do.',
]

const WhatWeDont = () => {
  return (
    <section id="what-we-dont-do" className="dont-section">
      <div className="container">
        <motion.div
          className="section-header"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <span className="badge">What We Don't Do</span>
          <h2>We Provide The <span className="gradient-text">Evidence</span></h2>
        </motion.div>

        <div className="dont-list">
          {items.map((item, index) => (
            <motion.div
              key={item}
              className="dont-item"
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
              {item}
            </motion.div>
          ))}
        </div>

        <motion.p
          className="dont-closer"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          We provide the evidence so your team can make better decisions.
        </motion.p>
      </div>
    </section>
  )
}

export default WhatWeDont
