import { AnimatePresence, motion } from 'framer-motion'
import { Cable, Check, CircleHelp, Keyboard, Piano, RefreshCw, Usb, X, Zap } from 'lucide-react'
import type { UseMidiResult } from '../hooks/useMidi'
import { formatMidiNote, type NoteNamingConvention } from '../lib/keyboardConfig'

interface MidiDrawerProps {
  open: boolean
  midi: UseMidiResult
  noteNaming: NoteNamingConvention
  onClose: () => void
  onEnable: () => Promise<void>
}

export function MidiDrawer({ open, midi, noteNaming, onClose, onEnable }: MidiDrawerProps) {
  const active = Array.from(midi.activeNotes).sort((a, b) => a - b)

  return (
    <AnimatePresence>
      {open && (
        <div className="sheet-layer" role="dialog" aria-modal="true" aria-label="MIDI keyboard setup">
          <motion.button className="sheet-backdrop" aria-label="Close MIDI setup" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.aside className="midi-drawer" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 260 }}>
            <div className="sheet-topline">
              <span>Keyboard connection</span>
              <button onClick={onClose} aria-label="Close"><X size={18} /></button>
            </div>

            <div className="midi-drawer-heading">
              <div className={midi.isConnected ? 'connection-orb active' : 'connection-orb'}><Piano size={28} /></div>
              <h2>{midi.isConnected ? 'Ready to play' : 'Connect your piano'}</h2>
              <p>{midi.isConnected ? `${midi.selectedInput?.name || 'Your MIDI keyboard'} is sending notes to OpenPiano.` : 'Use a single USB cable to turn your keyboard into an interactive lesson controller.'}</p>
            </div>

            {!midi.hasAccess ? (
              <div className="midi-steps">
                <div><span><Usb size={17} /></span><p><strong>1. Plug in</strong>Connect the MIDI keyboard USB TO HOST port to your computer.</p></div>
                <div><span><Zap size={17} /></span><p><strong>2. Power on</strong>Turn on the keyboard before enabling access.</p></div>
                <div><span><Cable size={17} /></span><p><strong>3. Allow MIDI</strong>Your browser will ask once for permission.</p></div>
                <button className="primary-action full" onClick={onEnable} disabled={midi.status === 'requesting' || !midi.isSupported}>
                  {midi.status === 'requesting' ? <span className="mini-spinner dark" /> : <Cable size={17} />}
                  {midi.status === 'requesting' ? 'Finding keyboard…' : 'Enable MIDI access'}
                </button>
              </div>
            ) : (
              <div className="device-list">
                <span>Available inputs</span>
                {midi.inputs.map((input) => (
                  <button key={input.id} className={midi.selectedInputId === input.id ? 'selected' : ''} onClick={() => midi.selectInput(input.id)}>
                    <span className="device-icon"><Keyboard size={19} /></span>
                    <span><strong>{input.name}</strong><small>{input.manufacturer} · {input.state}</small></span>
                    {midi.selectedInputId === input.id && <i><Check size={13} /></i>}
                  </button>
                ))}
                {midi.inputs.length === 0 && (
                  <div className="no-midi-device"><CircleHelp size={20} /><strong>No input found yet</strong><span>Check the cable and power, then retry.</span></div>
                )}
                <button className="refresh-midi" onClick={onEnable}><RefreshCw size={14} /> Refresh devices</button>
              </div>
            )}

            {midi.error && <div className="midi-error">{midi.error}</div>}

            <div className="midi-monitor">
              <div><span>Live note monitor</span><i className={midi.isConnected ? 'on' : ''} /></div>
              <div className="monitor-notes">
                {active.length ? active.map((note) => <span key={note}>{formatMidiNote(note, noteNaming)}</span>) : <small>Play a key to test the connection</small>}
              </div>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  )
}
