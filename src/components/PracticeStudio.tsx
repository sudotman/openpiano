import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  Award,
  Cable,
  Check,
  ChevronDown,
  Gauge,
  Hand,
  Headphones,
  Pause,
  Play,
  RefreshCcw,
  RotateCcw,
  Settings2,
  Sparkles,
  Target,
  Timer,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { UseMidiResult } from '../hooks/useMidi'
import { createPianoSynth, type PianoSynth } from '../lib/audio'
import { formatMidiNote, resolvePracticeRange, type KeyboardConfig } from '../lib/keyboardConfig'
import { getPracticeCompletionAction, type PracticeTempoPercent } from '../lib/practiceSettings'
import { playbackBpm, playbackBpmBounds, playbackRateForBpm } from '../lib/practicePlayback'
import type { Lesson, Song, SongNote } from '../types'
import { NoteHighway } from './NoteHighway'
import { PianoKeyboard } from './PianoKeyboard'
import './PracticeStudio.css'

const SheetMusic = lazy(() => import('./SheetMusic').then((module) => ({ default: module.SheetMusic })))

type PracticeMode = 'wait' | 'flow'
type HandMode = 'both' | 'right' | 'left'
type VisualMode = 'tiles' | 'sheet' | 'both'
type SessionKind = 'practice' | 'listen'

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
  onNextLesson: (lesson: Lesson) => void
  onResumeAudio: () => Promise<void>
  keyboardConfig: KeyboardConfig
  defaultTempoPercent: PracticeTempoPercent
  autoStart?: boolean
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
  onNextLesson,
  onResumeAudio,
  keyboardConfig,
  defaultTempoPercent,
  autoStart = false,
}: PracticeStudioProps) {
  const [mode, setMode] = useState<PracticeMode>('wait')
  const [handMode, setHandMode] = useState<HandMode>('both')
  const [visualMode, setVisualMode] = useState<VisualMode>('tiles')
  const [speed, setSpeed] = useState(defaultTempoPercent / 100)
  const [sessionKind, setSessionKind] = useState<SessionKind>('practice')
  const [backingTrack, setBackingTrack] = useState(false)
  const [metronomeEnabled, setMetronomeEnabled] = useState(false)
  const [playing, setPlaying] = useState(autoStart)
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
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(() => autoStart ? Date.now() : null)
  const hitRef = useRef(hitNotes)
  const missedRef = useRef(missedNotes)
  const completedRef = useRef(false)
  const lastEventRef = useRef<number | null>(null)
  const lastResultEventRef = useRef(midi.lastEvent)
  const armedResultShortcutRef = useRef<{ note: number; action: 'repeat' | 'next' } | null>(null)
  const previousHandModeRef = useRef(handMode)
  const feedbackTimer = useRef<number | null>(null)
  const trackSynthRef = useRef<PianoSynth | null>(null)
  const metronomeSynthRef = useRef<PianoSynth | null>(null)
  const trackReleaseTimersRef = useRef<Set<number>>(new Set())
  const metronomeReleaseTimersRef = useRef<Set<number>>(new Set())
  const trackMidiGenerationRef = useRef<Map<number, string>>(new Map())
  const lastTrackTimeRef = useRef(0)
  const lastTrackSpeedRef = useRef(speed)
  const trackWasPlayingRef = useRef(false)
  const trackNextNoteIndexRef = useRef(0)
  const practiceNotes = useMemo(
    () => song.notes.filter((note) => handMode === 'both' || note.hand === handMode),
    [handMode, song.notes],
  )
  const [startMidi, endMidi] = useMemo(
    () => resolvePracticeRange(practiceNotes, keyboardConfig),
    [keyboardConfig, practiceNotes],
  )
  const originalBpm = Math.max(1, Math.round(song.bpm))
  const effectiveBpm = playbackBpm(originalBpm, speed)
  const playbackPercent = Math.round(speed * 100)
  const tempoBounds = playbackBpmBounds(originalBpm)

  useEffect(() => { hitRef.current = hitNotes }, [hitNotes])
  useEffect(() => { missedRef.current = missedNotes }, [missedNotes])

  const silenceTrack = useCallback(() => {
    for (const timer of trackReleaseTimersRef.current) window.clearTimeout(timer)
    trackReleaseTimersRef.current.clear()
    trackMidiGenerationRef.current.clear()
    trackSynthRef.current?.stopAll(.025)
  }, [])

  const silenceMetronome = useCallback(() => {
    for (const timer of metronomeReleaseTimersRef.current) window.clearTimeout(timer)
    metronomeReleaseTimersRef.current.clear()
    metronomeSynthRef.current?.stopAll(.01)
  }, [])

  useEffect(() => {
    const trackSynth = createPianoSynth({ volume: .24, maxPolyphony: 48 })
    const metronomeSynth = createPianoSynth({ volume: .14, maxPolyphony: 4 })
    trackSynthRef.current = trackSynth
    metronomeSynthRef.current = metronomeSynth

    return () => {
      silenceTrack()
      silenceMetronome()
      if (trackSynthRef.current === trackSynth) trackSynthRef.current = null
      if (metronomeSynthRef.current === metronomeSynth) metronomeSynthRef.current = null
      void trackSynth.dispose()
      void metronomeSynth.dispose()
    }
  }, [silenceMetronome, silenceTrack])

  const clearSession = useCallback(() => {
    silenceTrack()
    silenceMetronome()
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
    lastTrackTimeRef.current = 0
    trackWasPlayingRef.current = false
    trackNextNoteIndexRef.current = 0
  }, [silenceMetronome, silenceTrack])

  const restart = useCallback((startImmediately = false) => {
    clearSession()
    setSessionKind('practice')
    if (startImmediately) {
      setSessionStartedAt(Date.now())
      setPlaying(true)
    }
  }, [clearSession])

  useEffect(() => {
    if (previousHandModeRef.current === handMode) return
    previousHandModeRef.current = handMode
    restart()
  }, [handMode, restart])

  useEffect(() => {
    setSpeed(defaultTempoPercent / 100)
  }, [defaultTempoPercent, song.id])

  useEffect(() => {
    if (!settingsOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [settingsOpen])

  useEffect(() => {
    if (!playing) return
    let frame = 0
    let previous = performance.now()

    const tick = (now: number) => {
      const delta = Math.min(.05, (now - previous) / 1000)
      previous = now
      setCurrentTime((current) => {
        let next = current + delta * speed
        if (mode === 'wait' && sessionKind === 'practice') {
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
  }, [mode, playing, practiceNotes, sessionKind, song.duration, speed])

  useEffect(() => {
    const shouldPlayTrack = playing && (sessionKind === 'listen' || backingTrack)
    if (!shouldPlayTrack) {
      if (trackWasPlayingRef.current) silenceTrack()
      trackWasPlayingRef.current = false
      lastTrackTimeRef.current = currentTime
      lastTrackSpeedRef.current = speed
      return
    }

    const previousTime = lastTrackTimeRef.current
    const speedChanged = Math.abs(lastTrackSpeedRef.current - speed) > .0001
    const resync = !trackWasPlayingRef.current
      || speedChanged
      || currentTime < previousTime - .01
      || currentTime - previousTime > .25

    if (resync) silenceTrack()

    let nextNoteIndex = resync ? 0 : trackNextNoteIndexRef.current
    const notesToStart: SongNote[] = []
    while (nextNoteIndex < song.notes.length && song.notes[nextNoteIndex].time <= currentTime + .0001) {
      const note = song.notes[nextNoteIndex]
      if (resync ? note.time + note.duration > currentTime : note.time > previousTime + .0001) notesToStart.push(note)
      nextNoteIndex += 1
    }

    const startTrackNote = (note: SongNote) => {
      const remainingSongSeconds = Math.max(.035, note.time + note.duration - currentTime)
      const generation = `${note.id}:${currentTime}`
      trackMidiGenerationRef.current.set(note.midi, generation)
      trackSynthRef.current?.noteOn(note.midi, note.velocity)

      const timer = window.setTimeout(() => {
        trackReleaseTimersRef.current.delete(timer)
        if (trackMidiGenerationRef.current.get(note.midi) !== generation) return
        trackMidiGenerationRef.current.delete(note.midi)
        trackSynthRef.current?.noteOff(note.midi)
      }, Math.max(35, (remainingSongSeconds / speed) * 1000))
      trackReleaseTimersRef.current.add(timer)
    }

    notesToStart.forEach(startTrackNote)
    lastTrackTimeRef.current = currentTime
    lastTrackSpeedRef.current = speed
    trackNextNoteIndexRef.current = nextNoteIndex
    trackWasPlayingRef.current = true
  }, [backingTrack, currentTime, playing, sessionKind, silenceTrack, song.notes, speed])

  useEffect(() => {
    if (!playing || !metronomeEnabled) {
      silenceMetronome()
      return
    }

    const beatSeconds = 60 / originalBpm
    const beatsPerMeasure = Math.max(1, Number.parseInt(song.signature.split('/')[0] ?? '4', 10) || 4)
    let beat = Math.max(0, Math.ceil((currentTime - .001) / beatSeconds))
    let intervalTimer: number | null = null

    const click = () => {
      const note = beat % beatsPerMeasure === 0 ? 96 : 88
      metronomeSynthRef.current?.noteOn(note, beat % beatsPerMeasure === 0 ? 118 : 88)
      const timer = window.setTimeout(() => {
        metronomeReleaseTimersRef.current.delete(timer)
        metronomeSynthRef.current?.noteOff(note)
      }, 45)
      metronomeReleaseTimersRef.current.add(timer)
      beat += 1
    }

    const firstBeatDelay = Math.max(0, ((beat * beatSeconds - currentTime) / speed) * 1000)
    const startTimer = window.setTimeout(() => {
      click()
      intervalTimer = window.setInterval(click, 60_000 / (originalBpm * speed))
    }, firstBeatDelay)

    return () => {
      window.clearTimeout(startTimer)
      if (intervalTimer !== null) window.clearInterval(intervalTimer)
      silenceMetronome()
    }
  // The clock intentionally captures the timeline position only when playback,
  // tempo, or the toggle changes; it must keep clicking while Wait mode is held.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metronomeEnabled, originalBpm, playing, silenceMetronome, song.signature, speed])

  useEffect(() => {
    if (mode !== 'flow' || !playing || sessionKind === 'listen') return
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
  }, [currentTime, mode, playing, practiceNotes, sessionKind])

  useEffect(() => {
    if (currentTime < song.duration || completedRef.current) return
    completedRef.current = true
    setPlaying(false)
    if (sessionKind === 'listen') return
    if (!sessionStartedAt) return
    const remaining = practiceNotes.filter((note) => !hitRef.current.has(note.id))
    setMissedNotes((current) => {
      const next = new Set(current)
      remaining.forEach((note) => next.add(note.id))
      missedRef.current = next
      return next
    })
    const resultTimer = window.setTimeout(() => setShowResults(true), 380)
    return () => window.clearTimeout(resultTimer)
  }, [currentTime, practiceNotes, sessionKind, sessionStartedAt, song.duration])

  useEffect(() => {
    const event = midi.lastEvent
    if (!event || event.type !== 'noteon' || event.timestamp === lastEventRef.current) return
    lastEventRef.current = event.timestamp
    if (!playing || sessionKind === 'listen') return

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
  }, [midi.lastEvent, mode, playing, practiceNotes, currentTime, sessionKind])

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

  async function resumePlaybackAudio() {
    await Promise.all([
      onResumeAudio().catch(() => undefined),
      trackSynthRef.current?.resume().catch(() => undefined),
      metronomeSynthRef.current?.resume().catch(() => undefined),
    ])
  }

  async function startPractice() {
    await resumePlaybackAudio()
    clearSession()
    setSessionKind('practice')
    setSessionStartedAt(Date.now())
    setPlaying(true)
  }

  async function listenToTrack() {
    await resumePlaybackAudio()
    clearSession()
    setSessionKind('listen')
    setPlaying(true)
  }

  async function togglePlay() {
    await resumePlaybackAudio()
    if (currentTime >= song.duration) {
      clearSession()
      if (sessionKind === 'practice') setSessionStartedAt(Date.now())
    } else if (sessionKind === 'practice' && !sessionStartedAt) {
      setSessionStartedAt(Date.now())
    }
    setPlaying((current) => !current)
  }

  function setExactBpm(bpm: number) {
    setSpeed(playbackRateForBpm(originalBpm, bpm))
  }

  function finishSession() {
    onComplete({
      songTitle: song.title,
      accuracy,
      notes: hitNotes.size,
      duration: sessionMinutes,
      lessonId: lesson?.id,
    })
    if (lesson) onNextLesson(lesson)
    else onBack()
  }

  useEffect(() => {
    const event = midi.lastEvent
    if (!event || event === lastResultEventRef.current) return
    lastResultEventRef.current = event

    if (!showResults || event.source !== 'midi') {
      armedResultShortcutRef.current = null
      return
    }

    const action = getPracticeCompletionAction(
      event.note,
      keyboardConfig.startMidi,
      keyboardConfig.endMidi,
    )

    if (event.type === 'noteon') {
      armedResultShortcutRef.current = action ? { note: event.note, action } : null
      return
    }

    const armed = armedResultShortcutRef.current
    if (!armed || armed.note !== event.note) return
    armedResultShortcutRef.current = null

    if (armed.action === 'repeat') {
      void onResumeAudio().catch(() => undefined)
      restart(true)
      return
    }
    finishSession()
  // finishSession intentionally represents the current score when the result
  // key is released; the MIDI event identity prevents replay on rerenders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyboardConfig.endMidi, keyboardConfig.startMidi, midi.lastEvent, onResumeAudio, restart, showResults])

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
            {sessionKind === 'listen' ? (
              <span className="listen-status"><Headphones size={14} /> Listening only<small>no scoring</small></span>
            ) : (
              <>
                <span><Target size={14} /> {hitNotes.size}<small> hit</small></span>
                <span><Sparkles size={14} /> {streak}<small> streak</small></span>
                <span className="accuracy-live">{hitNotes.size || missedNotes.size ? accuracy : '—'}<small>% accuracy</small></span>
              </>
            )}
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
              <div className="start-cue-actions">
                <button onClick={startPractice}><Play size={18} fill="currentColor" /> Start practice</button>
                <button className="secondary" onClick={listenToTrack}><Headphones size={18} /> Hear track first</button>
              </div>
            </div>
          )}
          {!playing && sessionKind === 'listen' && currentTime >= song.duration && (
            <div className="start-cue">
              <span>Track preview complete</span>
              <strong>Ready to try it yourself?</strong>
              <div className="start-cue-actions">
                <button onClick={startPractice}><Play size={18} fill="currentColor" /> Start practice</button>
                <button className="secondary" onClick={listenToTrack}><Headphones size={18} /> Listen again</button>
              </div>
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
            <button onClick={() => restart()} aria-label="Restart"><RotateCcw size={17} /></button>
            <button className="play-control" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}</button>
            <button onClick={() => setCurrentTime((time) => Math.min(song.duration, time + 5))} aria-label="Skip ahead"><RefreshCcw size={17} className="skip-icon" /></button>
          </div>
          <div className="transport-options">
            <button
              className={metronomeEnabled ? 'metronome-control active' : 'metronome-control'}
              onClick={() => setMetronomeEnabled((enabled) => !enabled)}
              aria-pressed={metronomeEnabled}
              aria-label={metronomeEnabled ? 'Turn metronome off' : `Turn metronome on at ${effectiveBpm} BPM`}
            >
              <Timer size={15} /> Metronome <small>{metronomeEnabled ? 'On' : 'Off'}</small>
            </button>
            <button
              className={backingTrack ? 'track-control active' : 'track-control'}
              onClick={() => setBackingTrack((enabled) => !enabled)}
              disabled={sessionKind === 'listen'}
              aria-pressed={backingTrack}
              aria-label={backingTrack ? 'Turn backing track off' : 'Play the track alongside practice'}
            >
              {backingTrack || sessionKind === 'listen' ? <Volume2 size={15} /> : <VolumeX size={15} />}
              Track <small>{sessionKind === 'listen' ? 'Preview' : backingTrack ? 'On' : 'Off'}</small>
            </button>
            <button className="speed-control" onClick={() => setSettingsOpen(true)} aria-label={`Tempo ${effectiveBpm} BPM, ${playbackPercent}% of original`}><Gauge size={15} /> {effectiveBpm} BPM <small>{playbackPercent}%</small></button>
          </div>
        </div>
      </main>

      <AnimatePresence>
        {settingsOpen && (
          <motion.div className="settings-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="settings-scrim" onClick={() => setSettingsOpen(false)} />
            <motion.aside
              className="practice-settings-popover"
              role="dialog"
              aria-modal="true"
              aria-labelledby="practice-settings-title"
              initial={{ opacity: 0, x: 14, y: -5 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, x: 14, y: -5 }}
            >
              <div className="settings-heading"><strong id="practice-settings-title">Practice settings</strong><button onClick={() => setSettingsOpen(false)} aria-label="Close practice settings"><X size={16} /></button></div>
              <section className="setting-block tempo-setting">
                <div className="setting-label"><span>Playback tempo</span><strong>{effectiveBpm} BPM</strong></div>
                <small>Original tempo: {originalBpm} BPM · Playing at {playbackPercent}%</small>
                <div className="tempo-input-row">
                  <input aria-label="Playback tempo in BPM" type="range" min={tempoBounds.min} max={tempoBounds.max} step="1" value={effectiveBpm} onChange={(event) => setExactBpm(Number(event.target.value))} />
                  <label className="bpm-input"><input aria-label="Exact playback BPM" type="number" min={tempoBounds.min} max={tempoBounds.max} value={effectiveBpm} onChange={(event) => setExactBpm(Number(event.target.value))} /><span>BPM</span></label>
                </div>
                <div className="tempo-presets" aria-label="Tempo presets">
                  {[.5, .75, 1].map((preset) => <button key={preset} className={Math.abs(speed - preset) < .005 ? 'active' : ''} onClick={() => setSpeed(preset)}>{preset * 100}% <small>{playbackBpm(originalBpm, preset)} BPM</small></button>)}
                </div>
              </section>
              <section className="setting-block">
                <div className="setting-label"><span>Backing track</span><small>Hear the full arrangement while you play</small></div>
                <div className="setting-choice" role="group" aria-label="Backing track">
                  <button className={!backingTrack ? 'active' : ''} onClick={() => setBackingTrack(false)}><VolumeX size={14} /> Off</button>
                  <button className={backingTrack ? 'active' : ''} onClick={() => setBackingTrack(true)}><Volume2 size={14} /> Play alongside</button>
                </div>
              </section>
              <section className="setting-block">
                <div className="setting-label"><span>Metronome</span><small>Steady click at {effectiveBpm} BPM</small></div>
                <div className="setting-choice" role="group" aria-label="Metronome">
                  <button className={!metronomeEnabled ? 'active' : ''} onClick={() => setMetronomeEnabled(false)}>Off</button>
                  <button className={metronomeEnabled ? 'active' : ''} onClick={() => setMetronomeEnabled(true)}><Timer size={14} /> On</button>
                </div>
              </section>
              <section className="setting-block">
                <div className="setting-label"><span>Timeline mode</span><small>{mode === 'wait' ? 'Waits for each correct note' : 'Keeps moving in real time'}</small></div>
                <div className="setting-choice" role="group" aria-label="Timeline mode">
                  <button className={mode === 'wait' ? 'active' : ''} onClick={() => setMode('wait')}>Wait</button>
                  <button className={mode === 'flow' ? 'active' : ''} onClick={() => setMode('flow')}>Flow</button>
                </div>
              </section>
              <p><Headphones size={13} /> “Hear track first” previews without scoring. Backing track plays the arrangement alongside you.</p>
            </motion.aside>
          </motion.div>
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
              {midi.isConnected && (
                <div className="result-midi-shortcuts">
                  <span><kbd>{formatMidiNote(keyboardConfig.startMidi, keyboardConfig.noteNaming)}</kbd> Repeat</span>
                  <i />
                  <span><kbd>{formatMidiNote(keyboardConfig.endMidi, keyboardConfig.noteNaming)}</kbd> {lesson ? 'Next lesson' : 'Finish'}</span>
                </div>
              )}
              <div className="result-actions"><button onClick={() => restart()}>Practice again</button><button className="primary-action" onClick={finishSession}>{lesson ? 'Next lesson' : 'Finish'} <ArrowLeft size={16} className="continue-arrow" /></button></div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export type { PracticeResult }
