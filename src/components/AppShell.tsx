import {
  BarChart3,
  BookOpen,
  Cable,
  GraduationCap,
  Library,
  Piano,
  Settings2,
  Sparkles,
} from 'lucide-react'
import type { ReactNode } from 'react'

export type AppView = 'learn' | 'theory' | 'songs' | 'progress' | 'settings'

interface AppShellProps {
  activeView: AppView
  onViewChange: (view: AppView) => void
  midiConnected: boolean
  midiName?: string
  onMidiClick: () => void
  profileName: string
  profileInitials: string
  streakDays: number
  onProfileClick: () => void
  children: ReactNode
}

const navItems = [
  { id: 'learn' as const, label: 'Learn', icon: BookOpen },
  { id: 'theory' as const, label: 'Theory', icon: GraduationCap },
  { id: 'songs' as const, label: 'Songs', icon: Library },
  { id: 'progress' as const, label: 'Progress', icon: BarChart3 },
  { id: 'settings' as const, label: 'Setup', icon: Settings2 },
]

const viewTitles: Record<AppView, { eyebrow: string; title: string }> = {
  learn: { eyebrow: 'Your curriculum', title: 'Learn' },
  theory: { eyebrow: 'Notes, rhythm & harmony', title: 'Theory Lab' },
  songs: { eyebrow: 'Practice anything', title: 'Songbook' },
  progress: { eyebrow: 'Your playing, measured', title: 'Progress' },
  settings: { eyebrow: 'Keyboard & experience', title: 'Setup' },
}

export function AppShell({
  activeView,
  onViewChange,
  midiConnected,
  midiName,
  onMidiClick,
  profileName,
  profileInitials,
  streakDays,
  onProfileClick,
  children,
}: AppShellProps) {
  const heading = viewTitles[activeView]

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <button className="brand-mark" onClick={() => onViewChange('learn')} aria-label="OpenPiano home">
          <span className="brand-glyph"><Piano size={20} strokeWidth={1.8} /></span>
          <span className="brand-name">open<span>piano</span></span>
        </button>

        <nav className="primary-nav" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                className={activeView === item.id ? 'nav-item active' : 'nav-item'}
                onClick={() => onViewChange(item.id)}
              >
                <Icon size={19} strokeWidth={1.8} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="nav-footer">
          <div className="streak-orbit" aria-label={`${streakDays} day practice streak`}>
            <Sparkles size={17} />
            <div><strong>{streakDays} {streakDays === 1 ? 'day' : 'days'}</strong><span>current streak</span></div>
          </div>
          <button className="profile-button" aria-label={`Open ${profileName}'s local profile`} onClick={onProfileClick}>
            <span>{profileInitials}</span>
            <div><strong>{profileName}</strong><small>Local learner profile</small></div>
          </button>
        </div>
      </aside>

      <section className="app-main">
        <header className="top-bar">
          <div className="page-heading">
            <span>{heading.eyebrow}</span>
            <h1>{heading.title}</h1>
          </div>
          <button
            className={midiConnected ? 'midi-status connected' : 'midi-status'}
            onClick={onMidiClick}
            aria-label={midiConnected ? `MIDI connected: ${midiName || 'keyboard'}` : 'Connect MIDI keyboard'}
          >
            <i />
            <Cable size={17} />
            <span>{midiConnected ? midiName || 'MIDI connected' : 'Connect keyboard'}</span>
          </button>
        </header>
        <main className="view-content">{children}</main>
      </section>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              className={activeView === item.id ? 'active' : ''}
              onClick={() => onViewChange(item.id)}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
