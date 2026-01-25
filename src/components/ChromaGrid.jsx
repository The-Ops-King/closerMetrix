import { useRef, useEffect, useState } from 'react'
import { motion } from 'framer-motion'

const ChromaGrid = () => {
  const gridRef = useRef(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [isHovering, setIsHovering] = useState(false)

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (gridRef.current) {
        const rect = gridRef.current.getBoundingClientRect()
        setMousePos({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        })
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  const gridItems = Array.from({ length: 64 }, (_, i) => i)

  return (
    <section className="chroma-section">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="section-header"
        >
          <span className="badge">The Problem</span>
          <h2>Making $100K+ Decisions Based on <span className="gradient-text">Feelings</span>, Not Data</h2>
          <p>Your sales team is flying blind. It's time to change that.</p>
        </motion.div>

        <div
          ref={gridRef}
          className="chroma-grid"
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
        >
          {gridItems.map((item, index) => {
            const row = Math.floor(index / 8)
            const col = index % 8
            const cellX = col * 80 + 40
            const cellY = row * 80 + 40
            const distance = Math.sqrt(
              Math.pow(mousePos.x - cellX, 2) + Math.pow(mousePos.y - cellY, 2)
            )
            const maxDistance = 200
            const intensity = isHovering ? Math.max(0, 1 - distance / maxDistance) : 0

            return (
              <motion.div
                key={item}
                className="chroma-cell"
                initial={{ opacity: 0, scale: 0 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{
                  duration: 0.4,
                  delay: index * 0.01,
                  ease: 'backOut',
                }}
                style={{
                  '--intensity': intensity,
                  '--hue': (index * 5 + mousePos.x * 0.1) % 360,
                }}
              />
            )
          })}

          <div className="chroma-content">
            <div className="problem-cards">
              <ProblemCard
                icon="⏱️"
                title="45+ min daily"
                description="Wasted on manual reporting instead of selling"
                delay={0}
              />
              <ProblemCard
                icon="🎯"
                title="Zero visibility"
                description="Into which objections are killing deals"
                delay={0.1}
              />
              <ProblemCard
                icon="🤔"
                title="Gut decisions"
                description="Coaching based on assumptions, not data"
                delay={0.2}
              />
              <ProblemCard
                icon="⚠️"
                title="Hidden risks"
                description="Compliance issues lurking in unreviewed calls"
                delay={0.3}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

const ProblemCard = ({ icon, title, description, delay }) => (
  <motion.div
    className="problem-card"
    initial={{ opacity: 0, x: -30 }}
    whileInView={{ opacity: 1, x: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.6, delay }}
    whileHover={{ scale: 1.02, x: 10 }}
  >
    <span className="problem-icon">{icon}</span>
    <div>
      <h4>{title}</h4>
      <p>{description}</p>
    </div>
  </motion.div>
)

export default ChromaGrid
