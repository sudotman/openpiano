export const PRACTICE_TEMPO_OPTIONS = [50, 75, 100] as const

export type PracticeTempoPercent = typeof PRACTICE_TEMPO_OPTIONS[number]

export interface PracticePreferences {
  defaultTempoPercent: PracticeTempoPercent
  midiPlayThrough: boolean
}

export const DEFAULT_PRACTICE_PREFERENCES: PracticePreferences = Object.freeze({
  defaultTempoPercent: 100,
  midiPlayThrough: false,
})

/**
 * Reads the practice fields from the profile's shared settings object. Older
 * profiles only stored keyboard-range fields here, so absent or invalid tempo
 * values intentionally migrate to full speed.
 */
export function sanitizePracticePreferences(value: unknown): PracticePreferences {
  if (!value || typeof value !== 'object') return DEFAULT_PRACTICE_PREFERENCES

  const requestedTempo = (value as Partial<PracticePreferences>).defaultTempoPercent
  const defaultTempoPercent = PRACTICE_TEMPO_OPTIONS.find((tempo) => tempo === requestedTempo)

  return {
    defaultTempoPercent: defaultTempoPercent ?? DEFAULT_PRACTICE_PREFERENCES.defaultTempoPercent,
    midiPlayThrough: (value as Partial<PracticePreferences>).midiPlayThrough === true,
  }
}

export type PracticeCompletionAction = 'repeat' | 'next'

/** The outermost configured MIDI keys become controls only on the results screen. */
export function getPracticeCompletionAction(
  note: number,
  lowestMidi: number,
  highestMidi: number,
): PracticeCompletionAction | null {
  if (note === lowestMidi) return 'repeat'
  if (note === highestMidi) return 'next'
  return null
}
