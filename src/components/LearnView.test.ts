import { describe, expect, it } from 'vitest'

import { lessons } from '../data/curriculum'
import { getLessonPathState } from '../lib/lessonPath'

describe('open lesson path', () => {
  it('recommends the next lesson while leaving later lessons available', () => {
    const completed = [lessons[0].id, lessons[1].id]
    const recommended = lessons[2].id

    expect(getLessonPathState(lessons[0], completed, recommended)).toBe('done')
    expect(getLessonPathState(lessons[2], completed, recommended)).toBe('current')
    expect(getLessonPathState(lessons.at(-1)!, completed, recommended)).toBe('available')
  })

  it('never returns a locked state for an incomplete lesson', () => {
    const states = lessons.map((lesson) => getLessonPathState(lesson, [], lessons[0].id))
    expect(states).toContain('current')
    expect(states).toContain('available')
    expect(states).not.toContain('locked')
  })
})
