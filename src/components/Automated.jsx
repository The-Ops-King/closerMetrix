import { motion } from 'framer-motion'

const Icon = ({ d }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

const items = [
  { label: 'CRM Updates', d: 'M4 7a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7zM4 10h16M9 14h6' },
  { label: 'Call Notes', d: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { label: 'Pain Points', d: 'M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z' },
  { label: 'Goals', d: 'M12 21a9 9 0 100-18 9 9 0 000 18zm0-4a5 5 0 100-10 5 5 0 000 10zm0-4a1 1 0 100-2 1 1 0 000 2z' },
  { label: 'Objections', d: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10zM12 8v3m0 3h.01' },
  { label: 'Next Steps', d: 'M5 12h14M12 5l7 7-7 7' },
  { label: 'Pipeline Updates', d: 'M3 5h18M6 12h12M10 19h4' },
  { label: 'Manager Notifications', d: 'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0' },
  { label: 'Weekly Reports', d: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z' },
  { label: 'Monthly Integrity Audit', d: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
]

const Automated = () => {
  return (
    <section id="automated" className="automated-section">
      <div className="container">
        <motion.div
          className="section-header"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <span className="badge">What Gets Automated</span>
          <h2>Nobody On Your Team <span className="gradient-text">Touches Any Of This</span></h2>
        </motion.div>

        <div className="automated-grid">
          {items.map((item, index) => (
            <motion.div
              key={item.label}
              className="automated-item"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: (index % 5) * 0.06 }}
            >
              <span className="automated-icon"><Icon d={item.d} /></span>
              <span className="automated-label">{item.label}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Automated
