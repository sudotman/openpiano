import type {
  RenderContext,
  Stave,
  StaveNote,
} from "vexflow/bravura";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

import type { Song, SongNote } from "../types";
import {
  formatMidiNote,
  type NoteNamingConvention,
} from "../lib/keyboardConfig";
import {
  buildMeasureRhythm,
  getChordSymbol,
  getMeasureBeats,
  getMeasureCount,
  getMeasureDuration,
  getMeasureIndex,
  getNotationPage,
  groupNotesIntoMeasures,
  keyPrefersFlats,
  midiToVexKey,
  parseTimeSignature,
  toVexKeySignature,
  type NotationClef,
  type QuantizedChord,
  type RhythmEvent,
  type TimeSignature,
} from "../lib/notation";
import "./SheetMusic.css";

export interface SheetMusicProps {
  song: Song;
  notes?: SongNote[];
  currentTime: number;
  hitNotes?: Set<string>;
  missedNotes?: Set<string>;
  compact?: boolean;
  measuresVisible?: number;
}

export interface SingleNoteStaffProps {
  midi: number;
  clef?: NotationClef;
  label?: string;
  noteNaming?: NoteNamingConvention;
  compact?: boolean;
}

const EMPTY_NOTE_IDS = new Set<string>();
const SVG_INK = "#302b25";
const SVG_STAFF = "#81786c";
const SVG_MUTED = "#9b9286";
const SVG_CURRENT = "#a75d18";
const SVG_HIT = "#27745d";
const SVG_MISSED = "#b34b45";
const NOTE_ID_SEPARATOR = "\u001f";

type VexFlowModule = typeof import("vexflow/bravura");
let vexFlowPromise: Promise<VexFlowModule> | undefined;

/** Keep the sizeable engraving engine out of OpenPiano's initial app bundle. */
function loadVexFlow(): Promise<VexFlowModule> {
  vexFlowPromise ??= import("vexflow/bravura");
  return vexFlowPromise;
}

type NoteStatus = "plain" | "current" | "hit" | "missed";
type PageDirection = "forward" | "back";

interface MeasureGeometry {
  index: number;
  startX: number;
  endX: number;
}

function sameMeasureGeometry(left: readonly MeasureGeometry[], right: readonly MeasureGeometry[]) {
  return left.length === right.length && left.every((item, index) => {
    const candidate = right[index];
    return candidate && item.index === candidate.index &&
      Math.abs(item.startX - candidate.startX) < 0.5 &&
      Math.abs(item.endX - candidate.endX) < 0.5;
  });
}

function useObservedWidth(ref: RefObject<HTMLElement>): number {
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof window === "undefined") return;

    let animationFrame: number | null = null;
    const commit = (candidate: number) => {
      if (!Number.isFinite(candidate) || candidate <= 0) return;
      const next = Math.floor(candidate);
      setWidth((current) => (Math.abs(current - next) > 1 ? next : current));
    };
    const schedule = (candidate: number) => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        commit(candidate);
      });
    };
    const read = () => schedule(element.getBoundingClientRect().width);

    commit(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", read, { passive: true });
      return () => {
        window.removeEventListener("resize", read);
        if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      };
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) schedule(entry.contentRect.width);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    };
  }, [ref]);

  return width;
}

function isPlayableNote(note: SongNote): boolean {
  return (
    Number.isFinite(note.midi) &&
    note.midi >= 0 &&
    note.midi <= 127 &&
    Number.isFinite(note.time) &&
    Number.isFinite(note.duration) &&
    note.duration > 0
  );
}

function getPitchGroups(chord: QuantizedChord): SongNote[][] {
  const groups = new Map<number, SongNote[]>();
  for (const note of chord.notes) {
    const midi = Math.round(note.midi);
    const group = groups.get(midi) ?? [];
    group.push(note);
    groups.set(midi, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, notes]) => notes);
}

function getPitchStatus(
  notes: readonly SongNote[],
  activeIds: ReadonlySet<string>,
  hitNotes: ReadonlySet<string>,
  missedNotes: ReadonlySet<string>,
): NoteStatus {
  if (notes.some((note) => missedNotes.has(note.id))) return "missed";
  if (notes.some((note) => activeIds.has(note.id))) return "current";
  if (notes.some((note) => hitNotes.has(note.id))) return "hit";
  return "plain";
}

