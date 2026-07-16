import { AnimatePresence, motion } from 'framer-motion'
import {
  BookOpenCheck,
  Check,
  ChevronRight,
  CircleGauge,
  Clock3,
  Ear,
  KeyRound,
  Music2,
  Play,
  RotateCcw,
  ScanLine,
  Sparkles,
  Target,
  Volume2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { UseMidiResult } from '../hooks/useMidi'
import type { KeyboardConfig } from '../lib/keyboardConfig'
import { getKeyboardConfigLabel, resolvePracticeRange } from '../lib/keyboardConfig'
import {
  getScalePitchClasses,
  midiFrequency,
  midiNoteName,
  notesInScale,
  theoryAccuracy,
  type TheoryProgress,
} from '../lib/theory'
import { PianoKeyboard } from './PianoKeyboard'
import { SingleNoteStaff } from './SheetMusic'
import './TheoryLab.css'

type TheoryModule = 'explore' | 'reading' | 'rhythm' | 'keys'
type ClefChoice = 'treble' | 'bass' | 'both'

interface TheoryLabProps {
  midi: UseMidiResult
  keyboardConfig: KeyboardConfig
  progress: TheoryProgress
  onProgress: (progress: TheoryProgress) => void
  onOpenMidi: () => void
}

const modules = [
  { id: 'explore' as const, label: 'Notes & keys', detail: 'Map sound to the keyboard', icon: Music2 },
  { id: 'reading' as const, label: 'Staff reader', detail: 'Read, find, and play', icon: ScanLine },
  { id: 'rhythm' as const, label: 'Rhythm lab', detail: 'Build an even internal pulse', icon: Clock3 },
  { id: 'keys' as const, label: 'Scales & keys', detail: 'See the pattern under your hand', icon: KeyRound },
]

const keys = [
  { name: 'C', root: 0, fifths: 0, flats: false },
  { name: 'G', root: 7, fifths: 1, flats: false },
  { name: 'D', root: 2, fifths: 2, flats: false },
  { name: 'A', root: 9, fifths: 3, flats: false },
  { name: 'F', root: 5, fifths: -1, flats: true },
  { name: 'B♭', root: 10, fifths: -2, flats: true },
  { name: 'E♭', root: 3, fifths: -3, flats: true },
]

function nextTarget(current: number, start: number, end: number, clef: ClefChoice) {
  const safeLow = Math.max(start, clef === 'treble' ? 60 : 43)
  const safeHigh = Math.min(end, clef === 'bass' ? 60 : 79)
  const low = Math.min(safeLow, safeHigh)
  const high = Math.max(safeLow, safeHigh)
  const whiteNotes = Array.from({ length: high - low + 1 }, (_, index) => low + index).filter((note) => ![1, 3, 6, 8, 10].includes(note % 12))
  if (!whiteNotes.length) return Math.max(start, Math.min(end, 60))
  const currentIndex = whiteNotes.indexOf(current)
  return whiteNotes[(currentIndex + 3 + Math.floor(Math.random() * Math.max(1, whiteNotes.length - 1))) % whiteNotes.length]
}

export function TheoryLab({ midi, keyboardConfig, progress, onProgress, onOpenMidi }: TheoryLabProps) {
  const [activeModule, setActiveModule] = useState<TheoryModule>('explore')
  const [selectedMidi, setSelectedMidi] = useState(60)
  const [clef, setClef] = useState<ClefChoice>('both')
  const [quizTarget, setQuizTarget] = useState(60)
  const [quizStreak, setQuizStreak] = useState(0)
  const [quizFeedback, setQuizFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [revealTarget, setRevealTarget] = useState(false)
  const [targetBpm, setTargetBpm] = useState(80)
  const [tapTimes, setTapTimes] = useState<number[]>([])
  const [rhythmScore, setRhythmScore] = useState<number | null>(null)
  const [selectedKey, setSelectedKey] = useState(keys[0])
  const [scaleMode, setScaleMode] = useState<'major' | 'minor'>('major')
  const [pulse, setPulse] = useState(false)
  const lastEventRef = useRef<number | null>(null)
  const feedbackTimerRef = useRef<number | null>(null)
  const [rangeStart, rangeEnd] = useMemo(() => resolvePracticeRange([], keyboardConfig), [keyboardConfig])

  const completeModule = useCallback((module: TheoryModule, patch: Partial<TheoryProgress> = {}) => {
    onProgress({
      ...progress,
      ...patch,
      completedModules: Array.from(new Set([...progress.completedModules, module])),
    })
  }, [onProgress, progress])

  const registerTap = useCallback((timestamp = performance.now()) => {
    setPulse(true)
    window.setTimeout(() => setPulse(false), 120)
    setTapTimes((current) => {
      const next = [...current, timestamp].slice(-9)
      if (next.length >= 5) {
        const intervals = next.slice(1).map((time, index) => time - next[index])
        const expected = 60_000 / targetBpm
        const error = intervals.reduce((sum, interval) => sum + Math.abs(interval - expected), 0) / intervals.length
        const score = Math.max(0, Math.round(100 - (error / expected) * 100))
        setRhythmScore(score)
        if (next.length >= 8 && score > progress.rhythmBest) completeModule('rhythm', { rhythmBest: score })
      }
      return next
    })
  }, [completeModule, progress.rhythmBest, targetBpm])

  useEffect(() => {
    const event = midi.lastEvent
    if (!event || event.type !== 'noteon' || event.timestamp === lastEventRef.current) return
    lastEventRef.current = event.timestamp
    setSelectedMidi(event.note)

    if (activeModule === 'reading') {
      const correct = event.note === quizTarget
      const nextStreak = correct ? quizStreak + 1 : 0
      const mastered = correct ? Array.from(new Set([...progress.masteredNotes, quizTarget])).sort((a, b) => a - b) : progress.masteredNotes
      onProgress({
        ...progress,
        attempts: progress.attempts + 1,
        correct: progress.correct + (correct ? 1 : 0),
        bestStreak: Math.max(progress.bestStreak, nextStreak),
        masteredNotes: mastered,
        completedModules: correct && mastered.length >= 5
          ? Array.from(new Set([...progress.completedModules, 'reading']))
          : progress.completedModules,
      })
      setQuizStreak(nextStreak)
      setQuizFeedback(correct ? 'correct' : 'wrong')
      setRevealTarget(!correct)
      if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current)
      feedbackTimerRef.current = window.setTimeout(() => {
        setQuizFeedback(null)
        if (correct) {
          setQuizTarget((target) => nextTarget(target, rangeStart, rangeEnd, clef))
          setRevealTarget(false)
        }
      }, correct ? 520 : 800)
    } else if (activeModule === 'rhythm') {
      registerTap(event.timestamp)
    }
  }, [activeModule, clef, midi.lastEvent, onProgress, progress, quizStreak, quizTarget, rangeEnd, rangeStart, registerTap])

  useEffect(() => () => {
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current)
  }, [])

  useEffect(() => {
    if (activeModule !== 'rhythm') return
    const handleSpace = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      event.preventDefault()
      registerTap()
    }
    window.addEventListener('keydown', handleSpace)
    return () => window.removeEventListener('keydown', handleSpace)
  }, [activeModule, registerTap])

  const noteClef = selectedMidi < 60 ? 'bass' : 'treble'
  const quizClef = clef === 'both' ? (quizTarget < 60 ? 'bass' : 'treble') : clef
  const scalePitchClasses = useMemo(() => getScalePitchClasses(selectedKey.root, scaleMode), [scaleMode, selectedKey.root])
  const scaleMidiNotes = useMemo(() => new Set(notesInScale(rangeStart, rangeEnd, selectedKey.root, scaleMode)), [rangeEnd, rangeStart, scaleMode, selectedKey.root])
  const preferFlats = selectedKey.flats

  function pianoNoteOn(note: number) {
    midi.virtualNoteOn(note)
  }

  return (
    <motion.div className="theory-view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <section className="theory-intro">
        <div>
          <span className="section-kicker"><BookOpenCheck size={14} /> Interactive theory</span>
          <h2>See it. Find it.<br />Play it.</h2>
          <p>Notation, keyboard geography, rhythm, and scales—all connected to the keys under your hands.</p>
        </div>
        <div className="theory-mastery">
          <div className="mastery-ring" style={{ '--mastery': `${Math.min(100, progress.masteredNotes.length * 5)}%` } as React.CSSProperties}>
            <strong>{progress.masteredNotes.length}</strong><span>notes known</span>
          </div>
          <div><span>Staff accuracy</span><strong>{progress.attempts ? `${theoryAccuracy(progress)}%` : 'Start a quiz'}</strong><small>{progress.attempts} reading attempts</small></div>
          <div><span>Best pulse</span><strong>{progress.rhythmBest ? `${progress.rhythmBest}%` : 'Untested'}</strong><small>rhythm stability</small></div>
        </div>
      </section>

      <section className="theory-workspace">
        <nav className="theory-module-nav" aria-label="Theory modules">
          <span>Modules</span>
          {modules.map((module, index) => {
            const Icon = module.icon
            const done = progress.completedModules.includes(module.id)
            return (
              <button key={module.id} className={activeModule === module.id ? 'active' : ''} onClick={() => setActiveModule(module.id)}>
                <i>{done ? <Check size={13} /> : String(index + 1).padStart(2, '0')}</i>
                <span><strong>{module.label}</strong><small>{module.detail}</small></span>
                <Icon size={17} />
              </button>
            )
          })}
          <button className="theory-midi-link" onClick={onOpenMidi}><Ear size={16} /><span><strong>{midi.isConnected ? 'MIDI listening' : 'Connect keyboard'}</strong><small>{midi.isConnected ? midi.selectedInput?.name : 'On-screen keys also work'}</small></span></button>
        </nav>

        <AnimatePresence mode="wait">
          {activeModule === 'explore' && (
            <motion.div className="theory-panel note-explorer" key="explore" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}>
              <div className="theory-panel-heading"><div><span>01 · Notes & keys</span><h3>One note, three ways to know it</h3></div><span className="module-status"><Sparkles size={13} /> Explore freely</span></div>
              <div className="note-identity">
                <div className="note-name-display"><small>Selected note</small><strong>{midiNoteName(selectedMidi, false, false)}<sup>{Math.floor(selectedMidi / 12) - 1}</sup></strong><span>{midiFrequency(selectedMidi).toFixed(1)} Hz · MIDI {selectedMidi}</span></div>
                <SingleNoteStaff midi={selectedMidi} clef={noteClef} label={`${noteClef} clef`} />
                <div className="note-landmark"><Target size={18} /><div><strong>{selectedMidi % 12 === 0 ? 'Keyboard landmark' : 'Find its nearest C'}</strong><span>{selectedMidi % 12 === 0 ? 'C sits immediately left of every two-black-key group.' : `${midiNoteName(selectedMidi - (selectedMidi % 12))} begins this octave.`}</span></div></div>
              </div>
              <div className="theory-keyboard-label"><span>Play or click any key</span><small>{getKeyboardConfigLabel(keyboardConfig)}</small></div>
              <PianoKeyboard activeNotes={new Set(midi.activeNotes)} startMidi={rangeStart} endMidi={rangeEnd} onNoteOn={pianoNoteOn} onNoteOff={midi.virtualNoteOff} compact />
              <div className="notation-glossary">
                <div><strong>Pitch</strong><span>How high or low a sound is.</span></div>
                <div><strong>Octave</strong><span>The same note name, 12 keys apart.</span></div>
                <div><strong>Sharp / flat</strong><span>The black key above or below a natural note.</span></div>
              </div>
            </motion.div>
          )}

          {activeModule === 'reading' && (
            <motion.div className="theory-panel reading-quiz" key="reading" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}>
              <div className="theory-panel-heading"><div><span>02 · Staff reader</span><h3>Play the note you see</h3></div><div className="clef-switch">{(['treble', 'bass', 'both'] as ClefChoice[]).map((item) => <button key={item} className={clef === item ? 'active' : ''} onClick={() => { setClef(item); setQuizTarget((target) => nextTarget(target, rangeStart, rangeEnd, item)) }}>{item}</button>)}</div></div>
              <div className={quizFeedback ? `quiz-score ${quizFeedback}` : 'quiz-score'}>
                <div className="quiz-prompt"><span>{quizFeedback === 'correct' ? 'Exactly right' : quizFeedback === 'wrong' ? `That was ${midiNoteName(selectedMidi)}` : 'Read, then play'}</span><h4>{quizFeedback === 'wrong' ? `Find ${midiNoteName(quizTarget)}` : 'What note is this?'}</h4></div>
                <SingleNoteStaff midi={quizTarget} clef={quizClef} compact={false} />
                <div className="quiz-stats"><span><strong>{quizStreak}</strong> streak</span><i /><span><strong>{theoryAccuracy(progress)}%</strong> accuracy</span></div>
              </div>
              <PianoKeyboard
                activeNotes={new Set(midi.activeNotes)}
                targetNotes={revealTarget ? new Set([quizTarget]) : undefined}
                correctNotes={quizFeedback === 'correct' ? new Set([quizTarget]) : undefined}
                wrongNotes={quizFeedback === 'wrong' ? new Set([selectedMidi]) : undefined}
                startMidi={rangeStart}
                endMidi={rangeEnd}
                onNoteOn={pianoNoteOn}
                onNoteOff={midi.virtualNoteOff}
                compact
              />
              <div className="quiz-actions"><button onClick={() => setRevealTarget(true)}><ScanLine size={15} /> Show me the key</button><button onClick={() => setQuizTarget((target) => nextTarget(target, rangeStart, rangeEnd, clef))}>Skip note <ChevronRight size={15} /></button></div>
            </motion.div>
          )}

          {activeModule === 'rhythm' && (
            <motion.div className="theory-panel rhythm-lab" key="rhythm" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}>
              <div className="theory-panel-heading"><div><span>03 · Rhythm lab</span><h3>Make the space between beats even</h3></div><span className="module-status"><Clock3 size={13} /> Tap any key</span></div>
              <div className="tempo-control"><span>Target tempo</span><input type="range" min="50" max="140" step="5" value={targetBpm} onChange={(event) => { setTargetBpm(Number(event.target.value)); setTapTimes([]); setRhythmScore(null) }} /><strong>{targetBpm}<small> BPM</small></strong></div>
              <div className="rhythm-stage">
                <div className={pulse ? 'pulse-orbit active' : 'pulse-orbit'}><i /><span>{rhythmScore ?? '—'}<small>{rhythmScore === null ? 'tap to begin' : '% steady'}</small></span></div>
                <button className="tap-pad" onClick={() => registerTap()}><Play size={20} fill="currentColor" /><strong>Tap the pulse</strong><span>Spacebar or any MIDI key</span></button>
                <div className="tap-history">{Array.from({ length: 8 }).map((_, index) => <i key={index} className={index < tapTimes.length ? 'filled' : ''} />)}</div>
              </div>
              <div className="rhythm-values">
                <div><span className="rhythm-symbol">𝅝</span><strong>Whole note</strong><small>4 beats</small></div>
                <div><span className="rhythm-symbol">𝅗𝅥</span><strong>Half note</strong><small>2 beats</small></div>
                <div><span className="rhythm-symbol">♩</span><strong>Quarter note</strong><small>1 beat</small></div>
                <div><span className="rhythm-symbol">♪</span><strong>Eighth note</strong><small>½ beat</small></div>
              </div>
              <button className="reset-rhythm" onClick={() => { setTapTimes([]); setRhythmScore(null) }}><RotateCcw size={14} /> Reset taps</button>
            </motion.div>
          )}

          {activeModule === 'keys' && (
            <motion.div className="theory-panel keys-lab" key="keys" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}>
              <div className="theory-panel-heading"><div><span>04 · Scales & keys</span><h3>See the shape of a key</h3></div><div className="clef-switch"><button className={scaleMode === 'major' ? 'active' : ''} onClick={() => setScaleMode('major')}>major</button><button className={scaleMode === 'minor' ? 'active' : ''} onClick={() => setScaleMode('minor')}>minor</button></div></div>
              <div className="key-picker">{keys.map((key) => <button key={key.name} className={selectedKey.name === key.name ? 'active' : ''} onClick={() => setSelectedKey(key)}>{key.name}</button>)}</div>
              <div className="scale-summary">
                <div><span>Selected key</span><strong>{selectedKey.name} {scaleMode}</strong><small>{selectedKey.fifths === 0 ? 'No sharps or flats' : `${Math.abs(selectedKey.fifths)} ${selectedKey.fifths > 0 ? 'sharp' : 'flat'}${Math.abs(selectedKey.fifths) === 1 ? '' : 's'}`}</small></div>
                <div className="scale-degrees">{scalePitchClasses.map((pitchClass, index) => <span key={pitchClass}><small>{index + 1}</small><strong>{midiNoteName(pitchClass + 60, preferFlats, false)}</strong></span>)}</div>
              </div>
              <div className="theory-keyboard-label"><span>The notes in this key are illuminated</span><small>Play the scale in any octave</small></div>
              <PianoKeyboard activeNotes={new Set(midi.activeNotes)} targetNotes={scaleMidiNotes} startMidi={rangeStart} endMidi={rangeEnd} onNoteOn={pianoNoteOn} onNoteOff={midi.virtualNoteOff} compact />
              <div className="scale-formula"><CircleGauge size={18} /><div><strong>{scaleMode === 'major' ? 'Tone · Tone · Semitone · Tone · Tone · Tone · Semitone' : 'Tone · Semitone · Tone · Tone · Semitone · Tone · Tone'}</strong><span>The distance formula stays the same in every {scaleMode} key.</span></div></div>
              <button className="mark-module" onClick={() => completeModule('keys')}><Check size={15} /> Mark explored</button>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </motion.div>
  )
}
