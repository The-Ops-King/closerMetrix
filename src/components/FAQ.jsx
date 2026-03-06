import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDemoModal } from '../hooks/useDemoModal'

const faqCategories = [
  {
    title: 'The Basics',
    items: [
      {
        q: 'What is CloserMetrix?',
        a: 'CloserMetrix is a sales intelligence platform built specifically for high-ticket, call-driven sales teams. It automatically pulls data from your calendar and call recordings, analyzes what\'s happening on your calls, and turns it into clear, structured insight — without you having to lift a finger.\n\nThink of it like HYROS, but for your sales calls. HYROS tells you where your revenue comes from in marketing. CloserMetrix tells you why revenue happens — or doesn\'t — on sales calls.',
      },
      {
        q: 'Who is CloserMetrix built for?',
        a: 'CloserMetrix is built for high-ticket coaching, consulting, and service businesses that sell primarily through 1-on-1 sales calls. If you have 2–20 closers, you\'re generating significant monthly revenue through calls, and you\'re making decisions based on gut feel or self-reported closer data — CloserMetrix was built for you.',
      },
      {
        q: 'What problem does it solve?',
        a: 'Most sales leaders are flying blind. Founders don\'t really know what\'s happening on calls. Managers rely on memory and anecdotes. Closers self-report inconsistently. And by the time you notice a problem — a spike in a certain objection, a closer losing momentum, a compliance risk — revenue has already taken the hit.\n\nCloserMetrix replaces guessing with clarity. You get structured data from every call, automatically, so you can make better decisions faster.',
      },
    ],
  },
  {
    title: 'How It Works',
    items: [
      {
        q: 'How does CloserMetrix actually get its data?',
        a: 'CloserMetrix connects to your team\'s Google Calendars and your call recording platform (Fathom, Otter, Read.ai, or TDLV). That\'s it. Once it\'s set up, it runs automatically — no manual input, no tagging, no extra admin from your team.\n\nEvery call that gets scheduled flows through the system. When a transcript arrives, it\'s matched to the call, analyzed by AI, and the data hits your dashboard — usually within 24 hours of the call happening.',
      },
      {
        q: 'How long does setup take?',
        a: 'About 30 minutes for most teams. There\'s a quick Zapier integration, calendar sharing from each closer, one client form, and one per-closer form. That\'s it. We walk you through all of it.',
      },
      {
        q: 'Do I need to change my sales process or tech stack?',
        a: 'Not at all. CloserMetrix sits on top of what you\'re already using. You keep your CRM, your call recorder, your calendar — everything stays the same. We just add a visibility layer on top of it.',
      },
    ],
  },
  {
    title: 'Features & Capabilities',
    items: [
      {
        q: 'What does CloserMetrix actually show me?',
        a: 'Depending on your tier, you get access to:\n\n• Business-level metrics: show rates, close rates, sales cycle length, week-over-week trends\n• Closer-level performance comparisons: who\'s closing, who\'s struggling, and why\n• Objection intelligence: which objections are showing up, how often, and whether they\'re being resolved\n• Timestamped call examples: filter by objection type or closer and pull a list of 15–20 real calls to review\n• Script adherence scores, quality scoring, and revenue projections',
      },
      {
        q: "What's objection intelligence, and why does it matter?",
        a: 'Objection intelligence is what most teams are completely missing. Right now, you probably know that objections are happening — but you don\'t know which ones, how often, whether your closers are actually handling them, or which closer handles them best.\n\nCloserMetrix tracks every objection by type, flags whether it was resolved, and links you directly to timestamped examples in the recording. So instead of telling a closer "you need to get better at money objections," you can pull up 20 real calls where that exact objection came up and show them what good looks like — and what doesn\'t.',
      },
      {
        q: 'Do I get weekly summaries, or do I have to log in to see data?',
        a: 'Both. The dashboards are always there when you want to dig in — but we also send weekly email wrap-ups to founders, managers, and closers. The founder summary tells you what changed, what it means, and what to do next. Managers get objection trends and coaching focus areas. Closers get recognition for what they did well.\n\nWe\'ve found that pushed insights create habits. Dashboards are powerful, but only if people remember to look at them.',
      },
    ],
  },
  {
    title: 'Comparisons',
    items: [
      {
        q: 'How does CloserMetrix compare to Gong?',
        a: 'Gong is an excellent tool — but it\'s built for enterprise SaaS sales teams, and it has a fundamental limitation that matters a lot for high-ticket call businesses: to get insight on any specific call or closer, you have to go into each recording individually. Gong doesn\'t surface aggregated per-closer or per-call intelligence across your whole team automatically.\n\nCloserMetrix works the other way around. You see patterns across your entire team first — which objections are spiking, which closers are struggling, how your numbers are trending — and then you can drill down to the specific calls that matter. It\'s also purpose-built for high-ticket call-based businesses where calls are longer, more emotional, and objection-heavy. We\'re not trying to be Gong for enterprise. We\'re the tool your team actually needs, at a fraction of the complexity and cost.',
      },
      {
        q: 'Does CloserMetrix replace my CRM?',
        a: 'No — and it\'s not trying to. Your CRM tracks deals and contacts. CloserMetrix tracks what happens on calls. They complement each other.',
      },
      {
        q: 'Does CloserMetrix replace my sales manager?',
        a: 'No — it makes your sales manager significantly more effective. Instead of relying on memory, spot-checks, and gut feel, your manager now walks into every coaching session with real data: which objections are trending up, which closer is struggling with a specific call stage, and exactly which calls to review. They spend less time hunting for insight and more time actually coaching.',
      },
    ],
  },
  {
    title: 'Admin & Your Closers',
    items: [
      {
        q: "How does CloserMetrix save my closers' admin time?",
        a: 'A lot of closer admin time goes toward logging call outcomes, writing up notes, and updating CRM records after calls. CloserMetrix automates the capture of call outcomes, attendance, objections, and notes — so your closers spend that time selling instead.\n\nIt also means your data is more accurate. When closers self-report, you get what they remember (or what they want you to see). With CloserMetrix, you get what actually happened.',
      },
      {
        q: 'Will my closers feel like they\'re being watched?',
        a: 'It\'s a fair concern, and we take it seriously. CloserMetrix is designed to be a tool for clarity, not surveillance. When you roll it out, we recommend framing it as a coaching and recognition tool — because that\'s genuinely what it is.\n\nThe weekly wrap-ups include a positive-only leaderboard that highlights wins: most deals closed, best objection resolution rate, highest script adherence, and more. Closers who perform well get recognized. Those who need help get targeted coaching with specific, real examples — not vague feedback.',
      },
    ],
  },
  {
    title: 'Getting Started',
    items: [
      {
        q: 'How quickly can I see data after signing up?',
        a: 'Most clients see their first real data within 24 hours of onboarding — often after the first call that goes through the system. There\'s no 30–60 day ramp-up period waiting for enough data to matter.',
      },
      {
        q: "What if I'm not happy after setup?",
        a: 'We offer a 14-Day Clarity Guarantee. If within 14 days you don\'t have working dashboards, automated call outcomes, objection visibility, and a weekly insight summary — we\'ll refund your setup fee. We guarantee delivery, not results, but we\'re confident you\'ll see the value quickly.',
      },
      {
        q: 'How do I get started?',
        a: 'Click on the button below to book a demo.',
      },
    ],
  },
]

