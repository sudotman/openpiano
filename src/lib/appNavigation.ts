export type OpenPianoView = 'learn' | 'theory' | 'songs' | 'progress' | 'settings'

export type OpenPianoNavigation =
  | { kind: 'view'; view: OpenPianoView }
  | { kind: 'lesson'; view: OpenPianoView; lessonId: string }
  | { kind: 'practice'; view: OpenPianoView; songId: string; lessonId?: string }

export interface OpenPianoHistoryEntry {
  version: 1
  depth: number
  navigation: OpenPianoNavigation
}

const HISTORY_KEY = '__openPianoNavigation'
const VIEWS = new Set<OpenPianoView>(['learn', 'theory', 'songs', 'progress', 'settings'])

function isView(value: unknown): value is OpenPianoView {
  return typeof value === 'string' && VIEWS.has(value as OpenPianoView)
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return ''
  }
}

export function openPianoNavigationHash(navigation: OpenPianoNavigation): string {
  const view = encodeURIComponent(navigation.view)
  if (navigation.kind === 'view') return `#op/${view}`
  if (navigation.kind === 'lesson') return `#op/lesson/${encodeURIComponent(navigation.lessonId)}?from=${view}`

  const lesson = navigation.lessonId ? `&lesson=${encodeURIComponent(navigation.lessonId)}` : ''
  return `#op/practice/${encodeURIComponent(navigation.songId)}?from=${view}${lesson}`
}

/** Parses only hash routes, so every navigation remains preview/static-host safe. */
export function parseOpenPianoNavigationHash(hash: string): OpenPianoNavigation | null {
  const normalized = hash.startsWith('#') ? hash.slice(1) : hash
  if (!normalized.startsWith('op/')) return null

  const [path, rawQuery = ''] = normalized.slice(3).split('?', 2)
  const query = new URLSearchParams(rawQuery)
  const requestedView = safeDecode(query.get('from') ?? '')
  const view: OpenPianoView = isView(requestedView) ? requestedView : 'learn'

  if (isView(safeDecode(path))) return { kind: 'view', view: safeDecode(path) as OpenPianoView }

  if (path.startsWith('lesson/')) {
    const lessonId = safeDecode(path.slice('lesson/'.length))
    return lessonId ? { kind: 'lesson', view, lessonId } : null
  }

  if (path.startsWith('practice/')) {
    const songId = safeDecode(path.slice('practice/'.length))
    if (!songId) return null
    const lessonId = safeDecode(query.get('lesson') ?? '')
    return lessonId
      ? { kind: 'practice', view, songId, lessonId }
      : { kind: 'practice', view, songId }
  }

  return null
}

function isNavigation(value: unknown): value is OpenPianoNavigation {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<OpenPianoNavigation>
  if (!isView(candidate.view)) return false
  if (candidate.kind === 'view') return true
  if (candidate.kind === 'lesson') return typeof candidate.lessonId === 'string' && candidate.lessonId.length > 0
  return candidate.kind === 'practice' && typeof candidate.songId === 'string' && candidate.songId.length > 0
}

export function readOpenPianoHistoryEntry(state: unknown): OpenPianoHistoryEntry | null {
  if (!state || typeof state !== 'object') return null
  const entry = (state as Record<string, unknown>)[HISTORY_KEY]
  if (!entry || typeof entry !== 'object') return null
  const candidate = entry as Partial<OpenPianoHistoryEntry>
  if (candidate.version !== 1 || !Number.isInteger(candidate.depth) || (candidate.depth ?? -1) < 0 || !isNavigation(candidate.navigation)) return null
  return candidate as OpenPianoHistoryEntry
}

/** Preserves state owned by other browser integrations while adding our entry. */
export function makeOpenPianoHistoryState(
  previousState: unknown,
  navigation: OpenPianoNavigation,
  depth: number,
): Record<string, unknown> {
  const state = previousState && typeof previousState === 'object'
    ? { ...(previousState as Record<string, unknown>) }
    : {}
  state[HISTORY_KEY] = {
    version: 1,
    depth: Math.max(0, Math.round(depth)),
    navigation,
  } satisfies OpenPianoHistoryEntry
  return state
}

export function sameOpenPianoNavigation(left: OpenPianoNavigation, right: OpenPianoNavigation) {
  return openPianoNavigationHash(left) === openPianoNavigationHash(right)
}
