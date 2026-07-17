import { describe, expect, it } from 'vitest'
import {
  buildTriad,
  getDiatonicTriads,
  getInterval,
  getScalePitchClasses,
  getTriadPitchClasses,
  midiFrequency,
  midiNoteName,
  notesInScale,
  sanitizeTheoryProgress,
  theoryAccuracy,
  triadName,
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

  it('describes chromatic intervals safely', () => {
    expect(getInterval(4)).toMatchObject({ shortName: 'M3', name: 'Major third' })
    expect(getInterval(7.2)).toMatchObject({ shortName: 'P5' })
    expect(getInterval(99)).toMatchObject({ shortName: 'P8' })
  })

  it('spells triads, inversions, and diatonic harmony', () => {
    expect(getTriadPitchClasses(0, 'major')).toEqual([0, 4, 7])
    expect(getTriadPitchClasses(9, 'minor')).toEqual([9, 0, 4])
    expect(buildTriad(60, 'major')).toEqual([60, 64, 67])
    expect(buildTriad(60, 'major', 1)).toEqual([64, 67, 72])
    expect(buildTriad(60, 'major', 2)).toEqual([67, 72, 76])
    expect(triadName(10, 'major', true)).toBe('B♭')

    expect(getDiatonicTriads(0, 'major').map(({ roman, quality }) => ({ roman, quality }))).toEqual([
      { roman: 'I', quality: 'major' },
      { roman: 'ii', quality: 'minor' },
      { roman: 'iii', quality: 'minor' },
      { roman: 'IV', quality: 'major' },
      { roman: 'V', quality: 'major' },
      { roman: 'vi', quality: 'minor' },
      { roman: 'vii°', quality: 'diminished' },
    ])
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
