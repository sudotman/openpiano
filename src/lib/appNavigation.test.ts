import { describe, expect, it } from 'vitest'
import {
  makeOpenPianoHistoryState,
  openPianoNavigationHash,
  parseOpenPianoNavigationHash,
  readOpenPianoHistoryEntry,
  sameOpenPianoNavigation,
  type OpenPianoNavigation,
} from './appNavigation'

describe('OpenPiano in-app navigation', () => {
  const routes: OpenPianoNavigation[] = [
    { kind: 'view', view: 'theory' },
    { kind: 'lesson', view: 'learn', lessonId: 'lesson/with spaces' },
    { kind: 'practice', view: 'songs', songId: 'import-café/1' },
    { kind: 'practice', view: 'learn', songId: 'warm-up', lessonId: 'lesson-one' },
  ]

  it('round-trips views, lessons, and practice through static-host-safe hashes', () => {
    for (const route of routes) {
      const hash = openPianoNavigationHash(route)
      expect(hash).toMatch(/^#op\//)
      expect(parseOpenPianoNavigationHash(hash)).toEqual(route)
    }
  })

  it('rejects unrelated or malformed hashes and defaults missing return views to Learn', () => {
    expect(parseOpenPianoNavigationHash('#section-heading')).toBeNull()
    expect(parseOpenPianoNavigationHash('#op/practice/')).toBeNull()
    expect(parseOpenPianoNavigationHash('#op/lesson/intro')).toEqual({ kind: 'lesson', view: 'learn', lessonId: 'intro' })
  })

  it('stores depth without destroying unrelated history state', () => {
    const navigation = { kind: 'view', view: 'songs' } as const
    const state = makeOpenPianoHistoryState({ scroll: 42 }, navigation, 3)
    expect(state.scroll).toBe(42)
    expect(readOpenPianoHistoryEntry(state)).toEqual({ version: 1, depth: 3, navigation })
    expect(readOpenPianoHistoryEntry({ __openPianoNavigation: { version: 1, depth: -1, navigation } })).toBeNull()
  })

  it('compares logical navigation targets instead of object identity', () => {
    expect(sameOpenPianoNavigation({ kind: 'view', view: 'learn' }, { kind: 'view', view: 'learn' })).toBe(true)
    expect(sameOpenPianoNavigation({ kind: 'view', view: 'learn' }, { kind: 'view', view: 'songs' })).toBe(false)
  })
})
