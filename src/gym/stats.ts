import type { Exercise, ID, MuscleGroup, Workout, WorkoutSet } from '../db/schema'
import { setE1rm } from '../lib/gym'
import { TRACKED_MUSCLES } from '../lib/exerciseCatalog'

// ---------- Personal records ----------

export type PRKind = 'weight' | 'e1rm' | 'volume' | 'reps' | 'duration'

export const PR_LABEL: Record<PRKind, string> = {
  weight: 'WEIGHT',
  e1rm: '1RM',
  volume: 'VOLUME',
  reps: 'REPS',
  duration: 'TIME',
}

export interface PREvent {
  setId: ID
  workoutId: ID
  exerciseId: ID
  at: number
  kinds: PRKind[]
}

/** The metrics a set can set a record in, by exercise type. */
function metrics(set: WorkoutSet, ex: Exercise): Partial<Record<PRKind, number>> {
  switch (ex.kind) {
    case 'weight_reps':
      return { weight: set.weight ?? 0, e1rm: setE1rm(set, ex.kind) ?? 0, volume: (set.weight ?? 0) * (set.reps ?? 0) }
    case 'bodyweight_plus':
      return { weight: set.weight ?? 0, reps: set.reps ?? 0 }
    case 'reps_only':
      return { reps: set.reps ?? 0 }
    case 'duration':
      return { duration: set.seconds ?? 0 }
  }
}

/**
 * Walks every finished workout in order and records which sets beat the exercise's previous best.
 * Only the first set reaching a new best within a workout gets the record. An exercise's first session
 * sets the baseline and earns no records (otherwise every new exercise would be all PRs).
 */
export function computePRs(workouts: Workout[], sets: WorkoutSet[], exercises: Map<ID, Exercise>): PREvent[] {
  const setsByWorkout = new Map<ID, WorkoutSet[]>()
  for (const s of sets) {
    if (!s.done || s.kind === 'warmup') continue
    setsByWorkout.set(s.workoutId, [...(setsByWorkout.get(s.workoutId) ?? []), s])
  }
  const best = new Map<ID, Partial<Record<PRKind, number>>>()
  const events = new Map<ID, PREvent>()

  for (const w of [...workouts].filter((x) => x.endedAt).sort((a, b) => a.startedAt - b.startedAt)) {
    const ws = (setsByWorkout.get(w.id) ?? []).sort((a, b) => a.exerciseOrder - b.exerciseOrder || a.setNumber - b.setNumber)
    const sessionBest = new Map<ID, Partial<Record<PRKind, { value: number; set: WorkoutSet }>>>()
    for (const s of ws) {
      const ex = exercises.get(s.exerciseId)
      if (!ex) continue
      const cur = sessionBest.get(ex.id) ?? {}
      for (const [k, v] of Object.entries(metrics(s, ex)) as [PRKind, number][]) {
        if (v > 0 && (!cur[k] || v > cur[k]!.value)) cur[k] = { value: v, set: s }
      }
      sessionBest.set(ex.id, cur)
    }
    for (const [exId, cur] of sessionBest) {
      const prev = best.get(exId)
      const next = { ...(prev ?? {}) }
      for (const [k, { value, set }] of Object.entries(cur) as [PRKind, { value: number; set: WorkoutSet }][]) {
        if (prev && value > (prev[k] ?? 0)) {
          const e = events.get(set.id) ?? { setId: set.id, workoutId: w.id, exerciseId: exId, at: w.startedAt, kinds: [] }
          e.kinds.push(k)
          events.set(set.id, e)
        }
        next[k] = Math.max(value, next[k] ?? 0)
      }
      best.set(exId, next)
    }
  }
  return [...events.values()].sort((a, b) => a.at - b.at)
}

// ---------- Per-exercise series ----------

export interface SessionPoint {
  t: number
  workoutId: ID
  e1rm?: number
  weight?: number
  volume: number
  reps?: number
}

/** One point per workout: best e1RM, heaviest weight, total volume and most reps for this exercise. */
export function exerciseSeries(exercise: Exercise, workouts: Map<ID, Workout>, sets: WorkoutSet[]): SessionPoint[] {
  const by = new Map<ID, SessionPoint>()
  for (const s of sets) {
    if (!s.done || s.kind === 'warmup' || s.exerciseId !== exercise.id) continue
    const w = workouts.get(s.workoutId)
    if (!w?.endedAt) continue
    const p = by.get(w.id) ?? { t: w.startedAt, workoutId: w.id, volume: 0 }
    const est = setE1rm(s, exercise.kind)
    if (est && est > (p.e1rm ?? 0)) p.e1rm = est
    if (s.weight && s.weight > (p.weight ?? 0)) p.weight = s.weight
    if (s.reps && s.reps > (p.reps ?? 0)) p.reps = s.reps
    p.volume += (s.weight ?? 0) * (s.reps ?? 0)
    by.set(w.id, p)
  }
  return [...by.values()].sort((a, b) => a.t - b.t)
}

