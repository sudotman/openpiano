import { Cable, Check, Keyboard, ScanLine, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import {
  KEYBOARD_PRESETS,
  MIDI_NOTE_MAX,
  MIDI_NOTE_MIN,
  NOTE_NAMING_CONVENTIONS,
  formatMidiNote,
  formatMidiRange,
  sanitizeKeyboardConfig,
  type KeyboardConfig,
} from '../lib/keyboardConfig'
import './KeyboardRangeSetup.css'

export interface KeyboardRangeSetupProps {
  value: KeyboardConfig
  onChange: (value: KeyboardConfig) => void
  lastMidiNote?: number
  isMidiConnected: boolean
  onConnect: () => void
}

type CalibrationStep = 'idle' | 'lowest' | 'highest'

const NOTE_OPTIONS = Array.from(
  { length: MIDI_NOTE_MAX - MIDI_NOTE_MIN + 1 },
  (_, index) => MIDI_NOTE_MIN + index,
)

function usableMidi(value: number | undefined) {
  if (!Number.isFinite(value)) return null
  return Math.max(MIDI_NOTE_MIN, Math.min(MIDI_NOTE_MAX, Math.round(value!)))
}

export function KeyboardRangeSetup({
  value,
  onChange,
  lastMidiNote,
  isMidiConnected,
  onConnect,
}: KeyboardRangeSetupProps) {
  const config = useMemo(
    () => sanitizeKeyboardConfig(value),
    [value.preset, value.startMidi, value.endMidi, value.noteNaming],
  )
  const [calibrationStep, setCalibrationStep] = useState<CalibrationStep>('idle')
  const [capturedLow, setCapturedLow] = useState<number | null>(null)
  const [calibrationError, setCalibrationError] = useState('')
  const consumedMidi = useRef<number | null>(null)

  const activeCalibration = calibrationStep !== 'idle'
  const manualSelected = config.preset === 'custom' || config.preset === 'detected'
  const keyCount = config.endMidi - config.startMidi + 1

  useEffect(() => {
    if (!activeCalibration || isMidiConnected) return
    setCalibrationStep('idle')
    setCapturedLow(null)
    setCalibrationError('')
  }, [activeCalibration, isMidiConnected])

  useEffect(() => {
    if (calibrationStep === 'idle') return
    const incoming = usableMidi(lastMidiNote)
    if (incoming === null || incoming === consumedMidi.current) return

    // Remember the event before changing steps. This prevents the lowest-key
    // event from being consumed again when the effect re-runs for `highest`.
    consumedMidi.current = incoming
    if (calibrationStep === 'lowest') {
      setCapturedLow(incoming)
      setCalibrationError('')
      setCalibrationStep('highest')
      return
    }

    if (capturedLow === null) {
      setCalibrationStep('lowest')
      return
    }
    if (incoming <= capturedLow) {
      setCalibrationError(`Play a key higher than ${formatMidiNote(capturedLow, config.noteNaming)}.`)
      return
    }

    onChange({
      preset: 'detected',
      startMidi: capturedLow,
      endMidi: incoming,
      noteNaming: config.noteNaming,
    })
    setCalibrationStep('idle')
    setCapturedLow(null)
    setCalibrationError('')
  }, [calibrationStep, capturedLow, config.noteNaming, lastMidiNote, onChange])

  function choosePreset(index: number) {
    const preset = KEYBOARD_PRESETS[index]
    onChange({
      preset: preset.preset,
      startMidi: preset.startMidi,
      endMidi: preset.endMidi,
      noteNaming: preset.preset === 'yamaha-psr-e383' ? 'yamaha' : config.noteNaming,
    })
  }

  function chooseCustom() {
    onChange({ ...config, preset: 'custom' })
  }

  function changeLow(startMidi: number) {
    onChange({
      preset: 'custom',
      startMidi,
      endMidi: config.endMidi,
      noteNaming: config.noteNaming,
    })
  }

  function changeHigh(endMidi: number) {
    onChange({
      preset: 'custom',
      startMidi: config.startMidi,
      endMidi,
      noteNaming: config.noteNaming,
    })
  }

  function changeNoteNaming(noteNaming: KeyboardConfig['noteNaming']) {
    onChange({ ...config, noteNaming })
  }

  function beginCalibration() {
    if (!isMidiConnected) {
      onConnect()
      return
    }
    // Ignore a note that was played before the user began calibration.
    consumedMidi.current = usableMidi(lastMidiNote)
    setCapturedLow(null)
    setCalibrationError('')
    setCalibrationStep('lowest')
  }

  function cancelCalibration() {
    setCalibrationStep('idle')
    setCapturedLow(null)
    setCalibrationError('')
  }

  return (
    <section className="keyboard-range-setup" aria-labelledby="keyboard-range-title">
      <header className="keyboard-range-heading">
        <span className="keyboard-range-heading__icon"><Keyboard size={18} /></span>
        <span>
          <small>Instrument profile</small>
          <strong id="keyboard-range-title">Keyboard range</strong>
        </span>
        <output>
          {config.preset === 'auto' ? 'Song focus' : `${keyCount} keys · ${formatMidiRange(config.startMidi, config.endMidi, config.noteNaming)}`}
        </output>
      </header>

      <div className="keyboard-range-layout">
        <div className="keyboard-range-presets" role="radiogroup" aria-label="Keyboard presets">
          {KEYBOARD_PRESETS.map((preset, index) => {
            const selected = config.preset === preset.preset
            return (
              <button
                key={preset.preset}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`keyboard-range-preset${selected ? ' is-selected' : ''}`}
                onClick={() => choosePreset(index)}
              >
                <span className="keyboard-range-preset__indicator">{selected && <Check size={13} />}</span>
                <span className="keyboard-range-preset__copy">
                  <strong>{preset.label}</strong>
                  <small>
                    {preset.keyCount
                      ? `${formatMidiRange(preset.startMidi, preset.endMidi, config.noteNaming)} · ${preset.description}`
                      : preset.description}
                  </small>
                </span>
                {preset.recommended && <span className="keyboard-range-preset__tag">Recommended</span>}
                {preset.keyCount && <span className="keyboard-range-preset__count">{preset.keyCount}</span>}
              </button>
            )
          })}
        </div>

        <div className="keyboard-range-manual-column">
          <div className={`keyboard-range-manual${manualSelected ? ' is-selected' : ''}`}>
            <button
              type="button"
              className="keyboard-range-manual__choice"
              aria-pressed={manualSelected}
              onClick={chooseCustom}
            >
              <span className="keyboard-range-preset__indicator">{manualSelected && <Check size={13} />}</span>
              <span>
                <strong>{config.preset === 'detected' ? 'Detected range' : 'Custom range'}</strong>
                <small>{manualSelected ? `${keyCount} keys · ${formatMidiRange(config.startMidi, config.endMidi, config.noteNaming)}` : 'Choose exact first and last notes'}</small>
              </span>
            </button>

            <div className="keyboard-range-selects">
              <label>
                <span>Lowest key</span>
                <select
                  value={config.startMidi}
                  onChange={(event) => changeLow(Number(event.target.value))}
                >
                  {NOTE_OPTIONS.filter((midi) => midi <= config.endMidi).map((midi) => (
                    <option key={midi} value={midi}>{formatMidiNote(midi, config.noteNaming)} · MIDI {midi}</option>
                  ))}
                </select>
              </label>
              <i aria-hidden="true" />
              <label>
                <span>Highest key</span>
                <select
                  value={config.endMidi}
                  onChange={(event) => changeHigh(Number(event.target.value))}
                >
                  {NOTE_OPTIONS.filter((midi) => midi >= config.startMidi).map((midi) => (
                    <option key={midi} value={midi}>{formatMidiNote(midi, config.noteNaming)} · MIDI {midi}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="keyboard-note-naming">
            <div className="keyboard-note-naming__heading">
              <span><small>Note labels</small><strong>Octave numbering</strong></span>
              <output>MIDI 60 = {formatMidiNote(60, config.noteNaming)}</output>
            </div>
            <div className="keyboard-note-naming__options" role="radiogroup" aria-label="Note octave naming">
              {NOTE_NAMING_CONVENTIONS.map((convention) => {
                const selected = convention.id === config.noteNaming
                return (
                  <button
                    key={convention.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={selected ? 'is-selected' : ''}
                    onClick={() => changeNoteNaming(convention.id)}
                  >
                    <span className="keyboard-note-naming__radio">{selected && <Check size={11} />}</span>
                    <span><strong>{convention.label}</strong><small>{convention.description}</small></span>
                  </button>
                )
              })}
            </div>
            <p>{NOTE_NAMING_CONVENTIONS.find((convention) => convention.id === config.noteNaming)?.detail}. Labels change; MIDI pitches do not.</p>
          </div>

          <div className={`keyboard-range-calibration${activeCalibration ? ' is-listening' : ''}`} aria-live="polite">
            {activeCalibration ? (
              <>
                <span className="keyboard-range-calibration__scan"><ScanLine size={18} /></span>
                <div className="keyboard-range-calibration__copy">
                  <small>Step {calibrationStep === 'lowest' ? '1 of 2' : '2 of 2'}</small>
                  <strong>
                    {calibrationStep === 'lowest'
                      ? 'Play your lowest key'
                      : `Now play your highest key`}
                  </strong>
                  <p>
                    {calibrationStep === 'lowest'
                      ? 'Press it once and release.'
                      : `${formatMidiNote(capturedLow ?? config.startMidi, config.noteNaming)} captured as the low end.`}
                  </p>
                  {calibrationError && <em>{calibrationError}</em>}
                </div>
                <button type="button" className="keyboard-range-calibration__cancel" onClick={cancelCalibration} aria-label="Cancel keyboard calibration">
                  <X size={16} />
                </button>
              </>
            ) : (
              <>
                <span className="keyboard-range-calibration__scan"><ScanLine size={18} /></span>
                <div className="keyboard-range-calibration__copy">
                  <small>MIDI calibration</small>
                  <strong>{isMidiConnected ? 'Detect your exact range' : 'Connect to detect your range'}</strong>
                  <p>{isMidiConnected ? 'Play two notes; no model lookup needed.' : 'OpenPiano will listen for your first and last keys.'}</p>
                </div>
                <button type="button" className="keyboard-range-calibration__action" onClick={beginCalibration}>
                  {isMidiConnected ? <ScanLine size={14} /> : <Cable size={14} />}
                  {isMidiConnected ? 'Calibrate' : 'Connect'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

export default KeyboardRangeSetup
