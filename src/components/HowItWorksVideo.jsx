import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import StarBorder from './StarBorder'

const HowItWorksVideo = () => {
  return (
    <div className="video-page">
      <motion.div
        className="video-page-nav"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Link to="/" className="btn btn-outline video-back-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back
        </Link>
        <Link to="/" className="logo">
          <span className="logo-icon">◆</span>
          <span className="logo-text">CloserMetrix</span>
        </Link>
        <div className="video-nav-spacer" />
      </motion.div>

      <div className="video-page-content">
        <motion.h1
          className="gradient-text"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          Here's How It Works
        </motion.h1>

        <motion.div
          className="video-container"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <iframe
            src="https://www.youtube.com/embed/dQw4w9WgXcQ"
            title="How CloserMetrix Works"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </motion.div>

        <motion.div
          className="video-cta"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <StarBorder borderRadius="12px">
            <a
              href="https://calendar.app.google/FBHCJbBbxhR1YP9V6"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary video-cta-btn"
            >
              Let's Talk
            </a>
          </StarBorder>
        </motion.div>
      </div>
    </div>
  )
}

export default HowItWorksVideo
