import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  Award,
  Cable,
  Check,
  ChevronDown,
  Gauge,
  Hand,
  Pause,
  Play,
  RefreshCcw,
  RotateCcw,
  Settings2,
  Sparkles,
  Target,
  X,
} from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { UseMidiResult } from '../hooks/useMidi'
import { resolvePracticeRange, type KeyboardConfig } from '../lib/keyboardConfig'
import type { Lesson, Song } from '../types'
import { NoteHighway } from './NoteHighway'
import { PianoKeyboard } from './PianoKeyboard'
import './PracticeStudio.css'

const SheetMusic = lazy(() => import('./SheetMusic').then((module) => ({ default: module.SheetMusic })))

type PracticeMode = 'wait' | 'flow'
type HandMode = 'both' | 'right' | 'left'
type VisualMode = 'tiles' | 'sheet' | 'both'

interface PracticeResult {
  songTitle: string
  accuracy: number
  notes: number
  duration: number
  lessonId?: string
}

interface PracticeStudioProps {
  song: Song
  lesson?: Lesson | null
  midi: UseMidiResult
  onBack: () => void
  onOpenMidi: () => void
  onComplete: (result: PracticeResult) => void
  onResumeAudio: () => Promise<void>
  keyboardConfig: KeyboardConfig
}

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds)
  return `${Math.floor(safe / 60)}:${Math.floor(safe % 60).toString().padStart(2, '0')}`
}

function noteName(midi: number) {
  return ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][midi % 12]
}

