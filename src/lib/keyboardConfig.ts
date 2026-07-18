export const MIDI_NOTE_MIN = 0
export const MIDI_NOTE_MAX = 127

export type KeyboardPresetId =
  | 'yamaha-psr-e383'
  | '49-key'
  | '76-key'
  | '88-key'
  | 'auto'
  | 'custom'
  | 'detected'

/**
 * Octave numbers are display conventions, not MIDI pitch data. Scientific
 * pitch names MIDI 60 as C4; the PSR-E383 manual names the same key C3.
 */
export type NoteNamingConvention = 'scientific' | 'yamaha'

export interface KeyboardRangeConfig {
  preset: KeyboardPresetId
  startMidi: number
  endMidi: number
}

/** Persistable keyboard-range preference. All endpoints are inclusive. */
export interface KeyboardConfig extends KeyboardRangeConfig {
  noteNaming: NoteNamingConvention
}

/** Accepts profiles saved before octave-label preferences were introduced. */
export type KeyboardConfigInput = KeyboardRangeConfig & Partial<Pick<KeyboardConfig, 'noteNaming'>>

export interface KeyboardPreset extends KeyboardRangeConfig {
  label: string
  description: string
  keyCount?: number
  recommended?: boolean
}

export type MidiNoteLike = number | { midi: number }

const PITCH_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const

export const DEFAULT_NOTE_NAMING_CONVENTION: NoteNamingConvention = 'yamaha'

export const NOTE_NAMING_CONVENTIONS = Object.freeze([
  {
    id: 'scientific',
    label: 'Scientific',
    description: 'Middle C = C4',
    detail: 'Common in music education and notation software',
  },
  {
    id: 'yamaha',
    label: 'Yamaha PSR',
    description: 'Middle C = C3',
    detail: 'Matches the PSR-E383 screen and manuals',
  },
] as const satisfies readonly {
  id: NoteNamingConvention
  label: string
  description: string
  detail: string
}[])

export const YAMAHA_PSR_E383_PRESET = Object.freeze({
  preset: 'yamaha-psr-e383',
  label: 'Yamaha PSR-E383',
  description: '61-key touch-sensitive keybed',
  startMidi: 36,
  endMidi: 96,
  keyCount: 61,
  recommended: false,
} satisfies KeyboardPreset)

export const KEYBOARD_49_PRESET = Object.freeze({
  preset: '49-key',
  label: '49-key keyboard',
  description: 'Compact controller range',
  startMidi: 36,
  endMidi: 84,
  keyCount: 49,
} satisfies KeyboardPreset)

export const KEYBOARD_76_PRESET = Object.freeze({
  preset: '76-key',
  label: '76-key keyboard',
  description: 'Extended keyboard range',
  startMidi: 28,
  endMidi: 103,
  keyCount: 76,
} satisfies KeyboardPreset)

export const FULL_PIANO_88_PRESET = Object.freeze({
  preset: '88-key',
  label: 'Full piano',
  description: 'Full acoustic-piano range',
  startMidi: 21,
  endMidi: 108,
  keyCount: 88,
} satisfies KeyboardPreset)

export const SONG_FOCUS_PRESET = Object.freeze({
  preset: 'auto',
  label: 'Song focus',
  description: 'Fit the visible keys to each song',
  // Used as the calm middle-C fallback when a song contains no notes.
  startMidi: 48,
  endMidi: 72,
} satisfies KeyboardPreset)

/** Presets shown in the range selector, ordered by the most useful default. */
export const KEYBOARD_PRESETS: readonly KeyboardPreset[] = Object.freeze([
  YAMAHA_PSR_E383_PRESET,
  KEYBOARD_49_PRESET,
  KEYBOARD_76_PRESET,
  FULL_PIANO_88_PRESET,
  SONG_FOCUS_PRESET,
] as const)

export const DEFAULT_KEYBOARD_CONFIG: Readonly<KeyboardConfig> = Object.freeze({
  preset: YAMAHA_PSR_E383_PRESET.preset,
  startMidi: YAMAHA_PSR_E383_PRESET.startMidi,
  endMidi: YAMAHA_PSR_E383_PRESET.endMidi,
  noteNaming: DEFAULT_NOTE_NAMING_CONVENTION,
})

const PRESET_IDS = new Set<KeyboardPresetId>([
  ...KEYBOARD_PRESETS.map((preset) => preset.preset),
  'custom',
  'detected',
])

const NOTE_NAMING_IDS = new Set<NoteNamingConvention>(
  NOTE_NAMING_CONVENTIONS.map((convention) => convention.id),
)

function clampMidi(value: number) {
  return Math.max(MIDI_NOTE_MIN, Math.min(MIDI_NOTE_MAX, Math.round(value)))
}

