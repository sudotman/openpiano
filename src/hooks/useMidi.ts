import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A deliberately small subset of the Web MIDI interfaces. Keeping these local
 * makes the hook compile in TypeScript DOM versions that do not ship Web MIDI
 * declarations while still using the native browser objects at runtime.
 */
interface MidiInputLike {
  id: string;
  manufacturer?: string | null;
  name?: string | null;
  state?: "connected" | "disconnected";
  connection?: "closed" | "open" | "pending";
  addEventListener(type: "midimessage", listener: EventListener): void;
  removeEventListener(type: "midimessage", listener: EventListener): void;
  open?: () => Promise<MidiInputLike>;
  close?: () => Promise<MidiInputLike>;
}

interface MidiAccessLike {
  inputs: {
    values(): IterableIterator<MidiInputLike>;
  };
  addEventListener(type: "statechange", listener: EventListener): void;
  removeEventListener(type: "statechange", listener: EventListener): void;
}

interface MidiMessageEventLike extends Event {
  data: Uint8Array;
}

interface NavigatorWithMidi {
  requestMIDIAccess(options?: { sysex?: boolean }): Promise<MidiAccessLike>;
}

export type MidiStatus =
  | "unsupported"
  | "idle"
  | "requesting"
  | "ready"
  | "connected"
  | "disconnected"
  | "error";

export interface MidiInputDevice {
  id: string;
  name: string;
  manufacturer: string;
  state: "connected" | "disconnected" | "unknown";
  connection: "closed" | "open" | "pending" | "unknown";
}

export interface MidiNoteEvent {
  type: "noteon" | "noteoff";
  /** MIDI note number, 0–127. */
  note: number;
  /** Alias of `note`, useful when sharing handlers with song notes. */
  midi: number;
  /** MIDI velocity, 0–127. */
  velocity: number;
  timestamp: number;
  source: "midi" | "virtual";
  inputId: string | null;
}

export interface UseMidiOptions {
  /** Select the first connected input after permission is granted. */
  autoSelect?: boolean;
  onNoteOn?: (event: MidiNoteEvent) => void;
  onNoteOff?: (event: MidiNoteEvent) => void;
}

export interface UseMidiResult {
  isSupported: boolean;
  hasAccess: boolean;
  isConnected: boolean;
  status: MidiStatus;
  error: string | null;
  inputs: MidiInputDevice[];
  selectedInputId: string | null;
  selectedInput: MidiInputDevice | null;
  activeNotes: Set<number>;
  /** Current note-on velocities in the MIDI 0–127 range. */
  velocities: Map<number, number>;
  lastEvent: MidiNoteEvent | null;
  requestAccess: () => Promise<boolean>;
  requestMidiAccess: () => Promise<boolean>;
  selectInput: (inputId: string | null) => boolean;
  virtualNoteOn: (note: number, velocity?: number) => void;
  virtualNoteOff: (note: number, velocity?: number) => void;
  noteOn: (note: number, velocity?: number) => void;
  noteOff: (note: number, velocity?: number) => void;
  resetActiveNotes: () => void;
}

function supportsWebMidi(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof (navigator as unknown as Partial<NavigatorWithMidi>)
      .requestMIDIAccess ===
      "function"
  );
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function clampMidiNote(note: number): number | null {
  if (!Number.isFinite(note)) return null;
  const rounded = Math.round(note);
  return rounded >= 0 && rounded <= 127 ? rounded : null;
}

/** Accept both MIDI velocity (0–127) and convenient normalized values (0–1). */
function toMidiVelocity(velocity: number | undefined, fallback = 100): number {
  if (velocity === undefined || !Number.isFinite(velocity)) return fallback;
  const midiVelocity = velocity > 0 && velocity <= 1 ? velocity * 127 : velocity;
  return Math.max(0, Math.min(127, Math.round(midiVelocity)));
}

function describeInput(input: MidiInputLike): MidiInputDevice {
  return {
    id: input.id,
    name: input.name?.trim() || "Unnamed MIDI input",
    manufacturer: input.manufacturer?.trim() || "Unknown manufacturer",
    state: input.state ?? "unknown",
    connection: input.connection ?? "unknown",
  };
}

function readInputs(access: MidiAccessLike): MidiInputDevice[] {
  return Array.from(access.inputs.values(), describeInput).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

function findNativeInput(
  access: MidiAccessLike,
  inputId: string,
): MidiInputLike | null {
  return (
    Array.from(access.inputs.values()).find((input) => input.id === inputId) ??
    null
  );
}

function midiAccessError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "SecurityError") {
      return "MIDI access requires a secure page (HTTPS or localhost).";
    }
    if (error.name === "NotAllowedError") {
      return "MIDI permission was denied. Allow MIDI access in your browser and try again.";
    }
  }

  if (error instanceof Error && error.message) {
    return `Could not access MIDI devices: ${error.message}`;
  }

  return "Could not access MIDI devices. Check the keyboard connection and browser permission.";
}

