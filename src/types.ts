/** Which hand owns a note in the learning score. */
export type Hand = "left" | "right";

/** A small, UI-friendly difficulty scale shared by songs and lessons. */
export type Difficulty = "Beginner" | "Easy" | "Intermediate" | "Advanced";

export type SongSource =
  | "exercise"
  | "traditional"
  | "public-domain"
  | "imported";

/**
 * A playable MIDI note. `time` and `duration` are expressed in seconds from
 * the start of the song; `midi` and `velocity` follow the MIDI 0–127 range.
 */
export interface SongNote {
  id: string;
  midi: number;
  time: number;
  duration: number;
  velocity: number;
  hand: Hand;
}

export interface Song {
  id: string;
  title: string;
  composer: string;
  description: string;
  difficulty: Difficulty;
  bpm: number;
  /** Total playback length in seconds, including a short release tail. */
  duration: number;
  key: string;
  signature: string;
  source: SongSource;
  /** CSS color used to theme the song throughout the interface. */
  accent: string;
  notes: SongNote[];
  tags: string[];
  featured?: boolean;
}

export type LessonKind =
  | "guided"
  | "technique"
  | "theory"
  | "song"
  | "challenge";

export type LessonHandFocus = Hand | "hands-together";

export interface Lesson {
  id: string;
  unitId: string;
  order: number;
  title: string;
  subtitle: string;
  description: string;
  durationMinutes: number;
  difficulty: Difficulty;
  kind: LessonKind;
  skills: string[];
  objectives: string[];
  tips: string[];
  prerequisiteIds: string[];
  songId?: string;
  handFocus?: LessonHandFocus;
}

export interface CourseUnit {
  id: string;
  order: number;
  /** Short progression label shown above the unit title. */
  level: string;
  eyebrow: string;
  title: string;
  description: string;
  outcome: string;
  difficulty: Difficulty;
  estimatedMinutes: number;
  accent: string;
  lessonIds: string[];
}
