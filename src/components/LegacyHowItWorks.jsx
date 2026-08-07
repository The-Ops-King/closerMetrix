import { motion } from 'framer-motion'

const steps = [
  {
    number: '01',
    title: 'Connect Your Tools',
    description: 'Link your calendar and call recording platform. Takes less than 5 minutes to set up.',
  },
  {
    number: '02',
    title: 'AI Analyzes Every Call',
    description: 'Our system automatically processes recordings, transcribes, and extracts key metrics.',
  },
  {
    number: '03',
    title: 'Get Actionable Insights',
    description: 'Within 24 hours, access dashboards showing exactly where to focus your coaching.',
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
          <h2>From Calls to Insights in <span className="gradient-text">3 Steps</span></h2>
          <p>No complex setup. No team training. Just connect and go.</p>
        </motion.div>

        <div className="steps-container">
          {steps.map((step, index) => (
            <motion.div
              key={step.number}
              className="step"
              initial={{ opacity: 0, x: index % 2 === 0 ? -50 : 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.2 }}
            >
              <motion.div
                className="step-number"
                whileHover={{ scale: 1.1 }}
                transition={{ type: 'spring', stiffness: 300 }}
              >
                {step.number}
              </motion.div>
              <div className="step-content">
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </div>
              {index < steps.length - 1 && (
                <motion.div
                  className="step-connector"
                  initial={{ scaleY: 0 }}
                  whileInView={{ scaleY: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.2 + 0.3 }}
                />
              )}
            </motion.div>
          ))}
        </div>

        <motion.div
          className="testimonial-card"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          whileHover={{ scale: 1.02 }}
        >
          <div className="quote-icon">"</div>
          <p className="testimonial-text">
            We went from guessing why deals were dying to knowing exactly which objections to train on.
            The time savings alone paid for CloserMetrix in the first week.
          </p>
          <div className="testimonial-author">
            <motion.div
              className="author-avatar"
              whileHover={{ scale: 1.1 }}
            >
              JM
            </motion.div>
            <div className="author-info">
              <span className="author-name">Sales Director</span>
              <span className="author-title">High-Ticket Coaching Company</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

export default HowItWorks
