import type { SongNote } from "../types";

/** The subset of western time signatures needed by the score renderer. */
export interface TimeSignature {
  beats: number;
  beatValue: number;
}

export type NotationClef = "treble" | "bass";

export interface QuantizedDuration {
  /** VexFlow's duration token. */
  duration: "w" | "h" | "q" | "8" | "16";
  dots: 0 | 1;
  /** Duration expressed in quarter-note beats. */
  beats: number;
}

export interface QuantizedChord {
  /** Offset from the beginning of the measure, in quarter-note beats. */
  beat: number;
  durationBeats: number;
  notes: SongNote[];
}

export interface NotationMeasure {
  index: number;
  treble: QuantizedChord[];
  bass: QuantizedChord[];
}

export interface RhythmRest {
  type: "rest";
  beat: number;
  token: QuantizedDuration;
}

export interface RhythmChord {
  type: "chord";
  beat: number;
  token: QuantizedDuration;
  chord: QuantizedChord;
}

export type RhythmEvent = RhythmRest | RhythmChord;

const DEFAULT_TIME_SIGNATURE: TimeSignature = { beats: 4, beatValue: 4 };
const VALID_BEAT_VALUES = new Set([1, 2, 4, 8, 16, 32]);
const EPSILON = 1e-7;

const DURATION_CANDIDATES: readonly QuantizedDuration[] = [
  { duration: "w", dots: 0, beats: 4 },
  { duration: "h", dots: 1, beats: 3 },
  { duration: "h", dots: 0, beats: 2 },
  { duration: "q", dots: 1, beats: 1.5 },
  { duration: "q", dots: 0, beats: 1 },
  { duration: "8", dots: 1, beats: 0.75 },
  { duration: "8", dots: 0, beats: 0.5 },
  { duration: "16", dots: 0, beats: 0.25 },
];

const SHARP_NAMES = [
  "c",
  "c#",
  "d",
  "d#",
  "e",
  "f",
  "f#",
  "g",
  "g#",
  "a",
  "a#",
  "b",
] as const;

const FLAT_NAMES = [
  "c",
  "db",
  "d",
  "eb",
  "e",
  "f",
  "gb",
  "g",
  "ab",
  "a",
  "bb",
  "b",
] as const;

const DISPLAY_SHARP_NAMES = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
] as const;

const DISPLAY_FLAT_NAMES = [
  "C",
  "D♭",
  "D",
  "E♭",
  "E",
  "F",
  "G♭",
  "G",
  "A♭",
  "A",
  "B♭",
  "B",
] as const;

const roundBeat = (value: number) => Math.round(value * 10_000) / 10_000;

const safeBpm = (bpm: number) =>
  Number.isFinite(bpm) && bpm > 0 ? bpm : 120;

/** Parse a song's signature without allowing malformed MIDI metadata to leak out. */
export function parseTimeSignature(value?: string | null): TimeSignature {
  const normalized = value?.trim();
  if (normalized === "C") return { beats: 4, beatValue: 4 };
  if (normalized === "C|" || normalized === "¢") {
    return { beats: 2, beatValue: 2 };
  }

  const match = normalized?.match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/);
  if (!match) return { ...DEFAULT_TIME_SIGNATURE };

  const beats = Number(match[1]);
  const beatValue = Number(match[2]);
  if (
    !Number.isInteger(beats) ||
    beats < 1 ||
    beats > 32 ||
    !VALID_BEAT_VALUES.has(beatValue)
  ) {
    return { ...DEFAULT_TIME_SIGNATURE };
  }

  return { beats, beatValue };
}

/** Quarter-note beats contained in one bar. */
export function getMeasureBeats(signature: TimeSignature): number {
  return signature.beats * (4 / signature.beatValue);
}

export function getSecondsPerQuarter(bpm: number): number {
  return 60 / safeBpm(bpm);
}

export function getMeasureDuration(
  bpm: number,
  signature: TimeSignature,
): number {
  return getSecondsPerQuarter(bpm) * getMeasureBeats(signature);
}

export function getMeasureIndex(
  time: number,
  bpm: number,
  signature: TimeSignature,
): number {
  const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
  return Math.floor((safeTime + EPSILON) / getMeasureDuration(bpm, signature));
}

export function getMeasureStartTime(
  index: number,
  bpm: number,
  signature: TimeSignature,
): number {
  const safeIndex = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  return safeIndex * getMeasureDuration(bpm, signature);
}

export function getMeasureCount(
  duration: number,
  bpm: number,
  signature: TimeSignature,
): number {
  const safeDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  return Math.max(1, Math.ceil((safeDuration - EPSILON) / getMeasureDuration(bpm, signature)));
}

export interface NotationPage {
  /** First measure kept on the current, stable score page. */
  startIndex: number;
  /** Real measures on this page; the final page may contain fewer cells. */
  indices: number[];
  /** Zero-based horizontal slot occupied by the current measure. */
  currentSlot: number;
}

/**
 * Pages the score without re-centering it at every bar line. Keeping the same
 * page for `visibleCount` measures prevents the notation from shifting under
 * the learner while the playhead advances.
 */
