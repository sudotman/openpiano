import { motion } from 'framer-motion'
import { Cable, Check, ChevronDown, Music, SlidersHorizontal, Volume2 } from 'lucide-react'
import type { KeyboardConfig } from '../lib/keyboardConfig'
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
  lastMidiNote?: number
  onConnect: () => void
  onSelectDevice: (id: string) => void
  onKeyboardConfigChange: (config: KeyboardConfig) => void
}

export function SetupView({
  supported,
  connected,
  requesting,
  devices,
  selectedDeviceId,
  error,
  keyboardConfig,
  lastMidiNote,
  onConnect,
  onSelectDevice,
  onKeyboardConfigChange,
}: SetupViewProps) {
  return (
    <motion.div className="setup-view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <section className="keyboard-setup">
        <div className="setup-copy">
          <span className="section-kicker"><Cable size={14} /> MIDI input</span>
          <h2>{connected ? 'Your keyboard is ready.' : 'Connect your keyboard.'}</h2>
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
            <span className="preference-icon"><Volume2 size={18} /></span>
            <span><strong>Key sound</strong><small>Hear a soft piano tone as you play</small></span>
            <input type="checkbox" defaultChecked /><i className="toggle" />
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
