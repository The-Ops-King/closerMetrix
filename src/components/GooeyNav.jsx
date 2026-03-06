import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'

const GooeyNav = ({ items, className = '' }) => {
  const navigate = useNavigate()
  const location = useLocation()

  const getActiveIndex = () => {
    const idx = items.findIndex((item) =>
      item.isRoute
        ? location.pathname === item.href
        : location.pathname === '/' && location.hash === item.href
    )
    return idx >= 0 ? idx : location.pathname === '/' ? 0 : -1
  }

  const [activeIndex, setActiveIndex] = useState(getActiveIndex)
  const [hoverIndex, setHoverIndex] = useState(null)
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })
  const navRef = useRef(null)
  const itemRefs = useRef([])

  useEffect(() => {
    setActiveIndex(getActiveIndex())
  }, [location.pathname, location.hash])

  useEffect(() => {
    const currentIndex = hoverIndex !== null ? hoverIndex : activeIndex
    const currentItem = itemRefs.current[currentIndex]
    if (currentItem && navRef.current) {
      const navRect = navRef.current.getBoundingClientRect()
      const itemRect = currentItem.getBoundingClientRect()
      setIndicatorStyle({
        left: itemRect.left - navRect.left,
        width: itemRect.width,
      })
    }
  }, [activeIndex, hoverIndex])

  const handleClick = (e, item, index) => {
    e.preventDefault()
    setActiveIndex(index)

    if (item.isRoute) {
      navigate(item.href)
    } else if (location.pathname !== '/') {
      navigate('/' + item.href)
    } else {
      const target = document.querySelector(item.href)
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' })
      }
    }
  }

  return (
    <nav
      ref={navRef}
      className={`gooey-nav ${className}`}
      style={{
        position: 'relative',
        display: 'inline-flex',
        gap: '4px',
        padding: '6px',
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
      }}
    >
      {/* Gooey blob indicator */}
      <motion.div
        className="gooey-indicator"
        layoutId="gooey-blob"
        animate={{
          left: indicatorStyle.left,
          width: indicatorStyle.width,
          opacity: activeIndex >= 0 || hoverIndex !== null ? 1 : 0,
        }}
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 30,
        }}
        style={{
          position: 'absolute',
          top: '6px',
          bottom: '6px',
          background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.3) 0%, rgba(0, 212, 255, 0.3) 100%)',
          borderRadius: '12px',
          zIndex: 0,
        }}
      />

      {/* Glow effect */}
      <motion.div
        className="gooey-glow"
        animate={{
          left: indicatorStyle.left + indicatorStyle.width / 2 - 30,
          opacity: hoverIndex !== null ? 1 : 0.5,
        }}
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 30,
        }}
        style={{
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '60px',
          height: '60px',
          background: 'rgba(0, 255, 136, 0.4)',
          borderRadius: '50%',
          filter: 'blur(20px)',
          zIndex: -1,
          pointerEvents: 'none',
        }}
      />

      {items.map((item, index) => (
        <motion.a
          key={item.href + item.label}
          ref={(el) => (itemRefs.current[index] = el)}
          href={item.href}
          onClick={(e) => handleClick(e, item, index)}
          onMouseEnter={() => setHoverIndex(index)}
          onMouseLeave={() => setHoverIndex(null)}
          whileTap={{ scale: 0.95 }}
          style={{
            position: 'relative',
            zIndex: 1,
            padding: '10px 16px',
            fontSize: '0.9rem',
            fontWeight: 500,
            color: activeIndex === index ? 'var(--aurora-green)' : 'var(--text-secondary)',
            textDecoration: 'none',
            borderRadius: '12px',
            transition: 'color 0.2s ease',
          }}
        >
          {item.label}
        </motion.a>
      ))}

      {/* SVG filter for gooey effect */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <filter id="gooey">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
              result="gooey"
            />
          </filter>
        </defs>
      </svg>
    </nav>
  )
}

export default GooeyNav
