import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useDemoModal } from '../hooks/useDemoModal'

function useAnimatedNumber(target, duration = 600) {
  const [display, setDisplay] = useState(target)
  const rafRef = useRef(null)
  const startRef = useRef(target)
  const startTimeRef = useRef(null)

  useEffect(() => {
    startRef.current = display
    startTimeRef.current = null

    const animate = (timestamp) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp
      const elapsed = timestamp - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = Math.round(startRef.current + (target - startRef.current) * eased)
      setDisplay(current)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return display
}

const RevenueCalculator = () => {
  const { openModal } = useDemoModal()
  const [closers, setClosers] = useState(5)
  const [callsPerDay, setCallsPerDay] = useState(6)
  const [offerPrice, setOfferPrice] = useState(5000)
  const [showRate, setShowRate] = useState(60)
  const [closeRate, setCloseRate] = useState(20)
  const [extraCallsPerWeek, setExtraCallsPerWeek] = useState(2)
  const [closeRateBump, setCloseRateBump] = useState(2)

  const weeksPerMonth = 4.33
  const daysPerWeek = 5

  // Current numbers
  const callsPerMonth = closers * callsPerDay * daysPerWeek * weeksPerMonth
  const showsPerMonth = callsPerMonth * (showRate / 100)
  const closesPerMonth = showsPerMonth * (closeRate / 100)
  const currentRevenue = closesPerMonth * offerPrice

  // With CloserMetrix: adjustable extra calls/week and close rate bump
  const extraCallsPerMonth = closers * extraCallsPerWeek * weeksPerMonth
  const newCallsPerMonth = callsPerMonth + extraCallsPerMonth
  const newCloseRate = Math.min(closeRate + closeRateBump, 100)
  const newShowsPerMonth = newCallsPerMonth * (showRate / 100)
  const newClosesPerMonth = newShowsPerMonth * (newCloseRate / 100)
  const newRevenue = newClosesPerMonth * offerPrice

  const difference = newRevenue - currentRevenue

  const animatedCurrent = useAnimatedNumber(Math.round(currentRevenue))
  const animatedNew = useAnimatedNumber(Math.round(newRevenue))
  const animatedDiff = useAnimatedNumber(Math.round(difference))

  const formatMoney = (n) =>
    '$' + n.toLocaleString()

  return (
    <section className="calculator-section">
      <div className="container">
        <motion.div
          className="section-header"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <span className="badge">Calculator</span>
          <h2>How Much Are You <span className="gradient-text">Leaving on the Table?</span></h2>
          <p>Adjust the sliders to see what small improvements do to your bottom line.</p>
        </motion.div>

        <motion.div
          className="calculator-card"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="calculator-inputs">
            <div className="calc-field">
              <label>Closers</label>
              <input
                type="number"
                min="1"
                value={closers}
                onChange={(e) => setClosers(Math.max(1, +e.target.value))}
              />
            </div>
            <div className="calc-field">
              <label>Calls / Day / Closer</label>
              <input
                type="number"
                min="1"
                value={callsPerDay}
                onChange={(e) => setCallsPerDay(Math.max(1, +e.target.value))}
              />
            </div>
            <div className="calc-field">
              <label>Offer Price ($)</label>
              <input
                type="number"
                min="1"
                value={offerPrice}
                onChange={(e) => setOfferPrice(Math.max(1, +e.target.value))}
              />
            </div>
            <div className="calc-field">
              <label>Show Rate (%)</label>
              <input
                type="number"
                min="1"
                max="100"
                value={showRate}
                onChange={(e) => setShowRate(Math.min(100, Math.max(1, +e.target.value)))}
              />
            </div>
            <div className="calc-field">
              <label>Close Rate (%)</label>
              <input
                type="number"
                min="1"
                max="100"
                value={closeRate}
                onChange={(e) => setCloseRate(Math.min(100, Math.max(1, +e.target.value)))}
              />
            </div>
          </div>

          <div className="calculator-sliders">
            <div className="calc-slider-field">
              <label><span className="calc-label-purple">At Just</span> <strong>{extraCallsPerWeek}</strong> <span className="calc-label-purple">Extra Calls / Week / Closer,</span></label>
              <input
                type="range"
                min="1"
                max="5"
                value={extraCallsPerWeek}
                onChange={(e) => setExtraCallsPerWeek(+e.target.value)}
                className="calc-slider"
              />
              <div className="calc-slider-labels">
                <span>1</span>
                <span>2</span>
                <span>3</span>
                <span>4</span>
                <span>5</span>
              </div>
            </div>
            <div className="calc-slider-field">
              <label><span className="calc-label-purple">At Just</span> <strong>+{closeRateBump}%</strong> <span className="calc-label-purple">Close Rate Bump</span></label>
              <input
                type="range"
                min="1"
                max="5"
                value={closeRateBump}
                onChange={(e) => setCloseRateBump(+e.target.value)}
                className="calc-slider"
              />
              <div className="calc-slider-labels">
                <span>1%</span>
                <span>2%</span>
                <span>3%</span>
                <span>4%</span>
                <span>5%</span>
              </div>
            </div>
          </div>

          <div className="calculator-results">
            <div className="calc-result-row">
              <div className="calc-result current">
                <span className="calc-result-label">Current Monthly Revenue</span>
                <span className="calc-result-value">{formatMoney(animatedCurrent)}</span>
              </div>
              <div className="calc-result-arrow">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--aurora-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
              <div className="calc-result projected">
                <span className="calc-result-label">With CloserMetrix</span>
                <span className="calc-result-value glow">{formatMoney(animatedNew)}</span>
              </div>
            </div>
            <div className="calc-difference">
              <span className="calc-difference-label">You could be missing out on</span>
              <span className="calc-difference-value">{formatMoney(animatedDiff)}</span>
              <span className="calc-difference-period">/ month</span>
            </div>
            <p className="calc-explainer">
              By cutting admin time and automating call analysis, your closers get back <strong>{extraCallsPerWeek} more call{extraCallsPerWeek > 1 ? 's' : ''} per week each</strong>. Better data means better coaching — we model a <strong>{closeRateBump}% lift in close rate</strong>. That's what the numbers above reflect.
            </p>
          </div>

          <motion.div
            className="calc-cta"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <motion.button
              className="btn btn-primary"
              onClick={openModal}
              whileHover={{ scale: 1.05, boxShadow: '0 0 30px rgba(0, 255, 136, 0.5)' }}
              whileTap={{ scale: 0.95 }}
            >
              Book a Demo
            </motion.button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

export default RevenueCalculator