function normalizeMidi(value: unknown, fallback: number) {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? clampMidi(numeric) : fallback
}

function getPresetFallback(preset: KeyboardPresetId) {
  return KEYBOARD_PRESETS.find((candidate) => candidate.preset === preset) ?? YAMAHA_PSR_E383_PRESET
}

/** Formats a MIDI number without changing its pitch or MIDI identity. */
export function formatMidiNote(
  midi: number,
  convention: NoteNamingConvention = DEFAULT_NOTE_NAMING_CONVENTION,
) {
  if (!Number.isFinite(midi)) return '—'
  const normalized = clampMidi(midi)
  const pitchClass = normalized % 12
  const octaveOffset = convention === 'yamaha' ? -2 : -1
  const octave = Math.floor(normalized / 12) + octaveOffset
  return `${PITCH_NAMES[pitchClass]}${octave}`
}

/** Alias for call sites that read more naturally with a getter-style name. */
export const getMidiNoteName = formatMidiNote

export function formatMidiRange(
  startMidi: number,
  endMidi: number,
  convention: NoteNamingConvention = DEFAULT_NOTE_NAMING_CONVENTION,
) {
  return `${formatMidiNote(startMidi, convention)}–${formatMidiNote(endMidi, convention)}`
}

/** A concise, derived label for settings and learning surfaces. */
export function getKeyboardConfigLabel(config: KeyboardConfigInput) {
  const safeConfig = sanitizeKeyboardConfig(config)
  const preset = KEYBOARD_PRESETS.find((candidate) => candidate.preset === safeConfig.preset)
  if (preset) return preset.label
  const kind = safeConfig.preset === 'detected' ? 'Detected' : 'Custom'
  return `${kind} · ${safeConfig.endMidi - safeConfig.startMidi + 1} keys`
}

/**
 * Makes persisted or user-provided range settings safe to render. Unknown
 * presets fall back to the recommended Yamaha model; reversed endpoints are
 * accepted and normalized rather than discarded.
 */
export function sanitizeKeyboardConfig(
  config?: Partial<KeyboardConfig> | null,
): KeyboardConfig {
  const requestedPreset = config?.preset
  const preset = requestedPreset && PRESET_IDS.has(requestedPreset)
    ? requestedPreset
    : DEFAULT_KEYBOARD_CONFIG.preset
  const fallback = getPresetFallback(preset)
  const first = normalizeMidi(config?.startMidi, fallback.startMidi)
  const second = normalizeMidi(config?.endMidi, fallback.endMidi)
  const requestedNoteNaming = config?.noteNaming
  const noteNaming = requestedNoteNaming && NOTE_NAMING_IDS.has(requestedNoteNaming)
    ? requestedNoteNaming
    : DEFAULT_NOTE_NAMING_CONVENTION

  return {
    preset,
    startMidi: Math.min(first, second),
    endMidi: Math.max(first, second),
    noteNaming,
  }
}

function readMidi(note: MidiNoteLike) {
  const value = typeof note === 'number' ? note : note?.midi
  return Number.isFinite(value) ? clampMidi(value) : null
}

/**
 * Resolves the visible keyboard/highway span. Physical, custom, and detected
 * ranges always use their complete configured keybed. Song focus adds three
 * semitones of context and guarantees at least 24 visible keys.
 */
export function resolvePracticeRange(
  notes: readonly MidiNoteLike[] | null | undefined,
  config: KeyboardConfigInput,
): [number, number] {
  const safeConfig = sanitizeKeyboardConfig(config)
  if (safeConfig.preset !== 'auto') {
    return [safeConfig.startMidi, safeConfig.endMidi]
  }

  const songMidis = (notes ?? [])
    .map(readMidi)
    .filter((midi): midi is number => midi !== null)
  if (!songMidis.length) {
    return [safeConfig.startMidi, safeConfig.endMidi]
  }

  let low = Math.max(MIDI_NOTE_MIN, Math.min(...songMidis) - 3)
  let high = Math.min(MIDI_NOTE_MAX, Math.max(...songMidis) + 3)

  const minimumDifference = 23 // 24 inclusive MIDI keys
  let missing = Math.max(0, minimumDifference - (high - low))
  const lowerExpansion = Math.min(low - MIDI_NOTE_MIN, Math.ceil(missing / 2))
  low -= lowerExpansion
  missing -= lowerExpansion

  const upperExpansion = Math.min(MIDI_NOTE_MAX - high, missing)
  high += upperExpansion
  missing -= upperExpansion

  // At the top edge, any space that could not be added above is added below.
  low = Math.max(MIDI_NOTE_MIN, low - missing)
  return [low, high]
}
