import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, CheckCircle2, Clock3, Lightbulb, Music2, Target, X } from 'lucide-react'
import type { Lesson, Song } from '../types'

interface LessonSheetProps {
  lesson: Lesson | null
  song?: Song
  onClose: () => void
  onStart: (song: Song, lesson: Lesson) => void
}

export function LessonSheet({ lesson, song, onClose, onStart }: LessonSheetProps) {
  return (
    <AnimatePresence>
      {lesson && (
        <div className="sheet-layer" role="dialog" aria-modal="true" aria-label={lesson.title}>
          <motion.button
            className="sheet-backdrop"
            aria-label="Close lesson"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.aside
            className="lesson-sheet"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
          >
            <div className="sheet-topline">
              <span>{lesson.kind} lesson</span>
              <button onClick={onClose} aria-label="Close"><X size={18} /></button>
            </div>
            <div className="sheet-heading">
              <span className="lesson-number">{String(lesson.order).padStart(2, '0')}</span>
              <h2>{lesson.title}</h2>
              <p>{lesson.description}</p>
              <div className="sheet-meta">
                <span><Clock3 size={14} /> {lesson.durationMinutes} min</span>
                <span><Target size={14} /> {lesson.difficulty}</span>
                <span><Music2 size={14} /> {song?.key || 'Keyboard'}</span>
              </div>
            </div>

            <div className="sheet-section">
              <span>In this lesson</span>
              <ul>
                {lesson.objectives.map((objective) => (
                  <li key={objective}><CheckCircle2 size={16} /> {objective}</li>
                ))}
              </ul>
            </div>

            {lesson.tips[0] && (
              <div className="teacher-tip">
                <Lightbulb size={18} />
                <div><span>Teacher tip</span><p>{lesson.tips[0]}</p></div>
              </div>
            )}

            <div className="sheet-footer">
              <div><span>Practice piece</span><strong>{song?.title || 'Guided keyboard exercise'}</strong></div>
              <button className="primary-action" disabled={!song} onClick={() => song && onStart(song, lesson)}>
                Enter studio <ArrowRight size={17} />
              </button>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  )
}
