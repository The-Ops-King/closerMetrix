import { motion } from 'framer-motion'

const plans = [
  {
    name: 'Minimum',
    description: 'Essential metrics for growing teams',
    features: [
      'Core show/close rates',
      'Objection tracking',
      'Team-wide dashboards',
      'Basic integrations',
    ],
    cta: 'Get Started',
    featured: false,
  },
  {
    name: 'Insight',
    description: 'Deep analytics for scaling teams',
    features: [
      'Everything in Minimum',
      'Per-closer analysis',
      'AI coaching recommendations',
      'Trend detection',
      'Priority support',
    ],
    cta: 'Get Started',
    featured: true,
    badge: 'Most Popular',
  },
  {
    name: 'Executive',
    description: 'Strategic intelligence for leaders',
    features: [
      'Everything in Insight',
      'Strategic dashboards',
      'Risk forecasting',
      'Compliance monitoring',
      'Dedicated success manager',
    ],
    cta: 'Contact Sales',
    featured: false,
  },
]

const Pricing = () => {
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
          <h2>Choose Your Level of <span className="gradient-text">Intelligence</span></h2>
          <p>Start with the essentials. Scale as you grow.</p>
        </motion.div>

        <div className="pricing-grid">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              className={`pricing-card ${plan.featured ? 'featured' : ''}`}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{
                y: -10,
                boxShadow: plan.featured
                  ? '0 30px 100px rgba(0, 255, 136, 0.3)'
                  : '0 20px 60px rgba(0, 0, 0, 0.3)',
              }}
            >
              {plan.badge && (
                <motion.span
                  className="pricing-badge"
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3, type: 'spring' }}
                >
                  {plan.badge}
                </motion.span>
              )}
              <div className="pricing-header">
                <h3>{plan.name}</h3>
                <p className="pricing-desc">{plan.description}</p>
              </div>
              <ul className="pricing-features">
                {plan.features.map((feature, i) => (
                  <motion.li
                    key={feature}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 + i * 0.05 }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 13l4 4L19 7"/>
                    </svg>
                    {feature}
                  </motion.li>
                ))}
              </ul>
              <motion.a
                href="#cta"
                className={`btn ${plan.featured ? 'btn-primary' : 'btn-outline'}`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {plan.cta}
              </motion.a>
              {plan.featured && <div className="card-glow" />}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Pricing
