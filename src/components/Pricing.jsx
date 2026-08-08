import { motion } from 'framer-motion'
import { useDemoModal } from '../hooks/useDemoModal'

const tiers = [
  { name: 'Basic', price: '$5,000', period: '/yr', foundersPrice: '$2,500', cta: 'Book a Demo', featured: false },
  { name: 'Insight', price: '+$75', period: '/closer /mo', foundersPrice: '+$50', cta: 'Book a Demo', featured: false },
  { name: 'Executive', price: '+$2,500', period: '/yr', foundersPrice: 'Free Upgrade', cta: 'Apply Now', featured: true },
]

const featureGroups = [
  {
    category: 'Revenue Visibility',
    features: [
      { name: 'Show rate, close rate & cash collected — automatically', basic: true, growth: true, enterprise: true },
      { name: 'See where deals die in your pipeline', basic: true, growth: true, enterprise: true },
      { name: 'Lost potential revenue — see dollars left on the table', basic: true, growth: true, enterprise: true },
    ],
  },
  {
    category: 'AI-Powered Insights',
    features: [
      { name: 'Nightly AI analysis with industry benchmarks', basic: '1 section', growth: '8 sections', enterprise: '10 sections' },
      { name: 'AI data analyst — ask any question about your sales data', basic: true, growth: true, enterprise: true },
    ],
  },
  {
    category: 'Closer-Level Accountability',
    features: [
      { name: 'Compare every closer side-by-side across every metric', basic: false, growth: true, enterprise: true },
      { name: "See each closer's strengths and blind spots", basic: false, growth: true, enterprise: true },
      { name: 'Know exactly which calls to review instead of guessing', basic: false, growth: true, enterprise: true },
    ],
  },
  {
    category: 'Objection Intelligence',
    features: [
      { name: 'Every objection tracked, categorized & timestamped', basic: false, growth: true, enterprise: true },
      { name: "See which objections are being overcome — and which aren't", basic: false, growth: true, enterprise: true },
      { name: 'Spot new objection patterns the moment they emerge', basic: false, growth: true, enterprise: true },
    ],
  },
  {
    category: 'Projections & Market Pulse',
    features: [
      { name: 'Revenue forecasting with goal pacing', basic: false, growth: true, enterprise: true },
      { name: '"What-if" sliders — see the impact of small improvements', basic: false, growth: true, enterprise: true },
      { name: 'AI-extracted prospect pain points & buying signals', basic: false, growth: true, enterprise: true },
    ],
  },
  {
    category: 'Compliance & Script Intelligence',
    features: [
      { name: 'FTC/SEC violation flags with full details & timestamps', basic: 'Count only', growth: 'Count only', enterprise: true },
      { name: 'Script adherence scoring across 8 phases of your process', basic: false, growth: false, enterprise: true },
      { name: 'Know which script sections actually correlate with wins', basic: false, growth: false, enterprise: true },
      { name: 'Audit-ready risk review table with recordings & transcripts', basic: false, growth: false, enterprise: true },
    ],
  },
]

const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--aurora-green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 13l4 4L19 7" />
  </svg>
)

const DashIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round">
    <path d="M5 12h14" />
  </svg>
)

const CellValue = ({ value }) => {
  if (value === true) return <CheckIcon />
  if (value === false) return <DashIcon />
  return <span className="pricing-table-text-value">{value}</span>
}

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
          <h2>Choose Your Level of <span className="gradient-text">Intelligence</span></h2>
          <p>Only those serious about growing their business make it to Executive.</p>
        </motion.div>

        <motion.p
          className="founders-banner"
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          50% off for the first 6 months — founders only, limited spots
        </motion.p>

        <motion.div
          className="pricing-table-wrapper"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="pricing-table-scroll">
            <table className="pricing-table">
              <thead>
                <tr>
                  <th className="pricing-table-feature-col" />
                  {tiers.map((tier) => (
                    <th key={tier.name} className={`pricing-table-tier-col ${tier.featured ? 'featured' : ''}`}>
                      <div className="pricing-table-tier-header">
                        {tier.badge && <span className="pricing-table-badge">{tier.badge}</span>}
                        <h3>{tier.name}</h3>
                        <div className="pricing-table-price">
                          <span className="pricing-table-amount strikethrough">{tier.price}</span>
                          {tier.period && <span className="pricing-table-period strikethrough">{tier.period}</span>}
                        </div>
                        <div className="pricing-table-founders">
                          <span className="founders-label">Founders</span>
                          <span className="founders-price">{tier.foundersPrice}</span>
                          {tier.foundersPrice !== 'Free Upgrade' && tier.period && <span className="founders-period">{tier.period}</span>}
                        </div>
                        <motion.button
                          onClick={openModal}
                          className={`btn ${tier.featured ? 'btn-primary' : 'btn-outline'} pricing-table-cta`}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          {tier.cta}
                        </motion.button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {featureGroups.map((group) => (
                  <>
                    <tr key={group.category} className="pricing-table-group-row">
                      <td className="pricing-table-group-label" colSpan={4}>
                        {group.category}
                      </td>
                    </tr>
                    {group.features.map((feature) => (
                      <tr key={feature.name} className="pricing-table-feature-row">
                        <td className="pricing-table-feature-name">{feature.name}</td>
                        <td className="pricing-table-cell"><CellValue value={feature.basic} /></td>
                        <td className="pricing-table-cell featured"><CellValue value={feature.growth} /></td>
                        <td className="pricing-table-cell"><CellValue value={feature.enterprise} /></td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

export default Pricing
