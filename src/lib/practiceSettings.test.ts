import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PRACTICE_PREFERENCES,
  getPracticeCompletionAction,
  sanitizePracticePreferences,
} from './practiceSettings'

describe('practice preferences', () => {
  it('starts new and legacy profiles at full tempo', () => {
    expect(sanitizePracticePreferences(null)).toEqual(DEFAULT_PRACTICE_PREFERENCES)
    expect(sanitizePracticePreferences({ preset: 'yamaha-psr-e383', startMidi: 36, endMidi: 96 })).toEqual({
      defaultTempoPercent: 100,
      midiPlayThrough: false,
    })
  })

  it('restores supported tempo choices and rejects malformed values', () => {
    expect(sanitizePracticePreferences({ defaultTempoPercent: 50 })).toEqual({ defaultTempoPercent: 50, midiPlayThrough: false })
    expect(sanitizePracticePreferences({ defaultTempoPercent: 75 })).toEqual({ defaultTempoPercent: 75, midiPlayThrough: false })
    expect(sanitizePracticePreferences({ defaultTempoPercent: 100, midiPlayThrough: true })).toEqual({ defaultTempoPercent: 100, midiPlayThrough: true })
    expect(sanitizePracticePreferences({ defaultTempoPercent: 90 })).toEqual({ defaultTempoPercent: 100, midiPlayThrough: false })
    expect(sanitizePracticePreferences({ defaultTempoPercent: '75', midiPlayThrough: 'yes' })).toEqual({ defaultTempoPercent: 100, midiPlayThrough: false })
  })
})

describe('practice completion MIDI controls', () => {
  it('maps only the configured outer keys to repeat and next', () => {
    expect(getPracticeCompletionAction(36, 36, 96)).toBe('repeat')
    expect(getPracticeCompletionAction(96, 36, 96)).toBe('next')
    expect(getPracticeCompletionAction(60, 36, 96)).toBeNull()
  })
})
