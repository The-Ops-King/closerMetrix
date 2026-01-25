import { motion } from 'framer-motion'

const ShapeBlur = ({
  className = '',
  color1 = '#00ff88',
  color2 = '#00d4ff',
  color3 = '#6366f1',
  blur = 80,
  opacity = 0.3,
  animate = true,
}) => {
  const shapes = [
    {
      color: color1,
      size: 400,
      top: '10%',
      left: '20%',
      animationDelay: 0,
    },
    {
      color: color2,
      size: 350,
      top: '30%',
      right: '15%',
      animationDelay: 2,
    },
    {
      color: color3,
      size: 300,
      bottom: '20%',
      left: '30%',
      animationDelay: 4,
    },
  ]

  return (
    <div
      className={`shape-blur-container ${className}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      {shapes.map((shape, index) => (
        <motion.div
          key={index}
          className="blur-shape"
          initial={{
            scale: 1,
            x: 0,
            y: 0,
          }}
          animate={animate ? {
            scale: [1, 1.2, 1],
            x: [0, 30, -20, 0],
            y: [0, -20, 30, 0],
          } : {}}
          transition={{
            duration: 15,
            repeat: Infinity,
            delay: shape.animationDelay,
            ease: 'easeInOut',
          }}
          style={{
            position: 'absolute',
            width: shape.size,
            height: shape.size,
            borderRadius: '50%',
            background: shape.color,
            filter: `blur(${blur}px)`,
            opacity,
            top: shape.top,
            left: shape.left,
            right: shape.right,
            bottom: shape.bottom,
          }}
        />
      ))}
    </div>
  )
}

export default ShapeBlur
