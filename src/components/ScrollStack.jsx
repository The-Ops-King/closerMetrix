import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'

const ScrollStack = ({ children, className = '' }) => {
  const containerRef = useRef(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  })

  return (
    <div
      ref={containerRef}
      className={`scroll-stack-container ${className}`}
      style={{
        position: 'relative',
        height: `${children.length * 100}vh`,
      }}
    >
      <div
        className="scroll-stack-sticky"
        style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {children.map((child, index) => (
          <ScrollStackCard
            key={index}
            index={index}
            total={children.length}
            scrollYProgress={scrollYProgress}
          >
            {child}
          </ScrollStackCard>
        ))}
      </div>
    </div>
  )
}

const ScrollStackCard = ({ children, index, total, scrollYProgress }) => {
  const cardProgress = useTransform(
    scrollYProgress,
    [index / total, (index + 1) / total],
    [0, 1]
  )

  const y = useTransform(cardProgress, [0, 1], ['100%', '0%'])
  const scale = useTransform(
    scrollYProgress,
    [index / total, (index + 0.5) / total, (index + 1) / total],
    [0.9, 1, 0.95]
  )
  const opacity = useTransform(
    scrollYProgress,
    [(index - 0.5) / total, index / total, (index + 0.8) / total, (index + 1) / total],
    [0, 1, 1, 0.3]
  )

  return (
    <motion.div
      className="scroll-stack-card"
      style={{
        position: 'absolute',
        width: '100%',
        maxWidth: '900px',
        padding: '0 24px',
        y: index === 0 ? 0 : y,
        scale,
        opacity: index === 0 ? 1 : opacity,
        zIndex: total - index,
      }}
    >
      {children}
    </motion.div>
  )
}

export default ScrollStack
