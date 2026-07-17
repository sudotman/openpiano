import { describe, expect, it } from 'vitest'
import {
  MAX_PLAYBACK_RATE,
  MIN_PLAYBACK_RATE,
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
