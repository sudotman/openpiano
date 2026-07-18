export const MIN_PLAYBACK_RATE = 0.25
export const MAX_PLAYBACK_RATE = 2
export const FLOW_COUNT_IN_BEATS = 3
export const MIN_FLOW_COUNT_IN_INTERVAL_MS = 450
export const MAX_FLOW_COUNT_IN_INTERVAL_MS = 900

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function safeOriginalBpm(originalBpm: number) {
  return Number.isFinite(originalBpm) && originalBpm > 0 ? originalBpm : 120
}

/** Convert a playback-rate multiplier into the tempo the learner will hear. */
export function playbackBpm(originalBpm: number, playbackRate: number) {
  const bpm = safeOriginalBpm(originalBpm)
  const rate = clamp(
    Number.isFinite(playbackRate) ? playbackRate : 1,
    MIN_PLAYBACK_RATE,
    MAX_PLAYBACK_RATE,
  )
  return Math.round(bpm * rate)
}

/** Convert an exact BPM choice back into the timeline's playback-rate multiplier. */
export function playbackRateForBpm(originalBpm: number, targetBpm: number) {
  const bpm = safeOriginalBpm(originalBpm)
  const target = Number.isFinite(targetBpm) ? targetBpm : bpm
  return clamp(target / bpm, MIN_PLAYBACK_RATE, MAX_PLAYBACK_RATE)
}

/** The explicit BPM slider spans the same safe 25%–200% range as playback. */
export function playbackBpmBounds(originalBpm: number) {
  const bpm = safeOriginalBpm(originalBpm)
  return {
    min: Math.max(1, Math.round(bpm * MIN_PLAYBACK_RATE)),
    max: Math.max(2, Math.round(bpm * MAX_PLAYBACK_RATE)),
  }
}

/**
 * Keep the Flow count-in musical without making very slow tempos feel stalled
 * or very fast tempos impossible to read.
 */
export function flowCountInIntervalMs(effectiveBpm: number) {
  const bpm = Number.isFinite(effectiveBpm) && effectiveBpm > 0 ? effectiveBpm : 120
  return Math.round(clamp(
    60_000 / bpm,
    MIN_FLOW_COUNT_IN_INTERVAL_MS,
    MAX_FLOW_COUNT_IN_INTERVAL_MS,
  ))
}
