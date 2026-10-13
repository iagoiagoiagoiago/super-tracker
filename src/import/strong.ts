import { newId, type SuperTrackerDB } from '../db/db'
import type { Exercise, ExerciseKind, MuscleGroup, SetKind, Template, Workout, WorkoutSet } from '../db/schema'
import { guessKind, guessMuscleGroup, nameKey, normalizeName } from '../lib/exerciseCatalog'
import { parseCsv } from './csv'

// ---------- Parsing ----------

export interface ParsedSet {
  kind: SetKind
  weight: number
  reps: number
  seconds: number
  notes?: string
}

export interface ParsedExercise {
  name: string
  restSeconds?: number
  sets: ParsedSet[]
}

export interface ParsedWorkout {
  externalId: string
  name: string
  startedAt: number
  durationMs: number
  notes?: string
  exercises: ParsedExercise[]
}

export class StrongImportError extends Error {}

const REQUIRED = ['Date', 'Workout Name', 'Exercise Name', 'Set Order', 'Weight', 'Reps'] as const

/** "2026-10-13 12:09:23" in local time. */
export function parseStrongDate(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s.trim())
  if (!m) return NaN
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)).getTime()
}

/** "1h 43m", "55m", "2h", "45s" → milliseconds. */
export function parseStrongDuration(s: string): number {
  let ms = 0
  for (const [, n, unit] of s.matchAll(/(\d+)\s*([hms])/g)) {
    ms += +n * (unit === 'h' ? 3_600_000 : unit === 'm' ? 60_000 : 1000)
  }
  return ms
}

const cleanNote = (s: string | undefined) => {
  const t = (s ?? '').replace(/\\n/g, '\n').trim()
  return t || undefined
}

const num = (s: string | undefined) => {
  const v = parseFloat(s ?? '')
  return Number.isFinite(v) ? v : 0
}

function setKind(order: string): SetKind | 'rest' | undefined {
  const o = order.trim()
  if (/^\d+$/.test(o)) return 'normal'
  if (o === 'W') return 'warmup'
  if (o === 'D') return 'drop'
  if (o === 'F') return 'failure'
  if (o === 'Rest Timer') return 'rest'
  return undefined
}

export function parseStrongCsv(text: string): ParsedWorkout[] {
  const rows = parseCsv(text)
  if (!rows.length) throw new StrongImportError('The file is empty.')
  const header = rows[0].map((h) => h.trim())
  const col = Object.fromEntries(header.map((h, i) => [h, i])) as Record<string, number>
  const missing = REQUIRED.filter((c) => col[c] === undefined)
  if (missing.length) {
    throw new StrongImportError(`This doesn't look like a Strong export (missing ${missing.join(', ')}).`)
  }
  const get = (r: string[], c: string) => (col[c] === undefined ? undefined : r[col[c]])

  const byId = new Map<string, ParsedWorkout>()
  for (const r of rows.slice(1)) {
    const date = get(r, 'Date')?.trim()
    if (!date) continue
    const startedAt = parseStrongDate(date)
    if (Number.isNaN(startedAt)) continue

    let w = byId.get(date)
    if (!w) {
      w = {
        externalId: `strong:${date}`,
        name: normalizeName(get(r, 'Workout Name') ?? '') || 'Workout',
        startedAt,
        durationMs: parseStrongDuration(get(r, 'Duration') ?? ''),
        notes: cleanNote(get(r, 'Workout Notes')),
        exercises: [],
      }
      byId.set(date, w)
    } else if (!w.notes) {
      w.notes = cleanNote(get(r, 'Workout Notes'))
    }

    const exName = normalizeName(get(r, 'Exercise Name') ?? '')
    if (!exName) continue
    // Strong lists an exercise's rows contiguously; a repeated name later in the workout is a new block.
    let ex = w.exercises[w.exercises.length - 1]
    if (!ex || nameKey(ex.name) !== nameKey(exName)) {
      ex = { name: exName, sets: [] }
      w.exercises.push(ex)
    }

    const kind = setKind(get(r, 'Set Order') ?? '')
    if (kind === 'rest') {
      const secs = num(get(r, 'Seconds'))
      if (secs > 0) ex.restSeconds = secs
      continue
    }
    if (!kind) continue
    const set: ParsedSet = {
      kind,
      weight: num(get(r, 'Weight')),
      reps: Math.round(num(get(r, 'Reps'))),
      seconds: num(get(r, 'Seconds')),
      notes: cleanNote(get(r, 'Notes')),
    }
    // Strong exports unfilled sets as 0 reps / 0 s. They carry no information.
    if (set.reps === 0 && set.seconds === 0) continue
    ex.sets.push(set)
  }

  const workouts = [...byId.values()]
  for (const w of workouts) w.exercises = w.exercises.filter((e) => e.sets.length)
  return workouts.filter((w) => w.exercises.length).sort((a, b) => a.startedAt - b.startedAt)
}

