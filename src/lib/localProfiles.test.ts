import { describe, expect, it } from 'vitest'
import {
  ACTIVE_LOCAL_PROFILE_STORAGE_KEY,
  createLocalProfile,
  listLocalProfiles,
  loadLocalProfileState,
  logoutLocalProfile,
  profileInitials,
  profileStorageKey,
  renameLocalProfile,
  safeReadStored,
  safeWriteStored,
  sanitizeProfileName,
  selectLocalProfile,
  type StorageLike,
} from './localProfiles'

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }
}

describe('local learner profiles', () => {
  it('sanitizes display names and derives compact initials', () => {
    expect(sanitizeProfileName('  Ada\n   Lovelace  ')).toBe('Ada Lovelace')
    expect(sanitizeProfileName('Ａｄａ')).toBe('Ada')
    expect(sanitizeProfileName('a'.repeat(50))).toHaveLength(40)
    expect(profileInitials('Ada Lovelace')).toBe('AL')
    expect(profileInitials('satyam')).toBe('SA')
    expect(profileInitials('')).toBe('?')
  })

  it('builds isolated, URL-safe domain keys', () => {
    expect(profileStorageKey('learner 1/α', 'songs')).toBe('openpiano:profile:learner%201%2F%CE%B1:songs:v1')
    expect(profileStorageKey('satyam', 'theory')).toBe('openpiano:profile:satyam:theory:v1')
    expect(() => profileStorageKey('  ', 'settings')).toThrow(/profile id/i)
  })

  it('creates the initial Satyam profile and migrates legacy progress without deleting it', () => {
    const storage = new MemoryStorage()
    const sessions = JSON.stringify([{ id: 'session-old' }])
    storage.setItem('openpiano:practice-sessions:v1', sessions)

    const profiles = listLocalProfiles(storage)
    const state = loadLocalProfileState(storage)

    expect(profiles).toHaveLength(1)
    expect(profiles[0]).toMatchObject({ id: 'satyam', name: 'Satyam', initials: 'SK' })
    expect(state.activeProfileId).toBe('satyam')
    expect(storage.getItem(profileStorageKey('satyam', 'sessions'))).toBe(sessions)
    expect(storage.getItem('openpiano:practice-sessions:v1')).toBe(sessions)
  })

  it('creates, selects, renames and leaves profiles while preserving their records', () => {
    const storage = new MemoryStorage()
    listLocalProfiles(storage)

    const created = createLocalProfile('  Grace Hopper ', storage)
    expect(created).toMatchObject({ id: 'grace-hopper', name: 'Grace Hopper', initials: 'GH' })
    expect(loadLocalProfileState(storage).activeProfileId).toBe(created.id)

    const renamed = renameLocalProfile(created.id, 'Amazing Grace', storage)
    expect(renamed).toMatchObject({ id: created.id, name: 'Amazing Grace', initials: 'AG' })

    const selected = selectLocalProfile('satyam', storage)
    expect(selected.id).toBe('satyam')
    expect(loadLocalProfileState(storage).activeProfileId).toBe('satyam')

    logoutLocalProfile(storage)
    expect(storage.getItem(ACTIVE_LOCAL_PROFILE_STORAGE_KEY)).toBeNull()
    expect(loadLocalProfileState(storage)).toMatchObject({ activeProfileId: null })
    expect(loadLocalProfileState(storage).profiles).toHaveLength(2)
  })

  it('rejects blank and duplicate names', () => {
    const storage = new MemoryStorage()
    listLocalProfiles(storage)
    expect(() => createLocalProfile('   ', storage)).toThrow(/enter a name/i)
    expect(() => createLocalProfile('sAtYaM', storage)).toThrow(/already exists/i)
    expect(() => renameLocalProfile('missing', 'Someone', storage)).toThrow(/no longer exists/i)
  })

  it('keeps storage failures non-fatal and returns fallbacks for corrupt JSON', () => {
    const brokenStorage: StorageLike = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('full') },
      removeItem: () => { throw new Error('blocked') },
    }

    expect(safeReadStored('anything', ['fallback'], brokenStorage)).toEqual(['fallback'])
    expect(safeWriteStored('anything', {}, brokenStorage)).toBe(false)

    const storage = new MemoryStorage()
    storage.setItem('bad', '{not json')
    expect(safeReadStored('bad', 42, storage)).toBe(42)
  })
})
