import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'

// Every link here must resolve. About/Blog/Careers were removed rather than
// left pointing at '#'.
const footerLinks = {
  Product: [
    { name: 'What You Get', href: '#what-you-get' },
    { name: 'Pricing', href: '#pricing' },
    /* Trailing slash required — /preview is a static page outside the SPA
       and the bare path matches no route, so it rendered nothing. */
    { name: 'Sample Integrity Audit', href: '/preview/', isExternal: true },
  ],
  Legal: [
    { name: 'Privacy Policy', href: '/privacy', isRoute: true },
    { name: 'Terms of Service', href: '/terms', isRoute: true },
    { name: 'Data Handling', href: '/data-handling', isRoute: true },
  ],
}

/*
 * Prerendered pages skip the entrance animation. framer-motion writes its
 * `initial` state to inline styles, and static HTML shipping opacity:0 links
 * is text a crawler can treat as hidden. Client rendering is unchanged.
 */
const reveal = (props) => (import.meta.env.SSR ? {} : props)

const Footer = () => {
  const navigate = useNavigate()
  const location = useLocation()

  const handleLinkClick = (e, link) => {
    // /preview is a static page outside the SPA — let the browser navigate.
    if (link.isExternal) return
    e.preventDefault()
    if (link.isRoute) {
      navigate(link.href)
      window.scrollTo(0, 0)
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
            {...reveal({
              initial: { opacity: 0, y: 20 },
              whileInView: { opacity: 1, y: 0 },
              viewport: { once: true },
            })}
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
            <p>You bought a recorder. You needed a reader.</p>
          </motion.div>

          <div className="footer-links">
            {Object.entries(footerLinks).map(([category, links], categoryIndex) => (
              <motion.div
                key={category}
                className="footer-column"
                {...reveal({
                  initial: { opacity: 0, y: 20 },
                  whileInView: { opacity: 1, y: 0 },
                  viewport: { once: true },
                  transition: { delay: categoryIndex * 0.1 },
                })}
              >
                <h3>{category}</h3>
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
          {...reveal({
            initial: { opacity: 0 },
            whileInView: { opacity: 1 },
            viewport: { once: true },
          })}
        >
          <p>&copy; {new Date().getFullYear()} CloserMetrix. All rights reserved.</p>
        </motion.div>
      </div>
    </footer>
  )
}

export default Footer
