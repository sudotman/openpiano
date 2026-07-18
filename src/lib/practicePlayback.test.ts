import { describe, expect, it } from 'vitest'
import {
  FLOW_COUNT_IN_BEATS,
  MAX_PLAYBACK_RATE,
  MIN_PLAYBACK_RATE,
  flowCountInIntervalMs,
  playbackBpm,
  playbackBpmBounds,
  playbackRateForBpm,
} from './practicePlayback'

describe('practice playback tempo', () => {
  it('labels percentage playback rates with their audible BPM', () => {
    expect(playbackBpm(120, .5)).toBe(60)
    expect(playbackBpm(120, .75)).toBe(90)
    expect(playbackBpm(120, 1)).toBe(120)
  })

  it('converts exact BPM choices into playback rates', () => {
    expect(playbackRateForBpm(120, 90)).toBe(.75)
    expect(playbackRateForBpm(80, 120)).toBe(1.5)
  })

  it('keeps direct BPM choices inside the supported playback range', () => {
    expect(playbackRateForBpm(120, 1)).toBe(MIN_PLAYBACK_RATE)
    expect(playbackRateForBpm(120, 999)).toBe(MAX_PLAYBACK_RATE)
    expect(playbackBpmBounds(120)).toEqual({ min: 30, max: 240 })
  })
})

describe('Flow mode count-in', () => {
  it('uses three readable, tempo-aware beats', () => {
    expect(FLOW_COUNT_IN_BEATS).toBe(3)
    expect(flowCountInIntervalMs(120)).toBe(500)
    expect(flowCountInIntervalMs(60)).toBe(900)
    expect(flowCountInIntervalMs(240)).toBe(450)
  })

  it('falls back safely for invalid tempos', () => {
    expect(flowCountInIntervalMs(Number.NaN)).toBe(500)
    expect(flowCountInIntervalMs(0)).toBe(500)
  })
})