function FAQItem({ item, isOpen, onToggle }) {
  return (
    <motion.div
      className="faq-item"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
    >
      <button className={`faq-question ${isOpen ? 'open' : ''}`} onClick={onToggle}>
        <span>{item.q}</span>
        <motion.svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3 }}
        >
          <path d="M6 9l6 6 6-6" />
        </motion.svg>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="faq-answer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="faq-answer-inner">
              {item.a.split('\n\n').map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

const FAQ = () => {
  const { openModal } = useDemoModal()
  const [openItem, setOpenItem] = useState(null)

  const toggleItem = (key) => {
    setOpenItem((prev) => (prev === key ? null : key))
  }

  return (
    <section className="faq-section">
      <div className="container">
        <motion.div
          className="section-header"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <span className="badge">FAQ</span>
          <h2>Frequently Asked <span className="gradient-text">Questions</span></h2>
          <p>Everything you need to know about CloserMetrix</p>
        </motion.div>

        <div className="faq-categories">
          {faqCategories.map((category) => (
            <div key={category.title} className="faq-category">
              <motion.h3
                className="faq-category-title"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                {category.title}
              </motion.h3>
              <div className="faq-items">
                {category.items.map((item) => {
                  const key = `${category.title}-${item.q}`
                  return (
                    <FAQItem
                      key={key}
                      item={item}
                      isOpen={openItem === key}
                      onToggle={() => toggleItem(key)}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <motion.div
          className="faq-cta"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p>Still have questions?</p>
          <motion.button
            className="btn-primary"
            onClick={openModal}
            whileHover={{ scale: 1.05, boxShadow: '0 0 30px rgba(0, 255, 136, 0.5)' }}
            whileTap={{ scale: 0.95 }}
          >
            Book a Demo
          </motion.button>
        </motion.div>
      </div>
    </section>
  )
}

export default FAQ
