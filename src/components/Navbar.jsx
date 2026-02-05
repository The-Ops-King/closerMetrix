import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import GooeyNav from './GooeyNav'

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const navItems = [
    { label: 'Features', href: '#features' },
    { label: 'How It Works', href: '/how-it-works-video' },
    { label: 'Pricing', href: '#pricing' },
  ]

  return (
    <motion.nav
      className={`navbar ${isScrolled ? 'scrolled' : ''}`}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <div className="nav-container">
        <motion.a
          href="#"
          className="logo"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <span className="logo-icon">◆</span>
          <span className="logo-text">CloserMetrix</span>
        </motion.a>

        {/* Gooey Nav for desktop */}
        <div className="nav-gooey-wrapper">
          <GooeyNav items={navItems} />
        </div>

        <motion.a
          href="https://calendar.app.google/FBHCJbBbxhR1YP9V6"
          target="_blank"
          rel="noopener noreferrer"
          className="nav-cta"
          whileHover={{ scale: 1.05, boxShadow: '0 0 30px rgba(0, 255, 136, 0.5)' }}
          whileTap={{ scale: 0.95 }}
        >
          Get Started
        </motion.a>

        <button
          className="mobile-menu-toggle"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          <motion.span
            animate={{ rotate: isMobileMenuOpen ? 45 : 0, y: isMobileMenuOpen ? 7 : 0 }}
          />
          <motion.span
            animate={{ opacity: isMobileMenuOpen ? 0 : 1 }}
          />
          <motion.span
            animate={{ rotate: isMobileMenuOpen ? -45 : 0, y: isMobileMenuOpen ? -7 : 0 }}
          />
        </button>
      </div>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            className="mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            {navItems.map((item) => (
              <motion.a
                key={item.label}
                href={item.href}
                onClick={(e) => {
                  e.preventDefault()
                  setIsMobileMenuOpen(false)
                  if (item.href.startsWith('#')) {
                    const target = document.querySelector(item.href)
                    if (target) {
                      target.scrollIntoView({ behavior: 'smooth' })
                    }
                  } else {
                    navigate(item.href)
                  }
                }}
                whileHover={{ x: 10, color: '#00ff88' }}
              >
                {item.label}
              </motion.a>
            ))}
            <a href="https://calendar.app.google/FBHCJbBbxhR1YP9V6" target="_blank" rel="noopener noreferrer" className="mobile-cta" onClick={() => setIsMobileMenuOpen(false)}>
              Get Started
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  )
}

export default Navbar
