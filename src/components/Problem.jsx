import { motion } from 'framer-motion'

const measured = [
  { label: 'Marketing', state: 'Measured' },
  { label: 'Finance', state: 'Measured' },
  { label: 'Operations', state: 'Measured' },
  { label: 'Sales Calls', state: 'Black Box', dark: true },
]

const Problem = () => {
  return (
    <section id="problem" className="problem-section">
      <div className="container">
        <motion.div
          className="section-header"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <span className="badge">The Problem</span>
          <h2>Stop Making Expensive Decisions With <span className="gradient-text">Incomplete Information</span></h2>
        </motion.div>

        <div className="problem-cards">
          {measured.map((item, index) => (
            <motion.div
              key={item.label}
              className={`problem-card ${item.dark ? 'blind' : ''}`}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <span className="problem-card-label">{item.label}</span>
              <span className="problem-card-state">{item.state}</span>
            </motion.div>
          ))}
        </div>

        <motion.p
          className="problem-closer"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          The conversations that actually create revenue are still mostly a black box.
          So owners and managers make expensive decisions using incomplete or inaccurate sales data.
        </motion.p>
      </div>
    </section>
  )
}

export default Problem
