import type { BjjSession, Workout } from '../db/schema'
import { sessionLoad } from '../bjj/sessions'

const DAY = 86_400_000

/** Gym workouts have no RPE (Strong doesn't record one), so their load assumes this session RPE. */
export const GYM_ASSUMED_RPE = 7

/** Local midnight of the given day. */
export function dayStart(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Monday 00:00 (local) of the week containing t. */
export function weekStart(t: number): number {
  const d = new Date(dayStart(t))
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  return d.getTime()
}

const addDays = (t: number, n: number) => {
  const d = new Date(t)
  d.setDate(d.getDate() + n)
  return d.getTime()
}

export interface DayCell {
  date: number
  gym: string[]
  bjj: string[]
  future: boolean
}

/** Weeks × 7 grid (Monday first), oldest week first, ending with the current week. */
export function activityGrid(workouts: Workout[], sessions: BjjSession[], now: number, weeks = 12): DayCell[][] {
  const first = addDays(weekStart(now), -7 * (weeks - 1))
  const byDay = new Map<number, DayCell>()
  const grid: DayCell[][] = []
  for (let w = 0; w < weeks; w++) {
    const col: DayCell[] = []
    for (let d = 0; d < 7; d++) {
      const date = addDays(first, w * 7 + d)
      const cell = { date, gym: [], bjj: [], future: date > now }
      byDay.set(date, cell)
      col.push(cell)
    }
    grid.push(col)
  }
  for (const w of workouts) if (w.endedAt) byDay.get(dayStart(w.startedAt))?.gym.push(w.name)
  for (const s of sessions) byDay.get(dayStart(s.date))?.bjj.push('BJJ')
  return grid
}

export interface WeekLoad {
  start: number
  gym: number
  bjj: number
  gymSessions: number
  bjjSessions: number
}

/** Training load per week (minutes × RPE), split by sport, oldest first, ending with the current week. */
export function weeklyLoad(workouts: Workout[], sessions: BjjSession[], now: number, weeks = 8): WeekLoad[] {
  const current = weekStart(now)
  const out: WeekLoad[] = Array.from({ length: weeks }, (_, i) => ({
    start: addDays(current, -7 * (weeks - 1 - i)),
    gym: 0,
    bjj: 0,
    gymSessions: 0,
    bjjSessions: 0,
  }))
  const idx = (t: number) => out.findIndex((w) => w.start === weekStart(t))
  for (const w of workouts) {
    if (!w.endedAt) continue
    const i = idx(w.startedAt)
    if (i < 0) continue
    out[i].gym += Math.round((w.endedAt - w.startedAt) / 60000) * GYM_ASSUMED_RPE
    out[i].gymSessions++
  }
  for (const s of sessions) {
    const i = idx(s.date)
    if (i < 0) continue
    out[i].bjj += sessionLoad(s)
    out[i].bjjSessions++
  }
  return out
}

/** Consecutive weeks (including the current one if it already has a session) with at least one session. */
export function weekStreak(workouts: Workout[], sessions: BjjSession[], now: number): number {
  const active = new Set<number>()
  for (const w of workouts) if (w.endedAt) active.add(weekStart(w.startedAt))
  for (const s of sessions) active.add(weekStart(s.date))
  let week = weekStart(now)
  // The current week only breaks the streak once it's over.
  if (!active.has(week)) week = addDays(week, -7)
  let n = 0
  while (active.has(week)) {
    n++
    week = addDays(week, -7)
  }
  return n
}

export { DAY }