/**
 * Connects a React view to a hardware MIDI input. Permission is intentionally
 * requested only by `requestAccess`, so callers can invoke it from a click or
 * tap (the browser-required user gesture).
 */
export function useMidi(options: UseMidiOptions = {}): UseMidiResult {
  const { autoSelect = true } = options;
  const isSupported = supportsWebMidi();
  const [access, setAccess] = useState<MidiAccessLike | null>(null);
  const [inputs, setInputs] = useState<MidiInputDevice[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string | null>(null);
  const [status, setStatus] = useState<MidiStatus>(() =>
    isSupported ? "idle" : "unsupported",
  );
  const [error, setError] = useState<string | null>(null);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(() => new Set());
  const [velocities, setVelocities] = useState<Map<number, number>>(
    () => new Map(),
  );
  const [lastEvent, setLastEvent] = useState<MidiNoteEvent | null>(null);

  const mountedRef = useRef(true);
  const requestPromiseRef = useRef<Promise<boolean> | null>(null);
  const activeNotesRef = useRef<Set<number>>(new Set());
  const velocitiesRef = useRef<Map<number, number>>(new Map());
  const callbacksRef = useRef({
    onNoteOn: options.onNoteOn,
    onNoteOff: options.onNoteOff,
  });
  const autoSelectRef = useRef(autoSelect);

  callbacksRef.current = {
    onNoteOn: options.onNoteOn,
    onNoteOff: options.onNoteOff,
  };
  autoSelectRef.current = autoSelect;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const emitNoteOn = useCallback(
    (
      noteValue: number,
      velocityValue: number,
      source: MidiNoteEvent["source"],
      inputId: string | null,
      timestamp = now(),
    ) => {
      const note = clampMidiNote(noteValue);
      if (note === null) return;

      const velocity = toMidiVelocity(velocityValue);
      if (velocity === 0) return;

      const nextNotes = new Set(activeNotesRef.current);
      const nextVelocities = new Map(velocitiesRef.current);
      nextNotes.add(note);
      nextVelocities.set(note, velocity);
      activeNotesRef.current = nextNotes;
      velocitiesRef.current = nextVelocities;
      setActiveNotes(nextNotes);
      setVelocities(nextVelocities);

      const event: MidiNoteEvent = {
        type: "noteon",
        note,
        midi: note,
        velocity,
        timestamp,
        source,
        inputId,
      };
      setLastEvent(event);
      callbacksRef.current.onNoteOn?.(event);
    },
    [],
  );

  const emitNoteOff = useCallback(
    (
      noteValue: number,
      velocityValue: number,
      source: MidiNoteEvent["source"],
      inputId: string | null,
      timestamp = now(),
    ) => {
      const note = clampMidiNote(noteValue);
      if (note === null) return;

      const nextNotes = new Set(activeNotesRef.current);
      const nextVelocities = new Map(velocitiesRef.current);
      nextNotes.delete(note);
      nextVelocities.delete(note);
      activeNotesRef.current = nextNotes;
      velocitiesRef.current = nextVelocities;
      setActiveNotes(nextNotes);
      setVelocities(nextVelocities);

      const event: MidiNoteEvent = {
        type: "noteoff",
        note,
        midi: note,
        velocity: toMidiVelocity(velocityValue, 0),
        timestamp,
        source,
        inputId,
      };
      setLastEvent(event);
      callbacksRef.current.onNoteOff?.(event);
    },
    [],
  );

  const resetActiveNotes = useCallback(() => {
    const notes = Array.from(activeNotesRef.current);
    for (const note of notes) {
      emitNoteOff(note, 0, "midi", selectedInputId);
    }
  }, [emitNoteOff, selectedInputId]);

  const refreshInputs = useCallback((midiAccess: MidiAccessLike) => {
    const nextInputs = readInputs(midiAccess);
    if (!mountedRef.current) return nextInputs;

    setInputs(nextInputs);
    setSelectedInputId((currentId) => {
      const current = nextInputs.find((input) => input.id === currentId);
      if (current && current.state !== "disconnected") return currentId;

      if (autoSelectRef.current) {
        const connected = nextInputs.find(
          (input) => input.state !== "disconnected",
        );
        if (connected) return connected.id;
      }

      // Retain a disconnected device id so reconnecting the same keyboard can
      // restore it automatically when no replacement input is available.
      return currentId;
    });
    return nextInputs;
  }, []);

  const requestAccess = useCallback(async (): Promise<boolean> => {
    if (access) {
      refreshInputs(access);
      return true;
    }

    if (!supportsWebMidi()) {
      if (mountedRef.current) {
        setStatus("unsupported");
        setError(
          "This browser does not support Web MIDI. Use a current Chromium-based browser such as Chrome or Edge.",
        );
      }
      return false;
    }

    if (requestPromiseRef.current) return requestPromiseRef.current;

    const request = (async () => {
      setStatus("requesting");
      setError(null);
      try {
        const midiAccess = await (
          navigator as unknown as NavigatorWithMidi
        ).requestMIDIAccess({ sysex: false });

        if (!mountedRef.current) return false;
        setAccess(midiAccess);
        const nextInputs = refreshInputs(midiAccess);
        setStatus("ready");

        if (autoSelectRef.current) {
          const firstConnected = nextInputs.find(
            (input) => input.state !== "disconnected",
          );
          if (firstConnected) setSelectedInputId(firstConnected.id);
        }
        return true;
      } catch (requestError) {
        if (mountedRef.current) {
          setStatus("error");
          setError(midiAccessError(requestError));
        }
        return false;
      } finally {
        requestPromiseRef.current = null;
      }
    })();

    requestPromiseRef.current = request;
    return request;
  }, [access, refreshInputs]);

  useEffect(() => {
    if (!access) return;

    const handleStateChange: EventListener = () => {
      refreshInputs(access);
    };
    access.addEventListener("statechange", handleStateChange);
    return () => {
      access.removeEventListener("statechange", handleStateChange);
    };
  }, [access, refreshInputs]);

  const selectedInput =
    inputs.find((input) => input.id === selectedInputId) ?? null;

  useEffect(() => {
    if (!access || !selectedInputId) {
      if (access) setStatus("ready");
      return;
    }

    const input = findNativeInput(access, selectedInputId);
    if (!input || input.state === "disconnected") {
      setStatus("disconnected");
      resetActiveNotes();
      return;
    }

    let cancelled = false;
    const handleMidiMessage: EventListener = (nativeEvent) => {
      const event = nativeEvent as MidiMessageEventLike;
      const data = event.data;
      if (!data || data.length < 2) return;

      const command = data[0] & 0xf0;
      const dataOne = data[1] & 0x7f;
      const dataTwo = (data[2] ?? 0) & 0x7f;

      if (command === 0x90 && dataTwo > 0) {
        emitNoteOn(dataOne, dataTwo, "midi", input.id, event.timeStamp);
      } else if (command === 0x80 || (command === 0x90 && dataTwo === 0)) {
        emitNoteOff(dataOne, dataTwo, "midi", input.id, event.timeStamp);
      } else if (command === 0xb0 && (dataOne === 120 || dataOne === 123)) {
        // MIDI CC 120/123: all sound / all notes off.
        resetActiveNotes();
      }
    };

    input.addEventListener("midimessage", handleMidiMessage);
    setError(null);

    if (input.open) {
      void input
        .open()
        .then(() => {
          if (!cancelled && mountedRef.current) setStatus("connected");
        })
        .catch((openError: unknown) => {
          if (!cancelled && mountedRef.current) {
            setStatus("error");
            setError(midiAccessError(openError));
          }
        });
    } else {
      setStatus("connected");
    }

    return () => {
      cancelled = true;
      input.removeEventListener("midimessage", handleMidiMessage);
      if (input.close) void input.close().catch(() => undefined);
      resetActiveNotes();
    };
  }, [
    access,
    emitNoteOff,
    emitNoteOn,
    resetActiveNotes,
    selectedInput?.state,
    selectedInputId,
  ]);

  const selectInput = useCallback(
    (inputId: string | null): boolean => {
      if (inputId === null) {
        setSelectedInputId(null);
        setError(null);
        resetActiveNotes();
        return true;
      }

      const selected = inputs.find((input) => input.id === inputId);
      if (!selected) {
        setStatus("error");
        setError("That MIDI input is no longer available. Reconnect it and try again.");
        return false;
      }

      setError(null);
      setSelectedInputId(inputId);
      return true;
    },
    [inputs, resetActiveNotes],
  );

  const virtualNoteOn = useCallback(
    (note: number, velocity = 100) => {
      emitNoteOn(note, velocity, "virtual", null);
    },
    [emitNoteOn],
  );

  const virtualNoteOff = useCallback(
    (note: number, velocity = 0) => {
      emitNoteOff(note, velocity, "virtual", null);
    },
    [emitNoteOff],
  );

  return {
    isSupported,
    hasAccess: access !== null,
    isConnected: status === "connected",
    status,
    error,
    inputs,
    selectedInputId,
    selectedInput,
    activeNotes,
    velocities,
    lastEvent,
    requestAccess,
    requestMidiAccess: requestAccess,
    selectInput,
    virtualNoteOn,
    virtualNoteOff,
    noteOn: virtualNoteOn,
    noteOff: virtualNoteOff,
    resetActiveNotes,
  };
}

export default useMidi;
