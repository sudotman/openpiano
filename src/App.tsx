import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppShell, type AppView } from './components/AppShell'
import { LearnView } from './components/LearnView'
import { LessonSheet } from './components/LessonSheet'
import { MidiDrawer } from './components/MidiDrawer'
import { PracticeStudio, type PracticeResult } from './components/PracticeStudio'
import { ProgressView, type SessionRecord } from './components/ProgressView'
import { SetupView } from './components/SetupView'
import { SongLibrary } from './components/SongLibrary'
import { builtInSongs, getSong, lessons } from './data/curriculum'
import { useMidi, type MidiNoteEvent } from './hooks/useMidi'
import { createPianoSynth, type PianoSynth } from './lib/audio'
import { importMidiFile } from './lib/midiImport'
import type { Lesson, Song } from './types'

const STORAGE = {
  songs: 'openpiano:imported-songs:v1',
  lessons: 'openpiano:completed-lessons:v1',
  sessions: 'openpiano:practice-sessions:v1',
}

function readStored<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key)
    return value ? JSON.parse(value) as T : fallback
  } catch {
    return fallback
  }
}

function writeStored(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // The in-memory session remains usable when storage is full or disabled.
  }
}

interface PracticeContext {
  song: Song
  lesson: Lesson | null
}

export default function App() {
  const synthRef = useRef<PianoSynth | null>(null)
  if (!synthRef.current) synthRef.current = createPianoSynth({ volume: .34, maxPolyphony: 36 })

  const handleNoteOn = useCallback((event: MidiNoteEvent) => {
    synthRef.current?.noteOn(event.note, event.velocity)
  }, [])
  const handleNoteOff = useCallback((event: MidiNoteEvent) => {
    synthRef.current?.noteOff(event.note)
  }, [])
  const midi = useMidi({ onNoteOn: handleNoteOn, onNoteOff: handleNoteOff })

  const [activeView, setActiveView] = useState<AppView>('learn')
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null)
  const [practice, setPractice] = useState<PracticeContext | null>(null)
  const [midiDrawerOpen, setMidiDrawerOpen] = useState(false)
  const [importedSongs, setImportedSongs] = useState<Song[]>(() => readStored(STORAGE.songs, []))
  const [completedLessonIds, setCompletedLessonIds] = useState<string[]>(() => readStored(STORAGE.lessons, ['l1-posture-pulse']))
  const [sessions, setSessions] = useState<SessionRecord[]>(() => readStored(STORAGE.sessions, []))
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')

  const songs = useMemo(() => [...importedSongs, ...builtInSongs], [importedSongs])
  const lessonSong = selectedLesson?.songId ? getSong(selectedLesson.songId) : undefined

  useEffect(() => {
    const openSongbook = () => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      setActiveView('songs')
    }
    window.addEventListener('open-songbook', openSongbook)
    return () => window.removeEventListener('open-songbook', openSongbook)
  }, [])

  useEffect(() => () => {
    synthRef.current?.dispose()
  }, [])

  useEffect(() => {
    document.title = practice ? `${practice.song.title} · OpenPiano` : 'OpenPiano · Learn at your keyboard'
  }, [practice])

  const resumeAudio = useCallback(async () => {
    await synthRef.current?.resume()
  }, [])

  const enableMidi = useCallback(async () => {
    await resumeAudio().catch(() => undefined)
    await midi.requestAccess()
  }, [midi.requestAccess, resumeAudio])

  function openLesson(lesson: Lesson) {
    setSelectedLesson(lesson)
  }

  function startPractice(song: Song, lesson: Lesson | null = null) {
    setSelectedLesson(null)
    setPractice({ song, lesson })
  }

  function resumeNextLesson() {
    const next = lessons.find((lesson) => !completedLessonIds.includes(lesson.id)) || lessons[0]
    if (next) openLesson(next)
  }

  async function handleImport(file: File) {
    setImporting(true)
    setImportError('')
    try {
      const song = await importMidiFile(file)
      setImportedSongs((current) => {
        const next = [song, ...current.filter((item) => item.id !== song.id)]
        writeStored(STORAGE.songs, next)
        return next
      })
      startPractice(song)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'This MIDI file could not be imported.')
    } finally {
      setImporting(false)
    }
  }

  function handlePracticeComplete(result: PracticeResult) {
    const session: SessionRecord = {
      id: `session-${Date.now()}`,
      songTitle: result.songTitle,
      date: 'Just now',
      accuracy: result.accuracy,
      notes: result.notes,
      duration: result.duration,
    }
    setSessions((current) => {
      const next = [...current, session].slice(-30)
      writeStored(STORAGE.sessions, next)
      return next
    })
    if (result.lessonId) {
      setCompletedLessonIds((current) => {
        if (current.includes(result.lessonId!)) return current
        const next = [...current, result.lessonId!]
        writeStored(STORAGE.lessons, next)
        return next
      })
    }
  }

  function changeView(view: AppView) {
    setSelectedLesson(null)
    setActiveView(view)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const activeContent = (() => {
    switch (activeView) {
      case 'songs':
        return <SongLibrary songs={songs} onPractice={(song) => startPractice(song)} onImport={handleImport} importing={importing} importError={importError} />
      case 'progress':
        return <ProgressView sessions={sessions} completedLessons={completedLessonIds.length} />
      case 'settings':
        return (
          <SetupView
            supported={midi.isSupported}
            connected={midi.isConnected}
            requesting={midi.status === 'requesting'}
            devices={midi.inputs}
            selectedDeviceId={midi.selectedInputId || undefined}
            error={midi.error || undefined}
            onConnect={enableMidi}
            onSelectDevice={(id) => midi.selectInput(id)}
          />
        )
      default:
        return <LearnView completedLessonIds={completedLessonIds} onOpenLesson={openLesson} onResume={resumeNextLesson} />
    }
  })()

  return (
    <>
      {practice ? (
        <PracticeStudio
          song={practice.song}
          lesson={practice.lesson}
          midi={midi}
          onBack={() => { midi.resetActiveNotes(); synthRef.current?.stopAll(); setPractice(null) }}
          onOpenMidi={() => setMidiDrawerOpen(true)}
          onComplete={handlePracticeComplete}
          onResumeAudio={resumeAudio}
        />
      ) : (
        <AppShell
          activeView={activeView}
          onViewChange={changeView}
          midiConnected={midi.isConnected}
          midiName={midi.selectedInput?.name}
          onMidiClick={() => setMidiDrawerOpen(true)}
        >
          {activeContent}
        </AppShell>
      )}

      <LessonSheet lesson={selectedLesson} song={lessonSong} onClose={() => setSelectedLesson(null)} onStart={(song, lesson) => startPractice(song, lesson)} />
      <MidiDrawer open={midiDrawerOpen} midi={midi} onClose={() => setMidiDrawerOpen(false)} onEnable={enableMidi} />
    </>
  )
}
