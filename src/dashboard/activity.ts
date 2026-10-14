import type { BjjSession, Workout } from '../db/schema'
import { isBareSession, sessionLoad } from '../bjj/sessions'

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
  /** BJJ sessions that day; `bare` = attendance only (nothing logged), safe to remove from the calendar. */
  bjjIds: { id: string; bare: boolean }[]
  future: boolean
}

export interface MonthView {
  year: number
  /** 0–11 */
  month: number
  /** Rows of 7 (Monday first); null pads days outside the month. */
  weeks: (DayCell | null)[][]
  gymSessions: number
  bjjSessions: number
  activeDays: number
}

/** Calendar for one month, Monday-first, with each day's gym workouts and BJJ sessions. */
export function monthGrid(year: number, month: number, workouts: Workout[], sessions: BjjSession[], now: number): MonthView {
  const first = new Date(year, month, 1).getTime()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const lead = (new Date(first).getDay() + 6) % 7
  const cells: (DayCell | null)[] = Array.from({ length: lead }, () => null)
  const byDay = new Map<number, DayCell>()
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d).getTime()
    const cell: DayCell = { date, gym: [], bjj: [], bjjIds: [], future: date > now }
    byDay.set(date, cell)
    cells.push(cell)
  }
  while (cells.length % 7) cells.push(null)

  let gymSessions = 0
  let bjjSessions = 0
  for (const w of workouts) {
    const c = w.endedAt ? byDay.get(dayStart(w.startedAt)) : undefined
    if (c) {
      c.gym.push(w.name)
      gymSessions++
    }
  }
  for (const s of sessions) {
    const c = byDay.get(dayStart(s.date))
    if (c) {
      c.bjj.push('BJJ')
      c.bjjIds.push({ id: s.id, bare: isBareSession(s) })
      bjjSessions++
    }
  }
  const weeks: (DayCell | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  const activeDays = [...byDay.values()].filter((c) => c.gym.length || c.bjj.length).length
  return { year, month, weeks, gymSessions, bjjSessions, activeDays }
}

/** First month (year, month) that has any training, for limiting how far back the calendar goes. */
export function firstActiveMonth(workouts: Workout[], sessions: BjjSession[], now: number): { year: number; month: number } {
  const ts = [...workouts.filter((w) => w.endedAt).map((w) => w.startedAt), ...sessions.map((s) => s.date)]
  const d = new Date(ts.length ? Math.min(...ts) : now)
  return { year: d.getFullYear(), month: d.getMonth() }
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
