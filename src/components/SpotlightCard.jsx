import { useRef, useState } from 'react'
import { motion } from 'framer-motion'

const SpotlightCard = ({
  children,
  className = '',
  spotlightColor = 'rgba(0, 255, 136, 0.15)',
  borderColor = 'rgba(255, 255, 255, 0.1)',
}) => {
  const cardRef = useRef(null)
  const [spotlightPos, setSpotlightPos] = useState({ x: 0, y: 0 })
  const [isHovering, setIsHovering] = useState(false)

  const handleMouseMove = (e) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    setSpotlightPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  return (
    <motion.div
      ref={cardRef}
      className={`spotlight-card ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      whileHover={{ y: -5 }}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
        border: `1px solid ${borderColor}`,
        borderRadius: '20px',
        backdropFilter: 'blur(10px)',
      }}
    >
      {/* Spotlight effect */}
      <motion.div
        className="spotlight"
        animate={{
          opacity: isHovering ? 1 : 0,
          background: `radial-gradient(600px circle at ${spotlightPos.x}px ${spotlightPos.y}px, ${spotlightColor}, transparent 40%)`,
        }}
        transition={{ duration: 0.15 }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* Border glow on hover */}
      <motion.div
        className="border-glow"
        animate={{
          opacity: isHovering ? 1 : 0,
        }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: '20px',
          border: '1px solid rgba(0, 255, 136, 0.3)',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />

      <div style={{ position: 'relative', zIndex: 3 }}>{children}</div>
    </motion.div>
  )
}

export default SpotlightCard
