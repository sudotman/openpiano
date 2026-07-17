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

export type ScaleMode = 'major' | 'minor'
export type TriadQuality = 'major' | 'minor' | 'diminished' | 'augmented'

export interface IntervalDefinition {
  semitones: number
  shortName: string
  name: string
  character: string
}

export interface DiatonicTriad {
  degree: number
  roman: string
  quality: Exclude<TriadQuality, 'augmented'>
  root: number
  function: 'tonic' | 'predominant' | 'dominant'
}

export const INTERVALS: readonly IntervalDefinition[] = [
  { semitones: 0, shortName: 'P1', name: 'Perfect unison', character: 'The same pitch' },
  { semitones: 1, shortName: 'm2', name: 'Minor second', character: 'Tight and tense' },
  { semitones: 2, shortName: 'M2', name: 'Major second', character: 'A whole-step move' },
  { semitones: 3, shortName: 'm3', name: 'Minor third', character: 'The color of a minor triad' },
  { semitones: 4, shortName: 'M3', name: 'Major third', character: 'The color of a major triad' },
  { semitones: 5, shortName: 'P4', name: 'Perfect fourth', character: 'Open and suspended' },
  { semitones: 6, shortName: 'TT', name: 'Tritone', character: 'Unstable; wants to resolve' },
  { semitones: 7, shortName: 'P5', name: 'Perfect fifth', character: 'Open and stable' },
  { semitones: 8, shortName: 'm6', name: 'Minor sixth', character: 'Wide and expressive' },
  { semitones: 9, shortName: 'M6', name: 'Major sixth', character: 'Warm and consonant' },
  { semitones: 10, shortName: 'm7', name: 'Minor seventh', character: 'Broad and unresolved' },
  { semitones: 11, shortName: 'M7', name: 'Major seventh', character: 'Bright, close tension' },
  { semitones: 12, shortName: 'P8', name: 'Perfect octave', character: 'The same note, higher' },
] as const

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

export function getScalePitchClasses(root: number, mode: ScaleMode) {
  const formula = mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10]
  const safeRoot = ((Math.round(root) % 12) + 12) % 12
  return formula.map((interval) => (safeRoot + interval) % 12)
}

export function notesInScale(startMidi: number, endMidi: number, root: number, mode: ScaleMode) {
  const classes = new Set(getScalePitchClasses(root, mode))
  const start = Math.max(0, Math.min(127, Math.round(startMidi)))
  const end = Math.max(start, Math.min(127, Math.round(endMidi)))
  return Array.from({ length: end - start + 1 }, (_, index) => start + index).filter((midi) => classes.has(midi % 12))
}

export function getInterval(semitones: number): IntervalDefinition {
  const normalized = Math.max(0, Math.min(12, Math.round(Number.isFinite(semitones) ? semitones : 0)))
  return INTERVALS.find((interval) => interval.semitones === normalized) ?? INTERVALS[0]
}

export function getTriadPitchClasses(root: number, quality: TriadQuality) {
  const safeRoot = ((Math.round(root) % 12) + 12) % 12
  const formula = quality === 'major'
    ? [0, 4, 7]
    : quality === 'minor'
      ? [0, 3, 7]
      : quality === 'diminished'
        ? [0, 3, 6]
        : [0, 4, 8]
  return formula.map((interval) => (safeRoot + interval) % 12)
}

/** Build an ascending playable triad and rotate voices for first/second inversion. */
export function buildTriad(rootMidi: number, quality: TriadQuality, inversion = 0) {
  // A second inversion can lift the upper chord tones by an octave; reserve 20 semitones.
  const safeRoot = Math.max(0, Math.min(107, Math.round(Number.isFinite(rootMidi) ? rootMidi : 60)))
  const pitchClasses = getTriadPitchClasses(safeRoot, quality)
  const chord = pitchClasses.map((pitchClass, index) => {
    const rootClass = safeRoot % 12
    const distance = (pitchClass - rootClass + 12) % 12
    return safeRoot + distance + (index > 0 && distance === 0 ? 12 : 0)
  })
  const turns = ((Math.round(inversion) % chord.length) + chord.length) % chord.length
  for (let index = 0; index < turns; index += 1) chord.push(chord.shift()! + 12)
  return chord
}

export function getDiatonicTriads(root: number, mode: ScaleMode): DiatonicTriad[] {
  const scale = getScalePitchClasses(root, mode)
  const majorQualities: DiatonicTriad['quality'][] = ['major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished']
  const minorQualities: DiatonicTriad['quality'][] = ['minor', 'diminished', 'major', 'minor', 'minor', 'major', 'major']
  const majorRomans = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']
  const minorRomans = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']
  const functions: DiatonicTriad['function'][] = ['tonic', 'predominant', 'tonic', 'predominant', 'dominant', 'tonic', 'dominant']
  const qualities = mode === 'major' ? majorQualities : minorQualities
  const romans = mode === 'major' ? majorRomans : minorRomans

  return scale.map((pitchClass, index) => ({
    degree: index + 1,
    roman: romans[index],
    quality: qualities[index],
    root: pitchClass,
    function: functions[index],
  }))
}

export function triadName(root: number, quality: TriadQuality, preferFlats = false) {
  const pitchClass = ((Math.round(root) % 12) + 12) % 12
  const rootName = (preferFlats ? FLAT_NAMES : SHARP_NAMES)[pitchClass]
  const suffix = quality === 'major' ? '' : quality === 'minor' ? 'm' : quality === 'diminished' ? '°' : '+'
  return `${rootName}${suffix}`
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
