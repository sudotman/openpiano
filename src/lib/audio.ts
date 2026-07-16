const MIN_GAIN = 0.0001;
const MAX_VOICE_SECONDS = 18;

interface Voice {
  note: number;
  velocity: number;
  envelope: GainNode;
  oscillators: OscillatorNode[];
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
    const envelope = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(
      Math.min(10_000, Math.max(1_800, fundamental * 7)),
      startedAt,
    );
    filter.Q.setValueAtTime(0.55, startedAt);
    envelope.connect(filter);
    filter.connect(this.master);

    const peak = 0.075 + 0.64 * velocity ** 1.35;
    envelope.gain.setValueAtTime(MIN_GAIN, startedAt);
    envelope.gain.linearRampToValueAtTime(peak, startedAt + 0.008);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(MIN_GAIN, peak * 0.46),
      startedAt + 0.2,
    );
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(MIN_GAIN, peak * 0.12),
      startedAt + 4.2,
    );
    envelope.gain.exponentialRampToValueAtTime(
      MIN_GAIN,
      startedAt + MAX_VOICE_SECONDS,
    );

    const oscillators: OscillatorNode[] = [];
    const partials: Array<{
      ratio: number;
      level: number;
      type: OscillatorType;
      detune?: number;
    }> = [
      { ratio: 1, level: 0.72, type: "triangle" },
      { ratio: 1, level: 0.2, type: "sine", detune: 3.5 },
      { ratio: 2, level: 0.18, type: "sine" },
      { ratio: 3, level: 0.07, type: "sine" },
    ];

    for (const partial of partials) {
      const partialFrequency = fundamental * partial.ratio;
      if (partialFrequency >= context.sampleRate / 2 - 100) continue;

      const oscillator = context.createOscillator();
      const partialGain = context.createGain();
      oscillator.type = partial.type;
      oscillator.frequency.setValueAtTime(partialFrequency, startedAt);
      oscillator.detune.setValueAtTime(partial.detune ?? 0, startedAt);
      partialGain.gain.setValueAtTime(partial.level, startedAt);
      oscillator.connect(partialGain);
      partialGain.connect(envelope);
      oscillator.start(startedAt);
      oscillator.stop(startedAt + MAX_VOICE_SECONDS + 0.05);
      oscillators.push(oscillator);
    }

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
      released: false,
      startedAt,
    };
    this.voices.set(note, voice);

    oscillators[0].addEventListener(
      "ended",
      () => {
        if (this.voices.get(note) === voice) this.voices.delete(note);
        envelope.disconnect();
        filter.disconnect();
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
    this.master = null;
    this.compressor = null;
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
    master.gain.setValueAtTime(this.volume, context.currentTime);
    compressor.threshold.setValueAtTime(-14, context.currentTime);
    compressor.knee.setValueAtTime(12, context.currentTime);
    compressor.ratio.setValueAtTime(4, context.currentTime);
    compressor.attack.setValueAtTime(0.003, context.currentTime);
    compressor.release.setValueAtTime(0.22, context.currentTime);
    master.connect(compressor);
    compressor.connect(context.destination);
    this.master = master;
    this.compressor = compressor;
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
