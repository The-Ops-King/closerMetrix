import { motion } from 'framer-motion'

const LogoLoop = ({ items, speed = 30, direction = 'left' }) => {
  // Duplicate items for seamless loop
  const duplicatedItems = [...items, ...items]

  return (
    <div className="logo-loop-container" style={{
      overflow: 'hidden',
      width: '100%',
      padding: '40px 0',
      position: 'relative',
    }}>
      {/* Fade edges */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '150px',
        height: '100%',
        background: 'linear-gradient(to right, rgba(2, 6, 23, 1), transparent)',
        zIndex: 10,
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: '150px',
        height: '100%',
        background: 'linear-gradient(to left, rgba(2, 6, 23, 1), transparent)',
        zIndex: 10,
        pointerEvents: 'none',
      }} />

      <motion.div
        className="logo-loop-track"
        animate={{
          x: direction === 'left' ? [0, '-50%'] : ['-50%', 0],
        }}
        transition={{
          x: {
            duration: speed,
            repeat: Infinity,
            ease: 'linear',
          },
        }}
        style={{
          display: 'flex',
          gap: '60px',
          width: 'fit-content',
        }}
      >
        {duplicatedItems.map((item, index) => (
          <div
            key={index}
            className="logo-loop-item"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px 32px',
              background: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              whiteSpace: 'nowrap',
              color: 'var(--text-secondary)',
              fontSize: '1rem',
              fontWeight: 500,
            }}
          >
            {item.icon && <span style={{ fontSize: '1.5rem' }}>{item.icon}</span>}
            {item.text}
          </div>
        ))}
      </motion.div>
    </div>
  )
}

export default LogoLoop
