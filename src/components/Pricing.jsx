import { motion } from 'framer-motion'
import StarBorder from './StarBorder'
import SpotlightCard from './SpotlightCard'

const plans = [
  {
    name: 'Essential',
    description: 'Baseline metrics for growing teams',
    features: [
      'Business-wide show & close rates',
      'Full call volume & outcome tracking',
      'Objection frequency & trends (team-level)',
      'Sales cycle insights (calls & days to close)',
      'Automatic call analysis (no manual input)',
    ],
    cta: 'Book a Demo',
    featured: false,
  },
  {
    name: 'Insight',
    description: 'Deep analytics for scaling teams',
    features: [
      'Everything in Essential',
      'Per-closer performance breakdowns',
      'Objection handling by closer',
      'Trend detection across calls & time',
      'Weekly-generated coaching plans',
      'Learn what prospects say they want and need',
      'Daily, weekly, and monthly performance updates',
      'Extra visibility into new closer performance',

    ],
    cta: 'Book a Demo',
    featured: true,
    badge: 'Most Popular',
  },
  {
    name: 'Executive',
    description: 'Strategic intelligence for leaders',
    features: [
      'Everything in Insight',
      'Compliance & risk monitoring (FTC / SEC)',
      'Script adherence & risk flags',
      'Upload your own script to track adherence',
      'Executive-level dashboards',
    ],
    cta: 'Get Started',
    featured: false,
  },
]

const PricingCard = ({ plan, index }) => {
  const cardContent = (
    <SpotlightCard
      className="pricing-card-inner"
      spotlightColor={plan.featured ? 'rgba(0, 255, 136, 0.2)' : 'rgba(0, 212, 255, 0.15)'}
    >
      <div className="pricing-card-content">
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
          href="https://calendar.app.google/FBHCJbBbxhR1YP9V6"
          target="_blank"
          rel="noopener noreferrer"
          className={`btn ${plan.featured ? 'btn-primary' : 'btn-outline'}`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {plan.cta}
        </motion.a>
      </div>
    </SpotlightCard>
  )

  return (
    <motion.div
      className={`pricing-card-wrapper ${plan.featured ? 'featured' : ''}`}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
    >
      {plan.featured ? (
        <StarBorder color="#00ff88" speed={6} borderRadius="24px">
          {cardContent}
        </StarBorder>
      ) : (
        cardContent
      )}
    </motion.div>
  )
}

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
            <PricingCard key={plan.name} plan={plan} index={index} />
          ))}
        </div>
      </div>
    </section>
  )
}

export default Pricing