/** e1RM trend of one exercise between `from` and `now` (best e1RM per session). */
export function liftTrend(exercise: Exercise, workouts: Workout[], sets: WorkoutSet[], from: number, now: number): LiftSummary {
  const wMap = new Map(workouts.filter((w) => w.endedAt && w.startedAt >= from && w.startedAt <= now).map((w) => [w.id, w]))
  const own = sets.filter((s) => s.exerciseId === exercise.id && s.done && s.kind !== 'warmup' && wMap.has(s.workoutId))
  const points = exerciseSeries(exercise, wMap, own).flatMap((p) => (p.e1rm ? [p.e1rm] : []))
  let best = 0
  let bestSet: WorkoutSet | undefined
  for (const s of own) {
    const est = setE1rm(s, exercise.kind) ?? 0
    if (est > best) {
      best = est
      bestSet = s
    }
  }
  return {
    exercise,
    best,
    bestSet,
    delta: points.length > 1 ? points[points.length - 1] - points[0] : 0,
    points,
    sessions: new Set(own.map((s) => s.workoutId)).size,
  }
}

// ---------- Gym tab ----------

export type RangeKey = '4W' | '12W' | '1Y' | 'ALL'

export const RANGE_DAYS: Record<RangeKey, number | null> = { '4W': 28, '12W': 84, '1Y': 365, ALL: null }

const DAY = 86_400_000

export interface LiftSummary {
  exercise: Exercise
  best: number
  bestSet?: WorkoutSet
  delta: number
  points: number[]
  sessions: number
}

export interface GymStats {
  workouts: number
  volume: number
  avgDurationMs: number
  prs: number
  lifts: LiftSummary[]
  muscles: { group: MuscleGroup; setsPerWeek: number }[]
  mostTrained: { exercise: Exercise; sessions: number }[]
  weeks: number
  /** Working (non-warm-up) sets per week over the period. */
  setsPerWeek: number
  progress: { exercises: ExerciseProgress[]; muscles: MuscleProgress[] }
}

export function gymStats(
  range: RangeKey,
  workouts: Workout[],
  sets: WorkoutSet[],
  exercises: Map<ID, Exercise>,
  prs: PREvent[],
  now = Date.now(),
): GymStats {
  const finished = workouts.filter((w) => w.endedAt)
  const days = RANGE_DAYS[range]
  const firstEver = finished.length ? Math.min(...finished.map((w) => w.startedAt)) : now
  const from = days === null ? firstEver : now - days * DAY
  const inRange = finished.filter((w) => w.startedAt >= from && w.startedAt <= now)
  const wMap = new Map(inRange.map((w) => [w.id, w]))
  const rSets = sets.filter((s) => s.done && s.kind !== 'warmup' && wMap.has(s.workoutId))
  const weeks = Math.max(1, (now - from) / (7 * DAY))

  const volume = rSets.reduce((n, s) => n + (s.weight ?? 0) * (s.reps ?? 0), 0)
  const avgDurationMs = inRange.length
    ? inRange.reduce((n, w) => n + (w.endedAt! - w.startedAt), 0) / inRange.length
    : 0

  // Sessions per exercise
  const sessions = new Map<ID, Set<ID>>()
  for (const s of rSets) sessions.set(s.exerciseId, (sessions.get(s.exerciseId) ?? new Set()).add(s.workoutId))

  const mostTrained = [...sessions.entries()]
    .map(([id, ws]) => ({ exercise: exercises.get(id)!, sessions: ws.size }))
    .filter((x) => x.exercise)
    .sort((a, b) => b.sessions - a.sessions || a.exercise.name.localeCompare(b.exercise.name))
    .slice(0, 5)

  // Best lifts: loaded exercises trained in at least two sessions, most trained first.
  const lifts: LiftSummary[] = []
  for (const { exercise, sessions: n } of [...sessions.entries()]
    .map(([id, ws]) => ({ exercise: exercises.get(id)!, sessions: ws.size }))
    .filter((x) => x.exercise?.kind === 'weight_reps' && x.sessions >= 2)
    .sort((a, b) => b.sessions - a.sessions)) {
    const series = exerciseSeries(exercise, wMap, rSets).filter((p) => p.e1rm)
    if (series.length < 2) continue
    let bestSet: WorkoutSet | undefined
    let best = 0
    for (const s of rSets) {
      if (s.exerciseId !== exercise.id) continue
      const est = setE1rm(s, exercise.kind) ?? 0
      if (est > best) {
        best = est
        bestSet = s
      }
    }
    const points = series.map((p) => p.e1rm!)
    lifts.push({ exercise, best, bestSet, delta: points[points.length - 1] - points[0], points, sessions: n })
    if (lifts.length === 4) break
  }

  // Working sets per muscle group per week. Every tracked muscle is listed, even at zero: a gap is information.
  const perGroup = new Map<MuscleGroup, number>(TRACKED_MUSCLES.map((g) => [g, 0]))
  for (const s of rSets) {
    const g = exercises.get(s.exerciseId)?.muscleGroup
    if (g) perGroup.set(g, (perGroup.get(g) ?? 0) + 1)
  }
  const muscles = [...perGroup.entries()]
    .map(([group, n]) => ({ group, setsPerWeek: n / weeks }))
    .sort((a, b) => b.setsPerWeek - a.setsPerWeek)

  const progress = progressRates(exercises, wMap, rSets, sessions)

  return {
    workouts: inRange.length,
    volume,
    setsPerWeek: rSets.length / weeks,
    avgDurationMs,
    prs: prs.filter((p) => wMap.has(p.workoutId)).length,
    lifts,
    muscles,
    mostTrained,
    weeks,
    progress,
  }
}

