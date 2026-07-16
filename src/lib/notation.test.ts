import { describe, expect, it } from "vitest";

import type { SongNote } from "../types";
import {
  buildMeasureRhythm,
  getChordSymbol,
  getMeasureBeats,
  getMeasureCount,
  getMeasureDuration,
  getMeasureIndex,
  getNotationPage,
  getMeasureStartTime,
  groupNotesIntoMeasures,
  midiToNoteName,
  midiToVexKey,
  parseTimeSignature,
  quantizeBeat,
  quantizeDuration,
  splitDuration,
  toVexKeySignature,
} from "./notation";

const note = (
  id: string,
  midi: number,
  time: number,
  duration: number,
  hand: SongNote["hand"] = "right",
): SongNote => ({ id, midi, time, duration, velocity: 84, hand });

describe("notation helpers", () => {
  it("parses simple, common, and malformed time signatures safely", () => {
    expect(parseTimeSignature("3/4")).toEqual({ beats: 3, beatValue: 4 });
    expect(parseTimeSignature(" 6 / 8 ")).toEqual({ beats: 6, beatValue: 8 });
    expect(parseTimeSignature("C")).toEqual({ beats: 4, beatValue: 4 });
    expect(parseTimeSignature("¢")).toEqual({ beats: 2, beatValue: 2 });
    expect(parseTimeSignature("7/3")).toEqual({ beats: 4, beatValue: 4 });
    expect(parseTimeSignature("not-a-meter")).toEqual({ beats: 4, beatValue: 4 });
  });

  it("converts MIDI pitches to VexFlow keys and readable note names", () => {
    expect(midiToVexKey(60)).toBe("c/4");
    expect(midiToVexKey(61)).toBe("c#/4");
    expect(midiToVexKey(61, true)).toBe("db/4");
    expect(midiToVexKey(21)).toBe("a/0");
    expect(midiToNoteName(70, true)).toBe("B♭4");
  });

  it("normalizes friendly key signatures", () => {
    expect(toVexKeySignature("G major")).toBe("G");
    expect(toVexKeySignature("A minor")).toBe("Am");
    expect(toVexKeySignature("Unknown")).toBe("C");
  });

  it("calculates bar timing in simple and compound meters", () => {
    const fourFour = parseTimeSignature("4/4");
    const sixEight = parseTimeSignature("6/8");

    expect(getMeasureBeats(sixEight)).toBe(3);
    expect(getMeasureDuration(120, fourFour)).toBe(2);
    expect(getMeasureDuration(120, sixEight)).toBe(1.5);
    expect(getMeasureIndex(1.999, 120, fourFour)).toBe(0);
    expect(getMeasureIndex(2, 120, fourFour)).toBe(1);
    expect(getMeasureStartTime(3, 120, fourFour)).toBe(6);
    expect(getMeasureCount(8, 120, fourFour)).toBe(4);
  });

  it("keeps bars on a stable score page until the page is exhausted", () => {
    expect(getNotationPage(0, 7, 3)).toEqual({
      startIndex: 0,
      indices: [0, 1, 2],
      currentSlot: 0,
    });
    expect(getNotationPage(2, 7, 3)).toEqual({
      startIndex: 0,
      indices: [0, 1, 2],
      currentSlot: 2,
    });
    expect(getNotationPage(3, 7, 3)).toEqual({
      startIndex: 3,
      indices: [3, 4, 5],
      currentSlot: 0,
    });
    expect(getNotationPage(6, 7, 3)).toEqual({
      startIndex: 6,
      indices: [6],
      currentSlot: 0,
    });
  });

  it("quantizes positions and maps common dotted durations", () => {
    expect(quantizeBeat(0.13)).toBe(0.25);
    expect(quantizeBeat(0.11)).toBe(0);
    expect(quantizeDuration(1.48)).toEqual({ duration: "q", dots: 1, beats: 1.5 });
    expect(quantizeDuration(0.51)).toEqual({ duration: "8", dots: 0, beats: 0.5 });
    expect(splitDuration(5.25).map((token) => token.beats)).toEqual([4, 1, 0.25]);
  });

  it("groups simultaneous imported notes into staff chords", () => {
    const measures = groupNotesIntoMeasures(
      [
        note("c", 60, 0, 0.48),
        note("e", 64, 0.01, 0.48),
        note("g", 67, 0.02, 0.48),
        note("bass", 48, 2, 1, "left"),
      ],
      120,
      parseTimeSignature("4/4"),
    );

    expect(measures).toHaveLength(2);
    expect(measures[0].treble).toHaveLength(1);
    expect(measures[0].treble[0].notes.map((item) => item.midi)).toEqual([60, 64, 67]);
    expect(measures[1].bass[0]).toMatchObject({ beat: 0, durationBeats: 2 });
  });

  it("builds complete voices with rests and clips overlaps at the next onset", () => {
    const source = [note("first", 60, 0.5, 2), note("next", 62, 1, 0.5)];
    const grouped = groupNotesIntoMeasures(source, 60, parseTimeSignature("4/4"));
    const rhythm = buildMeasureRhythm(grouped[0].treble, 4);
    const totalBeats = rhythm.reduce((total, event) => total + event.token.beats, 0);

    expect(rhythm.map((event) => event.type)).toEqual([
      "rest",
      "chord",
      "chord",
      "rest",
      "rest",
    ]);
    expect(rhythm[1].token.beats).toBe(0.5);
    expect(totalBeats).toBe(4);
  });

  it("recognizes common triads in root position or inversion", () => {
    expect(getChordSymbol([60, 64, 67])).toBe("C");
    expect(getChordSymbol([64, 67, 72])).toBe("C");
    expect(getChordSymbol([57, 60, 64])).toBe("Am");
    expect(getChordSymbol([60, 67])).toBeNull();
  });

  it("ignores malformed imported notes instead of throwing", () => {
    const malformed = [
      note("nan", Number.NaN, 0, 1),
      note("late", 60, Number.POSITIVE_INFINITY, 1),
      note("zero", 60, 0, 0),
    ];
    expect(groupNotesIntoMeasures(malformed, 0, parseTimeSignature(undefined))).toEqual([]);
    expect(buildMeasureRhythm([], 4)).toEqual([
      { type: "rest", beat: 0, token: { duration: "w", dots: 0, beats: 4 } },
    ]);
  });
});
