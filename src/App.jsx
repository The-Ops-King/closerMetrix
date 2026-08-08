import { useState, useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import Aurora from './components/Aurora'
import ShapeBlur from './components/ShapeBlur'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import LogoLoop from './components/LogoLoop'
import Features from './components/Features'
import HowItWorks from './components/HowItWorks'
import Pricing from './components/Pricing'
import ZeroAdmin from './components/ZeroAdmin'
import RevenueCalculator from './components/RevenueCalculator'
import CTA from './components/CTA'
import Footer from './components/Footer'
import FAQ from './components/FAQ'
import DemoModal from './components/DemoModal'
import { DemoModalProvider } from './hooks/useDemoModal'

function HomePage({ logoItems }) {
  return (
    <>
      <Hero />

      {/* Logo Loop / Trust Bar */}
      <section className="logo-loop-section">
        <div className="container">
          <motion.p
            className="logo-loop-label"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            Powering insights for high-ticket sales teams
          </motion.p>
        </div>
        <LogoLoop items={logoItems} speed={35} />
      </section>

      <Features />

      <section className="every-call-section">
        <div className="container">
          <motion.div
            className="section-header"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <span className="badge">Why CloserMetrix</span>
            <h2>Every Call, Fully <span className="gradient-text">Analyzed</span></h2>
            <p>Your closers are already on the phone. We make sure no insight gets left behind.</p>
          </motion.div>

          <div className="every-call-cards">
            <motion.div
              className="every-call-card"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <div className="every-call-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <h3>Call Component Scoring</h3>
              <p>Every call is broken down into component parts — opening, discovery, pitch, objection handling, close — each judged and scored individually.</p>
            </motion.div>

            <motion.div
              className="every-call-card"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <div className="every-call-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3>Objection Tracking by Closer</h3>
              <p>Track every individual objection down to the specific closer. See who handles what objections best, and who needs coaching on which areas.</p>
            </motion.div>

            <motion.div
              className="every-call-card"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <div className="every-call-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3>Compliance Monitoring</h3>
              <p>Quietly monitors risk language before it becomes a problem.</p>
            </motion.div>
          </div>
        </div>
      </section>

      <ZeroAdmin />
      <RevenueCalculator />
      <HowItWorks />
      <CTA />
    </>
  )
}

function HowItWorksPage() {
  return (
    <>
      <section className="video-section">
        <div className="container">
          <motion.div
            className="section-header"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <span className="badge">See It In Action</span>
            <h2>Every Call, Fully <span className="gradient-text">Analyzed</span></h2>
            <p>Your closers are already on the phone. We make sure no insight gets left behind.</p>
          </motion.div>
          <motion.div
            className="video-wrapper"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="video-placeholder">
              <div className="video-play-btn">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="var(--aurora-green)">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
      <Pricing />
    </>
  )
}

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

  const logoItems = [
    { icon: '📊', text: 'AI-Powered Analytics' },
    { icon: '🎯', text: 'Close Rate Tracking' },
    { icon: '📞', text: 'Call Intelligence' },
    { icon: '⚡', text: 'Real-time Insights' },
    { icon: '🛡️', text: 'Compliance Monitoring' },
    { icon: '📈', text: 'Performance Metrics' },
    { icon: '🤖', text: 'Automated Reports' },
    { icon: '💡', text: 'Coaching Tips' },
  ]

  return (
    <DemoModalProvider>
      <div className="app">
        <Aurora colorStops={["#3A29FF", "#FF94B4", "#FF3232"]} blend={1} amplitude={0}/>
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
              <ScrollToTop />
              <Navbar />
              <main>
                <Routes>
                  <Route path="/" element={<HomePage logoItems={logoItems} />} />
                  <Route path="/how-it-works" element={<HowItWorksPage />} />
                  <Route path="/faq" element={<FAQPage />} />
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
