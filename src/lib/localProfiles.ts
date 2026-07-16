export interface LocalProfile {
  id: string
  name: string
  initials: string
  createdAt: string
  lastActiveAt: string
}

export interface LocalProfileState {
  profiles: LocalProfile[]
  activeProfileId: string | null
}

export type ProfileStorageDomain = 'songs' | 'lessons' | 'sessions' | 'settings' | 'theory'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const LOCAL_PROFILES_STORAGE_KEY = 'openpiano:local-profiles:v1'
export const ACTIVE_LOCAL_PROFILE_STORAGE_KEY = 'openpiano:active-local-profile:v1'

const DEFAULT_PROFILE_ID = 'satyam'
const MAX_PROFILE_NAME_LENGTH = 40

const LEGACY_STORAGE_KEYS: Partial<Record<ProfileStorageDomain, readonly string[]>> = {
  songs: ['openpiano:imported-songs:v1'],
  lessons: ['openpiano:completed-lessons:v1'],
  sessions: ['openpiano:practice-sessions:v1'],
  settings: ['openpiano:settings:v1', 'openpiano:keyboard-settings:v1'],
  theory: ['openpiano:theory-progress:v1'],
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function storageOrBrowser(storage?: StorageLike | null): StorageLike | null {
  return storage === undefined ? browserStorage() : storage
}

export function safeReadStored<T>(key: string, fallback: T, storage?: StorageLike | null): T {
  const target = storageOrBrowser(storage)
  if (!target) return fallback

  try {
    const value = target.getItem(key)
    return value === null ? fallback : JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function safeWriteStored(key: string, value: unknown, storage?: StorageLike | null): boolean {
  const target = storageOrBrowser(storage)
  if (!target) return false

  try {
    target.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function safeRemoveStored(key: string, storage?: StorageLike | null): boolean {
  const target = storageOrBrowser(storage)
  if (!target) return false

  try {
    target.removeItem(key)
    return true
  } catch {
    return false
  }
}

export function sanitizeProfileName(value: string): string {
  return Array.from(
    value
      .normalize('NFKC')
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  ).slice(0, MAX_PROFILE_NAME_LENGTH).join('').trim()
}

export function profileInitials(value: string): string {
  const name = sanitizeProfileName(value)
  if (!name) return '?'

  const words = name.split(' ')
  const letters = words.length > 1
    ? `${Array.from(words[0])[0]}${Array.from(words[words.length - 1])[0]}`
    : Array.from(words[0]).slice(0, 2).join('')

  return letters.toLocaleUpperCase()
}

export function profileStorageKey(profileId: string, domain: ProfileStorageDomain): string {
  const normalizedId = profileId.trim()
  if (!normalizedId) throw new Error('A profile id is required to build a storage key.')
  return `openpiano:profile:${encodeURIComponent(normalizedId)}:${domain}:v1`
}

function validIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function normalizeProfile(value: unknown): LocalProfile | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<LocalProfile>
  const id = typeof candidate.id === 'string' ? candidate.id.trim() : ''
  const name = typeof candidate.name === 'string' ? sanitizeProfileName(candidate.name) : ''
  if (!id || !name || !validIsoDate(candidate.createdAt) || !validIsoDate(candidate.lastActiveAt)) return null

  return {
    id,
    name,
    initials: typeof candidate.initials === 'string' && candidate.initials.trim()
      ? Array.from(candidate.initials.trim()).slice(0, 2).join('').toLocaleUpperCase()
      : profileInitials(name),
    createdAt: candidate.createdAt,
    lastActiveAt: candidate.lastActiveAt,
  }
}

function readProfiles(storage?: StorageLike | null): LocalProfile[] {
  const stored = safeReadStored<unknown>(LOCAL_PROFILES_STORAGE_KEY, [], storage)
  if (!Array.isArray(stored)) return []

  const ids = new Set<string>()
  return stored.reduce<LocalProfile[]>((profiles, value) => {
    const profile = normalizeProfile(value)
    if (profile && !ids.has(profile.id)) {
      profiles.push(profile)
      ids.add(profile.id)
    }
    return profiles
  }, [])
}

function migrateLegacyData(profileId: string, storage?: StorageLike | null) {
  const target = storageOrBrowser(storage)
  if (!target) return

  for (const [domain, legacyKeys] of Object.entries(LEGACY_STORAGE_KEYS) as [ProfileStorageDomain, readonly string[]][]) {
    const destination = profileStorageKey(profileId, domain)
    try {
      if (target.getItem(destination) !== null) continue
      const legacyValue = legacyKeys.map((key) => target.getItem(key)).find((value) => value !== null)
      if (legacyValue !== undefined && legacyValue !== null) target.setItem(destination, legacyValue)
    } catch {
      // A storage failure must never prevent the learner from using an in-memory profile.
    }
  }
}

function makeDefaultProfile(): LocalProfile {
  const timestamp = new Date().toISOString()
  return {
    id: DEFAULT_PROFILE_ID,
    name: 'Satyam',
    initials: 'SK',
    createdAt: timestamp,
    lastActiveAt: timestamp,
  }
}

function uniqueProfileId(name: string, profiles: LocalProfile[]): string {
  const base = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24) || 'learner'
  const existingIds = new Set(profiles.map((profile) => profile.id))
  if (!existingIds.has(base)) return base

  let suffix = 2
  while (existingIds.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

/**
 * Loads every local learner. On a first run it creates the Satyam profile and
 * copies any pre-profile OpenPiano data into its profile-scoped keys.
 */
export function listLocalProfiles(storage?: StorageLike | null): LocalProfile[] {
  const profiles = readProfiles(storage)
  if (profiles.length > 0) return profiles.sort((a, b) => Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt))

  const defaultProfile = makeDefaultProfile()
  safeWriteStored(LOCAL_PROFILES_STORAGE_KEY, [defaultProfile], storage)
  safeWriteStored(ACTIVE_LOCAL_PROFILE_STORAGE_KEY, defaultProfile.id, storage)
  migrateLegacyData(defaultProfile.id, storage)
  return [defaultProfile]
}

export function loadLocalProfileState(storage?: StorageLike | null): LocalProfileState {
  const profiles = listLocalProfiles(storage)
  const activeProfileId = safeReadStored<unknown>(ACTIVE_LOCAL_PROFILE_STORAGE_KEY, null, storage)
  return {
    profiles,
    activeProfileId: typeof activeProfileId === 'string' && profiles.some((profile) => profile.id === activeProfileId)
      ? activeProfileId
      : null,
  }
}

export function loadActiveLocalProfile(storage?: StorageLike | null): LocalProfile | null {
  const state = loadLocalProfileState(storage)
  return state.profiles.find((profile) => profile.id === state.activeProfileId) ?? null
}

/** Creates and immediately selects a new local learner. */
export function createLocalProfile(nameInput: string, storage?: StorageLike | null): LocalProfile {
  const name = sanitizeProfileName(nameInput)
  if (!name) throw new Error('Enter a name for this learner.')

  const profiles = listLocalProfiles(storage)
  if (profiles.some((profile) => profile.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    throw new Error('A learner with that name already exists on this device.')
  }

  const timestamp = new Date().toISOString()
  const profile: LocalProfile = {
    id: uniqueProfileId(name, profiles),
    name,
    initials: profileInitials(name),
    createdAt: timestamp,
    lastActiveAt: timestamp,
  }
  safeWriteStored(LOCAL_PROFILES_STORAGE_KEY, [profile, ...profiles], storage)
  safeWriteStored(ACTIVE_LOCAL_PROFILE_STORAGE_KEY, profile.id, storage)
  return profile
}

export function renameLocalProfile(profileId: string, nameInput: string, storage?: StorageLike | null): LocalProfile {
  const name = sanitizeProfileName(nameInput)
  if (!name) throw new Error('Enter a name for this learner.')

  const profiles = listLocalProfiles(storage)
  const current = profiles.find((profile) => profile.id === profileId)
  if (!current) throw new Error('That learner profile no longer exists.')
  if (profiles.some((profile) => profile.id !== profileId && profile.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    throw new Error('A learner with that name already exists on this device.')
  }

  const updated = { ...current, name, initials: profileInitials(name) }
  safeWriteStored(
    LOCAL_PROFILES_STORAGE_KEY,
    profiles.map((profile) => profile.id === profileId ? updated : profile),
    storage,
  )
  return updated
}

export function selectLocalProfile(profileId: string, storage?: StorageLike | null): LocalProfile {
  const profiles = listLocalProfiles(storage)
  const current = profiles.find((profile) => profile.id === profileId)
  if (!current) throw new Error('That learner profile no longer exists.')

  const updated = { ...current, lastActiveAt: new Date().toISOString() }
  safeWriteStored(
    LOCAL_PROFILES_STORAGE_KEY,
    profiles.map((profile) => profile.id === profileId ? updated : profile),
    storage,
  )
  safeWriteStored(ACTIVE_LOCAL_PROFILE_STORAGE_KEY, profileId, storage)
  return updated
}

/** Leaves the active learner without deleting their progress or profile. */
export function logoutLocalProfile(storage?: StorageLike | null): void {
  safeRemoveStored(ACTIVE_LOCAL_PROFILE_STORAGE_KEY, storage)
}
