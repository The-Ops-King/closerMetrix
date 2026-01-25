import { motion } from 'framer-motion'

const StarBorder = ({
  children,
  className = '',
  color = '#00ff88',
  speed = 6,
  borderRadius = '16px'
}) => {
  return (
    <div
      className={`star-border-wrapper ${className}`}
      style={{
        position: 'relative',
        borderRadius,
        padding: '2px',
        background: 'transparent',
        overflow: 'hidden',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Animated border */}
      <motion.div
        className="star-border-animation"
        style={{
          position: 'absolute',
          top: '-50%',
          left: '-50%',
          width: '200%',
          height: '200%',
          background: `conic-gradient(from 0deg, transparent 0deg, ${color} 60deg, transparent 120deg)`,
          opacity: 0.8,
        }}
        animate={{ rotate: 360 }}
        transition={{
          duration: speed,
          repeat: Infinity,
          ease: 'linear',
        }}
      />

      {/* Inner content container */}
      <div
        className="star-border-content"
        style={{
          position: 'relative',
          background: 'rgba(2, 6, 23, 0.9)',
          borderRadius: `calc(${borderRadius} - 2px)`,
          zIndex: 1,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </div>
    </div>
  )
}

export default StarBorder
