import { describe, expect, it } from 'vitest'
import {
  getScalePitchClasses,
  midiFrequency,
  midiNoteName,
  notesInScale,
  sanitizeTheoryProgress,
  theoryAccuracy,
} from './theory'

describe('theory helpers', () => {
  it('names MIDI notes and calculates concert pitch', () => {
    expect(midiNoteName(60)).toBe('C4')
    expect(midiNoteName(70, true)).toBe('B♭4')
    expect(midiFrequency(69)).toBe(440)
  })

  it('builds major and minor scales', () => {
    expect(getScalePitchClasses(0, 'major')).toEqual([0, 2, 4, 5, 7, 9, 11])
    expect(getScalePitchClasses(9, 'minor')).toEqual([9, 11, 0, 2, 4, 5, 7])
    expect(notesInScale(60, 72, 0, 'major')).toEqual([60, 62, 64, 65, 67, 69, 71, 72])
  })

  it('sanitizes stored progress', () => {
    expect(sanitizeTheoryProgress({ attempts: 4, correct: 3, masteredNotes: [60, 60, 200], rhythmBest: 103 })).toMatchObject({
      attempts: 4,
      correct: 3,
      masteredNotes: [60],
      rhythmBest: 100,
    })
    expect(theoryAccuracy({ attempts: 4, correct: 3, bestStreak: 2, masteredNotes: [], rhythmBest: 0, completedModules: [] })).toBe(75)
  })
})
