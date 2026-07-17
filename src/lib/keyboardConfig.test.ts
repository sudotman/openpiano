import { describe, expect, it } from 'vitest'

import {
  DEFAULT_KEYBOARD_CONFIG,
  FULL_PIANO_88_PRESET,
  KEYBOARD_49_PRESET,
  KEYBOARD_76_PRESET,
  KEYBOARD_PRESETS,
  NOTE_NAMING_CONVENTIONS,
  SONG_FOCUS_PRESET,
  YAMAHA_PSR_E383_PRESET,
  formatMidiNote,
  formatMidiRange,
  getKeyboardConfigLabel,
  resolvePracticeRange,
  sanitizeKeyboardConfig,
  type KeyboardConfig,
} from './keyboardConfig'

describe('keyboard presets', () => {
  it('describes the supported physical keyboards with exact inclusive ranges', () => {
    expect(YAMAHA_PSR_E383_PRESET).toMatchObject({
      preset: 'yamaha-psr-e383',
      startMidi: 36,
      endMidi: 96,
      keyCount: 61,
      recommended: true,
    })
    expect(KEYBOARD_49_PRESET).toMatchObject({ startMidi: 36, endMidi: 84, keyCount: 49 })
    expect(KEYBOARD_76_PRESET).toMatchObject({ startMidi: 28, endMidi: 103, keyCount: 76 })
    expect(FULL_PIANO_88_PRESET).toMatchObject({ startMidi: 21, endMidi: 108, keyCount: 88 })
    expect(KEYBOARD_PRESETS.at(-1)).toBe(SONG_FOCUS_PRESET)
    expect(DEFAULT_KEYBOARD_CONFIG).toEqual({
      preset: 'yamaha-psr-e383',
      startMidi: 36,
      endMidi: 96,
      noteNaming: 'yamaha',
    })
    expect(NOTE_NAMING_CONVENTIONS.map((convention) => convention.id)).toEqual(['scientific', 'yamaha'])
  })
})

describe('MIDI note formatting and sanitizing', () => {
  it('defaults to the PSR-E383 convention and a typographic range separator', () => {
    expect(formatMidiNote(21)).toBe('A-1')
    expect(formatMidiNote(36)).toBe('C1')
    expect(formatMidiNote(60)).toBe('C3')
    expect(formatMidiNote(61)).toBe('C♯3')
    expect(formatMidiNote(108)).toBe('C7')
    expect(formatMidiNote(Number.NaN)).toBe('—')
    expect(formatMidiRange(36, 96)).toBe('C1–C6')
    expect(getKeyboardConfigLabel(DEFAULT_KEYBOARD_CONFIG)).toBe('Yamaha PSR-E383')
    expect(getKeyboardConfigLabel({ preset: 'detected', startMidi: 28, endMidi: 103, noteNaming: 'yamaha' })).toBe('Detected · 76 keys')
  })

  it('can label the same pitches with scientific pitch notation', () => {
    expect(formatMidiNote(36, 'scientific')).toBe('C2')
    expect(formatMidiNote(60, 'scientific')).toBe('C4')
    expect(formatMidiNote(61, 'scientific')).toBe('C♯4')
    expect(formatMidiNote(96, 'scientific')).toBe('C7')
    expect(formatMidiRange(36, 96, 'scientific')).toBe('C2–C7')
  })

  it('clamps, rounds, and orders custom endpoints', () => {
    expect(sanitizeKeyboardConfig({
      preset: 'custom',
      startMidi: 140,
      endMidi: 20.6,
      noteNaming: 'yamaha',
    })).toEqual({ preset: 'custom', startMidi: 21, endMidi: 127, noteNaming: 'yamaha' })
  })

  it('recovers from unknown or non-finite persisted values', () => {
    const unsafe = {
      preset: 'not-a-keyboard',
      startMidi: Number.NaN,
      endMidi: Number.POSITIVE_INFINITY,
      noteNaming: 'not-a-convention',
    } as unknown as KeyboardConfig
    expect(sanitizeKeyboardConfig(unsafe)).toEqual(DEFAULT_KEYBOARD_CONFIG)
  })

  it('migrates an existing profile to Yamaha labels without changing its range', () => {
    expect(sanitizeKeyboardConfig({
      preset: 'custom',
      startMidi: 32,
      endMidi: 92,
    })).toEqual({
      preset: 'custom',
      startMidi: 32,
      endMidi: 92,
      noteNaming: 'yamaha',
    })
  })
})

describe('practice range resolution', () => {
  it('keeps complete physical, custom, and detected ranges regardless of song notes', () => {
    expect(resolvePracticeRange([{ midi: 60 }, { midi: 64 }], DEFAULT_KEYBOARD_CONFIG)).toEqual([36, 96])
    expect(resolvePracticeRange([60], { preset: 'custom', startMidi: 41, endMidi: 89, noteNaming: 'scientific' })).toEqual([41, 89])
    expect(resolvePracticeRange([60], { preset: 'detected', startMidi: 28, endMidi: 103, noteNaming: 'yamaha' })).toEqual([28, 103])
  })

  it('focuses auto mode around a song with padding and a 24-key minimum', () => {
    expect(resolvePracticeRange([{ midi: 60 }, { midi: 64 }, { midi: 67 }], SONG_FOCUS_PRESET)).toEqual([52, 75])
    expect(resolvePracticeRange([0], SONG_FOCUS_PRESET)).toEqual([0, 23])
    expect(resolvePracticeRange([127], SONG_FOCUS_PRESET)).toEqual([104, 127])
  })

  it('uses the middle-C fallback for an empty or invalid song', () => {
    expect(resolvePracticeRange([], SONG_FOCUS_PRESET)).toEqual([48, 72])
    expect(resolvePracticeRange([{ midi: Number.NaN }], SONG_FOCUS_PRESET)).toEqual([48, 72])
  })
})
