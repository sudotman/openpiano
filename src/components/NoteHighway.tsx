import { useMemo, type CSSProperties } from "react";

import type { SongNote } from "../types";
import {
  getMidiNoteName,
  getMidiRange,
  getPianoKeyGeometry,
  type PianoKeyGeometry,
} from "./PianoKeyboard";
import "./practice.css";

export interface NoteHighwayProps {
  notes: SongNote[];
  currentTime: number;
  leadTime?: number;
  startMidi?: number;
  endMidi?: number;
  hitNotes?: Set<string>;
  missedNotes?: Set<string>;
}

interface VisibleNote {
  note: SongNote;
  geometry: PianoKeyGeometry;
  onsetY: number;
  height: number;
  hit: boolean;
  missed: boolean;
  target: boolean;
}

interface BeatGuide {
  index: number;
  y: number;
  isBar: boolean;
  barNumber: number;
}

type NoteStyle = CSSProperties & {
  "--op-note-velocity": number;
  "--op-note-y-offset": number;
};

const PLAY_LINE_Y = 86;
const SPAWN_LINE_Y = 4;
const BEAT_SECONDS = 0.5;
const BEATS_PER_BAR = 4;

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function lowerBound(notes: SongNote[], time: number) {
  let low = 0;
  let high = notes.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (notes[middle].time < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function NoteHighway({
  notes,
  currentTime,
  leadTime = 4,
  startMidi = 21,
  endMidi = 108,
  hitNotes,
  missedNotes,
}: NoteHighwayProps) {
  const now = Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0;
  const horizon = Number.isFinite(leadTime) ? Math.max(0.5, leadTime) : 4;
  const [rangeStart, rangeEnd] = getMidiRange(startMidi, endMidi);
  const geometry = useMemo(
    () => getPianoKeyGeometry(rangeStart, rangeEnd),
    [rangeStart, rangeEnd],
  );
  const geometryByMidi = useMemo(
    () => new Map(geometry.map((key) => [key.midi, key])),
    [geometry],
  );
  const travel = PLAY_LINE_Y - SPAWN_LINE_Y;

  // Imported MIDI files can contain tens of thousands of notes. Sorting once
  // lets each animation frame inspect only the small time window on screen.
  const preparedNotes = useMemo(() => {
    let longestDuration = 0.06;
    const sorted = notes
      .filter((note) => Number.isFinite(note.time) && Number.isFinite(note.duration))
      .slice()
      .sort((a, b) => a.time - b.time);
    for (const note of sorted) longestDuration = Math.max(longestDuration, note.duration);
    return { sorted, longestDuration };
  }, [notes]);

  const visibleNotes = useMemo<VisibleNote[]>(() => {
    const pastRetention = (100 - PLAY_LINE_Y) / travel * horizon + 0.12;
    const firstIndex = lowerBound(
      preparedNotes.sorted,
      now - pastRetention - preparedNotes.longestDuration,
    );
    const lastIndex = lowerBound(preparedNotes.sorted, now + horizon * 1.04 + 0.0001);
    const visible: VisibleNote[] = [];

    for (let index = firstIndex; index < lastIndex; index += 1) {
      const note = preparedNotes.sorted[index];
      const keyGeometry = geometryByMidi.get(note.midi);
      if (!keyGeometry) continue;

      const duration = Math.max(0.06, note.duration);
      const endTime = note.time + duration;
      if (endTime < now - pastRetention) continue;

      const onsetY = PLAY_LINE_Y - ((note.time - now) / horizon) * travel;
      const height = Math.max(1.35, (duration / horizon) * travel);
      const hit = hitNotes?.has(note.id) ?? false;
      const missed = !hit && (missedNotes?.has(note.id) ?? false);
      const timingWindow = Math.min(0.14, horizon * 0.04);
      const target = !missed
        && note.time - now <= timingWindow
        && endTime >= now - timingWindow;

      visible.push({ note, geometry: keyGeometry, onsetY, height, hit, missed, target });
    }

    return visible;
  }, [geometryByMidi, hitNotes, horizon, missedNotes, now, preparedNotes, travel]);

  const beatGuides = useMemo<BeatGuide[]>(() => {
    const belowLineSeconds = ((100 - PLAY_LINE_Y) / travel) * horizon;
    const firstBeat = Math.floor((now - belowLineSeconds) / BEAT_SECONDS);
    const lastBeat = Math.ceil((now + horizon) / BEAT_SECONDS);
    const guides: BeatGuide[] = [];

    for (let index = firstBeat; index <= lastBeat; index += 1) {
      const time = index * BEAT_SECONDS;
      const y = PLAY_LINE_Y - ((time - now) / horizon) * travel;
      if (y < -0.5 || y > 100.5) continue;
      const isBar = positiveModulo(index, BEATS_PER_BAR) === 0;
      guides.push({
        index,
        y,
        isBar,
        barNumber: Math.max(1, Math.floor(index / BEATS_PER_BAR) + 1),
      });
    }

    return guides;
  }, [horizon, now, travel]);

  const activeTargets = useMemo(() => {
    const byMidi = new Map<number, PianoKeyGeometry>();
    for (const item of visibleNotes) {
      if (item.target) byMidi.set(item.note.midi, item.geometry);
    }
    return [...byMidi.entries()];
  }, [visibleNotes]);

  const hitCount = hitNotes?.size ?? 0;
  const missedCount = missedNotes?.size ?? 0;

  return (
    <section
      className="note-highway"
      role="img"
      aria-label={`Falling-note practice view. ${visibleNotes.length} notes visible, ${hitCount} hit, ${missedCount} missed.`}
    >
      <div className="note-highway__stage">
        <div className="note-highway__horizon" aria-hidden="true">
          <span>UPCOMING</span>
          <span>{horizon.toFixed(1)} SEC</span>
        </div>

        <div className="note-highway__lanes" aria-hidden="true">
          {geometry.filter((key) => !key.isBlack).map((key) => (
            <span
              key={`white-${key.midi}`}
              className="note-highway__lane note-highway__lane--white"
              style={{ left: `${key.left}%`, width: `${key.width}%` }}
            />
          ))}
          {geometry.filter((key) => key.isBlack).map((key) => (
            <span
              key={`black-${key.midi}`}
              className="note-highway__lane note-highway__lane--black"
              style={{ left: `${key.left}%`, width: `${key.width}%` }}
            />
          ))}
        </div>

        <div className="note-highway__guides" aria-hidden="true">
          {beatGuides.map((guide) => (
            <span
              key={guide.index}
              className={`note-highway__guide${guide.isBar ? " note-highway__guide--bar" : ""}`}
              style={{ top: `${guide.y}%` }}
            >
              {guide.isBar ? <small>{guide.barNumber}</small> : null}
            </span>
          ))}
        </div>

        <div className="note-highway__notes" aria-hidden="true">
          {visibleNotes.map(({ note, geometry: key, onsetY, height, hit, missed, target }) => {
            const velocity = Math.max(0.45, Math.min(1, note.velocity / 127));
            const noteStyle: NoteStyle = {
              left: `${key.left}%`,
              width: `${key.width}%`,
              bottom: `${100 - PLAY_LINE_Y}%`,
              height: `max(10px, ${height}%)`,
              "--op-note-velocity": velocity,
              "--op-note-y-offset": onsetY - PLAY_LINE_Y,
            };
            const classes = [
              "note-highway__note",
              `note-highway__note--${note.hand}`,
              key.isBlack && "note-highway__note--accidental",
              hit && "is-hit",
              missed && "is-missed",
              target && "is-target",
            ].filter(Boolean).join(" ");

            return (
              <span
                key={note.id}
                className={classes}
                style={noteStyle}
                data-note-id={note.id}
                data-midi={note.midi}
                title={getMidiNoteName(note.midi)}
              >
                <span className="note-highway__note-core" />
                <span className="note-highway__note-head" />
              </span>
            );
          })}
        </div>

        <div className="note-highway__play-line" aria-hidden="true">
          <span>PLAY</span>
        </div>

        <div className="note-highway__targets" aria-hidden="true">
          {activeTargets.map(([midi, key]) => (
            <span
              key={midi}
              className={`note-highway__key-target${key.isBlack ? " note-highway__key-target--accidental" : ""}`}
              style={{ left: `${key.left}%`, width: `${key.width}%` }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export default NoteHighway;
