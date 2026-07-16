import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowUpRight,
  Clock3,
  FileMusic,
  Music2,
  Play,
  Search,
  Upload,
  X,
} from 'lucide-react'
import type { Song } from '../types'

interface SongLibraryProps {
  songs: Song[]
  onPractice: (song: Song) => void
  onImport: (file: File) => Promise<void>
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

export function SongLibrary({ songs, onPractice, onImport, importing, importError }: SongLibraryProps) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<(typeof filters)[number]>('All')
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const filteredSongs = useMemo(() => songs.filter((song) => {
    const matchesSearch = `${song.title} ${song.composer} ${song.tags?.join(' ') || ''}`.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = filter === 'All'
      || (filter === 'Imported' ? song.source === 'imported' : song.difficulty === filter)
    return matchesSearch && matchesFilter
  }), [filter, search, songs])

  const featured = songs.find((song) => song.featured) || songs[0]

  async function acceptFile(file?: File) {
    if (!file) return
    await onImport(file)
    if (inputRef.current) inputRef.current.value = ''
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
            <div className="song-meta"><span>{featured.composer}</span><i /><span>{featured.difficulty}</span><i /><span>{formatDuration(featured.duration)}</span></div>
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
          <motion.button
            className="song-tile"
            key={song.id}
            onClick={() => onPractice(song)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.035, 0.25) }}
          >
            <SongArtwork song={song} />
            <span className="song-tile-copy">
              <span className="song-source">{song.source === 'imported' ? 'Your MIDI' : song.difficulty}</span>
              <strong>{song.title}</strong>
              <small>{song.composer}</small>
              <span className="tile-meta"><Clock3 size={13} /> {formatDuration(song.duration)} <i /> {song.bpm} BPM</span>
            </span>
            <span className="tile-play"><Play size={16} fill="currentColor" /></span>
          </motion.button>
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
    </motion.div>
  )
}