function colorForStatus(status: NoteStatus): string {
  if (status === "current") return SVG_CURRENT;
  if (status === "hit") return SVG_HIT;
  if (status === "missed") return SVG_MISSED;
  return SVG_INK;
}

function makeVexNote(
  vex: VexFlowModule,
  event: RhythmEvent,
  clef: NotationClef,
  preferFlats: boolean,
  activeIds: ReadonlySet<string>,
  hitNotes: ReadonlySet<string>,
  missedNotes: ReadonlySet<string>,
): StaveNote {
  if (event.type === "rest") {
    const rest = new vex.StaveNote({
      keys: [clef === "treble" ? "b/4" : "d/3"],
      duration: event.token.duration,
      dots: event.token.dots,
      type: "r",
      clef,
    });
    rest.setStyle({ fillStyle: SVG_MUTED, strokeStyle: SVG_MUTED });
    if (event.token.dots) vex.Dot.buildAndAttach([rest], { all: true });
    return rest;
  }

  const pitchGroups = getPitchGroups(event.chord);
  const keys = pitchGroups.map((notes) => midiToVexKey(notes[0].midi, preferFlats));
  const statuses = pitchGroups.map((notes) =>
    getPitchStatus(notes, activeIds, hitNotes, missedNotes),
  );
  const aggregateStatus: NoteStatus = statuses.includes("missed")
    ? "missed"
    : statuses.includes("current")
      ? "current"
      : statuses.every((status) => status === "hit")
        ? "hit"
        : "plain";
  const aggregateColor = colorForStatus(aggregateStatus);
  const vexNote = new vex.StaveNote({
    keys,
    duration: event.token.duration,
    dots: event.token.dots,
    clef,
    autoStem: true,
  });

  vexNote.setStyle({ fillStyle: SVG_INK, strokeStyle: SVG_INK });
  vexNote.setStemStyle({ strokeStyle: aggregateColor });
  vexNote.setLedgerLineStyle({ fillStyle: SVG_STAFF, strokeStyle: SVG_STAFF });
  vexNote.setFlagStyle({ fillStyle: aggregateColor, strokeStyle: aggregateColor });
  statuses.forEach((status, index) => {
    const color = colorForStatus(status);
    vexNote.setKeyStyle(index, { fillStyle: color, strokeStyle: color });
  });
  if (event.token.dots) vex.Dot.buildAndAttach([vexNote], { all: true });

  vexNote.addClass(`op-sheet-note--${aggregateStatus}`);
  vexNote.setAttribute(
    "data-note-ids",
    event.chord.notes.map((note) => note.id).join(" "),
  );

  const chordSymbol = getChordSymbol(pitchGroups.map((notes) => notes[0].midi));
  if (chordSymbol) {
    const annotation = new vex.Annotation(chordSymbol)
      .setVerticalJustification(vex.Annotation.VerticalJustify.TOP)
      .setJustification(vex.Annotation.HorizontalJustify.CENTER);
    annotation.setFont("Avenir Next, Inter, sans-serif", 8, "600");
    annotation.setStyle({ fillStyle: "#746a5e", strokeStyle: "#746a5e" });
    vexNote.addModifier(annotation);
  }

  return vexNote;
}

function drawVoice(
  vex: VexFlowModule,
  context: RenderContext,
  stave: Stave,
  chords: readonly QuantizedChord[],
  clef: NotationClef,
  signature: TimeSignature,
  keySignature: string,
  preferFlats: boolean,
  activeIds: ReadonlySet<string>,
  hitNotes: ReadonlySet<string>,
  missedNotes: ReadonlySet<string>,
) {
  const rhythm = buildMeasureRhythm(chords, getMeasureBeats(signature));
  const staveNotes = rhythm.map((event) =>
    makeVexNote(
      vex,
      event,
      clef,
      preferFlats,
      activeIds,
      hitNotes,
      missedNotes,
    ),
  );
  const voice = new vex.Voice({
    numBeats: signature.beats,
    beatValue: signature.beatValue,
  });
  voice.setMode(vex.Voice.Mode.SOFT).addTickables(staveNotes);
  vex.Accidental.applyAccidentals([voice], keySignature);

  const formatter = new vex.Formatter({ globalSoftmax: false });
  formatter.joinVoices([voice]).formatToStave([voice], stave, {
    alignRests: true,
    context,
  });
  voice.draw(context, stave);

  const beams = vex.Beam.generateBeams(staveNotes, {
    beamRests: false,
    maintainStemDirections: true,
  });
  beams.forEach((beam) => {
    beam
      .setStyle({ fillStyle: SVG_INK, strokeStyle: SVG_INK })
      .setContext(context)
      .drawWithStyle();
  });
}

