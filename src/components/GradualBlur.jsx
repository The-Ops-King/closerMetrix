import { motion } from 'framer-motion'

const GradualBlur = ({
  children,
  direction = 'top', // 'top', 'bottom', 'left', 'right'
  intensity = 8,
  className = '',
}) => {
  const getGradientDirection = () => {
    switch (direction) {
      case 'top': return 'to bottom'
      case 'bottom': return 'to top'
      case 'left': return 'to right'
      case 'right': return 'to left'
      default: return 'to bottom'
    }
  }

  // Create multiple blur layers for gradual effect
  const layers = Array.from({ length: intensity }, (_, i) => ({
    blur: i + 1,
    opacity: (i + 1) / intensity,
  }))

  return (
    <div className={`gradual-blur-container ${className}`} style={{ position: 'relative' }}>
      {children}

      <div className="gradual-blur-overlay" style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: 5,
      }}>
        {layers.map((layer, index) => (
          <div
            key={index}
            style={{
              position: 'absolute',
              top: direction === 'bottom' ? `${(index / intensity) * 100}%` : 0,
              bottom: direction === 'top' ? `${(index / intensity) * 100}%` : 0,
              left: direction === 'right' ? `${(index / intensity) * 100}%` : 0,
              right: direction === 'left' ? `${(index / intensity) * 100}%` : 0,
              width: direction === 'left' || direction === 'right' ? `${100 / intensity}%` : '100%',
              height: direction === 'top' || direction === 'bottom' ? `${100 / intensity}%` : '100%',
              backdropFilter: `blur(${layer.blur}px)`,
              WebkitBackdropFilter: `blur(${layer.blur}px)`,
              maskImage: `linear-gradient(${getGradientDirection()}, transparent, black)`,
              WebkitMaskImage: `linear-gradient(${getGradientDirection()}, transparent, black)`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

// Text reveal with gradual blur animation
export const GradualBlurText = ({ text, className = '', delay = 0 }) => {
  const words = text.split(' ')

  return (
    <span className={`gradual-blur-text ${className}`}>
      {words.map((word, index) => (
        <motion.span
          key={index}
          initial={{ opacity: 0, filter: 'blur(10px)' }}
          whileInView={{ opacity: 1, filter: 'blur(0px)' }}
          viewport={{ once: true }}
          transition={{
            duration: 0.5,
            delay: delay + index * 0.1,
            ease: 'easeOut',
          }}
          style={{ display: 'inline-block', marginRight: '0.3em' }}
        >
          {word}
        </motion.span>
      ))}
    </span>
  )
}

export default GradualBlur
