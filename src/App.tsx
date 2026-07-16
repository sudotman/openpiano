import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppShell, type AppView } from './components/AppShell'
import { LearnView } from './components/LearnView'
import { LessonSheet } from './components/LessonSheet'
import { MidiDrawer } from './components/MidiDrawer'
import { ProfileGate, ProfileManager, type LocalProfileStats } from './components/ProfileManager'
import { PracticeStudio, type PracticeResult } from './components/PracticeStudio'
import { ProgressView, calculatePracticeStreak, type SessionRecord } from './components/ProgressView'
import { SetupView } from './components/SetupView'
import { SongLibrary } from './components/SongLibrary'
import { builtInSongs, getSong, lessons } from './data/curriculum'
import { useMidi, type MidiNoteEvent } from './hooks/useMidi'
import { createPianoSynth, type PianoSynth } from './lib/audio'
import { DEFAULT_KEYBOARD_CONFIG, sanitizeKeyboardConfig, type KeyboardConfig } from './lib/keyboardConfig'
import {
  createLocalProfile,
  loadLocalProfileState,
  logoutLocalProfile,
  profileStorageKey,
  renameLocalProfile,
  safeReadStored,
  safeWriteStored,
  selectLocalProfile,
  type ProfileStorageDomain,
} from './lib/localProfiles'
import { importMidiFile } from './lib/midiImport'
import { DEFAULT_THEORY_PROGRESS, sanitizeTheoryProgress, type TheoryProgress } from './lib/theory'
import type { Lesson, Song } from './types'

const TheoryLab = lazy(() => import('./components/TheoryLab').then((module) => ({ default: module.TheoryLab })))

function readProfileDomain<T>(profileId: string | null, domain: ProfileStorageDomain, fallback: T): T {
  if (!profileId) return fallback
  return safeReadStored(profileStorageKey(profileId, domain), fallback)
}

function writeProfileDomain(profileId: string | null, domain: ProfileStorageDomain, value: unknown) {
  if (profileId) safeWriteStored(profileStorageKey(profileId, domain), value)
}

