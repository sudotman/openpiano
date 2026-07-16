import { Midi } from "@tonejs/midi";

import type { Difficulty, Song, SongNote } from "../types";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_NOTES = 100_000;
const MAX_SONG_SECONDS = 2 * 60 * 60;
const MIN_NOTE_SECONDS = 0.03;
const MAX_NOTE_SECONDS = 60;

export const MIDI_IMPORT_LIMITS = {
  maxFileBytes: MAX_FILE_BYTES,
  maxNotes: MAX_NOTES,
  maxSongSeconds: MAX_SONG_SECONDS,
} as const;

export type MidiImportErrorCode =
  | "empty-file"
  | "file-too-large"
  | "invalid-midi"
  | "no-playable-notes"
  | "too-many-notes"
  | "song-too-long"
  | "read-failed";

export class MidiImportError extends Error {
  readonly code: MidiImportErrorCode;

  constructor(code: MidiImportErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "MidiImportError";
    this.code = code;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export interface MidiImportOptions {
  title?: string;
  composer?: string;
  /** Used as a display name when parsing an ArrayBuffer directly. */
  sourceName?: string;
}

interface FileLike {
  name?: string;
  size?: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface RawNote {
  midi: number;
  time: number;
  duration: number;
  velocity: number;
  trackIndex: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundTime(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function sanitizeText(
  value: unknown,
  fallback: string,
  maxLength: number,
): string {
  if (typeof value !== "string") return fallback;
  const clean = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .trim();
  return clean || fallback;
}

function sourceBaseName(sourceName: string): string {
  return sanitizeText(
    sourceName.replace(/\.(?:mid|midi)$/i, ""),
    "Imported song",
    96,
  );
}

function filenameMetadata(sourceName: string): {
  title: string;
  composer: string | null;
} {
  const base = sourceBaseName(sourceName);
  const pieces = base.split(/\s+(?:-|–|—)\s+/).filter(Boolean);
  if (pieces.length >= 2) {
    return {
      composer: sanitizeText(pieces.shift(), "", 64) || null,
      title: sanitizeText(pieces.join(" – "), base, 96),
    };
  }
  return { title: base, composer: null };
}

function isFileLike(source: File | ArrayBuffer): source is File & FileLike {
  return (
    typeof source === "object" &&
    source !== null &&
    !(source instanceof ArrayBuffer) &&
    "arrayBuffer" in source &&
    typeof (source as FileLike).arrayBuffer === "function"
  );
}

async function readSource(
  source: File | ArrayBuffer,
  sourceName?: string,
): Promise<{ buffer: ArrayBuffer; name: string }> {
  if (source instanceof ArrayBuffer) {
    return {
      buffer: source,
      name: sanitizeText(sourceName, "Imported song.mid", 128),
    };
  }

  if (!isFileLike(source)) {
    throw new MidiImportError(
      "read-failed",
      "Choose a MIDI file (.mid or .midi) and try again.",
    );
  }

  if (typeof source.size === "number" && source.size > MAX_FILE_BYTES) {
    throw new MidiImportError(
      "file-too-large",
      "This MIDI file is larger than 20 MB. Try a smaller arrangement.",
    );
  }

  try {
    return {
      buffer: await source.arrayBuffer(),
      name: sanitizeText(source.name, sourceName ?? "Imported song.mid", 128),
    };
  } catch (error) {
    throw new MidiImportError(
      "read-failed",
      "The MIDI file could not be read. Try choosing it again.",
      error,
    );
  }
}

function validateBuffer(buffer: ArrayBuffer): void {
  if (buffer.byteLength === 0) {
    throw new MidiImportError("empty-file", "This MIDI file is empty.");
  }
  if (buffer.byteLength > MAX_FILE_BYTES) {
    throw new MidiImportError(
      "file-too-large",
      "This MIDI file is larger than 20 MB. Try a smaller arrangement.",
    );
  }
  if (buffer.byteLength < 14) {
    throw new MidiImportError(
      "invalid-midi",
      "This file is too short to be a valid MIDI file.",
    );
  }

  const header = new Uint8Array(buffer, 0, 4);
  const hasMidiHeader =
    header[0] === 0x4d &&
    header[1] === 0x54 &&
    header[2] === 0x68 &&
    header[3] === 0x64;
  if (!hasMidiHeader) {
    throw new MidiImportError(
      "invalid-midi",
      "This does not look like a standard MIDI file. Choose a .mid or .midi file.",
    );
  }
}

function isPianoTrack(track: Midi["tracks"][number]): boolean {
  const family = track.instrument.family.toLowerCase();
  const instrument = track.instrument.name.toLowerCase();
  const trackName = track.name.toLowerCase();
  return (
    family === "piano" ||
    (track.instrument.number >= 0 && track.instrument.number <= 7) ||
    /piano|keyboard|grand|harpsichord|clavi/.test(
      `${instrument} ${trackName}`,
    )
  );
}

function chooseTracks(midi: Midi): Array<{
  track: Midi["tracks"][number];
  index: number;
}> {
  const melodic = midi.tracks
    .map((track, index) => ({ track, index }))
    .filter(
      ({ track }) =>
        track.notes.length > 0 &&
        !track.instrument.percussion &&
        track.channel !== 9,
    );

  const piano = melodic.filter(({ track }) => isPianoTrack(track));
  if (piano.length > 0) return piano;

  // MIDI files without program changes often have no reliable instrument
  // metadata. Keep the richest few pitched tracks so they remain playable as
  // a two-hand keyboard reduction without pulling in a whole orchestra.
  return melodic
    .sort((a, b) => b.track.notes.length - a.track.notes.length)
    .slice(0, 4)
    .sort((a, b) => a.index - b.index);
}

function toMidiVelocity(value: number): number {
  const midiValue = value <= 1 ? value * 127 : value;
  return clamp(Math.round(midiValue), 1, 127);
}

function collectNotes(
  selectedTracks: ReturnType<typeof chooseTracks>,
): RawNote[] {
  const notes: RawNote[] = [];
  for (const { track, index } of selectedTracks) {
    for (const note of track.notes) {
      if (
        !Number.isFinite(note.midi) ||
        !Number.isFinite(note.time) ||
        !Number.isFinite(note.duration) ||
        !Number.isFinite(note.velocity)
      ) {
        continue;
      }

      const midi = Math.round(note.midi);
      if (midi < 0 || midi > 127) continue;

      notes.push({
        midi,
        time: Math.max(0, note.time),
        duration: clamp(note.duration, MIN_NOTE_SECONDS, MAX_NOTE_SECONDS),
        velocity: toMidiVelocity(note.velocity),
        trackIndex: index,
      });

      if (notes.length > MAX_NOTES) {
        throw new MidiImportError(
          "too-many-notes",
          `This arrangement contains more than ${MAX_NOTES.toLocaleString()} notes. Try a simpler MIDI export.`,
        );
      }
    }
  }
  return notes;
}

function normalizeAndDedupe(rawNotes: RawNote[]): RawNote[] {
  let firstStart = Number.POSITIVE_INFINITY;
  for (const note of rawNotes) firstStart = Math.min(firstStart, note.time);
  const unique = new Map<string, RawNote>();

  for (const raw of rawNotes) {
    const note: RawNote = {
      ...raw,
      time: roundTime(Math.max(0, raw.time - firstStart)),
      duration: roundTime(raw.duration),
    };
    const key = `${note.midi}:${note.time.toFixed(4)}:${note.duration.toFixed(4)}`;
    const duplicate = unique.get(key);
    if (!duplicate || note.velocity > duplicate.velocity) unique.set(key, note);
  }

  return Array.from(unique.values()).sort(
    (a, b) =>
      a.time - b.time ||
      a.midi - b.midi ||
      a.trackIndex - b.trackIndex ||
      b.duration - a.duration,
  );
}

function inferDifficulty(notes: RawNote[], duration: number): Difficulty {
  let lowestPitch = 127;
  let highestPitch = 0;
  for (const note of notes) {
    lowestPitch = Math.min(lowestPitch, note.midi);
    highestPitch = Math.max(highestPitch, note.midi);
  }
  const range = highestPitch - lowestPitch;
  const density = notes.length / Math.max(1, duration);
  const starts = new Map<number, number>();
  let largestChord = 1;

  for (const note of notes) {
    const bucket = Math.round(note.time / 0.045);
    const count = (starts.get(bucket) ?? 0) + 1;
    starts.set(bucket, count);
    largestChord = Math.max(largestChord, count);
  }

  if (notes.length <= 100 && density < 1.5 && range <= 28 && largestChord <= 3) {
    return "Beginner";
  }
  if (density < 2.6 && range <= 40 && largestChord <= 4) return "Easy";
  if (density < 5 && range <= 58 && largestChord <= 6) return "Intermediate";
  return "Advanced";
}

function hashBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hash = 0x811c9dc5;
  for (let index = 0; index < bytes.length; index += 1) {
    hash ^= bytes[index];
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

function slugify(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 42) || "song"
  );
}

function headerComposer(midi: Midi): string | null {
  for (const entry of midi.header.meta) {
    const type = entry.type.toLowerCase();
    const text = sanitizeText(entry.text, "", 160);
    const labeled = text.match(/^(?:composer|artist|author)\s*:\s*(.+)$/i);
    if (labeled?.[1]) return sanitizeText(labeled[1], "", 64) || null;
    if (/composer|artist|author/.test(type) && text) {
      return sanitizeText(text, "", 64) || null;
    }
  }
  return null;
}

function makeSong(
  midi: Midi,
  buffer: ArrayBuffer,
  sourceName: string,
  options: MidiImportOptions,
): Song {
  const selectedTracks = chooseTracks(midi);
  if (selectedTracks.length === 0) {
    throw new MidiImportError(
      "no-playable-notes",
      "No playable pitched notes were found. This file may contain only drums or metadata.",
    );
  }

  const collected = collectNotes(selectedTracks);
  if (collected.length === 0) {
    throw new MidiImportError(
      "no-playable-notes",
      "No playable piano notes were found in this MIDI file.",
    );
  }

  const normalized = normalizeAndDedupe(collected);
  let musicalDuration = 0;
  for (const note of normalized) {
    musicalDuration = Math.max(musicalDuration, note.time + note.duration);
  }
  if (!Number.isFinite(musicalDuration) || musicalDuration > MAX_SONG_SECONDS) {
    throw new MidiImportError(
      "song-too-long",
      "This MIDI is longer than two hours. Try importing a shorter arrangement.",
    );
  }

  const fileMetadata = filenameMetadata(sourceName);
  const midiName = sanitizeText(midi.name, "", 96);
  const usefulMidiName = /^(?:untitled|midi|track\s*\d*)$/i.test(midiName)
    ? ""
    : midiName;
  const title = sanitizeText(
    options.title,
    usefulMidiName || fileMetadata.title,
    96,
  );
  const composer = sanitizeText(
    options.composer,
    headerComposer(midi) || fileMetadata.composer || "Unknown composer",
    64,
  );
  const songId = `import-${slugify(title)}-${hashBuffer(buffer)}`;

  const notes: SongNote[] = normalized.map((note, index) => ({
    id: `${songId}-note-${index + 1}`,
    midi: note.midi,
    time: note.time,
    duration: note.duration,
    velocity: note.velocity,
    hand: note.midi < 60 ? "left" : "right",
  }));

  const firstTempo = midi.header.tempos.find(
    (tempo) => Number.isFinite(tempo.bpm) && tempo.bpm > 0,
  );
  const bpm = Math.round(clamp(firstTempo?.bpm ?? 120, 20, 320));
  const firstKey = midi.header.keySignatures[0];
  const key = firstKey
    ? sanitizeText(`${firstKey.key} ${firstKey.scale}`, "Unknown", 24)
    : "Unknown";
  const timeSignature = midi.header.timeSignatures[0]?.timeSignature;
  const numerator = clamp(Math.round(timeSignature?.[0] ?? 4), 1, 32);
  const denominator = clamp(Math.round(timeSignature?.[1] ?? 4), 1, 32);
  const difficulty = inferDifficulty(normalized, musicalDuration);
  const trackLabel = `${selectedTracks.length} playable ${
    selectedTracks.length === 1 ? "track" : "tracks"
  }`;

  return {
    id: songId,
    title,
    composer,
    description: `Imported from ${sanitizeText(sourceName, "a MIDI file", 96)} · ${notes.length.toLocaleString()} notes across ${trackLabel}.`,
    difficulty,
    bpm,
    duration: roundTime(musicalDuration + 0.35),
    key,
    signature: `${numerator}/${denominator}`,
    source: "imported",
    accent: "#d77a55",
    notes,
    tags: ["Imported", "MIDI", difficulty],
  };
}

/** Parse a validated ArrayBuffer synchronously. */
export function parseMidiArrayBuffer(
  buffer: ArrayBuffer,
  options: MidiImportOptions = {},
): Song {
  validateBuffer(buffer);

  let midi: Midi;
  try {
    midi = new Midi(buffer);
  } catch (error) {
    throw new MidiImportError(
      "invalid-midi",
      "The MIDI data is damaged or uses a format this importer cannot read.",
      error,
    );
  }

  const sourceName = sanitizeText(
    options.sourceName,
    "Imported song.mid",
    128,
  );
  return makeSong(midi, buffer, sourceName, options);
}

/** Read a File or ArrayBuffer and convert it into OpenPiano's Song model. */
export async function importMidi(
  source: File | ArrayBuffer,
  options: MidiImportOptions = {},
): Promise<Song> {
  const { buffer, name } = await readSource(source, options.sourceName);
  return parseMidiArrayBuffer(buffer, { ...options, sourceName: name });
}

/** Alias used by file-picker based interfaces. */
export const importMidiFile = importMidi;

export default importMidi;
