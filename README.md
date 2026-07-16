# OpenPiano

OpenPiano is a browser-based piano teacher built around real MIDI input. It combines a guided beginner-to-advanced lesson path with a free-practice songbook and `.mid` / `.midi` import.

## What works

- 6 curriculum units and 18 linked lessons, from first-note orientation to advanced voicing and recital practice
- 6 playable original/public-domain arrangements with right- and left-hand parts
- Falling-note practice aligned precisely to a responsive piano keyboard
- **Wait mode**, which holds the timeline until every required note in a chord is played
- **Flow mode**, with live timing, misses, accuracy, and streak scoring
- Live Web MIDI note-on/note-off input, velocity tracking, hot-plug detection, and device selection
- On-screen playable keys for trying every interaction without hardware
- Piano-like Web Audio feedback with polyphony
- MIDI file import with track selection, metadata cleanup, hand inference, and clear validation errors
- Persistent imported songs, lesson completion, and recent practice history in local storage
- Responsive desktop and mobile layouts

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. For Web MIDI, use a current Chromium-based browser such as Chrome or Edge. Web MIDI requires `localhost` or another secure context.

## Connect a Yamaha PSR-E383

1. Connect the keyboard's **USB TO HOST** port to the computer.
2. Turn the keyboard on.
3. Open **Setup** or press **Connect keyboard** in OpenPiano.
4. Choose **Enable MIDI access** and approve the browser prompt.
5. Select the Yamaha input if more than one MIDI device is listed.
6. Play a key and confirm that it appears in the live note monitor.

The app responds to standard MIDI note-on and note-off messages. No MIDI connection is required to explore it—the on-screen keyboard goes through the same scoring path.

## Import a song

Open **Songs**, press **Import MIDI**, and choose a `.mid` or `.midi` file. OpenPiano selects useful pitched/piano tracks, ignores percussion, normalizes the start time, and opens the imported arrangement directly in the practice studio.

## Verify

```bash
npm test
npm run build
```

The test suite covers curriculum integrity, 88-key geometry, note naming, and valid/invalid MIDI parsing.

## Main modules

- `src/hooks/useMidi.ts` — Web MIDI permissions, devices, and live note state
- `src/lib/midiImport.ts` — safe MIDI parsing and OpenPiano song conversion
- `src/lib/audio.ts` — lightweight polyphonic piano synth
- `src/components/PracticeStudio.tsx` — timing, wait/flow modes, scoring, and results
- `src/components/NoteHighway.tsx` — aligned falling-note renderer
- `src/components/PianoKeyboard.tsx` — accurate interactive key geometry
- `src/data/curriculum.ts` — lessons, units, and built-in arrangements
