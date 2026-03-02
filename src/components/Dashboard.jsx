import { motion } from 'framer-motion'

const Dashboard = () => {
  const chartBars = [60, 80, 45, 90, 70, 85, 55]

  return (
    <motion.div
      className="dashboard-preview"
      whileHover={{ y: -5 }}
      transition={{ duration: 0.3 }}
    >
      <div className="dashboard-header">
        <div className="dashboard-dots">
          <span style={{ background: '#ff5f57' }}></span>
          <span style={{ background: '#febc2e' }}></span>
          <span style={{ background: '#28c840' }}></span>
        </div>
        <span className="dashboard-title">Performance Dashboard</span>
      </div>

      <div className="dashboard-content">
        <MetricCard
          label="Close Rate"
          value="34.7%"
          change="+5.2%"
          positive
          delay={0.2}
        />
        <MetricCard
          label="Show Rate"
          value="78.3%"
          change="+2.1%"
          positive
          delay={0.3}
        />
        <MetricCard
          label="Avg Call"
          value="42m"
          change="-1m"
          delay={0.4}
        />

        <motion.div
          className="chart-container"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {chartBars.map((height, index) => (
            <motion.div
              key={index}
              className="chart-bar"
              initial={{ height: 0 }}
              animate={{ height: `${height}%` }}
              transition={{
                delay: 0.6 + index * 0.1,
                duration: 0.8,
                ease: 'easeOut',
              }}
            />
          ))}
        </motion.div>

        <motion.div
          className="dashboard-row"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2 }}
        >
          <div className="mini-stat">
            <span className="mini-label">Top Objection</span>
            <span className="mini-value">Price Concern</span>
          </div>
          <div className="mini-stat">
            <span className="mini-label">Calls Today</span>
            <span className="mini-value">24</span>
          </div>
        </motion.div>
      </div>

      <div className="dashboard-glow" />
    </motion.div>
  )
}

const MetricCard = ({ label, value, change, positive, delay }) => (
  <motion.div
    className="metric-card"
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ delay, duration: 0.4 }}
    whileHover={{ scale: 1.05, borderColor: 'rgba(0, 255, 136, 0.3)' }}
  >
    <span className="metric-label">{label}</span>
    <span className="metric-value">{value}</span>
    <span className={`metric-change ${positive ? 'positive' : ''}`}>{change}</span>
  </motion.div>
)

export default Dashboard
