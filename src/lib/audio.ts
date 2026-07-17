const MIN_GAIN = 0.0001;
const MAX_VOICE_SECONDS = 18;

interface Voice {
  note: number;
  velocity: number;
  envelope: GainNode;
  oscillators: OscillatorNode[];
  cleanupNodes: AudioNode[];
  released: boolean;
  startedAt: number;
}

export interface PianoSynthOptions {
  /** Master output, from 0 (silent) to 1. Defaults to 0.42. */
  volume?: number;
  /** Maximum number of notes sounding at once. Defaults to 32. */
  maxPolyphony?: number;
  /** Primarily useful for tests or embedding into an existing audio graph. */
  audioContext?: AudioContext;
}

type AudioContextConstructor = new () => AudioContext;

function getAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof globalThis === "undefined") return null;

  const standard =
    typeof AudioContext === "undefined" ? undefined : AudioContext;
  const webkit = (
    globalThis as typeof globalThis & {
      webkitAudioContext?: AudioContextConstructor;
    }
  ).webkitAudioContext;

  return standard ?? webkit ?? null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeVelocity(value: number): number {
  if (!Number.isFinite(value)) return 0.78;
  const normalized = value > 1 ? value / 127 : value;
  return clamp(normalized, 0, 1);
}

function normalizeNote(note: number): number | null {
  if (!Number.isFinite(note)) return null;
  const rounded = Math.round(note);
  return rounded >= 0 && rounded <= 127 ? rounded : null;
}

function holdAudioParam(param: AudioParam, time: number): void {
  if (typeof param.cancelAndHoldAtTime === "function") {
    param.cancelAndHoldAtTime(time);
    return;
  }

  const value = Math.max(MIN_GAIN, param.value);
  param.cancelScheduledValues(time);
  param.setValueAtTime(value, time);
}

function createRoomImpulse(context: AudioContext): AudioBuffer {
  const length = Math.round(context.sampleRate * 1.15);
  const impulse = context.createBuffer(2, length, context.sampleRate);

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    let seed = 17_171 + channel * 7_919;
    for (let index = 0; index < length; index += 1) {
      seed = Math.imul(seed, 48_271) >>> 0;
      const noise = (seed / 4_294_967_295) * 2 - 1;
      const progress = index / length;
      data[index] = noise * Math.exp(-5.8 * progress) * (1 - progress) * 0.42;
    }
  }

  return impulse;
}