function drawMeasureNumber(
  context: RenderContext,
  number: number,
  x: number,
  current: boolean,
) {
  context.save();
  context.setFont("Avenir Next, Inter, sans-serif", 8, "600");
  context.setFillStyle(current ? SVG_CURRENT : "#9a9185");
  context.fillText(String(number), x, 17);
  context.restore();
}

function drawGrandStaff(
  vex: VexFlowModule,
  host: HTMLDivElement,
  width: number,
  compact: boolean,
  measureIndices: readonly number[],
  cellCount: number,
  currentMeasure: number,
  measureMap: ReadonlyMap<number, { treble: QuantizedChord[]; bass: QuantizedChord[] }>,
  signature: TimeSignature,
  keySignature: string,
  preferFlats: boolean,
  activeIds: ReadonlySet<string>,
  hitNotes: ReadonlySet<string>,
  missedNotes: ReadonlySet<string>,
): MeasureGeometry[] {
  const height = compact ? 202 : 238;
  const trebleY = compact ? 26 : 35;
  const bassY = compact ? 106 : 125;
  const sideMargin = compact ? 12 : 16;
  const usableWidth = Math.max(240, width - sideMargin * 2);
  const measureWidth = usableWidth / Math.max(1, cellCount);
  const geometry: MeasureGeometry[] = [];

  host.replaceChildren();
  const renderer = new vex.Renderer(host, vex.Renderer.Backends.SVG);
  renderer.resize(width, height);
  const context = renderer.getContext();
  context.setFillStyle(SVG_INK).setStrokeStyle(SVG_STAFF).setLineWidth(0.8);

  measureIndices.forEach((measureIndex, visibleIndex) => {
    const x = sideMargin + visibleIndex * measureWidth;
    const isCurrent = measureIndex === currentMeasure;
    if (isCurrent) {
      context.save();
      context.setFillStyle("rgba(167, 93, 24, 0.055)");
      context.fillRect(x, 8, measureWidth, height - 17);
      context.restore();
    }
    drawMeasureNumber(context, measureIndex + 1, x + 5, isCurrent);

    const staveOptions = {
      leftBar: false,
      rightBar: false,
      spacingBetweenLinesPx: compact ? 9 : 10,
      spaceAboveStaffLn: compact ? 2 : 3,
      spaceBelowStaffLn: compact ? 3 : 4,
    };
    const treble = new vex.Stave(x, trebleY, measureWidth, staveOptions);
    const bass = new vex.Stave(x, bassY, measureWidth, staveOptions);
    if (visibleIndex === 0) {
      treble.addClef("treble").addKeySignature(keySignature).addTimeSignature(
        `${signature.beats}/${signature.beatValue}`,
      );
      bass.addClef("bass").addKeySignature(keySignature).addTimeSignature(
        `${signature.beats}/${signature.beatValue}`,
      );
    }

    [treble, bass].forEach((stave) => {
      stave.setStyle({
        fillStyle: SVG_INK,
        strokeStyle: SVG_STAFF,
        lineWidth: 0.8,
      });
      stave.setDefaultLedgerLineStyle({
        fillStyle: SVG_STAFF,
        strokeStyle: SVG_STAFF,
        lineWidth: 0.8,
      });
      stave.setContext(context).drawWithStyle();
    });

    const measure = measureMap.get(measureIndex) ?? { treble: [], bass: [] };
    drawVoice(
      vex,
      context,
      treble,
      measure.treble,
      "treble",
      signature,
      keySignature,
      preferFlats,
      activeIds,
      hitNotes,
      missedNotes,
    );
    drawVoice(
      vex,
      context,
      bass,
      measure.bass,
      "bass",
      signature,
      keySignature,
      preferFlats,
      activeIds,
      hitNotes,
      missedNotes,
    );

    const rightConnector = new vex.StaveConnector(treble, bass)
      .setType("singleRight")
      .setStyle({ fillStyle: SVG_STAFF, strokeStyle: SVG_STAFF, lineWidth: 0.8 });
    rightConnector.setContext(context).drawWithStyle();

    if (visibleIndex === 0) {
      const brace = new vex.StaveConnector(treble, bass)
        .setType("brace")
        .setStyle({ fillStyle: SVG_INK, strokeStyle: SVG_INK, lineWidth: 0.8 });
      const leftConnector = new vex.StaveConnector(treble, bass)
        .setType("singleLeft")
        .setStyle({ fillStyle: SVG_STAFF, strokeStyle: SVG_STAFF, lineWidth: 0.8 });
      brace.setContext(context).drawWithStyle();
      leftConnector.setContext(context).drawWithStyle();
    }

    geometry.push({
      index: measureIndex,
      startX: treble.getNoteStartX(),
      endX: Math.max(treble.getNoteStartX() + 8, treble.getNoteEndX() - 8),
    });
  });

  const svg = host.querySelector("svg");
  svg?.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg?.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg?.setAttribute("aria-hidden", "true");
  return geometry;
}