export function getNotationPage(
  currentMeasure: number,
  totalMeasures: number,
  visibleCount: number,
): NotationPage {
  const safeTotal = Math.max(1, Math.floor(Number.isFinite(totalMeasures) ? totalMeasures : 1));
  const safeCount = Math.max(1, Math.floor(Number.isFinite(visibleCount) ? visibleCount : 1));
  const safeCurrent = Math.max(
    0,
    Math.min(safeTotal - 1, Math.floor(Number.isFinite(currentMeasure) ? currentMeasure : 0)),
  );
  const startIndex = Math.floor(safeCurrent / safeCount) * safeCount;
  const length = Math.min(safeCount, safeTotal - startIndex);

  return {
    startIndex,
    indices: Array.from({ length }, (_, index) => startIndex + index),
    currentSlot: safeCurrent - startIndex,
  };
}

/** Convert MIDI middle C (60) to VexFlow's `c/4` pitch syntax. */
export function midiToVexKey(midi: number, preferFlats = false): string {
  const normalized = Math.min(
    127,
    Math.max(0, Math.round(Number.isFinite(midi) ? midi : 60)),
  );
  const pitch = (preferFlats ? FLAT_NAMES : SHARP_NAMES)[normalized % 12];
  const octave = Math.floor(normalized / 12) - 1;
  return `${pitch}/${octave}`;
}

export function midiToNoteName(midi: number, preferFlats = false): string {
  const normalized = Math.min(
    127,
    Math.max(0, Math.round(Number.isFinite(midi) ? midi : 60)),
  );
  const pitch = (preferFlats ? DISPLAY_FLAT_NAMES : DISPLAY_SHARP_NAMES)[
    normalized % 12
  ];
  return `${pitch}${Math.floor(normalized / 12) - 1}`;
}

