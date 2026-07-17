import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import {
  formatMidiNote,
  type NoteNamingConvention,
} from "../lib/keyboardConfig";
import "./practice.css";

const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
export interface PianoKeyboardProps {
  activeNotes: Set<number>;
  targetNotes?: Set<number>;
  correctNotes?: Set<number>;
  wrongNotes?: Set<number>;
  startMidi?: number;
  endMidi?: number;
  onNoteOn?: (midi: number) => void;
  onNoteOff?: (midi: number) => void;
  noteNaming?: NoteNamingConvention;
  compact?: boolean;
}

export interface PianoKeyGeometry {
  midi: number;
  isBlack: boolean;
  left: number;
  width: number;
}

type KeyboardStyle = CSSProperties & {
  "--op-white-key-count": number;
};

function clampMidi(value: number) {
  return Math.max(0, Math.min(127, Math.round(Number.isFinite(value) ? value : 0)));
}

export function getMidiRange(startMidi = 21, endMidi = 108): [number, number] {
  const start = clampMidi(startMidi);
  const end = clampMidi(endMidi);
  return start <= end ? [start, end] : [end, start];
}

export function isBlackMidi(midi: number) {
  return BLACK_PITCH_CLASSES.has(((midi % 12) + 12) % 12);
}

export function getMidiNoteName(
  midi: number,
  convention: NoteNamingConvention = "scientific",
) {
  return formatMidiNote(midi, convention);
}

/**
 * Returns piano-key geometry in percentages. White notes occupy equal columns;
 * accidentals are centred on the boundary between their neighbouring whites.
 * NoteHighway uses this same function, so falling notes and keys stay aligned.
 */
export function getPianoKeyGeometry(startMidi = 21, endMidi = 108): PianoKeyGeometry[] {
  const [start, end] = getMidiRange(startMidi, endMidi);
  const midiNotes = Array.from({ length: end - start + 1 }, (_, index) => start + index);
  const whiteNotes = midiNotes.filter((midi) => !isBlackMidi(midi));

  // A one-note accidental range is unusual, but should still render usefully.
  if (whiteNotes.length === 0) {
    return midiNotes.map((midi) => ({ midi, isBlack: true, left: 0, width: 100 }));
  }

  const whiteWidth = 100 / whiteNotes.length;
  const blackWidth = whiteWidth * 0.62;
  const whiteIndex = new Map(whiteNotes.map((midi, index) => [midi, index]));

  return midiNotes.map((midi) => {
    if (!isBlackMidi(midi)) {
      const index = whiteIndex.get(midi) ?? 0;
      return { midi, isBlack: false, left: index * whiteWidth, width: whiteWidth };
    }

    const whitesBefore = whiteNotes.findIndex((whiteMidi) => whiteMidi > midi);
    const boundaryIndex = whitesBefore === -1 ? whiteNotes.length : whitesBefore;
    const unclampedLeft = boundaryIndex * whiteWidth - blackWidth / 2;
    const left = Math.max(0, Math.min(100 - blackWidth, unclampedLeft));

    return { midi, isBlack: true, left, width: blackWidth };
  });
}

