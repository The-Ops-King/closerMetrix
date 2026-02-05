import { motion } from 'framer-motion'
import StarBorder from './StarBorder'

const HowItWorksVideo = () => {
  return (
    <div className="video-page">
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