function practiceSummary(sessions: SessionRecord[]) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  const recent = sessions.filter((session) => session.completedAt && Date.parse(session.completedAt) >= cutoff)
  return {
    minutes: recent.reduce((sum, session) => sum + session.duration, 0),
    averageAccuracy: recent.length
      ? Math.round(recent.reduce((sum, session) => sum + session.accuracy, 0) / recent.length)
      : 0,
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

  const [profileState, setProfileState] = useState(loadLocalProfileState)
  const initialProfileId = profileState.activeProfileId
  const [activeView, setActiveView] = useState<AppView>('learn')
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null)
  const [practice, setPractice] = useState<PracticeContext | null>(null)
  const [midiDrawerOpen, setMidiDrawerOpen] = useState(false)
  const [profileManagerOpen, setProfileManagerOpen] = useState(false)
  const [importedSongs, setImportedSongs] = useState<Song[]>(() => readProfileDomain(initialProfileId, 'songs', []))
  const [completedLessonIds, setCompletedLessonIds] = useState<string[]>(() => readProfileDomain(initialProfileId, 'lessons', []))
  const [sessions, setSessions] = useState<SessionRecord[]>(() => readProfileDomain(initialProfileId, 'sessions', []))
  const [keyboardConfig, setKeyboardConfig] = useState<KeyboardConfig>(() => sanitizeKeyboardConfig(readProfileDomain<Partial<KeyboardConfig> | null>(initialProfileId, 'settings', DEFAULT_KEYBOARD_CONFIG)))
  const [theoryProgress, setTheoryProgress] = useState<TheoryProgress>(() => sanitizeTheoryProgress(readProfileDomain<unknown>(initialProfileId, 'theory', DEFAULT_THEORY_PROGRESS)))
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')

  const songs = useMemo(() => [...importedSongs, ...builtInSongs], [importedSongs])
  const lessonSong = selectedLesson?.songId ? getSong(selectedLesson.songId) : undefined
  const activeProfile = profileState.profiles.find((profile) => profile.id === profileState.activeProfileId) ?? null
  const summary = useMemo(() => practiceSummary(sessions), [sessions])
  const streakDays = useMemo(() => calculatePracticeStreak(sessions), [sessions])

  const profileStats = useMemo<Record<string, LocalProfileStats>>(() => Object.fromEntries(
    profileState.profiles.map((profile) => {
      const isActive = profile.id === profileState.activeProfileId
      const profileSessions = isActive ? sessions : readProfileDomain<SessionRecord[]>(profile.id, 'sessions', [])
      const profileLessons = isActive ? completedLessonIds : readProfileDomain<string[]>(profile.id, 'lessons', [])
      return [profile.id, {
        completedLessons: profileLessons.length,
        practiceMinutes: profileSessions.reduce((sum, session) => sum + session.duration, 0),
        sessions: profileSessions.length,
        streakDays: calculatePracticeStreak(profileSessions),
      }]
    }),
  ), [completedLessonIds, profileState.activeProfileId, profileState.profiles, sessions])

  useEffect(() => {
    const openSongbook = () => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      setActiveView('songs')
    }
    window.addEventListener('open-songbook', openSongbook)
    return () => window.removeEventListener('open-songbook', openSongbook)
  }, [])

  useEffect(() => {
    const profileId = profileState.activeProfileId
    setImportedSongs(readProfileDomain(profileId, 'songs', []))
    setCompletedLessonIds(readProfileDomain(profileId, 'lessons', []))
    setSessions(readProfileDomain(profileId, 'sessions', []))
    setKeyboardConfig(sanitizeKeyboardConfig(readProfileDomain<Partial<KeyboardConfig> | null>(profileId, 'settings', DEFAULT_KEYBOARD_CONFIG)))
    setTheoryProgress(sanitizeTheoryProgress(readProfileDomain<unknown>(profileId, 'theory', DEFAULT_THEORY_PROGRESS)))
    setSelectedLesson(null)
    setPractice(null)
    setActiveView('learn')
    setImportError('')
    midi.resetActiveNotes()
    synthRef.current?.stopAll()
  // Reload every learning domain only when the local learner changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileState.activeProfileId])

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
        writeProfileDomain(profileState.activeProfileId, 'songs', next)
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
      completedAt: new Date().toISOString(),
    }
    setSessions((current) => {
      const next = [...current, session].slice(-30)
      writeProfileDomain(profileState.activeProfileId, 'sessions', next)
      return next
    })
    if (result.lessonId) {
      setCompletedLessonIds((current) => {
        if (current.includes(result.lessonId!)) return current
        const next = [...current, result.lessonId!]
        writeProfileDomain(profileState.activeProfileId, 'lessons', next)
        return next
      })
    }
  }

  function handleKeyboardConfigChange(config: KeyboardConfig) {
    const next = sanitizeKeyboardConfig(config)
    setKeyboardConfig(next)
    writeProfileDomain(profileState.activeProfileId, 'settings', next)
  }

  function handleTheoryProgress(nextProgress: TheoryProgress) {
    const next = sanitizeTheoryProgress(nextProgress)
    setTheoryProgress(next)
    writeProfileDomain(profileState.activeProfileId, 'theory', next)
  }

  function refreshProfiles() {
    setProfileState(loadLocalProfileState())
  }

  function handleSelectProfile(profileId: string) {
    selectLocalProfile(profileId)
    refreshProfiles()
  }

  function handleCreateProfile(name: string) {
    createLocalProfile(name)
    refreshProfiles()
  }

  function handleRenameProfile(profileId: string, name: string) {
    renameLocalProfile(profileId, name)
    refreshProfiles()
  }

  function handleLogoutProfile() {
    logoutLocalProfile()
    setMidiDrawerOpen(false)
    setProfileManagerOpen(false)
    refreshProfiles()
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
      case 'theory':
        return (
          <Suspense fallback={<div className="module-loading"><span className="mini-spinner dark" /><strong>Preparing the Theory Lab…</strong></div>}>
            <TheoryLab midi={midi} keyboardConfig={keyboardConfig} progress={theoryProgress} onProgress={handleTheoryProgress} onOpenMidi={() => setMidiDrawerOpen(true)} />
          </Suspense>
        )
      case 'progress':
        return <ProgressView sessions={sessions} completedLessons={completedLessonIds.length} theoryProgress={theoryProgress} />
      case 'settings':
        return (
          <SetupView
            supported={midi.isSupported}
            connected={midi.isConnected}
            requesting={midi.status === 'requesting'}
            devices={midi.inputs}
            selectedDeviceId={midi.selectedInputId || undefined}
            error={midi.error || undefined}
            keyboardConfig={keyboardConfig}
            lastMidiNote={midi.lastEvent?.type === 'noteon' ? midi.lastEvent.note : undefined}
            onConnect={enableMidi}
            onSelectDevice={(id) => midi.selectInput(id)}
            onKeyboardConfigChange={handleKeyboardConfigChange}
          />
        )
      default:
        return <LearnView completedLessonIds={completedLessonIds} practiceMinutes={summary.minutes} averageAccuracy={summary.averageAccuracy} onOpenLesson={openLesson} onResume={resumeNextLesson} />
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
          keyboardConfig={keyboardConfig}
        />
      ) : (
        <AppShell
          activeView={activeView}
          onViewChange={changeView}
          midiConnected={midi.isConnected}
          midiName={midi.selectedInput?.name}
          onMidiClick={() => setMidiDrawerOpen(true)}
          profileName={activeProfile?.name || 'Choose learner'}
          profileInitials={activeProfile?.initials || '?'}
          streakDays={streakDays}
          onProfileClick={() => setProfileManagerOpen(true)}
        >
          {activeContent}
        </AppShell>
      )}

      <LessonSheet lesson={selectedLesson} song={lessonSong} onClose={() => setSelectedLesson(null)} onStart={(song, lesson) => startPractice(song, lesson)} />
      <MidiDrawer open={midiDrawerOpen} midi={midi} onClose={() => setMidiDrawerOpen(false)} onEnable={enableMidi} />
      <ProfileManager
        open={profileManagerOpen}
        profiles={profileState.profiles}
        activeProfileId={profileState.activeProfileId}
        stats={profileStats}
        onSelect={handleSelectProfile}
        onCreate={handleCreateProfile}
        onRename={handleRenameProfile}
        onLogout={handleLogoutProfile}
        onClose={() => setProfileManagerOpen(false)}
      />
      <ProfileGate
        activeProfileId={profileState.activeProfileId}
        profiles={profileState.profiles}
        stats={profileStats}
        onSelect={handleSelectProfile}
        onCreate={handleCreateProfile}
      />
    </>
  )
}
