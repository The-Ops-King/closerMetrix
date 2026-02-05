import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import Aurora from './components/Aurora'
import ShapeBlur from './components/ShapeBlur'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import LogoLoop from './components/LogoLoop'
import Features from './components/Features'
import Insights from './components/Insights'
import HowItWorks from './components/HowItWorks'
import CallBreakdown from './components/CallBreakdown'
import Pricing from './components/Pricing'
import CTA from './components/CTA'
import Footer from './components/Footer'
import HowItWorksVideo from './components/HowItWorksVideo'

function LandingPage() {
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
    <>
      <Navbar />
      <main>
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
        <Insights />
        <HowItWorks />
        <CallBreakdown />
        <Pricing />
        <CTA />
      </main>
      <Footer />
    </>
  )
}

function App() {
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    setIsLoaded(true)
  }, [])

  return (
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
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/how-it-works-video" element={<HowItWorksVideo />} />
            </Routes>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default App
