import type { Lesson } from '../types'

export type LessonPathState = 'done' | 'current' | 'available'

/** Guided order is advisory: one lesson is recommended and every other lesson stays open. */
export function getLessonPathState(
  lesson: Lesson,
  completedLessonIds: readonly string[],
  recommendedLessonId?: string,
): LessonPathState {
  if (completedLessonIds.includes(lesson.id)) return 'done'
  if (lesson.id === recommendedLessonId) return 'current'
  return 'available'
}
