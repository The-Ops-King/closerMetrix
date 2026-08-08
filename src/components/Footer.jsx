import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'

const footerLinks = {
  Product: [
    { name: 'Features', href: '#features' },
    { name: 'Pricing', href: '/pricing', isRoute: true },
    { name: 'How It Works', href: '#how-it-works' },
  ],
  Company: [
    { name: 'About', href: '#' },
    { name: 'Blog', href: '#' },
    { name: 'Careers', href: '#' },
  ],
  Legal: [
    { name: 'Privacy Policy', href: '#' },
    { name: 'Terms of Service', href: '#' },
  ],
}

const Footer = () => {
  const navigate = useNavigate()
  const location = useLocation()

  const handleLinkClick = (e, link) => {
    e.preventDefault()
    if (link.isRoute) {
      navigate(link.href)
    } else if (link.href === '#') {
      return
    } else if (location.pathname !== '/') {
      navigate('/' + link.href)
    } else {
      const target = document.querySelector(link.href)
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' })
      }
    }
  }

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-content">
          <motion.div
            className="footer-brand"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <a
              href="/"
              className="logo"
              onClick={(e) => {
                e.preventDefault()
                navigate('/')
              }}
            >
              <img src="/logo-full.png" alt="CloserMetrix" className="logo-img-full" />
            </a>
            <p>Sales intelligence for high-ticket teams.</p>
          </motion.div>

          <div className="footer-links">
            {Object.entries(footerLinks).map(([category, links], categoryIndex) => (
              <motion.div
                key={category}
                className="footer-column"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: categoryIndex * 0.1 }}
              >
                <h4>{category}</h4>
                {links.map((link) => (
                  <motion.a
                    key={link.name}
                    href={link.href}
                    onClick={(e) => handleLinkClick(e, link)}
                    whileHover={{ x: 5, color: '#00ff88' }}
                  >
                    {link.name}
                  </motion.a>
                ))}
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div
          className="footer-bottom"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <p>&copy; {new Date().getFullYear()} CloserMetrix. All rights reserved.</p>
        </motion.div>
      </div>
    </footer>
  )
}

export default Footer
