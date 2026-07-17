# OpenPiano

OpenPiano is a browser-based piano teacher built around real MIDI input. It combines a guided beginner-to-advanced lesson path with a free-practice songbook and `.mid` / `.midi` import.

## What works

- 8 curriculum units and 32 freely accessible lessons, from first-note orientation to counterpoint, rubato, and capstone performance
- 14 playable original, traditional, and public-domain arrangements with right- and left-hand parts
- Falling-note practice aligned precisely to a responsive piano keyboard
- Three practice views: falling tiles, standard grand-staff notation, or both together
- **Wait mode**, which holds the timeline until every required note in a chord is played
- **Flow mode**, with live timing, misses, accuracy, and streak scoring
- Live Web MIDI note-on/note-off input, velocity tracking, hot-plug detection, remembered device selection, and automatic reconnection after the first approval
- On-screen playable keys for trying every interaction without hardware
- Piano-like Web Audio feedback with polyphony
- MIDI file import with track selection, metadata cleanup, hand inference, and clear validation errors
- A Yamaha PSR-E383 preset (61 keys, Yamaha C1–C6), common 49/76/88-key presets, custom endpoints, two-note MIDI calibration, and selectable Yamaha C3 / Scientific C4 octave labels
- Password-free local learner profiles with separate songs, lesson progress, settings, theory scores, practice history, switching, renaming, and non-destructive logout
- A six-part interactive Theory Lab for keyboard geography, chromatic staff reading, pulse training, scales, intervals, triads, inversions, and harmonic function
- Browser Back navigation that stays inside OpenPiano across views, lesson sheets, and practice sessions so an active MIDI connection is not discarded
- Real practice totals, accuracy, streaks, staff-note mastery, and session history—no placeholder progress data
- On-demand loading for the notation engine so the core curriculum and tiles view stay quick
- Responsive desktop and mobile layouts

## Run locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`, which is also printed by Vite. The port is fixed deliberately: if another process owns it, Vite reports that directly instead of silently moving the app to another address.

If the browser reports `ERR_CONNECTION_REFUSED`, keep the terminal running and restart Vite's dependency cache once:

```bash
npm run dev:restart
```

For Web MIDI, use a current Chromium-based browser such as Chrome or Edge. Web MIDI requires localhost or another secure context. The browser must ask once before any site can access MIDI; after approval, OpenPiano restores the remembered keyboard automatically.

## Connect a Yamaha PSR-E383

1. Connect the keyboard's **USB TO HOST** port to the computer.
2. Turn the keyboard on.
3. Open **Setup** or press **Connect keyboard** in OpenPiano.
4. Choose **Enable MIDI access** and approve the browser prompt.
5. Select the Yamaha input if more than one MIDI device is listed.
6. Choose the **Yamaha PSR-E383** instrument profile, or press **Calibrate** and play the lowest then highest key. This profile uses Yamaha's labels, where MIDI 60 / middle C is shown as **C3**; switch to Scientific naming in Setup if you prefer **C4**.
7. Play a key and confirm that it appears in the live note monitor.

The app responds to standard MIDI note-on and note-off messages. No MIDI connection is required to explore it—the on-screen keyboard goes through the same scoring path.

## Import a song

Open **Songs**, press **Import MIDI**, and choose a `.mid` or `.midi` file. OpenPiano selects useful pitched/piano tracks, ignores percussion, normalizes the start time, and opens the imported arrangement directly in the practice studio.

Inside the studio, switch between **Tiles**, **Score**, and **Both** without restarting the session. Imported MIDI is quantized into readable grand-staff notation automatically; tiles mode remains available if an unusual file cannot be engraved.

## Local learner profiles

Press the learner card at the bottom of the sidebar to add, rename, switch, or leave a profile. There is no password and no server account: all data stays in this browser's local storage. Logging out returns to the learner picker without deleting anything. Clearing browser site data will remove local profiles, so this is intentionally a single-device setup for now.

## Verify

```bash
npm test
npm run build
```

The test suite covers curriculum integrity, keyboard presets and calibration ranges, local profile migration/isolation, notation quantization, theory utilities, key geometry, and valid/invalid MIDI parsing.

Every pull request, push to `main`, and `v*` tag also runs `.github/workflows/package.yml`. The workflow tests and builds with Node.js 22, then publishes the production `dist/` directory as a 30-day GitHub Actions artifact.

## Main modules

- `src/hooks/useMidi.ts` — Web MIDI permissions, devices, and live note state
- `src/lib/midiImport.ts` — safe MIDI parsing and OpenPiano song conversion
- `src/lib/audio.ts` — lightweight polyphonic piano synth
- `src/components/PracticeStudio.tsx` — timing, wait/flow modes, scoring, and results
- `src/components/NoteHighway.tsx` — aligned falling-note renderer
- `src/components/PianoKeyboard.tsx` — accurate interactive key geometry
- `src/components/SheetMusic.tsx` — live VexFlow grand staff, playhead, and note-result coloring
- `src/components/TheoryLab.tsx` — interactive note, staff, rhythm, and key-signature practice
- `src/components/KeyboardRangeSetup.tsx` — instrument presets and live two-note calibration
- `src/lib/localProfiles.ts` — isolated password-free learner storage
- `src/data/curriculum.ts` — lessons, units, and built-in arrangements
