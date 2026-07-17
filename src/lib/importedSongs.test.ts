import { describe, expect, it } from 'vitest'
import type { Song } from '../types'
import { MAX_IMPORTED_SONG_TITLE_LENGTH, renameImportedSong, sanitizeImportedSongTitle } from './importedSongs'

function song(overrides: Partial<Song> = {}): Song {
  return {
    id: 'song-1',
    title: 'Original title',
    composer: 'Imported MIDI',
    description: '',
    difficulty: 'Intermediate',
    bpm: 120,
    duration: 30,
    key: 'C',
    signature: '4/4',
    source: 'imported',
    accent: '#d9ff5b',
    notes: [],
    tags: [],
    ...overrides,
  }
}

describe('imported song names', () => {
  it('normalizes whitespace and removes control characters', () => {
    expect(sanitizeImportedSongTitle('  My\n\tSong\u0000  ')).toBe('My Song')
  })

  it('limits titles without splitting Unicode characters', () => {
    const title = `${'a'.repeat(MAX_IMPORTED_SONG_TITLE_LENGTH - 1)}🎹extra`
    expect(Array.from(sanitizeImportedSongTitle(title))).toHaveLength(MAX_IMPORTED_SONG_TITLE_LENGTH)
    expect(sanitizeImportedSongTitle(title).endsWith('🎹')).toBe(true)
  })

  it('renames only imported songs while preserving their identity', () => {
    const imported = song()
    const builtIn = song({ id: 'built-in', source: 'traditional' })
    const renamed = renameImportedSong([imported, builtIn], imported.id, '  Evening Study  ')

    expect(renamed[0]).toMatchObject({ id: imported.id, title: 'Evening Study' })
    expect(renamed[1]).toBe(builtIn)
  })

  it('does not accept a blank replacement name', () => {
    const songs = [song()]
    expect(renameImportedSong(songs, 'song-1', ' \n ')).toBe(songs)
  })
})
