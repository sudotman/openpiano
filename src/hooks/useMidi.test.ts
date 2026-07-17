import { describe, expect, it } from 'vitest'
import {
  resolvePreferredMidiInputId,
  shouldAttemptMidiAutoReconnect,
  type MidiInputDevice,
  type MidiInputPreference,
} from './useMidi'

function input(overrides: Partial<MidiInputDevice> & Pick<MidiInputDevice, 'id' | 'name'>): MidiInputDevice {
  return {
    manufacturer: 'Yamaha',
    state: 'connected',
    connection: 'open',
    ...overrides,
  }
}

describe('MIDI reconnection policy', () => {
  const yamaha: MidiInputPreference = {
    id: 'yamaha-old-id',
    name: 'Digital Keyboard',
    manufacturer: 'Yamaha Corporation',
  }

  it('retains the chosen keyboard while it is temporarily disconnected', () => {
    const inputs = [
      input({ id: yamaha.id, name: yamaha.name, manufacturer: yamaha.manufacturer, state: 'disconnected', connection: 'closed' }),
      input({ id: 'other', name: 'IAC Driver', manufacturer: 'Apple' }),
    ]
    expect(resolvePreferredMidiInputId(inputs, yamaha.id, yamaha, true)).toBe(yamaha.id)
  })

  it('recovers the chosen keyboard by identity when the browser changes its opaque id', () => {
    const inputs = [
      input({ id: 'yamaha-new-id', name: 'Digital Keyboard', manufacturer: 'Yamaha Corporation' }),
      input({ id: 'other', name: 'IAC Driver', manufacturer: 'Apple' }),
    ]
    expect(resolvePreferredMidiInputId(inputs, yamaha.id, yamaha, true)).toBe('yamaha-new-id')
  })

  it('auto-selects only when there is no usable current or preferred input', () => {
    const inputs = [input({ id: 'first', name: 'PSR-E383' })]
    expect(resolvePreferredMidiInputId(inputs, null, null, true)).toBe('first')
    expect(resolvePreferredMidiInputId(inputs, null, null, false)).toBeNull()
  })

  it('auto-reconnects granted access and uses the remembered flag only when permission querying is unavailable', () => {
    expect(shouldAttemptMidiAutoReconnect('granted', false)).toBe(true)
    expect(shouldAttemptMidiAutoReconnect('unknown', true)).toBe(true)
    expect(shouldAttemptMidiAutoReconnect('prompt', true)).toBe(false)
    expect(shouldAttemptMidiAutoReconnect('denied', true)).toBe(false)
  })
})