function formatBarRange(indices: readonly number[], total: number): string {
  if (!indices.length) return "Bar 1";
  const first = indices[0] + 1;
  const last = indices[indices.length - 1] + 1;
  return first === last ? `Bar ${first} of ${total}` : `Bars ${first}–${last} of ${total}`;
}

export function SheetMusic({
  song,
  notes,
  currentTime,
  hitNotes = EMPTY_NOTE_IDS,
  missedNotes = EMPTY_NOTE_IDS,
  compact = false,
  measuresVisible,
}: SheetMusicProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const outgoingHostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const lastDrawnPageRef = useRef<number | null>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const width = useObservedWidth(hostRef);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [measureGeometry, setMeasureGeometry] = useState<MeasureGeometry[]>([]);
  const sourceNotes = notes ?? song.notes;
  const playableNotes = useMemo(
    () => sourceNotes.filter(isPlayableNote),
    [sourceNotes],
  );
  const signature = useMemo(
    () => parseTimeSignature(song.signature),
    [song.signature],
  );
  const groupedMeasures = useMemo(
    () => groupNotesIntoMeasures(playableNotes, song.bpm, signature),
    [playableNotes, signature, song.bpm],
  );
  const measureMap = useMemo(
    () =>
      new Map(
        groupedMeasures.map((measure) => [
          measure.index,
          { treble: measure.treble, bass: measure.bass },
        ]),
      ),
    [groupedMeasures],
  );
  const totalMeasures = useMemo(() => {
    if (groupedMeasures.length) {
      return groupedMeasures[groupedMeasures.length - 1].index + 1;
    }
    return getMeasureCount(song.duration, song.bpm, signature);
  }, [groupedMeasures, signature, song.bpm, song.duration]);
  const unclampedMeasure = getMeasureIndex(currentTime, song.bpm, signature);
  const currentMeasure = Math.min(Math.max(0, unclampedMeasure), totalMeasures - 1);

  const responsiveLimit = width < 470 ? 1 : width < 770 ? 2 : width < 1060 ? 3 : 4;
  const requestedMeasures = Math.min(
    6,
    Math.max(1, Math.round(measuresVisible ?? (compact ? 2 : 3))),
  );
  const visibleCount = Math.min(requestedMeasures, responsiveLimit);
  const notationPage = useMemo(
    () => getNotationPage(currentMeasure, totalMeasures, visibleCount),
    [currentMeasure, totalMeasures, visibleCount],
  );
  const { startIndex: pageStart, indices: measureIndices, currentSlot } = notationPage;

  const activeKey = useMemo(
    () =>
      playableNotes
        .filter((note) => {
          if (hitNotes.has(note.id) || missedNotes.has(note.id)) return false;
          const release = note.time + Math.max(0.14, note.duration);
          return currentTime >= note.time - 0.055 && currentTime <= release;
        })
        .map((note) => note.id)
        .sort()
        .join(NOTE_ID_SEPARATOR),
    [currentTime, hitNotes, missedNotes, playableNotes],
  );

  useEffect(() => {
    const host = hostRef.current;
    const outgoingHost = outgoingHostRef.current;
    const canvas = canvasRef.current;
    if (!host) return;
    if (!width || !playableNotes.length || !measureIndices.length) {
      host.replaceChildren();
      outgoingHost?.replaceChildren();
      lastDrawnPageRef.current = null;
      setMeasureGeometry([]);
      return;
    }
    let cancelled = false;
    const previousPage = lastDrawnPageRef.current;
    const pageDirection: PageDirection | null = previousPage === null || previousPage === pageStart
      ? null
      : pageStart > previousPage ? "forward" : "back";
    const outgoingSnapshot = pageDirection && host.firstElementChild
      ? host.firstElementChild.cloneNode(true)
      : null;

    void loadVexFlow()
      .then((vex) => {
        if (cancelled || hostRef.current !== host) return;
        const activeIds = new Set(
          activeKey ? activeKey.split(NOTE_ID_SEPARATOR) : [],
        );
        const nextGeometry = drawGrandStaff(
          vex,
          host,
          width,
          compact,
          measureIndices,
          visibleCount,
          currentMeasure,
          measureMap,
          signature,
          toVexKeySignature(song.key),
          keyPrefersFlats(song.key),
          activeIds,
          hitNotes,
          missedNotes,
        );
        setMeasureGeometry((current) => sameMeasureGeometry(current, nextGeometry) ? current : nextGeometry);
        lastDrawnPageRef.current = pageStart;

        if (pageDirection && outgoingSnapshot && outgoingHost && canvas) {
          outgoingHost.replaceChildren(outgoingSnapshot);
          const transitionClass = pageDirection === "forward"
            ? "is-page-turning-forward"
            : "is-page-turning-back";
          canvas.classList.remove("is-page-turning-forward", "is-page-turning-back");
          void canvas.offsetWidth;
          canvas.classList.add(transitionClass);
          if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
          transitionTimerRef.current = window.setTimeout(() => {
            canvas.classList.remove(transitionClass);
            outgoingHost.replaceChildren();
            transitionTimerRef.current = null;
          }, 420);
        }
        if (!cancelled) setRenderError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        host.replaceChildren();
        setRenderError(
          error instanceof Error ? error.message : "This score could not be engraved.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeKey,
    compact,
    currentMeasure,
    hitNotes,
    measureIndices,
    measureMap,
    missedNotes,
    pageStart,
    playableNotes.length,
    signature,
    song.key,
    visibleCount,
    width,
  ]);

  useEffect(() => () => {
    if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
  }, []);

  const measureDuration = getMeasureDuration(song.bpm, signature);
  const measureProgress = Math.min(
    1,
    Math.max(0, (currentTime - currentMeasure * measureDuration) / measureDuration),
  );
  const sideMargin = compact ? 12 : 16;
  const cellWidth = width
    ? (Math.max(240, width - sideMargin * 2) / Math.max(1, visibleCount))
    : 0;
  const fallbackModifierWidth = currentSlot === 0
    ? Math.min(cellWidth * 0.42, compact ? 78 : 90)
    : Math.min(16, cellWidth * 0.12);
  const currentGeometry = measureGeometry.find((item) => item.index === currentMeasure);
  const measureStartX = currentGeometry?.startX ??
    sideMargin + currentSlot * cellWidth + fallbackModifierWidth;
  const measureEndX = currentGeometry?.endX ??
    sideMargin + (currentSlot + 1) * cellWidth - 8;
  const playheadX = measureStartX +
    measureProgress * Math.max(8, measureEndX - measureStartX);
  const paperStyle = {
    "--sheet-song-accent": song.accent,
    "--sheet-playhead-x": `${playheadX}px`,
  } as CSSProperties;
  const meterLabel = `${signature.beats}/${signature.beatValue}`;
  const hasNotation = playableNotes.length > 0;

  return (
    <section
      className={`sheet-music${compact ? " sheet-music--compact" : ""}`}
      aria-label={`Sheet music for ${song.title}`}
      style={paperStyle}
    >
      <header className="sheet-music__header">
        <div className="sheet-music__identity">
          <span>Standard notation</span>
          <strong>{song.title}</strong>
          {!compact && <small>{song.composer}</small>}
        </div>
        <dl className="sheet-music__meta" aria-label="Score details">
          <div>
            <dt>Key</dt>
            <dd>{song.key}</dd>
          </div>
          <div>
            <dt>Meter</dt>
            <dd>{meterLabel}</dd>
          </div>
          <div>
            <dt>Tempo</dt>
            <dd>{Math.round(song.bpm)} bpm</dd>
          </div>
          <div className="sheet-music__bar-range">
            <dt>View</dt>
            <dd>{formatBarRange(measureIndices, totalMeasures)}</dd>
          </div>
        </dl>
      </header>

      <div ref={canvasRef} className="sheet-music__canvas">
        <div className="sheet-music__staff-stack">
          <div ref={outgoingHostRef} className="sheet-music__render sheet-music__render--outgoing" aria-hidden="true" />
          <div ref={hostRef} className="sheet-music__render sheet-music__render--current" />
        </div>
        {width > 0 && hasNotation && !renderError && (
          <i className="sheet-music__playhead" aria-hidden="true" />
        )}
        {!hasNotation && (
          <div className="sheet-music__empty" role="status">
            <i aria-hidden="true" />
            <div>
              <strong>No score data yet</strong>
              <span>Import or choose a song with MIDI notes to see its notation.</span>
            </div>
          </div>
        )}
        {renderError && hasNotation && (
          <div className="sheet-music__empty sheet-music__empty--error" role="status">
            <i aria-hidden="true" />
            <div>
              <strong>Notation preview unavailable</strong>
              <span>The song is still playable in tiles mode.</span>
            </div>
          </div>
        )}
      </div>

      <footer className="sheet-music__legend" aria-label="Note result legend">
        <span><i className="current" />Now</span>
        <span><i className="hit" />Played</span>
        <span><i className="missed" />Missed</span>
        <small>RH treble · LH bass</small>
      </footer>
    </section>
  );
}

function drawSingleNote(
  vex: VexFlowModule,
  host: HTMLDivElement,
  width: number,
  midi: number,
  clef: NotationClef,
  compact: boolean,
) {
  const height = compact ? 112 : 138;
  const renderer = new vex.Renderer(host, vex.Renderer.Backends.SVG);
  renderer.resize(width, height);
  const context = renderer.getContext();
  context.setFillStyle(SVG_INK).setStrokeStyle(SVG_STAFF).setLineWidth(0.8);

  const stave = new vex.Stave(12, compact ? 18 : 28, Math.max(180, width - 24), {
    leftBar: false,
    rightBar: false,
    spacingBetweenLinesPx: compact ? 9 : 10,
  });
  stave.addClef(clef);
  stave.setStyle({ fillStyle: SVG_INK, strokeStyle: SVG_STAFF, lineWidth: 0.8 });
  stave.setContext(context).drawWithStyle();

  const staveNote = new vex.StaveNote({
    keys: [midiToVexKey(midi)],
    duration: "q",
    clef,
    autoStem: true,
  });
  staveNote.setStyle({ fillStyle: SVG_CURRENT, strokeStyle: SVG_CURRENT });
  staveNote.setLedgerLineStyle({ fillStyle: SVG_STAFF, strokeStyle: SVG_STAFF });
  staveNote.addClass("op-sheet-note--current");

  const voice = new vex.Voice({ numBeats: 1, beatValue: 4 });
  voice.addTickable(staveNote);
  vex.Accidental.applyAccidentals([voice], "C");
  new vex.Formatter().joinVoices([voice]).formatToStave([voice], stave, { context });
  voice.draw(context, stave);

  const svg = host.querySelector("svg");
  svg?.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg?.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg?.setAttribute("aria-hidden", "true");
}

export function SingleNoteStaff({
  midi,
  clef,
  label,
  noteNaming = "scientific",
  compact = false,
}: SingleNoteStaffProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const width = useObservedWidth(hostRef);
  const [renderFailed, setRenderFailed] = useState(false);
  const safeMidi = Math.min(
    127,
    Math.max(0, Math.round(Number.isFinite(midi) ? midi : 60)),
  );
  const resolvedClef = clef ?? (safeMidi < 60 ? "bass" : "treble");
  const noteName = formatMidiNote(safeMidi, noteNaming);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.replaceChildren();
    if (!width) return;
    let cancelled = false;
    void loadVexFlow()
      .then((vex) => {
        if (cancelled || hostRef.current !== host) return;
        drawSingleNote(vex, host, width, safeMidi, resolvedClef, compact);
        if (!cancelled) setRenderFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        host.replaceChildren();
        setRenderFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [compact, resolvedClef, safeMidi, width]);

  return (
    <figure
      className={`single-note-staff${compact ? " single-note-staff--compact" : ""}`}
      aria-label={`${label ? `${label}, ` : ""}${noteName} on the ${resolvedClef} staff`}
    >
      <div ref={hostRef} className="single-note-staff__render" />
      {renderFailed && <div className="single-note-staff__fallback">{noteName}</div>}
      <figcaption>
        <strong>{label ?? noteName}</strong>
        {label && <span>{noteName}</span>}
        <small>{resolvedClef} clef</small>
      </figcaption>
    </figure>
  );
}
