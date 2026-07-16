import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  BookOpen,
  Check,
  Clock3,
  HardDrive,
  LogOut,
  Music2,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import type { LocalProfile } from '../lib/localProfiles'
import './ProfileManager.css'

export interface LocalProfileStats {
  completedLessons?: number
  practiceMinutes?: number
  sessions?: number
  streakDays?: number
}

// Callbacks may return a value (for example the newly-created profile); the UI
// deliberately ignores it and remains fully controlled by the props above it.
type ProfileAction = unknown

export interface ProfileManagerProps {
  open: boolean
  profiles: LocalProfile[]
  activeProfileId: string | null
  stats?: Record<string, LocalProfileStats | undefined>
  onSelect: (profileId: string) => ProfileAction
  onCreate: (name: string) => ProfileAction
  onRename: (profileId: string, name: string) => ProfileAction
  onLogout: () => ProfileAction
  onClose: () => void
}

export interface ProfileGateProps {
  activeProfileId: string | null
  profiles: LocalProfile[]
  stats?: Record<string, LocalProfileStats | undefined>
  onSelect: (profileId: string) => ProfileAction
  onCreate: (name: string) => ProfileAction
}

function actionError(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function ProfileAvatar({ profile, large = false }: { profile: LocalProfile; large?: boolean }) {
  return (
    <span className={large ? 'op-profile-avatar op-profile-avatar--large' : 'op-profile-avatar'} aria-hidden="true">
      {profile.initials}
    </span>
  )
}

function StatsLine({ value }: { value?: LocalProfileStats }) {
  if (!value) {
    return <span className="op-profile-stats-line"><span><HardDrive size={11} /> Local progress</span></span>
  }
  const lessons = value?.completedLessons ?? 0
  const minutes = value?.practiceMinutes ?? 0
  return (
    <span className="op-profile-stats-line">
      <span><BookOpen size={11} /> {lessons} {lessons === 1 ? 'lesson' : 'lessons'}</span>
      <i />
      <span><Clock3 size={11} /> {minutes} min</span>
    </span>
  )
}

export function ProfileManager({
  open,
  profiles,
  activeProfileId,
  stats,
  onSelect,
  onCreate,
  onRename,
  onLogout,
  onClose,
}: ProfileManagerProps) {
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? null

  useEffect(() => {
    if (!open) return
    setCreating(false)
    setEditingId(null)
    setName('')
    setError('')
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, busy])

  async function run(action: () => ProfileAction, closeAfter = false) {
    setBusy(true)
    setError('')
    try {
      await action()
      setCreating(false)
      setEditingId(null)
      setName('')
      if (closeAfter) onClose()
    } catch (nextError) {
      setError(actionError(nextError))
    } finally {
      setBusy(false)
    }
  }

  function beginCreate() {
    setCreating(true)
    setEditingId(null)
    setName('')
    setError('')
  }

  function beginRename(profile: LocalProfile) {
    setCreating(false)
    setEditingId(profile.id)
    setName(profile.name)
    setError('')
  }

  function cancelEdit() {
    setCreating(false)
    setEditingId(null)
    setName('')
    setError('')
  }

  function submitName(event: FormEvent) {
    event.preventDefault()
    if (editingId) void run(() => onRename(editingId, name))
    else void run(() => onCreate(name), true)
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="op-profile-layer" role="dialog" aria-modal="true" aria-labelledby="op-profile-title">
          <motion.button
            className="op-profile-backdrop"
            aria-label="Close learner profiles"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.aside
            className="op-profile-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 270 }}
          >
            <header className="op-profile-header">
              <div>
                <span>Learner profiles</span>
                <h2 id="op-profile-title">Who’s playing?</h2>
              </div>
              <button className="op-profile-icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
            </header>

            <div className="op-profile-local-note">
              <span><ShieldCheck size={18} /></span>
              <p><strong>Private by design</strong>Your profiles and progress stay in this browser on this device. There are no passwords or online accounts.</p>
            </div>

            {activeProfile && (
              <section className="op-profile-current" aria-label="Current learner">
                <span className="op-profile-eyebrow">Playing as</span>
                <div className="op-profile-current-row">
                  <ProfileAvatar profile={activeProfile} large />
                  <div>
                    <h3>{activeProfile.name}</h3>
                    <StatsLine value={stats?.[activeProfile.id]} />
                  </div>
                  <span className="op-profile-active-pill"><Check size={12} /> Active</span>
                </div>
              </section>
            )}

            <section className="op-profile-list-section">
              <div className="op-profile-section-heading">
                <span>{activeProfile ? 'Switch learner' : 'Choose a learner'}</span>
                <small>{profiles.length} {profiles.length === 1 ? 'profile' : 'profiles'}</small>
              </div>

              <div className="op-profile-list">
                {profiles.map((profile) => {
                  const active = profile.id === activeProfileId
                  const editing = editingId === profile.id
                  return editing ? (
                    <form key={profile.id} className="op-profile-name-form op-profile-name-form--inline" onSubmit={submitName}>
                      <label htmlFor={`rename-profile-${profile.id}`}>Rename {profile.name}</label>
                      <div>
                        <input
                          id={`rename-profile-${profile.id}`}
                          value={name}
                          maxLength={40}
                          onChange={(event) => setName(event.target.value)}
                          autoFocus
                          disabled={busy}
                        />
                        <button type="submit" disabled={busy || !name.trim()}>Save</button>
                        <button type="button" onClick={cancelEdit} disabled={busy}>Cancel</button>
                      </div>
                    </form>
                  ) : (
                    <div key={profile.id} className={active ? 'op-profile-row op-profile-row--active' : 'op-profile-row'}>
                      <button
                        className="op-profile-select"
                        onClick={() => void run(() => onSelect(profile.id), true)}
                        disabled={busy || active}
                        aria-label={active ? `${profile.name}, current learner` : `Switch to ${profile.name}`}
                      >
                        <ProfileAvatar profile={profile} />
                        <span className="op-profile-row-copy">
                          <strong>{profile.name}</strong>
                          <StatsLine value={stats?.[profile.id]} />
                        </span>
                        {active ? <Check className="op-profile-row-check" size={17} /> : <ArrowRight className="op-profile-row-arrow" size={17} />}
                      </button>
                      <button className="op-profile-edit" onClick={() => beginRename(profile)} aria-label={`Rename ${profile.name}`} disabled={busy}>
                        <Pencil size={14} />
                      </button>
                    </div>
                  )
                })}
              </div>

              {creating ? (
                <form className="op-profile-name-form op-profile-name-form--create" onSubmit={submitName}>
                  <span className="op-profile-new-avatar"><UserRound size={18} /></span>
                  <label htmlFor="new-profile-name">New learner’s name</label>
                  <input
                    id="new-profile-name"
                    value={name}
                    maxLength={40}
                    placeholder="e.g. Maya"
                    onChange={(event) => setName(event.target.value)}
                    autoFocus
                    disabled={busy}
                  />
                  <div>
                    <button className="op-profile-submit" type="submit" disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create profile'}</button>
                    <button className="op-profile-cancel" type="button" onClick={cancelEdit} disabled={busy}>Cancel</button>
                  </div>
                </form>
              ) : (
                <button className="op-profile-add" onClick={beginCreate} disabled={busy}>
                  <span><Plus size={17} /></span>
                  <span><strong>Add another learner</strong><small>Start with a fresh curriculum and songbook</small></span>
                </button>
              )}

              {error && <p className="op-profile-error" role="alert">{error}</p>}
            </section>

            <footer className="op-profile-footer">
              <span><HardDrive size={13} /> Saved locally on this device</span>
              {activeProfile && (
                <button onClick={() => void run(onLogout, true)} disabled={busy}>
                  <LogOut size={14} /> Leave this profile
                </button>
              )}
              <small>Leaving returns to the profile picker. It does not delete any progress.</small>
            </footer>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  )
}

export function ProfileGate({ activeProfileId, profiles, stats, onSelect, onCreate }: ProfileGateProps) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setCreating(false)
    setName('')
    setBusyId(null)
    setError('')
  }, [activeProfileId])

  if (activeProfileId !== null) return null

  async function select(profileId: string) {
    setBusyId(profileId)
    setError('')
    try {
      await onSelect(profileId)
    } catch (nextError) {
      setError(actionError(nextError))
    } finally {
      setBusyId(null)
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault()
    setBusyId('new')
    setError('')
    try {
      await onCreate(name)
    } catch (nextError) {
      setError(actionError(nextError))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="op-profile-gate" role="dialog" aria-modal="true" aria-labelledby="op-profile-gate-title">
      <div className="op-profile-gate-glow" />
      <main className="op-profile-gate-card">
        <div className="op-profile-gate-brand"><span><Music2 size={21} /></span>open<strong>piano</strong></div>
        <div className="op-profile-gate-heading">
          <span><Sparkles size={14} /> Your practice space</span>
          <h1 id="op-profile-gate-title">Who’s at the piano?</h1>
          <p>Pick your local profile to continue exactly where you left off.</p>
        </div>

        {!creating ? (
          <>
            <div className="op-profile-gate-grid">
              {profiles.map((profile) => (
                <button key={profile.id} onClick={() => void select(profile.id)} disabled={busyId !== null}>
                  <ProfileAvatar profile={profile} large />
                  <span><strong>{profile.name}</strong><StatsLine value={stats?.[profile.id]} /></span>
                  <ArrowRight size={17} />
                </button>
              ))}
              <button className="op-profile-gate-add" onClick={() => { setCreating(true); setError('') }} disabled={busyId !== null}>
                <span className="op-profile-gate-plus"><Plus size={20} /></span>
                <span><strong>New learner</strong><small>Create a separate learning journey</small></span>
              </button>
            </div>
            {busyId && <p className="op-profile-gate-loading">Opening your piano…</p>}
          </>
        ) : (
          <form className="op-profile-gate-form" onSubmit={(event) => void create(event)}>
            <span className="op-profile-new-avatar"><UserRound size={21} /></span>
            <label htmlFor="gate-profile-name">What should we call you?</label>
            <p>You can rename this profile later. No password or email needed.</p>
            <input
              id="gate-profile-name"
              value={name}
              maxLength={40}
              placeholder="Your name"
              onChange={(event) => setName(event.target.value)}
              autoFocus
              disabled={busyId !== null}
            />
            <div>
              <button type="submit" disabled={!name.trim() || busyId !== null}>{busyId ? 'Creating…' : 'Start learning'} <ArrowRight size={15} /></button>
              <button type="button" onClick={() => { setCreating(false); setName(''); setError('') }} disabled={busyId !== null}>Back</button>
            </div>
          </form>
        )}

        {error && <p className="op-profile-error op-profile-gate-error" role="alert">{error}</p>}
        <footer><ShieldCheck size={14} /> Everything stays in this browser on this device.</footer>
      </main>
    </div>
  )
}
