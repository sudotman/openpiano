import type { Song } from '../types'

export const MAX_IMPORTED_SONG_TITLE_LENGTH = 96

export function sanitizeImportedSongTitle(value: string) {
  const normalized = value
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return Array.from(normalized)
    .slice(0, MAX_IMPORTED_SONG_TITLE_LENGTH)
    .join('')
    .trim()
}

export function renameImportedSong(songs: Song[], songId: string, value: string): Song[] {
  const title = sanitizeImportedSongTitle(value)
  if (!title) return songs

  let changed = false
  const next = songs.map((song) => {
    if (song.id !== songId || song.source !== 'imported' || song.title === title) return song
    changed = true
    return { ...song, title }
  })

  return changed ? next : songs
}
