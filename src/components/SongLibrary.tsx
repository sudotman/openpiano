import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowUpRight,
  Check,
  Clock3,
  FileMusic,
  Music2,
  Pencil,
  Play,
  Search,
  Upload,
  X,
} from 'lucide-react'
import { MAX_IMPORTED_SONG_TITLE_LENGTH, sanitizeImportedSongTitle } from '../lib/importedSongs'
import type { Song } from '../types'

interface SongLibraryProps {
  songs: Song[]
  onPractice: (song: Song) => void
  onImport: (file: File) => Promise<void>
  onRename: (songId: string, title: string) => void
  importing: boolean
  importError?: string
}

const filters = ['All', 'Beginner', 'Easy', 'Intermediate', 'Advanced', 'Imported'] as const

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remaining = Math.round(seconds % 60).toString().padStart(2, '0')
  return `${minutes}:${remaining}`
}

function SongArtwork({ song, large = false }: { song: Song; large?: boolean }) {
  const notes = song.notes.slice(0, large ? 24 : 10)
  return (
    <div className={large ? 'song-artwork large' : 'song-artwork'} style={{ '--song-accent': song.accent } as React.CSSProperties}>
      <span className="artwork-orbit" />
      <span className="artwork-title">{song.title.slice(0, 1)}</span>
      <div className="artwork-notes">
        {notes.map((note, index) => (
          <i key={note.id} style={{ left: `${8 + ((note.midi * 13) % 82)}%`, top: `${8 + ((index * 23) % 78)}%` }} />
        ))}
      </div>
    </div>
  )
}

export function SongLibrary({ songs, onPractice, onImport, onRename, importing, importError }: SongLibraryProps) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<(typeof filters)[number]>('All')
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [renamingSong, setRenamingSong] = useState<Song | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState('')

  const filteredSongs = useMemo(() => songs.filter((song) => {
    const matchesSearch = `${song.title} ${song.composer} ${song.tags?.join(' ') || ''}`.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = filter === 'All'
      || (filter === 'Imported' ? song.source === 'imported' : song.difficulty === filter)
    return matchesSearch && matchesFilter
  }), [filter, search, songs])

  const featured = songs.find((song) => song.featured) || songs[0]

  useEffect(() => {
    if (!renamingSong) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setRenamingSong(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [renamingSong])

  async function acceptFile(file?: File) {
    if (!file) return
    await onImport(file)
    if (inputRef.current) inputRef.current.value = ''
  }

  function beginRename(song: Song) {
    setRenamingSong(song)
    setRenameValue(song.title)
    setRenameError('')
  }

  function closeRename() {
    setRenamingSong(null)
    setRenameError('')
  }

  function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!renamingSong) return

    const title = sanitizeImportedSongTitle(renameValue)
    if (!title) {
      setRenameError('Enter a name for this MIDI.')
      return
    }

    onRename(renamingSong.id, title)
    closeRename()
  }

  return (
    <motion.div className="library-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {featured && (
        <section className="featured-song" style={{ '--song-accent': featured.accent } as React.CSSProperties}>
          <SongArtwork song={featured} large />
          <div className="featured-copy">
            <span>Suggested for your level</span>
            <h2>{featured.title}</h2>
            <p>{featured.description}</p>
            <div className="song-meta"><span>{featured.composer}</span><i /><span>{featured.difficulty}</span><i /><span>{formatDuration(featured.duration)}</span><i /><span>{featured.bpm} BPM</span></div>
            <button className="primary-action" onClick={() => onPractice(featured)}><Play size={17} fill="currentColor" /> Start practice</button>
          </div>
        </section>
      )}

      <section className="library-tools">
        <label className="song-search">
          <Search size={18} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search songs, composers, or skills" />
          {search && <button onClick={() => setSearch('')} aria-label="Clear search"><X size={15} /></button>}
        </label>
        <button className="import-button" onClick={() => inputRef.current?.click()} disabled={importing}>
          {importing ? <span className="mini-spinner" /> : <Upload size={17} />}
          {importing ? 'Reading MIDI…' : 'Import MIDI'}
        </button>
        <input ref={inputRef} type="file" accept=".mid,.midi,audio/midi,audio/x-midi" hidden onChange={(event) => acceptFile(event.target.files?.[0])} />
      </section>

      <div className="filter-tabs" role="tablist" aria-label="Filter songs">
        {filters.map((item) => (
          <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>
        ))}
      </div>

      {importError && <div className="inline-error" role="alert"><FileMusic size={18} /><span>{importError}</span></div>}

      <section
        className={dragging ? 'song-grid dragging' : 'song-grid'}
        onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          acceptFile(event.dataTransfer.files[0])
        }}
      >
        {filteredSongs.map((song, index) => (
          <motion.article
            className="song-tile-shell"
            key={song.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.035, 0.25) }}
          >
            <button className="song-tile" onClick={() => onPractice(song)} aria-label={`Practice ${song.title}`}>
              <SongArtwork song={song} />
              <span className="song-tile-copy">
                <span className="song-source">{song.source === 'imported' ? 'Your MIDI' : song.difficulty}</span>
                <strong>{song.title}</strong>
                <small>{song.composer}</small>
                <span className="tile-meta"><Clock3 size={13} /> {formatDuration(song.duration)} <i /> {song.bpm} BPM</span>
              </span>
              <span className="tile-play"><Play size={16} fill="currentColor" /></span>
            </button>
            {song.source === 'imported' && (
              <button
                className="song-rename-button"
                onClick={() => beginRename(song)}
                aria-label={`Rename ${song.title}`}
                title="Rename MIDI"
              >
                <Pencil size={13} />
              </button>
            )}
          </motion.article>
        ))}

        <button className="drop-midi-tile" onClick={() => inputRef.current?.click()}>
          <span><Music2 size={24} /></span>
          <strong>Bring your own song</strong>
          <small>Drop a .mid file here or browse</small>
          <ArrowUpRight size={17} />
        </button>

        {filteredSongs.length === 0 && (
          <div className="empty-search"><Music2 size={26} /><strong>No songs found</strong><span>Try a different title or level.</span></div>
        )}
      </section>

      <AnimatePresence>
        {renamingSong && (
          <motion.div className="song-rename-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button className="song-rename-backdrop" onClick={closeRename} aria-label="Cancel renaming" />
            <motion.form
              className="song-rename-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="song-rename-title"
              onSubmit={submitRename}
              initial={{ opacity: 0, y: 12, scale: .98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: .98 }}
              transition={{ duration: .18 }}
            >
              <header className="song-rename-header">
                <span><Pencil size={17} /></span>
                <div>
                  <small>Your MIDI</small>
                  <h3 id="song-rename-title">Rename song</h3>
                </div>
                <button type="button" onClick={closeRename} aria-label="Close rename dialog"><X size={17} /></button>
              </header>
              <label htmlFor="song-rename-input">Song name</label>
              <input
                id="song-rename-input"
                autoFocus
                maxLength={MAX_IMPORTED_SONG_TITLE_LENGTH}
                value={renameValue}
                onChange={(event) => {
                  setRenameValue(event.target.value)
                  if (renameError) setRenameError('')
                }}
                onFocus={(event) => event.currentTarget.select()}
              />
              {renameError && <p className="song-rename-error" role="alert">{renameError}</p>}
              <div className="song-rename-actions">
                <button type="button" onClick={closeRename}>Cancel</button>
                <button type="submit"><Check size={15} /> Save name</button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
