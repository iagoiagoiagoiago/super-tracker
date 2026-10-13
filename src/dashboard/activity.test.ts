import { describe, expect, it } from 'vitest'
import type { BjjSession, Workout } from '../db/schema'
import { emptyDraft } from '../bjj/sessions'
import { activityGrid, GYM_ASSUMED_RPE, weekStart, weekStreak, weeklyLoad } from './activity'

// Thursday 15 Oct 2026, 18:00 local (Monday is the 12th)
const NOW = new Date(2026, 9, 15, 18).getTime()
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime()
const workout = (t: number, min = 60): Workout => ({ id: String(t), name: 'ANT', startedAt: t, endedAt: t + min * 60000, source: 'app' })
const bjj = (t: number, min = 90, rpe = 8): BjjSession => ({ id: String(t), ...emptyDraft(t), durationMin: min, rpe })

describe('dashboard activity', () => {
  it('starts weeks on Monday', () => {
    expect(new Date(weekStart(NOW)).getDate()).toBe(12)
  })

  it('builds a 12-week grid ending this week, marking future days', () => {
    const grid = activityGrid([workout(at(2026, 10, 12))], [bjj(at(2026, 10, 13))], NOW)
    expect(grid).toHaveLength(12)
    const thisWeek = grid[11]
    expect(thisWeek[0].gym).toEqual(['ANT'])
    expect(thisWeek[1].bjj).toHaveLength(1)
    expect(thisWeek[3].future).toBe(false)
    expect(thisWeek[4].future).toBe(true)
  })

  it('sums load per week and sport', () => {
    const load = weeklyLoad([workout(at(2026, 10, 13), 60)], [bjj(at(2026, 10, 14), 90, 8), bjj(at(2026, 10, 7), 60, 5)], NOW, 2)
    expect(load[1]).toMatchObject({ gym: 60 * GYM_ASSUMED_RPE, bjj: 720, gymSessions: 1, bjjSessions: 1 })
    expect(load[0]).toMatchObject({ gym: 0, bjj: 300 })
  })

  it('counts the week streak without breaking on an empty current week', () => {
    const ws = [workout(at(2026, 10, 6)), workout(at(2026, 9, 29)), workout(at(2026, 9, 15))]
    expect(weekStreak(ws, [], NOW)).toBe(2)
    expect(weekStreak([...ws, workout(at(2026, 10, 14))], [], NOW)).toBe(3)
  })
})
