import { motion } from 'framer-motion'

const steps = [
  {
    number: '01',
    title: 'Every Call',
    description: 'We review every recorded sales call.',
    items: [],
  },
  {
    number: '02',
    title: 'Automatically',
    description: '',
    items: [
      'CRM updated',
      'Notes added',
      'Pain points',
      'Goals',
      'Objections',
      'Next steps',
      'Manager notified',
    ],
  },
  {
    number: '03',
    title: 'Every Week & Month',
    description: '',
    items: [
      'Weekly Sales Intelligence Report',
      'Monthly Sales Integrity Audit',
    ],
  },
]

const HowItWorks = () => {
  return (
    <section id="how-it-works" className="how-it-works">
      <div className="container">
        <motion.div
          className="section-header"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <span className="badge">How It Works</span>
          <h2>Three Steps. <span className="gradient-text">Zero Effort.</span></h2>
          <p>Nothing for your closers to fill out. Nothing for managers to chase.</p>
        </motion.div>

        <div className="flow-grid">
          {steps.map((step, index) => (
            <motion.div
              key={step.number}
              className="flow-step"
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.15 }}
            >
              <div className="flow-card">
                <span className="flow-number">{step.number}</span>
                <h3>{step.title}</h3>
                {step.description && <p className="flow-desc">{step.description}</p>}
                {step.items.length > 0 && (
                  <ul className="flow-list">
                    {step.items.map((item) => (
                      <li key={item}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {index < steps.length - 1 && (
                <div className="flow-arrow" aria-hidden="true">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M19 12l-7 7-7-7" />
                  </svg>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default HowItWorks
