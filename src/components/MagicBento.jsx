import { useRef, useState } from 'react'
import { motion } from 'framer-motion'

const MagicBento = ({ items, className = '' }) => {
  return (
    <div
      className={`magic-bento-grid ${className}`}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gridTemplateRows: 'repeat(2, minmax(200px, auto))',
        gap: '16px',
        width: '100%',
      }}
    >
      {items.map((item, index) => (
        <BentoCard key={index} item={item} index={index} />
      ))}
    </div>
  )
}

const BentoCard = ({ item, index }) => {
  const cardRef = useRef(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [isHovering, setIsHovering] = useState(false)

  const handleMouseMove = (e) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  // Grid span configurations for bento layout
  const getSpan = (idx) => {
    const spans = [
      { gridColumn: 'span 2', gridRow: 'span 2' }, // Large square
      { gridColumn: 'span 1', gridRow: 'span 1' }, // Small
      { gridColumn: 'span 1', gridRow: 'span 1' }, // Small
      { gridColumn: 'span 2', gridRow: 'span 1' }, // Wide
      { gridColumn: 'span 1', gridRow: 'span 1' }, // Small
      { gridColumn: 'span 1', gridRow: 'span 1' }, // Small
    ]
    return spans[idx % spans.length]
  }

  return (
    <motion.div
      ref={cardRef}
      className="bento-card"
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1 }}
      whileHover={{ y: -5 }}
      style={{
        ...getSpan(index),
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '20px',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: 'pointer',
      }}
    >
      {/* Spotlight effect */}
      <motion.div
        animate={{
          opacity: isHovering ? 1 : 0,
          background: `radial-gradient(400px circle at ${mousePos.x}px ${mousePos.y}px, rgba(0, 255, 136, 0.1), transparent 40%)`,
        }}
        transition={{ duration: 0.2 }}
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

      {/* Border gradient on hover */}
      <motion.div
        animate={{ opacity: isHovering ? 1 : 0 }}
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

      <div style={{ position: 'relative', zIndex: 3 }}>
        {item.icon && (
          <div
            className="bento-icon"
            style={{
              width: '48px',
              height: '48px',
              background: 'rgba(0, 255, 136, 0.1)',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
              color: 'var(--aurora-green)',
              fontSize: '1.5rem',
            }}
          >
            {item.icon}
          </div>
        )}
        <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>{item.title}</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>
          {item.description}
        </p>
      </div>

      {item.visual && (
        <div className="bento-visual" style={{ marginTop: '16px' }}>
          {item.visual}
        </div>
      )}
    </motion.div>
  )
}

export default MagicBento
