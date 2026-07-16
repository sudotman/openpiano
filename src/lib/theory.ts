export interface TheoryProgress {
  attempts: number
  correct: number
  bestStreak: number
  masteredNotes: number[]
  rhythmBest: number
  completedModules: string[]
}

export const DEFAULT_THEORY_PROGRESS: TheoryProgress = {
  attempts: 0,
  correct: 0,
  bestStreak: 0,
  masteredNotes: [],
  rhythmBest: 0,
  completedModules: [],
}

const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']

export function midiNoteName(midi: number, preferFlats = false, includeOctave = true) {
  const safe = Math.max(0, Math.min(127, Math.round(midi)))
  const name = (preferFlats ? FLAT_NAMES : SHARP_NAMES)[safe % 12]
  return includeOctave ? `${name}${Math.floor(safe / 12) - 1}` : name
}

export function midiFrequency(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12)
}

export function getScalePitchClasses(root: number, mode: 'major' | 'minor') {
  const formula = mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10]
  return formula.map((interval) => (root + interval) % 12)
}

export function notesInScale(startMidi: number, endMidi: number, root: number, mode: 'major' | 'minor') {
  const classes = new Set(getScalePitchClasses(root, mode))
  const start = Math.max(0, Math.min(127, Math.round(startMidi)))
  const end = Math.max(start, Math.min(127, Math.round(endMidi)))
  return Array.from({ length: end - start + 1 }, (_, index) => start + index).filter((midi) => classes.has(midi % 12))
}

export function sanitizeTheoryProgress(value: unknown): TheoryProgress {
  if (!value || typeof value !== 'object') return { ...DEFAULT_THEORY_PROGRESS }
  const source = value as Partial<TheoryProgress>
  const number = (input: unknown, fallback = 0) => Number.isFinite(input) ? Math.max(0, Math.round(input as number)) : fallback
  return {
    attempts: number(source.attempts),
    correct: number(source.correct),
    bestStreak: number(source.bestStreak),
    masteredNotes: Array.isArray(source.masteredNotes)
      ? Array.from(new Set(source.masteredNotes.filter((note): note is number => Number.isInteger(note) && note >= 0 && note <= 127))).sort((a, b) => a - b)
      : [],
    rhythmBest: Math.min(100, number(source.rhythmBest)),
    completedModules: Array.isArray(source.completedModules)
      ? Array.from(new Set(source.completedModules.filter((item): item is string => typeof item === 'string')))
      : [],
  }
}

export function theoryAccuracy(progress: TheoryProgress) {
  return progress.attempts ? Math.round((progress.correct / progress.attempts) * 100) : 0
}