export function keyPrefersFlats(key: string): boolean {
  const tonic = key.trim().match(/^([A-G](?:b|#)?)/)?.[1] ?? "C";
  return ["F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"].includes(tonic);
}

/** Normalize friendly values such as "G major" into VexFlow's key spec. */
export function toVexKeySignature(key: string): string {
  const match = key.trim().match(/^([A-G](?:b|#)?)(?:\s+(major|minor))?/i);
  if (!match) return "C";
  const tonic = `${match[1][0].toUpperCase()}${match[1].slice(1)}`;
  return match[2]?.toLowerCase() === "minor" ? `${tonic}m` : tonic;
}

/** Snap a beat position to a rhythmic grid; four subdivisions means sixteenths. */
export function quantizeBeat(value: number, subdivisions = 4): number {
  const safeSubdivisions =
    Number.isFinite(subdivisions) && subdivisions > 0
      ? Math.max(1, Math.round(subdivisions))
      : 4;
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  const step = 1 / safeSubdivisions;
  return roundBeat(Math.round(safeValue / step) * step);
}

/** Return the closest engravable duration, including common dotted values. */
export function quantizeDuration(beats: number): QuantizedDuration {
  const safeBeats = Number.isFinite(beats) ? Math.max(0.25, beats) : 1;
  return DURATION_CANDIDATES.reduce((closest, candidate) => {
    const candidateDistance = Math.abs(candidate.beats - safeBeats);
    const closestDistance = Math.abs(closest.beats - safeBeats);
    if (candidateDistance < closestDistance - EPSILON) return candidate;
    if (
      Math.abs(candidateDistance - closestDistance) <= EPSILON &&
      candidate.beats < closest.beats
    ) {
      return candidate;
    }
    return closest;
  });
}

/** Decompose a rest into exact VexFlow duration values on a sixteenth grid. */
export function splitDuration(beats: number): QuantizedDuration[] {
  let remaining = quantizeBeat(beats);
  const result: QuantizedDuration[] = [];

  while (remaining >= 0.25 - EPSILON) {
    const token =
      DURATION_CANDIDATES.find((candidate) => candidate.beats <= remaining + EPSILON) ??
      DURATION_CANDIDATES[DURATION_CANDIDATES.length - 1];
    result.push(token);
    remaining = roundBeat(remaining - token.beats);
  }

  return result;
}

function clefForNote(note: SongNote): NotationClef {
  if (note.hand === "left") return "bass";
  if (note.hand === "right") return "treble";
  return note.midi < 60 ? "bass" : "treble";
}

/** Group a MIDI-like note cloud by measure, staff, and quantized onset. */
export function groupNotesIntoMeasures(
  notes: readonly SongNote[],
  bpm: number,
  signature: TimeSignature,
  subdivisions = 4,
): NotationMeasure[] {
  const secondsPerQuarter = getSecondsPerQuarter(bpm);
  const beatsPerMeasure = getMeasureBeats(signature);
  const step = 1 / Math.max(1, Math.round(subdivisions));
  const measures = new Map<number, NotationMeasure>();

  const playableNotes = notes
    .filter(
      (note) =>
        Number.isFinite(note.midi) &&
        note.midi >= 0 &&
        note.midi <= 127 &&
        Number.isFinite(note.time) &&
        Number.isFinite(note.duration) &&
        note.duration > 0,
    )
    .sort((a, b) => a.time - b.time || a.midi - b.midi || a.id.localeCompare(b.id));

  for (const note of playableNotes) {
    let globalBeat = quantizeBeat(Math.max(0, note.time) / secondsPerQuarter, subdivisions);
    let measureIndex = Math.floor((globalBeat + EPSILON) / beatsPerMeasure);
    let localBeat = roundBeat(globalBeat - measureIndex * beatsPerMeasure);

    // Floating-point rounding can place a boundary onset at the end of a bar.
    if (localBeat >= beatsPerMeasure - EPSILON) {
      measureIndex += 1;
      globalBeat = measureIndex * beatsPerMeasure;
      localBeat = 0;
    }

    const quantizedDuration = Math.max(
      step,
      quantizeBeat(note.duration / secondsPerQuarter, subdivisions),
    );
    const durationBeats = roundBeat(
      Math.min(quantizedDuration, beatsPerMeasure - localBeat),
    );
    if (durationBeats <= EPSILON) continue;

    const measure =
      measures.get(measureIndex) ??
      ({ index: measureIndex, treble: [], bass: [] } satisfies NotationMeasure);
    measures.set(measureIndex, measure);

    const clef = clefForNote(note);
    const staff = measure[clef];
    const chord = staff.find((candidate) => Math.abs(candidate.beat - localBeat) < EPSILON);
    if (chord) {
      chord.notes.push(note);
      chord.notes.sort((a, b) => a.midi - b.midi || a.id.localeCompare(b.id));
      chord.durationBeats = Math.max(chord.durationBeats, durationBeats);
    } else {
      staff.push({ beat: localBeat, durationBeats, notes: [note] });
      staff.sort((a, b) => a.beat - b.beat);
    }
  }

  return [...measures.values()].sort((a, b) => a.index - b.index);
}

/**
 * Create one complete, non-overlapping VexFlow voice for a measure.
 * Sustains crossing a later onset are shortened to that onset; this is the
 * safest readable reduction for arbitrary imported polyphonic MIDI.
 */
export function buildMeasureRhythm(
  chords: readonly QuantizedChord[],
  beatsPerMeasure: number,
): RhythmEvent[] {
  const measureLength = Math.max(0.25, quantizeBeat(beatsPerMeasure));
  const sorted = [...chords]
    .filter((chord) => Number.isFinite(chord.beat) && chord.notes.length > 0)
    .sort((a, b) => a.beat - b.beat);
  const result: RhythmEvent[] = [];
  let cursor = 0;

  const addRests = (from: number, duration: number) => {
    let restBeat = from;
    for (const token of splitDuration(duration)) {
      result.push({ type: "rest", beat: roundBeat(restBeat), token });
      restBeat = roundBeat(restBeat + token.beats);
    }
  };

  for (let index = 0; index < sorted.length; index += 1) {
    const chord = sorted[index];
    const start = Math.max(cursor, quantizeBeat(chord.beat));
    if (start >= measureLength - EPSILON) break;
    if (start > cursor + EPSILON) addRests(cursor, start - cursor);

    const nextStart = sorted[index + 1]
      ? Math.max(start + 0.25, quantizeBeat(sorted[index + 1].beat))
      : measureLength;
    const available = Math.max(
      0.25,
      Math.min(measureLength, nextStart) - start,
    );
    const requested = Math.min(
      Math.max(0.25, quantizeBeat(chord.durationBeats)),
      available,
    );
    const token =
      DURATION_CANDIDATES.find((candidate) => candidate.beats <= requested + EPSILON) ??
      DURATION_CANDIDATES[DURATION_CANDIDATES.length - 1];

    result.push({ type: "chord", beat: roundBeat(start), token, chord });
    cursor = roundBeat(start + token.beats);
  }

  if (cursor < measureLength - EPSILON) addRests(cursor, measureLength - cursor);
  return result;
}

/** A deliberately small chord-name detector for clear triads in learning scores. */
export function getChordSymbol(midis: readonly number[]): string | null {
  const pitchClasses = [...new Set(midis.map((midi) => ((Math.round(midi) % 12) + 12) % 12))];
  if (pitchClasses.length < 3) return null;

  const qualities: readonly [intervals: readonly number[], suffix: string][] = [
    [[0, 4, 7], ""],
    [[0, 3, 7], "m"],
    [[0, 3, 6], "dim"],
    [[0, 4, 8], "aug"],
    [[0, 5, 7], "sus4"],
  ];

  for (const root of pitchClasses) {
    const intervals = pitchClasses
      .map((pitchClass) => (pitchClass - root + 12) % 12)
      .sort((a, b) => a - b);
    for (const [pattern, suffix] of qualities) {
      if (
        pattern.length === intervals.length &&
        pattern.every((interval, index) => interval === intervals[index])
      ) {
        return `${DISPLAY_SHARP_NAMES[root]}${suffix}`;
      }
    }
  }

  return null;
}
