import { AnimatePresence, motion } from 'framer-motion'
import {
  Blocks,
  BookOpenCheck,
  Check,
  ChevronRight,
  CircleGauge,
  Clock3,
  Ear,
  KeyRound,
  Music2,
  MoveHorizontal,
  Play,
  RotateCcw,
  ScanLine,
  Sparkles,
  Target,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { UseMidiResult } from '../hooks/useMidi'
import type { KeyboardConfig } from '../lib/keyboardConfig'
import { formatMidiNote, getKeyboardConfigLabel, resolvePracticeRange } from '../lib/keyboardConfig'
import {
  buildTriad,
  getDiatonicTriads,
  getInterval,
  getScalePitchClasses,
  midiFrequency,
  midiNoteName,
  notesInScale,
  theoryAccuracy,
  triadName,
  type TheoryProgress,
} from '../lib/theory'
import { PianoKeyboard } from './PianoKeyboard'
import { SingleNoteStaff } from './SheetMusic'
import './TheoryLab.css'

type TheoryModule = 'explore' | 'reading' | 'rhythm' | 'keys' | 'intervals' | 'harmony'
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
  { id: 'intervals' as const, label: 'Intervals', detail: 'Measure musical distance', icon: MoveHorizontal },
  { id: 'harmony' as const, label: 'Chords & function', detail: 'Follow tension and release', icon: Blocks },
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

const intervalRoots = [60, 62, 64, 65, 67, 69]
const intervalChoices = [1, 2, 3, 4, 5, 7, 9, 12]

function pitchClassInRange(pitchClass: number, start: number, end: number, headroom = 0) {
  const candidates = Array.from({ length: Math.max(0, end - start - headroom + 1) }, (_, index) => start + index)
    .filter((midi) => midi % 12 === pitchClass)
  if (!candidates.length) return Math.max(start, Math.min(end, 60))
  return candidates.sort((left, right) => Math.abs(left - 60) - Math.abs(right - 60))[0]
}

function nextTarget(current: number, start: number, end: number, clef: ClefChoice, chromatic = false) {
  const safeLow = Math.max(start, clef === 'treble' ? 60 : 43)
  const safeHigh = Math.min(end, clef === 'bass' ? 60 : 79)
  const low = Math.min(safeLow, safeHigh)
  const high = Math.max(safeLow, safeHigh)
  const candidates = Array.from({ length: high - low + 1 }, (_, index) => low + index)
    .filter((note) => chromatic || ![1, 3, 6, 8, 10].includes(note % 12))
  if (!candidates.length) return Math.max(start, Math.min(end, 60))
  const currentIndex = candidates.indexOf(current)
  return candidates[(currentIndex + 3 + Math.floor(Math.random() * Math.max(1, candidates.length - 1))) % candidates.length]
}

export function TheoryLab({ midi, keyboardConfig, progress, onProgress, onOpenMidi }: TheoryLabProps) {
  const [activeModule, setActiveModule] = useState<TheoryModule>('explore')
  const [selectedMidi, setSelectedMidi] = useState(60)
  const [clef, setClef] = useState<ClefChoice>('both')
  const [quizTarget, setQuizTarget] = useState(60)
  const [quizStreak, setQuizStreak] = useState(0)
  const [quizFeedback, setQuizFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [revealTarget, setRevealTarget] = useState(false)
  const [readingChromatic, setReadingChromatic] = useState(false)
  const [targetBpm, setTargetBpm] = useState(80)
  const [tapTimes, setTapTimes] = useState<number[]>([])
  const [rhythmScore, setRhythmScore] = useState<number | null>(null)
  const [selectedKey, setSelectedKey] = useState(keys[0])
  const [scaleMode, setScaleMode] = useState<'major' | 'minor'>('major')
  const [pulse, setPulse] = useState(false)
  const [intervalRoot, setIntervalRoot] = useState(60)
  const [selectedInterval, setSelectedInterval] = useState(7)
  const [intervalWins, setIntervalWins] = useState(0)
  const [intervalFeedback, setIntervalFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [harmonyDegree, setHarmonyDegree] = useState(0)
  const [harmonyInversion, setHarmonyInversion] = useState(0)
  const [harmonyPlayed, setHarmonyPlayed] = useState<Set<number>>(() => new Set())
  const lastEventRef = useRef<number | null>(null)
  const feedbackTimerRef = useRef<number | null>(null)
  const [rangeStart, rangeEnd] = useMemo(() => resolvePracticeRange([], keyboardConfig), [keyboardConfig])
  const noteClef = selectedMidi < 60 ? 'bass' : 'treble'
  const quizClef = clef === 'both' ? (quizTarget < 60 ? 'bass' : 'treble') : clef
  const scalePitchClasses = useMemo(() => getScalePitchClasses(selectedKey.root, scaleMode), [scaleMode, selectedKey.root])
  const scaleMidiNotes = useMemo(() => new Set(notesInScale(rangeStart, rangeEnd, selectedKey.root, scaleMode)), [rangeEnd, rangeStart, scaleMode, selectedKey.root])
  const preferFlats = selectedKey.flats
  const selectedIntervalDefinition = getInterval(selectedInterval)
  const intervalRootMidi = Math.max(rangeStart, Math.min(intervalRoot, rangeEnd - selectedInterval))
  const intervalTarget = Math.min(rangeEnd, intervalRootMidi + selectedInterval)
  const intervalTargetNotes = useMemo(() => new Set([intervalRootMidi, intervalTarget]), [intervalRootMidi, intervalTarget])
  const diatonicTriads = useMemo(() => getDiatonicTriads(selectedKey.root, scaleMode), [scaleMode, selectedKey.root])
  const selectedHarmony = diatonicTriads[harmonyDegree] ?? diatonicTriads[0]
  const harmonyRootMidi = pitchClassInRange(selectedHarmony.root, rangeStart, rangeEnd, 16)
  const harmonyMidiNotes = useMemo(
    () => buildTriad(harmonyRootMidi, selectedHarmony.quality, harmonyInversion),
    [harmonyInversion, harmonyRootMidi, selectedHarmony.quality],
  )
  const harmonyTargets = useMemo(() => new Set(harmonyMidiNotes), [harmonyMidiNotes])
  const completedModuleCount = modules.filter((module) => progress.completedModules.includes(module.id)).length
  const selectedDisplay = formatMidiNote(selectedMidi, keyboardConfig.noteNaming)
  const selectedPitch = selectedDisplay.replace(/-?\d+$/, '')
  const selectedOctave = selectedDisplay.slice(selectedPitch.length)

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
          setQuizTarget((target) => nextTarget(target, rangeStart, rangeEnd, clef, readingChromatic))
          setRevealTarget(false)
        }
      }, correct ? 520 : 800)
    } else if (activeModule === 'rhythm') {
      registerTap(event.timestamp)
    } else if (activeModule === 'intervals') {
      if (event.note === intervalRootMidi) return
      const correct = event.note === intervalTarget
      setIntervalFeedback(correct ? 'correct' : 'wrong')
      if (correct) {
        const nextWins = intervalWins + 1
        setIntervalWins(nextWins)
        if (nextWins >= 5) completeModule('intervals')
      }
      if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current)
      feedbackTimerRef.current = window.setTimeout(() => setIntervalFeedback(null), correct ? 520 : 850)
    } else if (activeModule === 'harmony' && harmonyMidiNotes.includes(event.note)) {
      const nextPlayed = new Set(harmonyPlayed).add(event.note)
      setHarmonyPlayed(nextPlayed)
      if (harmonyMidiNotes.every((note) => nextPlayed.has(note))) completeModule('harmony')
    }
  }, [activeModule, clef, completeModule, harmonyMidiNotes, harmonyPlayed, intervalRootMidi, intervalTarget, intervalWins, midi.lastEvent, onProgress, progress, quizStreak, quizTarget, rangeEnd, rangeStart, readingChromatic, registerTap])

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

  useEffect(() => {
    setHarmonyPlayed(new Set())
  }, [harmonyDegree, harmonyInversion, scaleMode, selectedKey.root])

  function pianoNoteOn(note: number) {
    midi.virtualNoteOn(note)
  }

  return (
    <motion.div className="theory-view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <section className="theory-intro">
        <div>
          <span className="section-kicker"><BookOpenCheck size={14} /> Interactive theory</span>
          <h2>See it. Find it.<br />Play it.</h2>
          <p>Notation, rhythm, intervals, scales, and harmony—connected directly to the keys under your hands.</p>
        </div>
        <div className="theory-mastery">
          <div className="mastery-ring" style={{ '--mastery': `${Math.round((completedModuleCount / modules.length) * 100)}%` } as React.CSSProperties}>
            <strong>{completedModuleCount}<small> / {modules.length}</small></strong><span>modules explored</span>
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
                <div className="note-name-display"><small>Selected note</small><strong>{selectedPitch}<sup>{selectedOctave}</sup></strong><span>{midiFrequency(selectedMidi).toFixed(1)} Hz · MIDI {selectedMidi}</span></div>
                <SingleNoteStaff midi={selectedMidi} clef={noteClef} label={`${noteClef} clef`} noteNaming={keyboardConfig.noteNaming} />
                <div className="note-landmark"><Target size={18} /><div><strong>{selectedMidi % 12 === 0 ? 'Keyboard landmark' : 'Find its nearest C'}</strong><span>{selectedMidi % 12 === 0 ? 'C sits immediately left of every two-black-key group.' : `${formatMidiNote(selectedMidi - (selectedMidi % 12), keyboardConfig.noteNaming)} begins this octave.`}</span></div></div>
              </div>
              <div className="theory-keyboard-label"><span>Play or click any key</span><small>{getKeyboardConfigLabel(keyboardConfig)}</small></div>
              <PianoKeyboard activeNotes={new Set(midi.activeNotes)} startMidi={rangeStart} endMidi={rangeEnd} onNoteOn={pianoNoteOn} onNoteOff={midi.virtualNoteOff} noteNaming={keyboardConfig.noteNaming} compact />
              <div className="notation-glossary">
                <div><strong>Pitch</strong><span>How high or low a sound is.</span></div>
                <div><strong>Octave</strong><span>The same note name, 12 keys apart.</span></div>
                <div><strong>Sharp / flat</strong><span>The black key above or below a natural note.</span></div>
              </div>
              <button className="mark-module" onClick={() => completeModule('explore')}><Check size={15} /> Mark explored</button>
            </motion.div>
          )}

          {activeModule === 'reading' && (
            <motion.div className="theory-panel reading-quiz" key="reading" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}>
              <div className="theory-panel-heading"><div><span>02 · Staff reader</span><h3>Play the note you see</h3></div><div className="clef-switch">{(['treble', 'bass', 'both'] as ClefChoice[]).map((item) => <button key={item} className={clef === item ? 'active' : ''} onClick={() => { setClef(item); setQuizTarget((target) => nextTarget(target, rangeStart, rangeEnd, item, readingChromatic)) }}>{item}</button>)}</div></div>
              <div className={quizFeedback ? `quiz-score ${quizFeedback}` : 'quiz-score'}>
                <div className="quiz-prompt"><span>{quizFeedback === 'correct' ? 'Exactly right' : quizFeedback === 'wrong' ? `That was ${formatMidiNote(selectedMidi, keyboardConfig.noteNaming)}` : 'Read, then play'}</span><h4>{quizFeedback === 'wrong' ? `Find ${formatMidiNote(quizTarget, keyboardConfig.noteNaming)}` : 'What note is this?'}</h4></div>
                <SingleNoteStaff midi={quizTarget} clef={quizClef} compact={false} noteNaming={keyboardConfig.noteNaming} />
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
                noteNaming={keyboardConfig.noteNaming}
                compact
              />
              <div className="quiz-actions"><button className={readingChromatic ? 'active' : ''} onClick={() => { const next = !readingChromatic; setReadingChromatic(next); setQuizTarget((target) => nextTarget(target, rangeStart, rangeEnd, clef, next)) }}>{readingChromatic ? 'Accidentals on' : 'Natural notes'}</button><button onClick={() => setRevealTarget(true)}><ScanLine size={15} /> Show me the key</button><button onClick={() => setQuizTarget((target) => nextTarget(target, rangeStart, rangeEnd, clef, readingChromatic))}>Skip note <ChevronRight size={15} /></button></div>
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
              <PianoKeyboard activeNotes={new Set(midi.activeNotes)} targetNotes={scaleMidiNotes} startMidi={rangeStart} endMidi={rangeEnd} onNoteOn={pianoNoteOn} onNoteOff={midi.virtualNoteOff} noteNaming={keyboardConfig.noteNaming} compact />
              <div className="scale-formula"><CircleGauge size={18} /><div><strong>{scaleMode === 'major' ? 'Tone · Tone · Semitone · Tone · Tone · Tone · Semitone' : 'Tone · Semitone · Tone · Tone · Semitone · Tone · Tone'}</strong><span>The distance formula stays the same in every {scaleMode} key.</span></div></div>
              <button className="mark-module" onClick={() => completeModule('keys')}><Check size={15} /> Mark explored</button>
            </motion.div>
          )}

          {activeModule === 'intervals' && (
            <motion.div className="theory-panel interval-lab" key="intervals" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}>
              <div className="theory-panel-heading"><div><span>05 · Intervals</span><h3>Measure the space between notes</h3></div><span className="module-status"><Target size={13} /> {Math.min(intervalWins, 5)} / 5 found</span></div>
              <div className="interval-controls">
                <div><span>Start note</span><div className="root-picker">{intervalRoots.filter((midi) => midi >= rangeStart && midi <= rangeEnd).map((midi) => <button key={midi} className={intervalRoot === midi ? 'active' : ''} onClick={() => { setIntervalRoot(midi); setIntervalFeedback(null) }}>{formatMidiNote(midi, keyboardConfig.noteNaming)}</button>)}</div></div>
                <div><span>Distance</span><div className="interval-picker">{intervalChoices.map((semitones) => { const interval = getInterval(semitones); return <button key={semitones} className={selectedInterval === semitones ? 'active' : ''} onClick={() => { setSelectedInterval(semitones); setIntervalFeedback(null) }}><strong>{interval.shortName}</strong><small>{semitones}</small></button> })}</div></div>
              </div>
              <div className={intervalFeedback ? `interval-stage ${intervalFeedback}` : 'interval-stage'}>
                <div className="interval-identity"><span>{selectedIntervalDefinition.shortName}</span><div><strong>{selectedIntervalDefinition.name}</strong><small>{selectedIntervalDefinition.character}</small></div></div>
                <div className="interval-distance" aria-label={`${selectedIntervalDefinition.name} from ${formatMidiNote(intervalRootMidi, keyboardConfig.noteNaming)} to ${formatMidiNote(intervalTarget, keyboardConfig.noteNaming)}`}>
                  <strong>{formatMidiNote(intervalRootMidi, keyboardConfig.noteNaming)}</strong><i><b style={{ width: `${Math.max(8, (selectedInterval / 12) * 100)}%` }} /></i><strong>{formatMidiNote(intervalTarget, keyboardConfig.noteNaming)}</strong>
                </div>
                <div className="interval-prompt"><span>{intervalFeedback === 'correct' ? 'Exactly right' : intervalFeedback === 'wrong' ? `You played ${formatMidiNote(selectedMidi, keyboardConfig.noteNaming)}` : 'Play the upper note'}</span><strong>{intervalFeedback === 'wrong' ? `Find ${formatMidiNote(intervalTarget, keyboardConfig.noteNaming)}` : `${selectedInterval} semitone${selectedInterval === 1 ? '' : 's'} above the root`}</strong></div>
              </div>
              <div className="theory-keyboard-label"><span>Root and target are illuminated</span><small>Play the upper note to answer</small></div>
              <PianoKeyboard
                activeNotes={new Set(midi.activeNotes)}
                targetNotes={intervalTargetNotes}
                correctNotes={intervalFeedback === 'correct' ? new Set([intervalTarget]) : undefined}
                wrongNotes={intervalFeedback === 'wrong' ? new Set([selectedMidi]) : undefined}
                startMidi={rangeStart}
                endMidi={rangeEnd}
                onNoteOn={pianoNoteOn}
                onNoteOff={midi.virtualNoteOff}
                noteNaming={keyboardConfig.noteNaming}
                compact
              />
              <div className="interval-guide"><span><b>Perfect</b> unison, fourth, fifth, octave</span><span><b>Major / minor</b> seconds, thirds, sixths, sevenths</span><span><b>Tritone</b> six semitones, exactly half an octave</span></div>
            </motion.div>
          )}

          {activeModule === 'harmony' && (
            <motion.div className="theory-panel harmony-lab" key="harmony" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}>
              <div className="theory-panel-heading"><div><span>06 · Chords & function</span><h3>Follow tension into release</h3></div><div className="clef-switch"><button className={scaleMode === 'major' ? 'active' : ''} onClick={() => setScaleMode('major')}>major</button><button className={scaleMode === 'minor' ? 'active' : ''} onClick={() => setScaleMode('minor')}>minor</button></div></div>
              <div className="key-picker">{keys.map((key) => <button key={key.name} className={selectedKey.name === key.name ? 'active' : ''} onClick={() => { setSelectedKey(key); setHarmonyDegree(0) }}>{key.name}</button>)}</div>
              <div className="harmony-degrees">{diatonicTriads.map((chord, index) => <button key={`${chord.roman}-${chord.root}`} className={harmonyDegree === index ? 'active' : ''} onClick={() => setHarmonyDegree(index)}><strong>{chord.roman}</strong><span>{triadName(chord.root, chord.quality, preferFlats)}</span><small>{chord.function}</small></button>)}</div>
              <div className="harmony-stage">
                <div className="harmony-name"><span>{selectedHarmony.function} function</span><strong>{triadName(selectedHarmony.root, selectedHarmony.quality, preferFlats)}</strong><small>{selectedHarmony.roman} in {selectedKey.name} {scaleMode}</small></div>
                <div className="chord-tones">{harmonyMidiNotes.map((midiNote, index) => <span key={midiNote} className={harmonyPlayed.has(midiNote) ? 'played' : ''}><small>{index === 0 ? 'low' : index === harmonyMidiNotes.length - 1 ? 'high' : 'middle'}</small><strong>{midiNoteName(midiNote, preferFlats, false)}</strong></span>)}</div>
                <div className="inversion-control"><span>Voicing</span><div className="clef-switch">{['Root', '1st inv.', '2nd inv.'].map((label, index) => <button key={label} className={harmonyInversion === index ? 'active' : ''} onClick={() => setHarmonyInversion(index)}>{label}</button>)}</div></div>
              </div>
              <div className="theory-keyboard-label"><span>Play all three illuminated notes</span><small>Order does not matter</small></div>
              <PianoKeyboard activeNotes={new Set(midi.activeNotes)} targetNotes={harmonyTargets} correctNotes={harmonyPlayed} startMidi={rangeStart} endMidi={rangeEnd} onNoteOn={pianoNoteOn} onNoteOff={midi.virtualNoteOff} noteNaming={keyboardConfig.noteNaming} compact />
              <div className="function-flow"><span><b>Tonic</b> feels settled</span><ChevronRight size={14} /><span><b>Predominant</b> moves away</span><ChevronRight size={14} /><span><b>Dominant</b> creates tension</span><ChevronRight size={14} /><span><b>Tonic</b> releases</span></div>
              <button className="mark-module" onClick={() => completeModule('harmony')}><Check size={15} /> Mark explored</button>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </motion.div>
  )
}
