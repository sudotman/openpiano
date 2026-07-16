import { motion } from 'framer-motion'
import { Award, CalendarDays, Clock3, Flame, Target, TrendingUp } from 'lucide-react'

interface SessionRecord {
  id: string
  songTitle: string
  date: string
  accuracy: number
  notes: number
  duration: number
}

interface ProgressViewProps {
  sessions: SessionRecord[]
  completedLessons: number
}

const week = [
  { day: 'M', minutes: 12 },
  { day: 'T', minutes: 18 },
  { day: 'W', minutes: 0 },
  { day: 'T', minutes: 24 },
  { day: 'F', minutes: 8 },
  { day: 'S', minutes: 31 },
  { day: 'S', minutes: 16 },
]

export function ProgressView({ sessions, completedLessons }: ProgressViewProps) {
  const recent = sessions.slice().reverse().slice(0, 5)
  const avgAccuracy = sessions.length
    ? Math.round(sessions.reduce((sum, session) => sum + session.accuracy, 0) / sessions.length)
    : 86

  return (
    <motion.div className="progress-view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <section className="progress-summary">
        <div className="summary-lead">
          <span className="section-kicker"><TrendingUp size={14} /> This week</span>
          <h2>Your hands are<br />finding their rhythm.</h2>
          <p>7 more minutes will beat your best week.</p>
        </div>
        <div className="week-chart" aria-label="Practice minutes this week">
          {week.map((item, index) => (
            <div className="week-day" key={`${item.day}-${index}`}>
              <span className="bar-value">{item.minutes || ''}</span>
              <div className="bar-track"><motion.i initial={{ height: 0 }} animate={{ height: `${Math.max(4, (item.minutes / 31) * 100)}%` }} transition={{ delay: index * .05 }} /></div>
              <small>{item.day}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="metric-line">
        <div><span><Clock3 size={17} /></span><strong>1h 49m</strong><small>practice time</small></div>
        <div><span><Target size={17} /></span><strong>{avgAccuracy}%</strong><small>average accuracy</small></div>
        <div><span><Flame size={17} /></span><strong>4 days</strong><small>current streak</small></div>
        <div><span><Award size={17} /></span><strong>{completedLessons}</strong><small>lessons mastered</small></div>
      </section>

      <section className="skill-progress">
        <div className="section-heading-inline">
          <div><span>Skill map</span><h3>What’s becoming automatic</h3></div>
          <button>View curriculum</button>
        </div>
        <div className="skill-rows">
          {[
            ['Note reading', 68],
            ['Rhythm & timing', 54],
            ['Right-hand control', 82],
            ['Left-hand control', 41],
            ['Chords', 27],
          ].map(([label, value]) => (
            <div className="skill-row" key={label as string}>
              <span>{label}</span>
              <div><motion.i initial={{ width: 0 }} whileInView={{ width: `${value}%` }} viewport={{ once: true }} /></div>
              <strong>{value}%</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="recent-sessions">
        <div className="section-heading-inline"><div><span>History</span><h3>Recent practice</h3></div></div>
        <div className="session-table">
          {(recent.length ? recent : [
            { id: 'demo-1', songTitle: 'Ode to Joy — First Phrase', date: 'Today', accuracy: 91, notes: 38, duration: 5 },
            { id: 'demo-2', songTitle: 'Five-Finger Walk', date: 'Yesterday', accuracy: 84, notes: 42, duration: 7 },
          ]).map((session) => (
            <div className="session-row" key={session.id}>
              <span className="session-icon"><CalendarDays size={17} /></span>
              <span><strong>{session.songTitle}</strong><small>{session.date}</small></span>
              <span><strong>{session.notes}</strong><small>notes hit</small></span>
              <span><strong>{session.duration} min</strong><small>duration</small></span>
              <span className="accuracy-score">{session.accuracy}%</span>
            </div>
          ))}
        </div>
      </section>
    </motion.div>
  )
}

export type { SessionRecord }
