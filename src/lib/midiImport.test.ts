import { Midi } from "@tonejs/midi";
import { describe, expect, it } from "vitest";

import { importMidi, MidiImportError } from "./midiImport";

function makeTinyMidiBuffer(): ArrayBuffer {
  const midi = new Midi();
  midi.name = "Generated Etude";
  midi.header.setTempo(96);

  const track = midi.addTrack();
  track.name = "Grand Piano";
  track.instrument.number = 0;
  track.addNote({ midi: 48, time: 0.5, duration: 0.25, velocity: 0.5 });
  track.addNote({ midi: 60, time: 2, duration: 0.5, velocity: 0.75 });

  return Uint8Array.from(midi.toArray()).buffer;
}

describe("MIDI import", () => {
  it("turns a generated MIDI buffer into a normalized OpenPiano song", async () => {
    const buffer = makeTinyMidiBuffer();
    const options = {
      title: "Tiny Study",
      composer: "Test Composer",
      sourceName: "tiny.mid",
    };
    const song = await importMidi(buffer, options);
    const repeatedImport = await importMidi(buffer, options);

    expect(song).toMatchObject({
      id: expect.stringMatching(/^import-tiny-study-[a-z0-9]+$/),
      title: "Tiny Study",
      composer: "Test Composer",
      difficulty: "Beginner",
      bpm: 96,
      duration: 2.35,
      key: "Unknown",
      signature: "4/4",
      source: "imported",
      accent: "#d77a55",
      tags: ["Imported", "MIDI", "Beginner"],
    });
    expect(song.id).toBe(repeatedImport.id);
    expect(song.description).toBe(
      "Imported from tiny.mid · 2 notes across 1 playable track.",
    );
    expect(song.notes).toEqual([
      {
        id: `${song.id}-note-1`,
        midi: 48,
        time: 0,
        duration: 0.25,
        velocity: 63,
        hand: "left",
      },
      {
        id: `${song.id}-note-2`,
        midi: 60,
        time: 1.5,
        duration: 0.5,
        velocity: 95,
        hand: "right",
      },
    ]);
  });

  it("rejects an empty file with a typed empty-file error", async () => {
    await expect(importMidi(new ArrayBuffer(0))).rejects.toMatchObject({
      name: "MidiImportError",
      code: "empty-file",
      message: "This MIDI file is empty.",
    } satisfies Partial<MidiImportError>);
  });

  it("rejects non-MIDI bytes with a typed invalid-midi error", async () => {
    const invalid = Uint8Array.from({ length: 16 }, (_, index) => index).buffer;

    await expect(importMidi(invalid)).rejects.toMatchObject({
      name: "MidiImportError",
      code: "invalid-midi",
      message: "This does not look like a standard MIDI file. Choose a .mid or .midi file.",
    } satisfies Partial<MidiImportError>);
  });
});