// ---------- Progress rates ----------

/** An exercise needs this many sessions, spread over at least this many days, to get a progress rate. */
export const PROGRESS_MIN_SESSIONS = 4
export const PROGRESS_MIN_SPAN_DAYS = 21
/** Rates are shrunk toward 0 by n / (n + this), so a lift backed by few sessions can't top the list on luck. */
export const PROGRESS_SHRINK = 4

export interface ExerciseProgress {
  exercise: Exercise
  /** e1RM change in % per 30 days: least-squares fit over the period's sessions, shrunk by session count. */
  ratePerMonth: number
  sessions: number
  from: number
  to: number
}

export interface MuscleProgress {
  group: MuscleGroup
  /** Session-weighted mean of its exercises' rates. */
  ratePerMonth: number
  exercises: number
}

/** Least-squares slope of y over x. */
function slope(points: { x: number; y: number }[]): number {
  const n = points.length
  const mx = points.reduce((a, p) => a + p.x, 0) / n
  const my = points.reduce((a, p) => a + p.y, 0) / n
  let num = 0
  let den = 0
  for (const p of points) {
    num += (p.x - mx) * (p.y - my)
    den += (p.x - mx) ** 2
  }
  return den ? num / den : 0
}

/**
 * How fast each loaded lift's estimated 1RM is moving, as % per month. A regression over every session is far
 * less noisy than first-vs-last (one bad day doesn't flip the result).
 */
export function progressRates(
  exercises: Map<ID, Exercise>,
  workouts: Map<ID, Workout>,
  sets: WorkoutSet[],
  sessions: Map<ID, Set<ID>>,
): { exercises: ExerciseProgress[]; muscles: MuscleProgress[] } {
  const out: ExerciseProgress[] = []
  for (const [id, ws] of sessions) {
    const exercise = exercises.get(id)
    if (!exercise || exercise.kind !== 'weight_reps' || ws.size < PROGRESS_MIN_SESSIONS) continue
    const pts = exerciseSeries(exercise, workouts, sets).flatMap((p) => (p.e1rm ? [{ x: p.t / DAY, y: p.e1rm }] : []))
    if (pts.length < PROGRESS_MIN_SESSIONS || pts[pts.length - 1].x - pts[0].x < PROGRESS_MIN_SPAN_DAYS) continue
    const mean = pts.reduce((a, p) => a + p.y, 0) / pts.length
    out.push({
      exercise,
      ratePerMonth: ((slope(pts) * 30) / mean) * 100 * (pts.length / (pts.length + PROGRESS_SHRINK)),
      sessions: pts.length,
      from: pts[0].x * DAY,
      to: pts[pts.length - 1].x * DAY,
    })
  }
  out.sort((a, b) => b.ratePerMonth - a.ratePerMonth)

  const byGroup = new Map<MuscleGroup, { sum: number; weight: number; n: number }>()
  for (const p of out) {
    const g = p.exercise.muscleGroup
    if (g === 'other' || g === 'full_body') continue
    const cur = byGroup.get(g) ?? { sum: 0, weight: 0, n: 0 }
    cur.sum += p.ratePerMonth * p.sessions
    cur.weight += p.sessions
    cur.n++
    byGroup.set(g, cur)
  }
  const muscles = [...byGroup.entries()]
    .map(([group, v]) => ({ group, ratePerMonth: v.sum / v.weight, exercises: v.n }))
    .sort((a, b) => b.ratePerMonth - a.ratePerMonth)

  return { exercises: out, muscles }
}
