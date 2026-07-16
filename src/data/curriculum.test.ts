import { describe, expect, it } from "vitest";

import {
  builtInSongs,
  courseUnits,
  getLesson,
  getSong,
  lessons,
} from "./curriculum";

const EXPECTED_SONG_IDS = [
  "first-light",
  "au-clair",
  "ode-to-joy",
  "lantern-waltz",
  "g-major-flight",
  "prelude-c-opening",
];

const EXPECTED_UNIT_LESSONS = [
  {
    id: "u1-first-notes",
    lessonIds: ["l1-posture-pulse", "l2-middle-c", "l3-five-finger"],
  },
  {
    id: "u2-read-and-connect",
    lessonIds: ["l4-steps-skips", "l5-bass-landmarks", "l6-hands-together"],
  },
  {
    id: "u3-harmony-in-motion",
    lessonIds: ["l7-triad-shapes", "l8-chord-changes", "l9-broken-chords"],
  },
  {
    id: "u4-play-musically",
    lessonIds: ["l10-dynamics", "l11-articulation", "l12-pedal"],
  },
  {
    id: "u5-independent-hands",
    lessonIds: ["l13-eighth-note-grid", "l14-contrary-motion", "l15-independence"],
  },
  {
    id: "u6-fluent-performance",
    lessonIds: ["l16-arpeggio-map", "l17-voicing", "l18-recital"],
  },
];

describe("curriculum graph", () => {
  it("keeps the intended beginner-to-advanced lesson sequence", () => {
    expect(builtInSongs.map((song) => song.id)).toEqual(EXPECTED_SONG_IDS);
    expect(
      courseUnits.map(({ id, lessonIds }) => ({ id, lessonIds })),
    ).toEqual(EXPECTED_UNIT_LESSONS);
    expect(courseUnits.map((unit) => unit.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(lessons.map((lesson) => lesson.order)).toEqual(
      Array.from({ length: 18 }, (_, index) => index + 1),
    );
  });

  it("resolves every unit, prerequisite, and practice-song link", () => {
    const lessonIds = new Set(lessons.map((lesson) => lesson.id));
    const unitIds = new Set(courseUnits.map((unit) => unit.id));
    const listedLessonIds = courseUnits.flatMap((unit) => unit.lessonIds);

    expect(lessonIds.size).toBe(lessons.length);
    expect(new Set(listedLessonIds).size).toBe(lessons.length);
    expect(listedLessonIds).toHaveLength(lessons.length);

    for (const unit of courseUnits) {
      for (const lessonId of unit.lessonIds) {
        expect(getLesson(lessonId)?.unitId).toBe(unit.id);
      }
    }

    for (const lesson of lessons) {
      expect(unitIds.has(lesson.unitId)).toBe(true);
      expect(listedLessonIds).toContain(lesson.id);
      expect(lesson.songId).toBeDefined();
      expect(getSong(lesson.songId!)).toBeDefined();

      for (const prerequisiteId of lesson.prerequisiteIds) {
        expect(lessonIds.has(prerequisiteId)).toBe(true);
        expect(getLesson(prerequisiteId)!.order).toBeLessThan(lesson.order);
      }
    }

    expect(getLesson("missing-lesson")).toBeUndefined();
    expect(getSong("missing-song")).toBeUndefined();
  });
});

describe("built-in song note data", () => {
  it.each(builtInSongs)("contains valid, playable MIDI notes for $id", (song) => {
    const noteIds = new Set<string>();

    expect(song.notes.length).toBeGreaterThan(0);
    expect(Number.isFinite(song.duration)).toBe(true);
    expect(song.duration).toBeGreaterThan(0);

    for (const [index, note] of song.notes.entries()) {
      expect(noteIds.has(note.id)).toBe(false);
      noteIds.add(note.id);

      expect(Number.isInteger(note.midi)).toBe(true);
      expect(note.midi).toBeGreaterThanOrEqual(0);
      expect(note.midi).toBeLessThanOrEqual(127);
      expect(Number.isFinite(note.time)).toBe(true);
      expect(note.time).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(note.duration)).toBe(true);
      expect(note.duration).toBeGreaterThan(0);
      expect(note.time + note.duration).toBeLessThanOrEqual(song.duration);
      expect(Number.isInteger(note.velocity)).toBe(true);
      expect(note.velocity).toBeGreaterThanOrEqual(1);
      expect(note.velocity).toBeLessThanOrEqual(127);
      expect(["left", "right"]).toContain(note.hand);

      if (index > 0) {
        expect(note.time).toBeGreaterThanOrEqual(song.notes[index - 1].time);
      }
    }

    expect(noteIds.size).toBe(song.notes.length);
  });
});
