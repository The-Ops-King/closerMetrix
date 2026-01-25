import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Aurora from './components/Aurora'
import ChromaGrid from './components/ChromaGrid'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Features from './components/Features'
import HowItWorks from './components/HowItWorks'
import Pricing from './components/Pricing'
import CTA from './components/CTA'
import Footer from './components/Footer'
import GlowingCursor from './components/GlowingCursor'

function App() {
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    setIsLoaded(true)
  }, [])

  return (
    <div className="app">
      <Aurora />
      <GlowingCursor />

      <AnimatePresence>
        {isLoaded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <Navbar />
            <main>
              <Hero />
              <ChromaGrid />
              <Features />
              <HowItWorks />
              <Pricing />
              <CTA />
            </main>
            <Footer />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default App