// ---------- Planning (what the review screen shows) ----------

export interface ExercisePlan {
  key: string
  name: string
  /** Set when an exercise with this name already exists in the app. */
  existingId?: string
  muscleGroup: MuscleGroup
  kind: ExerciseKind
  /** True when the muscle group couldn't be guessed from the name. */
  needsReview: boolean
  restSeconds: number
  setCount: number
  lastUsed: number
}

export interface ImportPlan {
  workouts: ParsedWorkout[]
  newWorkouts: ParsedWorkout[]
  skippedWorkouts: number
  exercises: ExercisePlan[]
  templateNames: string[]
}

/** Workouts this recent (relative to the newest workout in the file) become templates. */
const TEMPLATE_WINDOW_MS = 120 * 24 * 60 * 60 * 1000

export async function planImport(db: SuperTrackerDB, workouts: ParsedWorkout[]): Promise<ImportPlan> {
  const existingIds = new Set(
    (await db.workouts.where('externalId').anyOf(workouts.map((w) => w.externalId)).toArray()).map((w) => w.externalId),
  )
  const newWorkouts = workouts.filter((w) => !existingIds.has(w.externalId))

  const existingByKey = new Map((await db.exercises.toArray()).map((e) => [nameKey(e.name), e]))
  const plans = new Map<string, ExercisePlan>()
  for (const w of newWorkouts) {
    for (const ex of w.exercises) {
      const key = nameKey(ex.name)
      let p = plans.get(key)
      if (!p) {
        const existing = existingByKey.get(key)
        const guess = guessMuscleGroup(ex.name)
        p = {
          key,
          name: existing?.name ?? ex.name,
          existingId: existing?.id,
          muscleGroup: existing?.muscleGroup ?? guess ?? 'other',
          kind: existing?.kind ?? guessKind(ex.name, ex.sets.some((s) => s.seconds > 0 && s.reps === 0)),
          needsReview: !existing && !guess,
          restSeconds: existing?.restSeconds ?? 180,
          setCount: 0,
          lastUsed: 0,
        }
        plans.set(key, p)
      }
      p.setCount += ex.sets.length
      if (w.startedAt >= p.lastUsed) {
        p.lastUsed = w.startedAt
        if (!p.existingId && ex.restSeconds) p.restSeconds = ex.restSeconds
      }
    }
  }

  const existingTemplates = new Set((await db.templates.toArray()).map((t) => nameKey(t.name)))
  const exercises = [...plans.values()].sort(
    (a, b) => Number(b.needsReview) - Number(a.needsReview) || b.setCount - a.setCount,
  )
  return {
    workouts,
    newWorkouts,
    skippedWorkouts: workouts.length - newWorkouts.length,
    exercises,
    templateNames: recentRoutines(workouts)
      .map((w) => w.name)
      .filter((n) => !existingTemplates.has(nameKey(n))),
  }
}

/** A routine needs this many workouts inside the window to become a template (skips one-offs). */
const TEMPLATE_MIN_COUNT = 2

