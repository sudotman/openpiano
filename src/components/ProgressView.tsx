import { motion } from 'framer-motion'
import { Award, BookOpenCheck, CalendarDays, Clock3, Flame, Music2, Target, TrendingUp } from 'lucide-react'
import { theoryAccuracy, type TheoryProgress } from '../lib/theory'

interface SessionRecord {
  id: string
  songTitle: string
  date: string
  accuracy: number
  notes: number
  duration: number
  completedAt?: string
}

interface ProgressViewProps {
  sessions: SessionRecord[]
  completedLessons: number
  theoryProgress: TheoryProgress
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

export function calculatePracticeStreak(sessions: SessionRecord[]) {
  const practiced = new Set(sessions
    .filter((session) => session.completedAt && Number.isFinite(Date.parse(session.completedAt)))
    .map((session) => dayKey(new Date(session.completedAt!))))
  if (!practiced.size) return 0

  const cursor = new Date()
  cursor.setHours(12, 0, 0, 0)
  if (!practiced.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (practiced.has(dayKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

function thisWeek(sessions: SessionRecord[]) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date()
    date.setHours(12, 0, 0, 0)
    date.setDate(date.getDate() - (6 - index))
    const minutes = sessions
      .filter((session) => session.completedAt && dayKey(new Date(session.completedAt)) === dayKey(date))
      .reduce((sum, session) => sum + session.duration, 0)
    return { day: date.toLocaleDateString(undefined, { weekday: 'narrow' }), minutes }
  })
}

function formatPracticeTime(minutes: number) {
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export function ProgressView({ sessions, completedLessons, theoryProgress }: ProgressViewProps) {
  const recent = sessions.slice().reverse().slice(0, 5)
  const week = thisWeek(sessions)
  const weekMinutes = week.reduce((sum, item) => sum + item.minutes, 0)
  const maxDayMinutes = Math.max(1, ...week.map((item) => item.minutes))
  const totalMinutes = sessions.reduce((sum, session) => sum + session.duration, 0)
  const streak = calculatePracticeStreak(sessions)
  const avgAccuracy = sessions.length
    ? Math.round(sessions.reduce((sum, session) => sum + session.accuracy, 0) / sessions.length)
    : 0

  return (
    <motion.div className="progress-view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <section className="progress-summary">
        <div className="summary-lead">
          <span className="section-kicker"><TrendingUp size={14} /> This week</span>
          <h2>{sessions.length ? <>Your hands are<br />finding their rhythm.</> : <>Your first session<br />starts here.</>}</h2>
          <p>{sessions.length ? `${weekMinutes} minutes of focused playing in the last seven days.` : 'Complete a lesson or song and your practice history will appear here.'}</p>
        </div>
        <div className="week-chart" aria-label="Practice minutes this week">
          {week.map((item, index) => (
            <div className="week-day" key={`${item.day}-${index}`}>
              <span className="bar-value">{item.minutes || ''}</span>
              <div className="bar-track"><motion.i initial={{ height: 0 }} animate={{ height: `${(item.minutes / maxDayMinutes) * 100}%` }} transition={{ delay: index * .05 }} /></div>
              <small>{item.day}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="metric-line">
        <div><span><Clock3 size={17} /></span><strong>{formatPracticeTime(totalMinutes)}</strong><small>practice time</small></div>
        <div><span><Target size={17} /></span><strong>{avgAccuracy}%</strong><small>average accuracy</small></div>
        <div><span><Flame size={17} /></span><strong>{streak} {streak === 1 ? 'day' : 'days'}</strong><small>current streak</small></div>
        <div><span><Award size={17} /></span><strong>{completedLessons}</strong><small>lessons mastered</small></div>
        <div><span><BookOpenCheck size={17} /></span><strong>{theoryProgress.masteredNotes.length}</strong><small>staff notes learned</small></div>
      </section>

      <section className="skill-progress">
        <div className="section-heading-inline">
          <div><span>Skill map</span><h3>What’s becoming automatic</h3></div>
          <button>View curriculum</button>
        </div>
        <div className="skill-rows">
          {[
            ['Note reading', theoryProgress.attempts ? theoryAccuracy(theoryProgress) : 18],
            ['Rhythm & timing', theoryProgress.rhythmBest],
            ['Right-hand control', avgAccuracy],
            ['Left-hand control', avgAccuracy ? Math.max(0, avgAccuracy - 8) : 0],
            ['Chords', Math.min(100, completedLessons * 6)],
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
          {recent.map((session) => (
            <div className="session-row" key={session.id}>
              <span className="session-icon"><CalendarDays size={17} /></span>
              <span><strong>{session.songTitle}</strong><small>{session.date}</small></span>
              <span><strong>{session.notes}</strong><small>notes hit</small></span>
              <span><strong>{session.duration} min</strong><small>duration</small></span>
              <span className="accuracy-score">{session.accuracy}%</span>
            </div>
          ))}
          {!recent.length && <div className="empty-progress"><Music2 size={22} /><strong>No practice sessions yet</strong><span>Finish a lesson or song to start your history.</span></div>}
        </div>
      </section>
    </motion.div>
  )
}

export type { SessionRecord }