/** Convert a MIDI note number to equal-tempered frequency (A4 = 440 Hz). */
export function midiToFrequency(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

/**
 * A small, dependency-free polyphonic synth with a piano-like transient and
 * natural decay. The AudioContext is lazy: constructing this class is safe
 * during SSR and does not trigger the browser's autoplay warning.
 */
export class PianoSynth {
  private context: AudioContext | null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private dryGain: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private reverbFilter: BiquadFilterNode | null = null;
  private reverbGain: GainNode | null = null;
  private hammerBuffer: AudioBuffer | null = null;
  private readonly ownsContext: boolean;
  private readonly maxPolyphony: number;
  private readonly voices = new Map<number, Voice>();
  private volume: number;
  private disposed = false;

  constructor(options: PianoSynthOptions = {}) {
    this.context = options.audioContext ?? null;
    this.ownsContext = !options.audioContext;
    this.volume = clamp(options.volume ?? 0.42, 0, 1);
    this.maxPolyphony = Math.round(
      clamp(options.maxPolyphony ?? 32, 1, 128),
    );

    if (this.context) this.createOutputGraph(this.context);
  }

  get isSupported(): boolean {
    return this.context !== null || getAudioContextConstructor() !== null;
  }

  get isRunning(): boolean {
    return this.context?.state === "running";
  }

  get activeNotes(): ReadonlySet<number> {
    return new Set(this.voices.keys());
  }

  get audioContext(): AudioContext | null {
    return this.context;
  }

  /**
   * Resume audio after a click/tap. Browsers normally require this explicit
   * user gesture before MIDI or pointer events may make sound.
   */
  async resume(): Promise<void> {
    if (this.disposed) {
      throw new Error("This piano synth has already been disposed.");
    }

    const context = this.ensureContext();
    if (!context) {
      throw new Error("Web Audio is not supported by this browser.");
    }

    if (context.state === "suspended") await context.resume();
    if (context.state !== "running") {
      throw new Error("Audio could not start. Tap the page and try again.");
    }
  }

  /**
   * Start a note. Velocity may be supplied as either MIDI 0–127 or normalized
   * 0–1. Returns false when the note or Web Audio is unavailable.
   */
  noteOn(noteValue: number, velocityValue = 100): boolean {
    if (this.disposed) return false;

    const note = normalizeNote(noteValue);
    const velocity = normalizeVelocity(velocityValue);
    if (note === null || velocity <= 0) {
      if (note !== null) this.noteOff(note);
      return false;
    }

    const context = this.ensureContext();
    if (!context || !this.master) return false;

    // Calling resume without awaiting keeps hardware MIDI latency low. The UI
    // should still call `resume()` from its enable-audio button to satisfy the
    // browser's user-gesture policy.
    if (context.state === "suspended") void context.resume().catch(() => undefined);

    const existing = this.voices.get(note);
    if (existing) {
      this.releaseVoice(existing, 0.035);
      this.voices.delete(note);
    }

    if (this.voices.size >= this.maxPolyphony) {
      const oldest = Array.from(this.voices.values()).sort(
        (a, b) => a.startedAt - b.startedAt,
      )[0];
      if (oldest) {
        this.releaseVoice(oldest, 0.025);
        this.voices.delete(oldest.note);
      }
    }

    const startedAt = context.currentTime;
    const fundamental = midiToFrequency(note);
    const keyboardPosition = clamp((note - 21) / 87, 0, 1);
    const envelope = context.createGain();
    const filter = context.createBiquadFilter();
    const panner = context.createStereoPanner();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(
      clamp(2_100 + velocity ** 1.5 * 8_400 + fundamental * 2.2, 2_200, 12_500),
      startedAt,
    );
    filter.Q.setValueAtTime(0.42, startedAt);
    panner.pan.setValueAtTime(clamp((note - 64) / 58, -0.52, 0.52), startedAt);
    envelope.connect(filter);
    filter.connect(panner);
    panner.connect(this.master);

    const peak = 0.16 + 0.54 * velocity ** 1.2;
    const bodyDecay = 8.4 - keyboardPosition * 4.8 + velocity * 1.15;
    envelope.gain.setValueAtTime(MIN_GAIN, startedAt);
    envelope.gain.linearRampToValueAtTime(peak, startedAt + 0.0045);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(MIN_GAIN, peak * 0.78),
      startedAt + 0.065,
    );
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(MIN_GAIN, peak * 0.4),
      startedAt + 0.85,
    );
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(MIN_GAIN, peak * 0.075),
      startedAt + bodyDecay,
    );
    envelope.gain.exponentialRampToValueAtTime(
      MIN_GAIN,
      startedAt + MAX_VOICE_SECONDS,
    );

    const oscillators: OscillatorNode[] = [];
    const cleanupNodes: AudioNode[] = [envelope, filter, panner];
    const harmonicLevels = [1, 0.44, 0.24, 0.145, 0.09, 0.052, 0.03];
    const inharmonicity = 0.000055 + keyboardPosition ** 1.7 * 0.00031;
    const partials = harmonicLevels.map((level, index) => {
      const harmonic = index + 1;
      return {
        harmonic,
        ratio: harmonic * Math.sqrt(1 + inharmonicity * harmonic ** 2),
        level: level * (harmonic === 1 ? 1 : 0.44 + velocity * 0.72),
      };
    });

    for (const partial of partials) {
      const partialFrequency = fundamental * partial.ratio;
      if (partialFrequency >= context.sampleRate / 2 - 100) continue;

      const oscillator = context.createOscillator();
      const partialGain = context.createGain();
      const partialDecay = clamp(bodyDecay / (0.66 + partial.harmonic * 0.27), 0.42, bodyDecay);
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(partialFrequency, startedAt);
      oscillator.detune.setValueAtTime(((note + partial.harmonic) % 3 - 1) * 0.28, startedAt);
      partialGain.gain.setValueAtTime(MIN_GAIN, startedAt);
      partialGain.gain.linearRampToValueAtTime(partial.level, startedAt + 0.0035 + partial.harmonic * 0.00035);
      partialGain.gain.exponentialRampToValueAtTime(
        Math.max(MIN_GAIN, partial.level * 0.64),
        startedAt + 0.055,
      );
      partialGain.gain.exponentialRampToValueAtTime(MIN_GAIN, startedAt + partialDecay);
      oscillator.connect(partialGain);
      partialGain.connect(envelope);
      oscillator.start(startedAt);
      oscillator.stop(startedAt + MAX_VOICE_SECONDS + 0.05);
      oscillators.push(oscillator);
      cleanupNodes.push(oscillator, partialGain);
    }

    if (note >= 40 && fundamental < context.sampleRate / 4) {
      const stringSpread = 0.46 + keyboardPosition * 0.62;
      for (const direction of [-1, 1]) {
        const string = context.createOscillator();
        const stringGain = context.createGain();
        string.type = "sine";
        string.frequency.setValueAtTime(fundamental, startedAt);
        string.detune.setValueAtTime(direction * stringSpread, startedAt);
        stringGain.gain.setValueAtTime(MIN_GAIN, startedAt);
        stringGain.gain.linearRampToValueAtTime(0.12, startedAt + 0.005);
        stringGain.gain.exponentialRampToValueAtTime(MIN_GAIN, startedAt + bodyDecay * 0.9);
        string.connect(stringGain);
        stringGain.connect(envelope);
        string.start(startedAt);
        string.stop(startedAt + MAX_VOICE_SECONDS + 0.05);
        oscillators.push(string);
        cleanupNodes.push(string, stringGain);
      }
    }

    const hammer = context.createBufferSource();
    const hammerFilter = context.createBiquadFilter();
    const hammerGain = context.createGain();
    hammer.buffer = this.hammerBuffer;
    hammerFilter.type = "bandpass";
    hammerFilter.frequency.setValueAtTime(clamp(fundamental * 7.5, 1_700, 7_800), startedAt);
    hammerFilter.Q.setValueAtTime(0.72, startedAt);
    hammerGain.gain.setValueAtTime(0.025 + velocity ** 2 * 0.16, startedAt);
    hammer.connect(hammerFilter);
    hammerFilter.connect(hammerGain);
    hammerGain.connect(envelope);
    hammer.start(startedAt);
    cleanupNodes.push(hammer, hammerFilter, hammerGain);

    if (oscillators.length === 0) {
      envelope.disconnect();
      filter.disconnect();
      return false;
    }

    const voice: Voice = {
      note,
      velocity,
      envelope,
      oscillators,
      cleanupNodes,
      released: false,
      startedAt,
    };
    this.voices.set(note, voice);

    oscillators[0].addEventListener(
      "ended",
      () => {
        if (this.voices.get(note) === voice) this.voices.delete(note);
        voice.cleanupNodes.forEach((node) => node.disconnect());
      },
      { once: true },
    );

    return true;
  }

  /** Release a note with a short piano-style tail. */
  noteOff(noteValue: number): void {
    const note = normalizeNote(noteValue);
    if (note === null) return;

    const voice = this.voices.get(note);
    if (!voice) return;
    const release = 0.16 + (1 - voice.velocity) * 0.14;
    this.releaseVoice(voice, release);
  }

  /** Release every sounding note; useful on disconnect, pause, and unmount. */
  stopAll(releaseSeconds = 0.035): void {
    const release = clamp(releaseSeconds, 0.01, 2);
    for (const voice of this.voices.values()) {
      this.releaseVoice(voice, release);
    }
  }

  setVolume(volume: number): void {
    this.volume = clamp(volume, 0, 1);
    if (!this.context || !this.master) return;

    const time = this.context.currentTime;
    holdAudioParam(this.master.gain, time);
    this.master.gain.linearRampToValueAtTime(this.volume, time + 0.02);
  }

  /** Stop voices and release owned AudioContext resources. */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.stopAll(0.01);
    this.disposed = true;

    this.master?.disconnect();
    this.compressor?.disconnect();
    this.dryGain?.disconnect();
    this.reverb?.disconnect();
    this.reverbFilter?.disconnect();
    this.reverbGain?.disconnect();
    this.master = null;
    this.compressor = null;
    this.dryGain = null;
    this.reverb = null;
    this.reverbFilter = null;
    this.reverbGain = null;
    this.hammerBuffer = null;
    this.voices.clear();

    if (this.ownsContext && this.context?.state !== "closed") {
      await this.context?.close();
    }
    this.context = null;
  }

  private ensureContext(): AudioContext | null {
    if (this.disposed) return null;
    if (this.context?.state === "closed") {
      if (!this.ownsContext) return null;
      this.context = null;
      this.master = null;
      this.compressor = null;
      this.dryGain = null;
      this.reverb = null;
      this.reverbFilter = null;
      this.reverbGain = null;
      this.hammerBuffer = null;
    }

    if (!this.context) {
      const Context = getAudioContextConstructor();
      if (!Context) return null;
      this.context = new Context();
    }

    if (!this.master) this.createOutputGraph(this.context);
    return this.context;
  }

  private createOutputGraph(context: AudioContext): void {
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    const dryGain = context.createGain();
    const reverb = context.createConvolver();
    const reverbFilter = context.createBiquadFilter();
    const reverbGain = context.createGain();
    const hammerLength = Math.max(1, Math.round(context.sampleRate * 0.032));
    const hammerBuffer = context.createBuffer(1, hammerLength, context.sampleRate);
    const hammerData = hammerBuffer.getChannelData(0);
    let hammerSeed = 1_103;
    for (let index = 0; index < hammerLength; index += 1) {
      hammerSeed = Math.imul(hammerSeed, 16_807) >>> 0;
      const noise = (hammerSeed / 4_294_967_295) * 2 - 1;
      hammerData[index] = noise * (1 - index / hammerLength) ** 3;
    }
    master.gain.setValueAtTime(this.volume, context.currentTime);
    dryGain.gain.setValueAtTime(0.94, context.currentTime);
    reverb.buffer = createRoomImpulse(context);
    reverbFilter.type = "lowpass";
    reverbFilter.frequency.setValueAtTime(3_600, context.currentTime);
    reverbGain.gain.setValueAtTime(0.115, context.currentTime);
    compressor.threshold.setValueAtTime(-12, context.currentTime);
    compressor.knee.setValueAtTime(10, context.currentTime);
    compressor.ratio.setValueAtTime(3.2, context.currentTime);
    compressor.attack.setValueAtTime(0.004, context.currentTime);
    compressor.release.setValueAtTime(0.24, context.currentTime);
    master.connect(dryGain);
    dryGain.connect(compressor);
    master.connect(reverb);
    reverb.connect(reverbFilter);
    reverbFilter.connect(reverbGain);
    reverbGain.connect(compressor);
    compressor.connect(context.destination);
    this.master = master;
    this.compressor = compressor;
    this.dryGain = dryGain;
    this.reverb = reverb;
    this.reverbFilter = reverbFilter;
    this.reverbGain = reverbGain;
    this.hammerBuffer = hammerBuffer;
  }

  private releaseVoice(voice: Voice, releaseSeconds: number): void {
    if (voice.released || !this.context) return;
    voice.released = true;

    const releaseAt = this.context.currentTime;
    holdAudioParam(voice.envelope.gain, releaseAt);
    voice.envelope.gain.exponentialRampToValueAtTime(
      MIN_GAIN,
      releaseAt + releaseSeconds,
    );

    for (const oscillator of voice.oscillators) {
      try {
        oscillator.stop(releaseAt + releaseSeconds + 0.025);
      } catch {
        // The voice may already have reached its natural scheduled stop.
      }
    }
  }
}

export function createPianoSynth(options?: PianoSynthOptions): PianoSynth {
  return new PianoSynth(options);
}

export default createPianoSynth;