/** Most recent workout per routine name done repeatedly within the template window, newest first. */
export function recentRoutines(workouts: ParsedWorkout[]): ParsedWorkout[] {
  if (!workouts.length) return []
  const newest = Math.max(...workouts.map((w) => w.startedAt))
  const latest = new Map<string, ParsedWorkout>()
  const count = new Map<string, number>()
  for (const w of workouts) {
    if (newest - w.startedAt > TEMPLATE_WINDOW_MS) continue
    const k = nameKey(w.name)
    count.set(k, (count.get(k) ?? 0) + 1)
    const cur = latest.get(k)
    if (!cur || w.startedAt > cur.startedAt) latest.set(k, w)
  }
  return [...latest.values()]
    .filter((w) => (count.get(nameKey(w.name)) ?? 0) >= TEMPLATE_MIN_COUNT)
    .sort((a, b) => b.startedAt - a.startedAt)
}

// ---------- Commit ----------

export interface ImportResult {
  workouts: number
  sets: number
  exercisesCreated: number
  templates: number
}

export async function commitImport(
  db: SuperTrackerDB,
  plan: ImportPlan,
  /** Template names to create (a subset of plan.templateNames). */
  options: { templates: string[] },
): Promise<ImportResult> {
  return db.transaction('rw', [db.exercises, db.workouts, db.sets, db.templates], async () => {
    const now = Date.now()
    const idByKey = new Map<string, string>()
    const newExercises: Exercise[] = []
    for (const p of plan.exercises) {
      if (p.existingId) {
        idByKey.set(p.key, p.existingId)
        continue
      }
      const id = newId()
      idByKey.set(p.key, id)
      newExercises.push({
        id,
        name: p.name,
        muscleGroup: p.muscleGroup,
        kind: p.kind,
        restSeconds: p.restSeconds,
        archived: false,
        createdAt: now,
      })
    }
    // Exercises that already existed may have been re-categorised on the review screen.
    for (const p of plan.exercises) {
      if (p.existingId) await db.exercises.update(p.existingId, { muscleGroup: p.muscleGroup, kind: p.kind })
    }
    await db.exercises.bulkAdd(newExercises)

    const workouts: Workout[] = []
    const sets: WorkoutSet[] = []
    for (const w of plan.newWorkouts) {
      const workoutId = newId()
      const endedAt = w.startedAt + (w.durationMs || 60 * 60 * 1000)
      workouts.push({
        id: workoutId,
        name: w.name,
        startedAt: w.startedAt,
        endedAt,
        notes: w.notes,
        source: 'strong',
        externalId: w.externalId,
      })
      w.exercises.forEach((ex, order) => {
        const exerciseId = idByKey.get(nameKey(ex.name))!
        ex.sets.forEach((s, i) => {
          sets.push({
            id: newId(),
            workoutId,
            exerciseId,
            exerciseOrder: order,
            setNumber: i + 1,
            kind: s.kind,
            weight: s.weight || undefined,
            reps: s.reps || undefined,
            seconds: s.seconds || undefined,
            notes: s.notes,
            done: true,
            // Strong doesn't export per-set times; keep order within the workout.
            completedAt: w.startedAt + order * 1000 + i,
          })
        })
      })
    }
    await db.workouts.bulkAdd(workouts)
    await db.sets.bulkAdd(sets)

    let templates = 0
    if (options.templates.length) {
      const wanted = new Set(options.templates.map(nameKey))
      const toAdd: Template[] = recentRoutines(plan.workouts)
        .filter((w) => wanted.has(nameKey(w.name)))
        .map((w) => ({
          id: newId(),
          name: w.name,
          folder: 'From Strong',
          updatedAt: now,
          exercises: w.exercises.map((ex) => ({
            exerciseId: idByKey.get(nameKey(ex.name)) ?? '',
            sets: Math.max(1, ex.sets.filter((s) => s.kind === 'normal' || s.kind === 'failure').length),
            restSeconds: ex.restSeconds,
          })).filter((e) => e.exerciseId),
        }))
      await db.templates.bulkAdd(toAdd)
      templates = toAdd.length
    }

    return { workouts: workouts.length, sets: sets.length, exercisesCreated: newExercises.length, templates }
  })
}
