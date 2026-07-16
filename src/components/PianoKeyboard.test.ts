import { describe, expect, it } from "vitest";

import {
  getMidiNoteName,
  getMidiRange,
  getPianoKeyGeometry,
  isBlackMidi,
} from "./PianoKeyboard";

describe("piano MIDI ranges and note names", () => {
  it("uses the complete 88-key piano range and normalizes custom endpoints", () => {
    expect(getMidiRange()).toEqual([21, 108]);
    expect(getMidiRange(108, 21)).toEqual([21, 108]);
    expect(getMidiRange(18.6, 140)).toEqual([19, 127]);
    expect(getMidiRange(-20, 128)).toEqual([0, 127]);
    expect(getMidiRange(Number.NaN, Number.POSITIVE_INFINITY)).toEqual([0, 0]);
  });

  it("names MIDI pitches with scientific pitch notation", () => {
    expect([
      getMidiNoteName(0),
      getMidiNoteName(21),
      getMidiNoteName(60),
      getMidiNoteName(61),
      getMidiNoteName(69),
      getMidiNoteName(108),
      getMidiNoteName(127),
    ]).toEqual(["C-1", "A0", "C4", "C♯4", "A4", "C8", "G9"]);
  });

  it("identifies the five black-key pitch classes in every octave", () => {
    expect(Array.from({ length: 12 }, (_, midi) => isBlackMidi(midi))).toEqual([
      false,
      true,
      false,
      true,
      false,
      false,
      true,
      false,
      true,
      false,
      true,
      false,
    ]);
    expect(isBlackMidi(-2)).toBe(true);
    expect(isBlackMidi(121)).toBe(true);
  });
});

describe("piano key geometry", () => {
  it("lays out the exact default 88-key keyboard from A0 through C8", () => {
    const geometry = getPianoKeyGeometry();
    const whiteKeys = geometry.filter((key) => !key.isBlack);
    const blackKeys = geometry.filter((key) => key.isBlack);
    const whiteWidth = 100 / 52;

    expect(geometry).toHaveLength(88);
    expect(geometry.map((key) => key.midi)).toEqual(
      Array.from({ length: 88 }, (_, index) => index + 21),
    );
    expect(whiteKeys).toHaveLength(52);
    expect(blackKeys).toHaveLength(36);
    expect(geometry[0]).toEqual({
      midi: 21,
      isBlack: false,
      left: 0,
      width: whiteWidth,
    });
    expect(geometry.at(-1)).toEqual({
      midi: 108,
      isBlack: false,
      left: 51 * whiteWidth,
      width: whiteWidth,
    });
    expect(geometry.find((key) => key.midi === 22)).toEqual({
      midi: 22,
      isBlack: true,
      left: whiteWidth - (whiteWidth * 0.62) / 2,
      width: whiteWidth * 0.62,
    });
  });

  it("aligns one C-to-B octave to seven equal white columns", () => {
    const geometry = getPianoKeyGeometry(60, 71);
    const expected = [
      [60, false, 0],
      [61, true, 9.8571428571],
      [62, false, 14.2857142857],
      [63, true, 24.1428571429],
      [64, false, 28.5714285714],
      [65, false, 42.8571428571],
      [66, true, 52.7142857143],
      [67, false, 57.1428571429],
      [68, true, 67],
      [69, false, 71.4285714286],
      [70, true, 81.2857142857],
      [71, false, 85.7142857143],
    ] as const;

    expect(geometry).toHaveLength(expected.length);
    geometry.forEach((key, index) => {
      const [midi, isBlack, left] = expected[index];
      expect(key.midi).toBe(midi);
      expect(key.isBlack).toBe(isBlack);
      expect(key.left).toBeCloseTo(left, 9);
      expect(key.width).toBeCloseTo(isBlack ? (100 / 7) * 0.62 : 100 / 7, 12);
    });
  });

  it("normalizes reversed ranges and renders a black-note-only range", () => {
    expect(getPianoKeyGeometry(62, 60).map((key) => key.midi)).toEqual([60, 61, 62]);
    expect(getPianoKeyGeometry(61, 61)).toEqual([
      { midi: 61, isBlack: true, left: 0, width: 100 },
    ]);
  });
});