export function PracticeStudio({
  song,
  lesson,
  midi,
  onBack,
  onOpenMidi,
  onComplete,
  onResumeAudio,
  keyboardConfig,
}: PracticeStudioProps) {
  const [mode, setMode] = useState<PracticeMode>('wait')
  const [handMode, setHandMode] = useState<HandMode>('both')
  const [visualMode, setVisualMode] = useState<VisualMode>('tiles')
  const [speed, setSpeed] = useState(.75)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [hitNotes, setHitNotes] = useState<Set<string>>(() => new Set())
  const [missedNotes, setMissedNotes] = useState<Set<string>>(() => new Set())
  const [correctMidis, setCorrectMidis] = useState<Set<number>>(() => new Set())
  const [wrongMidis, setWrongMidis] = useState<Set<number>>(() => new Set())
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [wrongCount, setWrongCount] = useState(0)
  const [feedback, setFeedback] = useState<{ kind: 'right' | 'wrong'; label: string } | null>(null)
  const [showResults, setShowResults] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null)
  const hitRef = useRef(hitNotes)
  const missedRef = useRef(missedNotes)
  const completedRef = useRef(false)
  const lastEventRef = useRef<number | null>(null)
  const feedbackTimer = useRef<number | null>(null)
  const practiceNotes = useMemo(
    () => song.notes.filter((note) => handMode === 'both' || note.hand === handMode),
    [handMode, song.notes],
  )
  const [startMidi, endMidi] = useMemo(
    () => resolvePracticeRange(practiceNotes, keyboardConfig),
    [keyboardConfig, practiceNotes],
  )

  useEffect(() => { hitRef.current = hitNotes }, [hitNotes])
  useEffect(() => { missedRef.current = missedNotes }, [missedNotes])

  const restart = useCallback(() => {
    setPlaying(false)
    setCurrentTime(0)
    setHitNotes(new Set())
    setMissedNotes(new Set())
    setCorrectMidis(new Set())
    setWrongMidis(new Set())
    setStreak(0)
    setBestStreak(0)
    setWrongCount(0)
    setFeedback(null)
    setShowResults(false)
    setSessionStartedAt(null)
    hitRef.current = new Set()
    missedRef.current = new Set()
    completedRef.current = false
  }, [])

  useEffect(() => {
    restart()
  }, [handMode, restart, song.id])

  useEffect(() => {
    if (!playing) return
    let frame = 0
    let previous = performance.now()

    const tick = (now: number) => {
      const delta = Math.min(.05, (now - previous) / 1000)
      previous = now
      setCurrentTime((current) => {
        let next = current + delta * speed
        if (mode === 'wait') {
          const nextPending = practiceNotes.find(
            (note) => !hitRef.current.has(note.id) && !missedRef.current.has(note.id) && note.time >= current - .055,
          )
          if (nextPending && next >= nextPending.time) next = nextPending.time
        }
        return Math.min(song.duration, next)
      })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [mode, playing, practiceNotes, song.duration, speed])

  useEffect(() => {
    if (mode !== 'flow' || !playing) return
    const newlyMissed = practiceNotes.filter(
      (note) => note.time < currentTime - .34 && !hitRef.current.has(note.id) && !missedRef.current.has(note.id),
    )
    if (!newlyMissed.length) return
    setMissedNotes((current) => {
      const next = new Set(current)
      newlyMissed.forEach((note) => next.add(note.id))
      missedRef.current = next
      return next
    })
    setStreak(0)
  }, [currentTime, mode, playing, practiceNotes])

  useEffect(() => {
    if (currentTime < song.duration || completedRef.current || !sessionStartedAt) return
    completedRef.current = true
    setPlaying(false)
    const remaining = practiceNotes.filter((note) => !hitRef.current.has(note.id))
    setMissedNotes((current) => {
      const next = new Set(current)
      remaining.forEach((note) => next.add(note.id))
      missedRef.current = next
      return next
    })
    window.setTimeout(() => setShowResults(true), 380)
  }, [currentTime, practiceNotes, sessionStartedAt, song.duration])

  useEffect(() => {
    const event = midi.lastEvent
    if (!event || event.type !== 'noteon' || event.timestamp === lastEventRef.current) return
    lastEventRef.current = event.timestamp
    if (!playing) return

    const candidates = practiceNotes
      .filter((note) => note.midi === event.note && !hitRef.current.has(note.id) && !missedRef.current.has(note.id))
      .map((note) => ({ note, distance: Math.abs(note.time - currentTime) }))
      .sort((a, b) => a.distance - b.distance)
    const tolerance = mode === 'wait' ? .7 : .36
    const match = candidates.find((candidate) => candidate.distance <= tolerance)

    if (match) {
      setHitNotes((current) => {
        const next = new Set(current).add(match.note.id)
        hitRef.current = next
        return next
      })
      setCorrectMidis((current) => new Set(current).add(event.note))
      window.setTimeout(() => setCorrectMidis((current) => {
        const next = new Set(current)
        next.delete(event.note)
        return next
      }), 250)
      setStreak((current) => {
        const next = current + 1
        setBestStreak((best) => Math.max(best, next))
        return next
      })
      setFeedback({ kind: 'right', label: match.distance < .12 ? 'Perfect' : 'Good' })
    } else {
      setWrongMidis((current) => new Set(current).add(event.note))
      window.setTimeout(() => setWrongMidis((current) => {
        const next = new Set(current)
        next.delete(event.note)
        return next
      }), 250)
      setWrongCount((count) => count + 1)
      setStreak(0)
      setFeedback({ kind: 'wrong', label: `Try ${targetNotes.size ? Array.from(targetNotes).map(noteName).join(' + ') : 'the next key'}` })
    }

    if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current)
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), 650)
  // targetNotes is derived below but intentionally represented by live timing here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [midi.lastEvent, mode, playing, practiceNotes, currentTime])

  useEffect(() => () => {
    if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current)
  }, [])

  const nextPendingTime = useMemo(() => practiceNotes.find((note) => !hitNotes.has(note.id) && !missedNotes.has(note.id) && note.time >= currentTime - .06)?.time, [currentTime, hitNotes, missedNotes, practiceNotes])
  const targetNotes = useMemo(() => new Set(practiceNotes
    .filter((note) => {
      if (hitNotes.has(note.id) || missedNotes.has(note.id)) return false
      if (mode === 'wait' && nextPendingTime !== undefined) return Math.abs(note.time - nextPendingTime) < .035 && currentTime >= nextPendingTime - .06
      return Math.abs(note.time - currentTime) <= .12
    })
    .map((note) => note.midi)), [currentTime, hitNotes, missedNotes, mode, nextPendingTime, practiceNotes])

  const accuracy = Math.round((hitNotes.size / Math.max(1, hitNotes.size + missedNotes.size + wrongCount)) * 100)
  const progress = Math.min(100, (currentTime / Math.max(.1, song.duration)) * 100)
  const sessionMinutes = Math.max(1, Math.round(((sessionStartedAt ? Date.now() - sessionStartedAt : 0) / 60000)))

  async function togglePlay() {
    await onResumeAudio().catch(() => undefined)
    if (currentTime >= song.duration) restart()
    if (!sessionStartedAt) setSessionStartedAt(Date.now())
    setPlaying((current) => !current)
  }

  function finishSession() {
    onComplete({
      songTitle: song.title,
      accuracy,
      notes: hitNotes.size,
      duration: sessionMinutes,
      lessonId: lesson?.id,
    })
    onBack()
  }

  return (
    <div className="practice-studio">
      <header className="studio-header">
        <button className="studio-back" onClick={onBack} aria-label="Leave studio"><ArrowLeft size={18} /> <span>Leave studio</span></button>
        <div className="studio-title"><span>{lesson ? `Lesson ${lesson.order}` : 'Free practice'}</span><strong>{song.title}</strong></div>
        <div className="studio-header-actions">
          <button className={midi.isConnected ? 'studio-midi connected' : 'studio-midi'} onClick={onOpenMidi} aria-label={midi.isConnected ? 'MIDI keyboard ready' : 'Connect MIDI keyboard'}><i /> <Cable size={16} /><span>{midi.isConnected ? 'MIDI ready' : 'Connect MIDI'}</span></button>
          <button className="icon-button" onClick={() => setSettingsOpen((open) => !open)} aria-label="Practice settings"><Settings2 size={18} /></button>
        </div>
      </header>

      <div className="studio-progress"><i style={{ width: `${progress}%` }} /></div>

      <main className="studio-stage">
        <div className="studio-toolbar">
          <div className="segmented-control">
            <button className={mode === 'wait' ? 'active' : ''} onClick={() => setMode('wait')}>Wait mode</button>
            <button className={mode === 'flow' ? 'active' : ''} onClick={() => setMode('flow')}>Flow mode</button>
          </div>
          <div className="studio-live-stats">
            <span><Target size={14} /> {hitNotes.size}<small> hit</small></span>
            <span><Sparkles size={14} /> {streak}<small> streak</small></span>
            <span className="accuracy-live">{hitNotes.size || missedNotes.size ? accuracy : '—'}<small>% accuracy</small></span>
          </div>
          <div className="view-mode-control segmented-control" aria-label="Practice visual mode">
            <button className={visualMode === 'tiles' ? 'active' : ''} onClick={() => setVisualMode('tiles')}>Tiles</button>
            <button className={visualMode === 'sheet' ? 'active' : ''} onClick={() => setVisualMode('sheet')}>Score</button>
            <button className={visualMode === 'both' ? 'active' : ''} onClick={() => setVisualMode('both')}>Both</button>
          </div>
          <button className="hand-select" onClick={() => setHandMode((current) => current === 'both' ? 'right' : current === 'right' ? 'left' : 'both')}><Hand size={15} /> {handMode === 'both' ? 'Both hands' : `${handMode[0].toUpperCase()}${handMode.slice(1)} hand`} <ChevronDown size={13} /></button>
        </div>

        <div className={`practice-visual practice-visual--${visualMode}`}>
          {visualMode !== 'tiles' && (
            <div className="sheet-music-wrap">
              <Suspense fallback={<div className="score-loading"><span className="mini-spinner" /> Engraving score…</div>}>
                <SheetMusic
                  song={song}
                  notes={practiceNotes}
                  currentTime={currentTime}
                  hitNotes={hitNotes}
                  missedNotes={missedNotes}
                  compact={visualMode === 'both'}
                  measuresVisible={visualMode === 'both' ? 3 : 4}
                />
              </Suspense>
            </div>
          )}
          {visualMode !== 'sheet' && (
            <div className="highway-wrap">
              <NoteHighway
                notes={practiceNotes}
                currentTime={currentTime}
                leadTime={Math.max(2.7, 4 / speed)}
                startMidi={startMidi}
                endMidi={endMidi}
                hitNotes={hitNotes}
                missedNotes={missedNotes}
              />
            </div>
          )}
          <AnimatePresence>
            {feedback && (
              <motion.div className={`timing-feedback ${feedback.kind}`} initial={{ opacity: 0, y: 8, scale: .92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }}>
                {feedback.kind === 'right' && <Check size={15} />} {feedback.label}
              </motion.div>
            )}
          </AnimatePresence>
          {!playing && currentTime === 0 && (
            <div className="start-cue">
              <span>{mode === 'wait' ? 'The song waits for you' : 'Play in time with the notes'}</span>
              <strong>{targetNotes.size ? `Find ${Array.from(targetNotes).map(noteName).join(' + ')}` : 'Ready when you are'}</strong>
              <button onClick={togglePlay}><Play size={18} fill="currentColor" /> Start</button>
            </div>
          )}
        </div>

        <div className="keyboard-wrap">
          <PianoKeyboard
            activeNotes={new Set(midi.activeNotes)}
            targetNotes={targetNotes}
            correctNotes={correctMidis}
            wrongNotes={wrongMidis}
            startMidi={startMidi}
            endMidi={endMidi}
            noteNaming={keyboardConfig.noteNaming}
            onNoteOn={midi.virtualNoteOn}
            onNoteOff={midi.virtualNoteOff}
            compact
          />
        </div>

        <div className="transport-bar">
          <span className="time-readout">{formatTime(currentTime)} <i /> {formatTime(song.duration)}</span>
          <div className="transport-controls">
            <button onClick={restart} aria-label="Restart"><RotateCcw size={17} /></button>
            <button className="play-control" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}</button>
            <button onClick={() => setCurrentTime((time) => Math.min(song.duration, time + 5))} aria-label="Skip ahead"><RefreshCcw size={17} className="skip-icon" /></button>
          </div>
          <button className="speed-control" onClick={() => setSpeed((current) => current === .5 ? .75 : current === .75 ? 1 : .5)}><Gauge size={15} /> {Math.round(speed * 100)}%</button>
        </div>
      </main>

      <AnimatePresence>
        {settingsOpen && (
          <motion.aside className="practice-settings-popover" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <div><strong>Practice settings</strong><button onClick={() => setSettingsOpen(false)}><X size={15} /></button></div>
            <label><span>Tempo</span><input type="range" min="50" max="100" step="25" value={speed * 100} onChange={(event) => setSpeed(Number(event.target.value) / 100)} /><small>{speed * 100}%</small></label>
            <label><span>Mode</span><button onClick={() => setMode((current) => current === 'wait' ? 'flow' : 'wait')}>{mode === 'wait' ? 'Wait for correct note' : 'Keep time moving'}</button></label>
            <p>Tip: use the on-screen keys to try the app without a MIDI keyboard.</p>
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showResults && (
          <motion.div className="results-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <motion.section className="results-card" initial={{ opacity: 0, y: 22, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', damping: 25 }}>
              <div className="result-orbit"><Award size={30} /><i /></div>
              <span>Practice complete</span>
              <h2>{accuracy >= 90 ? 'Beautifully played.' : accuracy >= 70 ? 'That’s taking shape.' : 'Every note counts.'}</h2>
              <p>{song.title} · {handMode === 'both' ? 'both hands' : `${handMode} hand`}</p>
              <div className="result-metrics">
                <div><strong>{accuracy}%</strong><span>accuracy</span></div>
                <div><strong>{hitNotes.size}</strong><span>notes hit</span></div>
                <div><strong>{bestStreak}</strong><span>best streak</span></div>
              </div>
              <div className="result-actions"><button onClick={restart}>Practice again</button><button className="primary-action" onClick={finishSession}>Continue <ArrowLeft size={16} className="continue-arrow" /></button></div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export type { PracticeResult }
