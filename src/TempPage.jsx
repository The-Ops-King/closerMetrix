import Hero from './components/Hero'
import Problem from './components/Problem'
import HowItWorks from './components/HowItWorks'
import WhoItsFor from './components/WhoItsFor'
import Automated from './components/Automated'
import IntegrityAudit from './components/IntegrityAudit'
import Questions from './components/Questions'
import WhatWeDont from './components/WhatWeDont'
import Pricing from './components/Pricing'
import CTA from './components/CTA'

/*
 * New positioning page. Lives at /temp while the original homepage stays at /.
 * This tree is what scripts/prerender.mjs renders to static HTML for crawlers.
 */
const TempPage = () => (
  <>
    <Hero />
    <Problem />
    <HowItWorks />
    <WhoItsFor />
    <Automated />
    <IntegrityAudit />
    <Questions />
    <WhatWeDont />
    <Pricing />
    <CTA />
  </>
)

export default TempPage
