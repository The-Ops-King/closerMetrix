import { motion } from 'framer-motion'
import SpotlightCard from './SpotlightCard'

const audiences = [
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />
      </svg>
    ),
    title: 'Owners',
    description: 'Make better business decisions with real sales data.',
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    title: 'Sales Managers',
    description: 'Know exactly what happened without reviewing every call.',
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M11 5.882V19.24a1 1 0 01-1.447.894L5 17.882V7.118l4.553-2.276A1 1 0 0111 5.882zM5 7.118H3a2 2 0 00-2 2v6a2 2 0 002 2h2M15 8a5 5 0 010 8M18.5 5a9 9 0 010 14" />
      </svg>
    ),
    title: 'Marketing',
    description: 'See what buyers actually say, what objections they have, and what messaging resonates.',
  },
]

const WhoItsFor = () => {
  return (
    <section id="who-its-for" className="who-section">
      <div className="container">
        <motion.div
          className="section-header"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <span className="badge cyan">Who It's For</span>
          <h2>One System. <span className="gradient-text">Three Blind Spots Closed.</span></h2>
        </motion.div>

        <div className="who-grid">
          {audiences.map((item, index) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <SpotlightCard className="feature-card-inner">
                <div className="feature-card-content">
                  <motion.div
                    className="feature-icon"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    {item.icon}
                  </motion.div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
              </SpotlightCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default WhoItsFor
