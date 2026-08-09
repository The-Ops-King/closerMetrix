import { useState, useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import Aurora from './components/Aurora'
import ShapeBlur from './components/ShapeBlur'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import FAQ from './components/FAQ'
import DemoModal from './components/DemoModal'
import HomePage from './HomePage'
import PrivacyPage from './pages/PrivacyPage'
import TermsPage from './pages/TermsPage'
import DataHandlingPage from './pages/DataHandlingPage'
import { DemoModalProvider } from './hooks/useDemoModal'

/*
 * The pre-Aug-2026 homepage lived at /v1 as a rollback target, alongside a
 * /how-it-works page that still published the retired tier pricing. Both are
 * gone, with the fourteen components and ~21 kB of CSS that only they used.
 * Git history is the rollback target now.
 */

function FAQPage() {
  return <FAQ />
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function App() {
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    setIsLoaded(true)
  }, [])

  return (
    <DemoModalProvider>
      <div className="app">
        <Aurora />
        <ShapeBlur
          color1="#00ff88"
          color2="#00d4ff"
          color3="#6366f1"
          blur={100}
          opacity={0.2}
        />

        <AnimatePresence>
          {isLoaded && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <a className="skip-link" href="#main">
                Skip to content
              </a>
              <ScrollToTop />
              <Navbar />
              <main id="main">
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/faq" element={<FAQPage />} />
                  <Route path="/privacy" element={<PrivacyPage />} />
                  <Route path="/terms" element={<TermsPage />} />
                  <Route path="/data-handling" element={<DataHandlingPage />} />
                </Routes>
              </main>
              <Footer />
            </motion.div>
          )}
        </AnimatePresence>

        <DemoModal />
      </div>
    </DemoModalProvider>
  )
}

export default App
