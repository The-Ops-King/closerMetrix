import { useRef, useState } from 'react'
import { motion } from 'framer-motion'

const GlareHover = ({ children, className = '', glareColor = 'rgba(0, 255, 136, 0.4)' }) => {
  const containerRef = useRef(null)
  const [glarePosition, setGlarePosition] = useState({ x: 50, y: 50 })
  const [isHovering, setIsHovering] = useState(false)

  const handleMouseMove = (e) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setGlarePosition({ x, y })
  }

  return (
    <motion.div
      ref={containerRef}
      className={`glare-hover-container ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      style={{ position: 'relative', overflow: 'hidden' }}
    >
      {children}
      <motion.div
        className="glare-effect"
        animate={{
          opacity: isHovering ? 1 : 0,
          background: `radial-gradient(circle at ${glarePosition.x}% ${glarePosition.y}%, ${glareColor} 0%, transparent 50%)`,
        }}
        transition={{ duration: 0.2 }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
          zIndex: 10,
        }}
      />
    </motion.div>
  )
}

export default GlareHover
