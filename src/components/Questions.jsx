import { motion } from 'framer-motion'

const questions = [
  'Why did close rate change?',
  'Which objections are costing us deals?',
  'Which avatars convert best?',
  'Which reps follow the process?',
  'Which calls should managers review?',
  'Can we trust our CRM?',
  'What changed this month?',
]

const Questions = () => {
  return (
    <section id="questions" className="questions-section">
      <div className="container">
        <motion.div
          className="section-header"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <span className="badge cyan">Questions We Help Answer</span>
          <h2>The Questions Nobody Can <span className="gradient-text">Answer With Confidence</span></h2>
        </motion.div>

        <div className="questions-grid">
          {questions.map((question, index) => (
            <motion.div
              key={question}
              className="question-card"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: (index % 4) * 0.08 }}
            >
              <span className="question-mark">?</span>
              <span className="question-text">{question}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Questions