export function PianoKeyboard({
  activeNotes,
  targetNotes,
  correctNotes,
  wrongNotes,
  startMidi = 21,
  endMidi = 108,
  onNoteOn,
  onNoteOff,
  noteNaming = "scientific",
  compact = false,
}: PianoKeyboardProps) {
  const [rangeStart, rangeEnd] = getMidiRange(startMidi, endMidi);
  const geometry = useMemo(
    () => getPianoKeyGeometry(rangeStart, rangeEnd),
    [rangeStart, rangeEnd],
  );
  const whiteKeyCount = geometry.reduce((count, key) => count + (key.isBlack ? 0 : 1), 0);

  const pointerNotes = useRef(new Map<number, number>());
  const keyboardNotes = useRef(new Set<number>());
  const noteOffRef = useRef(onNoteOff);
  const [locallyActive, setLocallyActive] = useState<Set<number>>(() => new Set());
  noteOffRef.current = onNoteOff;

  const isLocallyHeld = useCallback((midi: number) => {
    if (keyboardNotes.current.has(midi)) return true;
    for (const heldMidi of pointerNotes.current.values()) {
      if (heldMidi === midi) return true;
    }
    return false;
  }, []);

  const syncLocalState = useCallback(() => {
    const next = new Set(keyboardNotes.current);
    for (const midi of pointerNotes.current.values()) next.add(midi);
    setLocallyActive(next);
  }, []);

  const releasePointer = useCallback(
    (pointerId: number) => {
      const midi = pointerNotes.current.get(pointerId);
      if (midi === undefined) return;

      pointerNotes.current.delete(pointerId);
      syncLocalState();
      if (!isLocallyHeld(midi)) onNoteOff?.(midi);
    },
    [isLocallyHeld, onNoteOff, syncLocalState],
  );

  useEffect(() => {
    const releaseOutsideKey = (event: globalThis.PointerEvent) => {
      releasePointer(event.pointerId);
    };

    // Pointer capture is broadly supported, but the window listeners cover
    // older touch engines and pointers released outside the browser viewport.
    window.addEventListener("pointerup", releaseOutsideKey);
    window.addEventListener("pointercancel", releaseOutsideKey);
    return () => {
      window.removeEventListener("pointerup", releaseOutsideKey);
      window.removeEventListener("pointercancel", releaseOutsideKey);
    };
  }, [releasePointer]);

  useEffect(() => {
    const releaseEverything = () => {
      const heldNotes = new Set([
        ...pointerNotes.current.values(),
        ...keyboardNotes.current.values(),
      ]);
      pointerNotes.current.clear();
      keyboardNotes.current.clear();
      setLocallyActive(new Set());
      heldNotes.forEach((midi) => noteOffRef.current?.(midi));
    };

    window.addEventListener("blur", releaseEverything);
    return () => {
      window.removeEventListener("blur", releaseEverything);
      const heldNotes = new Set([
        ...pointerNotes.current.values(),
        ...keyboardNotes.current.values(),
      ]);
      pointerNotes.current.clear();
      keyboardNotes.current.clear();
      heldNotes.forEach((midi) => noteOffRef.current?.(midi));
    };
  }, []);

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>, midi: number) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();

    const previousMidi = pointerNotes.current.get(event.pointerId);
    if (previousMidi === midi) return;
    if (previousMidi !== undefined) {
      pointerNotes.current.delete(event.pointerId);
      if (!isLocallyHeld(previousMidi)) onNoteOff?.(previousMidi);
    }

    const shouldStart = !isLocallyHeld(midi);
    pointerNotes.current.set(event.pointerId, midi);
    syncLocalState();
    if (shouldStart) onNoteOn?.(midi);

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some touch browsers release capture while focus is changing. The
      // pointer-cancel path still guarantees a corresponding note-off.
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, midi: number) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    if (event.repeat || keyboardNotes.current.has(midi)) return;

    const shouldStart = !isLocallyHeld(midi);
    keyboardNotes.current.add(midi);
    syncLocalState();
    if (shouldStart) onNoteOn?.(midi);
  };

  const releaseKeyboardNote = (midi: number) => {
    if (!keyboardNotes.current.delete(midi)) return;
    syncLocalState();
    if (!isLocallyHeld(midi)) onNoteOff?.(midi);
  };

  const keyboardStyle: KeyboardStyle = {
    "--op-white-key-count": Math.max(whiteKeyCount, 1),
  };

  return (
    <section
      className={`piano-keyboard${compact ? " piano-keyboard--compact" : ""}`}
      style={keyboardStyle}
      aria-label="Interactive piano keyboard"
    >
      <div className="piano-keyboard__rail" aria-hidden="true">
        <span className="piano-keyboard__rail-mark" />
        <span className="piano-keyboard__range">
          {getMidiNoteName(rangeStart, noteNaming)}
          <span className="piano-keyboard__range-line" />
          {getMidiNoteName(rangeEnd, noteNaming)}
        </span>
      </div>

      <div className="piano-keyboard__keybed" role="group" aria-label="Piano keys">
        {geometry.map(({ midi, isBlack, left, width }) => {
          const externalActive = activeNotes.has(midi);
          const pressed = externalActive || locallyActive.has(midi);
          const target = targetNotes?.has(midi) ?? false;
          const correct = correctNotes?.has(midi) ?? false;
          const wrong = !correct && (wrongNotes?.has(midi) ?? false);
          const noteName = getMidiNoteName(midi, noteNaming);
          const isC = midi % 12 === 0;
          const stateDescription = [
            pressed && "pressed",
            target && "target note",
            correct && "correct",
            wrong && "incorrect",
          ].filter(Boolean);
          const classNames = [
            "piano-keyboard__key",
            isBlack ? "piano-keyboard__key--black" : "piano-keyboard__key--white",
            pressed && "is-active",
            target && "is-target",
            correct && "is-correct",
            wrong && "is-wrong",
          ].filter(Boolean).join(" ");

          return (
            <button
              key={midi}
              type="button"
              className={classNames}
              style={{ left: `${left}%`, width: `${width}%` }}
              aria-label={`${noteName}${stateDescription.length ? `, ${stateDescription.join(", ")}` : ""}`}
              aria-pressed={pressed}
              data-midi={midi}
              data-note={noteName}
              onPointerDown={(event) => handlePointerDown(event, midi)}
              onPointerUp={(event) => releasePointer(event.pointerId)}
              onPointerCancel={(event) => releasePointer(event.pointerId)}
              onLostPointerCapture={(event) => releasePointer(event.pointerId)}
              onKeyDown={(event) => handleKeyDown(event, midi)}
              onKeyUp={(event) => {
                if (event.key === " " || event.key === "Enter") {
                  event.preventDefault();
                  releaseKeyboardNote(midi);
                }
              }}
              onBlur={() => releaseKeyboardNote(midi)}
              onContextMenu={(event) => event.preventDefault()}
            >
              {isC && !isBlack ? (
                <span className="piano-keyboard__note-label" aria-hidden="true">
                  C<small>{noteName.slice(1)}</small>
                </span>
              ) : null}
              <span className="piano-keyboard__key-shine" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default PianoKeyboard;
