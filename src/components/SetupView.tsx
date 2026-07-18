import { motion } from 'framer-motion'
import { Cable, Check, ChevronDown, Gauge, Music, RotateCcw, SlidersHorizontal, Volume2 } from 'lucide-react'
import { formatMidiNote, type KeyboardConfig } from '../lib/keyboardConfig'
import {
  PRACTICE_TEMPO_OPTIONS,
  type PracticePreferences,
  type PracticeTempoPercent,
} from '../lib/practiceSettings'
import { KeyboardRangeSetup } from './KeyboardRangeSetup'

interface MidiDevice {
  id: string
  name?: string
  manufacturer?: string
  state?: string
}

interface SetupViewProps {
  supported: boolean
  connected: boolean
  requesting: boolean
  devices: MidiDevice[]
  selectedDeviceId?: string
  error?: string
  keyboardConfig: KeyboardConfig
  practicePreferences: PracticePreferences
  lastMidiNote?: number
  onConnect: () => void
  onSelectDevice: (id: string) => void
  onKeyboardConfigChange: (config: KeyboardConfig) => void
  onPracticePreferencesChange: (preferences: PracticePreferences) => void
}

export function SetupView({
  supported,
  connected,
  requesting,
  devices,
  selectedDeviceId,
  error,
  keyboardConfig,
  practicePreferences,
  lastMidiNote,
  onConnect,
  onSelectDevice,
  onKeyboardConfigChange,
  onPracticePreferencesChange,
}: SetupViewProps) {
  return (
    <motion.div className="setup-view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <section className="keyboard-setup">
        <div className="setup-copy">
          <span className="section-kicker"><Cable size={14} /> MIDI input</span>
          <h2>{connected ? 'Your keyboard is ready.' : 'Connect your Yamaha.'}</h2>
          <p>Plug the PSR-E383 into this computer with USB, turn it on, then let OpenPiano listen for notes.</p>

          {!supported ? (
            <div className="setup-warning">Web MIDI is not available in this browser. Open the app in Chrome, Edge, or the installed desktop build.</div>
          ) : devices.length > 0 ? (
            <label className="device-select">
              <span>Input device</span>
              <div>
                <select value={selectedDeviceId || ''} onChange={(event) => onSelectDevice(event.target.value)}>
                  {devices.map((device) => <option key={device.id} value={device.id}>{device.name || 'MIDI keyboard'}</option>)}
                </select>
                <ChevronDown size={16} />
              </div>
            </label>
          ) : (
            <button className="primary-action" onClick={onConnect} disabled={requesting}>
              {requesting ? <span className="mini-spinner dark" /> : <Cable size={17} />}
              {requesting ? 'Looking for keyboard…' : 'Enable MIDI access'}
            </button>
          )}
          {error && <div className="setup-warning">{error}</div>}
        </div>

        <div className="device-illustration" aria-hidden="true">
          <div className={connected ? 'usb-path active' : 'usb-path'}><i /><i /><i /></div>
          <div className="keyboard-body">
            <div className="keyboard-screen">{connected ? 'READY' : 'USB'}</div>
            <div className="keyboard-mini-keys">{Array.from({ length: 22 }).map((_, i) => <i key={i} />)}</div>
          </div>
          <div className={connected ? 'connection-badge on' : 'connection-badge'}>{connected ? <><Check size={14} /> Connected</> : 'Waiting'}</div>
        </div>
      </section>

      <section className="setup-sections keyboard-range-section">
        <KeyboardRangeSetup
          value={keyboardConfig}
          onChange={onKeyboardConfigChange}
          lastMidiNote={lastMidiNote}
          isMidiConnected={connected}
          onConnect={onConnect}
        />
      </section>

      <section className="setup-sections">
        <div className="setup-section-heading"><span>Practice preferences</span><h3>Make the studio yours</h3></div>
        <div className="preference-list">
          <label className="preference-row">
            <span className="preference-icon"><Gauge size={18} /></span>
            <span><strong>Default tempo</strong><small>The starting speed for every new song or lesson</small></span>
            <select
              className="preference-select"
              aria-label="Default practice tempo"
              value={practicePreferences.defaultTempoPercent}
              onChange={(event) => onPracticePreferencesChange({
                ...practicePreferences,
                defaultTempoPercent: Number(event.target.value) as PracticeTempoPercent,
              })}
            >
              {PRACTICE_TEMPO_OPTIONS.map((tempo) => <option key={tempo} value={tempo}>{tempo}%</option>)}
            </select>
          </label>
          <div className="preference-row preference-row-static">
            <span className="preference-icon"><RotateCcw size={18} /></span>
            <span><strong>MIDI result shortcuts</strong><small>After a song, press and release an outer key—no mouse needed</small></span>
            <span className="midi-shortcut-keys">
              <span><kbd>{formatMidiNote(keyboardConfig.startMidi, keyboardConfig.noteNaming)}</kbd><small>Repeat</small></span>
              <span><kbd>{formatMidiNote(keyboardConfig.endMidi, keyboardConfig.noteNaming)}</kbd><small>Next</small></span>
            </span>
          </div>
          <label className="preference-row">
            <span className="preference-icon"><Volume2 size={18} /></span>
            <span><strong>Browser play-through</strong><small>Hear OpenPiano’s software piano while playing MIDI keys</small></span>
            <input
              type="checkbox"
              checked={practicePreferences.midiPlayThrough}
              onChange={(event) => onPracticePreferencesChange({
                ...practicePreferences,
                midiPlayThrough: event.target.checked,
              })}
            />
            <i className="toggle" />
          </label>
          <label className="preference-row">
            <span className="preference-icon"><Music size={18} /></span>
            <span><strong>Note names</strong><small>Show labels on the keyboard while learning</small></span>
            <input type="checkbox" defaultChecked /><i className="toggle" />
          </label>
          <label className="preference-row">
            <span className="preference-icon"><SlidersHorizontal size={18} /></span>
            <span><strong>Wait mode by default</strong><small>The music pauses until you find the right key</small></span>
            <input type="checkbox" defaultChecked /><i className="toggle" />
          </label>
        </div>
      </section>
    </motion.div>
  )
}
