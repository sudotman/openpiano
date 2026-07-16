import { motion } from 'framer-motion'
import {
  ArrowRight,
  Check,
  ChevronRight,
  Circle,
  Clock3,
  LockKeyhole,
  Play,
  Sparkles,
} from 'lucide-react'
import { courseUnits, lessons } from '../data/curriculum'
import type { Lesson } from '../types'

interface LearnViewProps {
  completedLessonIds: string[]
  onOpenLesson: (lesson: Lesson) => void
  onResume: () => void
}

function lessonState(lesson: Lesson, completedLessonIds: string[], index: number) {
  if (completedLessonIds.includes(lesson.id)) return 'done'
  const previous = lessons[index - 1]
  if (index === 0 || (previous && completedLessonIds.includes(previous.id))) return 'current'
  // Keep the first unit open in the demo so the path is useful immediately.
  if (lesson.unitId === courseUnits[0]?.id) return 'available'
  return 'locked'
}

export function LearnView({ completedLessonIds, onOpenLesson, onResume }: LearnViewProps) {
  const completed = completedLessonIds.length
  const total = lessons.length

  return (
    <motion.div
      className="learn-view"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <section className="continue-stage">
        <div className="continue-copy">
          <div className="section-kicker"><Sparkles size={14} /> Continue learning</div>
          <h2>Find your way<br />around the keys.</h2>
          <p>Lesson 2 · The five-finger position</p>
          <button className="primary-action" onClick={onResume}>
            <Play size={17} fill="currentColor" /> Resume lesson
          </button>
        </div>
        <div className="continue-visual" aria-hidden="true">
          <div className="hand-map">
            {[1, 2, 3, 4, 5].map((n) => <span key={n}>{n}</span>)}
          </div>
          <div className="hero-keys">
            {Array.from({ length: 12 }).map((_, i) => (
              <i key={i} className={i === 4 ? 'lit' : ''} />
            ))}
          </div>
          <div className="lesson-progress-ring">
            <svg viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="34" />
              <circle cx="40" cy="40" r="34" pathLength="100" strokeDasharray="42 100" />
            </svg>
            <strong>42%</strong>
            <span>lesson</span>
          </div>
        </div>
      </section>

      <section className="learning-overview">
        <div className="overview-copy">
          <span>Full curriculum</span>
          <h3>Your path from first note to fluent playing</h3>
        </div>
        <div className="overview-stats">
          <div><strong>{completed}<small> / {total}</small></strong><span>lessons complete</span></div>
          <div><strong>18<small> min</small></strong><span>this week</span></div>
          <div><strong>86<small>%</small></strong><span>note accuracy</span></div>
        </div>
      </section>

      <section className="course-path">
        {courseUnits.map((unit, unitIndex) => {
          const unitLessons = lessons.filter((lesson) => lesson.unitId === unit.id)
          const unitComplete = unitLessons.filter((lesson) => completedLessonIds.includes(lesson.id)).length
          return (
            <motion.article
              className="course-unit"
              key={unit.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ delay: Math.min(unitIndex * 0.05, 0.2) }}
            >
              <div className="unit-index">
                <span>{String(unit.order).padStart(2, '0')}</span>
                <i style={{ background: unit.accent }} />
              </div>
              <div className="unit-body">
                <div className="unit-heading">
                  <div>
                    <span>{unit.level}</span>
                    <h3>{unit.title}</h3>
                    <p>{unit.description}</p>
                  </div>
                  <span className="unit-count">{unitComplete}/{unitLessons.length}</span>
                </div>
                <div className="lesson-list">
                  {unitLessons.map((lesson) => {
                    const globalIndex = lessons.findIndex((item) => item.id === lesson.id)
                    const state = lessonState(lesson, completedLessonIds, globalIndex)
                    return (
                      <button
                        key={lesson.id}
                        className={`lesson-row ${state}`}
                        onClick={() => state !== 'locked' && onOpenLesson(lesson)}
                        disabled={state === 'locked'}
                      >
                        <span className="lesson-state">
                          {state === 'done' && <Check size={15} />}
                          {state === 'current' && <Play size={13} fill="currentColor" />}
                          {state === 'available' && <Circle size={10} />}
                          {state === 'locked' && <LockKeyhole size={14} />}
                        </span>
                        <span className="lesson-name">
                          <strong>{lesson.title}</strong>
                          <small>{lesson.subtitle}</small>
                        </span>
                        <span className="lesson-time"><Clock3 size={14} /> {lesson.durationMinutes} min</span>
                        <ChevronRight size={17} className="lesson-arrow" />
                      </button>
                    )
                  })}
                </div>
              </div>
            </motion.article>
          )
        })}
      </section>

      <button className="explore-songbook" onClick={() => window.dispatchEvent(new CustomEvent('open-songbook'))}>
        <div>
          <span>Practice beyond the path</span>
          <strong>Open the complete songbook</strong>
        </div>
        <ArrowRight size={22} />
      </button>
    </motion.div>
  )
}
