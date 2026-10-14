import Dexie from 'dexie'
import { db, newId } from '../db/db'
import {
  META_ACTIVE_REST,
  META_ACTIVE_WORKOUT,
  type ActiveRest,
  type ID,
  type SetKind,
  type Template,
  type WorkoutSet,
} from '../db/schema'
import { nameKey } from '../lib/exerciseCatalog'

export async function getActiveWorkoutId(): Promise<ID | undefined> {
  const id = (await db.meta.get(META_ACTIVE_WORKOUT))?.value as ID | undefined
  if (!id) return undefined
  const w = await db.workouts.get(id)
  return w && !w.endedAt ? id : undefined
}

/** Starts a workout (empty or from a template). If one is already running, returns that one instead. */
export async function startWorkout(template?: Template): Promise<ID> {
  return db.transaction('rw', [db.workouts, db.sets, db.meta, db.exercises], async () => {
    const active = await getActiveWorkoutId()
    if (active) return active
    const id = newId()
    await db.workouts.add({
      id,
      name: template?.name ?? 'Workout',
      startedAt: Date.now(),
      templateId: template?.id,
      source: 'app',
    })
    const sets: WorkoutSet[] = []
    template?.exercises.forEach((te, order) => {
      for (let i = 0; i < te.sets; i++) {
        sets.push({ id: newId(), workoutId: id, exerciseId: te.exerciseId, exerciseOrder: order, setNumber: i + 1, kind: 'normal', done: false })
      }
    })
    await db.sets.bulkAdd(sets)
    await db.meta.put({ key: META_ACTIVE_WORKOUT, value: id })
    await db.meta.delete(META_ACTIVE_REST)
    return id
  })
}

/** Sets of the most recent finished workout (other than `excludeWorkoutId`) that contains this exercise. */
export async function previousSets(exerciseId: ID, excludeWorkoutId?: ID, before = Date.now()): Promise<WorkoutSet[]> {
  const candidates = db.sets
    .where('[exerciseId+completedAt]')
    .between([exerciseId, Dexie.minKey], [exerciseId, before], true, false)
    .reverse()
  let workoutId: ID | undefined
  await candidates.until(() => workoutId !== undefined).each((s) => {
    if (s.done && s.workoutId !== excludeWorkoutId) workoutId = s.workoutId
  })
  if (!workoutId) return []
  const sets = await db.sets.where('workoutId').equals(workoutId).filter((s) => s.exerciseId === exerciseId && s.done).toArray()
  return sets.sort((a, b) => a.exerciseOrder - b.exerciseOrder || a.setNumber - b.setNumber)
}

/** Key used to line a set up with "the same set last time": W1, W2… for warm-ups, D1… for drops, N1… otherwise. */
export function setSlotKeys(sets: Pick<WorkoutSet, 'kind'>[]): string[] {
  const counts: Record<string, number> = {}
  return sets.map((s) => {
    const k = s.kind === 'warmup' ? 'W' : s.kind === 'drop' ? 'D' : 'N'
    counts[k] = (counts[k] ?? 0) + 1
    return `${k}${counts[k]}`
  })
}

async function exerciseSets(workoutId: ID, exerciseOrder: number) {
  const sets = await db.sets.where('workoutId').equals(workoutId).filter((s) => s.exerciseOrder === exerciseOrder).toArray()
  return sets.sort((a, b) => a.setNumber - b.setNumber)
}

export async function addExercise(workoutId: ID, exerciseId: ID): Promise<void> {
  const all = await db.sets.where('workoutId').equals(workoutId).toArray()
  const order = all.length ? Math.max(...all.map((s) => s.exerciseOrder)) + 1 : 0
  const prev = await previousSets(exerciseId, workoutId)
  const kinds: SetKind[] = prev.length ? prev.map((s) => s.kind ?? 'normal') : ['normal']
  await db.sets.bulkAdd(
    kinds.map((kind, i) => ({ id: newId(), workoutId, exerciseId, exerciseOrder: order, setNumber: i + 1, kind, done: false })),
  )
}

export async function addSet(workoutId: ID, exerciseOrder: number, exerciseId: ID): Promise<void> {
  const sets = await exerciseSets(workoutId, exerciseOrder)
  await db.sets.add({
    id: newId(),
    workoutId,
    exerciseId,
    exerciseOrder,
    setNumber: (sets.at(-1)?.setNumber ?? 0) + 1,
    kind: 'normal',
    done: false,
  })
}

export async function removeSet(setId: ID): Promise<void> {
  await db.transaction('rw', [db.sets, db.meta], async () => {
    const set = await db.sets.get(setId)
    if (!set) return
    await db.sets.delete(setId)
    const rest = (await db.meta.get(META_ACTIVE_REST))?.value as ActiveRest | undefined
    if (rest?.setId === setId) await db.meta.delete(META_ACTIVE_REST)
    const remaining = await exerciseSets(set.workoutId, set.exerciseOrder)
    await Promise.all(remaining.map((s, i) => (s.setNumber === i + 1 ? null : db.sets.update(s.id, { setNumber: i + 1 }))))
  })
}

export async function removeExercise(workoutId: ID, exerciseOrder: number): Promise<void> {
  await db.transaction('rw', db.sets, async () => {
    const all = await db.sets.where('workoutId').equals(workoutId).toArray()
    await db.sets.bulkDelete(all.filter((s) => s.exerciseOrder === exerciseOrder).map((s) => s.id))
    await Promise.all(
      all.filter((s) => s.exerciseOrder > exerciseOrder).map((s) => db.sets.update(s.id, { exerciseOrder: s.exerciseOrder - 1 })),
    )
  })
}

/** Moves an exercise block one slot up (-1) or down (+1) by swapping it with its neighbour. */
export async function moveExercise(workoutId: ID, exerciseOrder: number, direction: -1 | 1): Promise<void> {
  await db.transaction('rw', db.sets, async () => {
    const all = await db.sets.where('workoutId').equals(workoutId).toArray()
    const orders = [...new Set(all.map((s) => s.exerciseOrder))].sort((a, b) => a - b)
    const i = orders.indexOf(exerciseOrder)
    const j = i + direction
    if (i < 0 || j < 0 || j >= orders.length) return
    const other = orders[j]
    await Promise.all(
      all.flatMap((s) =>
        s.exerciseOrder === exerciseOrder
          ? [db.sets.update(s.id, { exerciseOrder: other })]
          : s.exerciseOrder === other
            ? [db.sets.update(s.id, { exerciseOrder })]
            : [],
      ),
    )
  })
}

/**
 * Swaps the exercise of a block for another one, keeping the set structure. Values typed into unchecked sets
 * belonged to the old exercise, so they're cleared; completed sets move to the new exercise as logged.
 */
export async function replaceExercise(workoutId: ID, exerciseOrder: number, exerciseId: ID): Promise<void> {
  await db.transaction('rw', [db.sets, db.meta], async () => {
    const block = await db.sets.where('workoutId').equals(workoutId).filter((s) => s.exerciseOrder === exerciseOrder).toArray()
    await Promise.all(
      block.map((s) =>
        db.sets.update(s.id, s.done ? { exerciseId } : { exerciseId, weight: undefined, reps: undefined, seconds: undefined }),
      ),
    )
  })
}

export async function updateSet(setId: ID, patch: Partial<Pick<WorkoutSet, 'weight' | 'reps' | 'seconds' | 'kind'>>) {
  await db.sets.update(setId, patch)
}

/**
 * Checks or unchecks a set. Checking fills empty fields from the previous session (like Strong)
 * and starts the exercise's rest timer. Returns false if there was nothing to log.
 */
export async function toggleSet(setId: ID, previous?: Pick<WorkoutSet, 'weight' | 'reps' | 'seconds'>): Promise<boolean> {
  return db.transaction('rw', [db.sets, db.meta, db.exercises], async () => {
    const set = await db.sets.get(setId)
    if (!set) return false
    if (set.done) {
      await db.sets.update(setId, { done: false, completedAt: undefined })
      const rest = (await db.meta.get(META_ACTIVE_REST))?.value as ActiveRest | undefined
      if (rest?.setId === setId) await db.meta.delete(META_ACTIVE_REST)
      return true
    }
    const weight = set.weight ?? previous?.weight
    const reps = set.reps ?? previous?.reps
    const seconds = set.seconds ?? previous?.seconds
    if (!reps && !seconds) return false
    await db.sets.update(setId, { weight, reps, seconds, done: true, completedAt: Date.now() })
    const ex = await db.exercises.get(set.exerciseId)
    const total = ex?.restSeconds ?? 0
    if (total > 0) {
      await db.meta.put({ key: META_ACTIVE_REST, value: { setId, endsAt: Date.now() + total * 1000, total } satisfies ActiveRest })
    }
    return true
  })
}

export async function adjustRest(deltaSeconds: number): Promise<void> {
  const rest = (await db.meta.get(META_ACTIVE_REST))?.value as ActiveRest | undefined
  if (!rest) return
  const endsAt = rest.endsAt + deltaSeconds * 1000
  if (endsAt <= Date.now()) await db.meta.delete(META_ACTIVE_REST)
  else await db.meta.put({ key: META_ACTIVE_REST, value: { ...rest, endsAt, total: Math.max(rest.total + deltaSeconds, 1) } })
}

export const skipRest = () => db.meta.delete(META_ACTIVE_REST)

/** Ends the workout: incomplete sets are discarded. A workout with no completed sets is deleted. */
export async function finishWorkout(workoutId: ID): Promise<'saved' | 'discarded'> {
  return db.transaction('rw', [db.workouts, db.sets, db.meta], async () => {
    const sets = await db.sets.where('workoutId').equals(workoutId).toArray()
    await db.sets.bulkDelete(sets.filter((s) => !s.done).map((s) => s.id))
    await db.meta.bulkDelete([META_ACTIVE_WORKOUT, META_ACTIVE_REST])
    const kept = sets.filter((s) => s.done)
    if (!kept.length) {
      await db.workouts.delete(workoutId)
      return 'discarded'
    }
    // Close gaps left by removed exercises/sets.
    const orders = [...new Set(kept.map((s) => s.exerciseOrder))].sort((a, b) => a - b)
    const byOrder = new Map(orders.map((o, i) => [o, i]))
    const counters = new Map<number, number>()
    for (const s of kept.sort((a, b) => a.exerciseOrder - b.exerciseOrder || a.setNumber - b.setNumber)) {
      const o = byOrder.get(s.exerciseOrder)!
      const n = (counters.get(o) ?? 0) + 1
      counters.set(o, n)
      if (o !== s.exerciseOrder || n !== s.setNumber) await db.sets.update(s.id, { exerciseOrder: o, setNumber: n })
    }
    await db.workouts.update(workoutId, { endedAt: Date.now() })
    return 'saved'
  })
}

export async function cancelWorkout(workoutId: ID): Promise<void> {
  await db.transaction('rw', [db.workouts, db.sets, db.meta], async () => {
    await db.sets.where('workoutId').equals(workoutId).delete()
    await db.workouts.delete(workoutId)
    await db.meta.bulkDelete([META_ACTIVE_WORKOUT, META_ACTIVE_REST])
  })
}

export async function deleteWorkout(workoutId: ID): Promise<void> {
  await db.transaction('rw', [db.workouts, db.sets], async () => {
    await db.sets.where('workoutId').equals(workoutId).delete()
    await db.workouts.delete(workoutId)
  })
}

/** Creates a template from a finished workout's exercises and set counts. */
export async function saveWorkoutAsTemplate(workoutId: ID): Promise<ID> {
  const w = await db.workouts.get(workoutId)
  const sets = await db.sets.where('workoutId').equals(workoutId).toArray()
  const byOrder = new Map<number, { exerciseId: ID; sets: number }>()
  for (const s of sets) {
    if (s.kind === 'warmup' || s.kind === 'drop') continue
    const cur = byOrder.get(s.exerciseOrder) ?? { exerciseId: s.exerciseId, sets: 0 }
    cur.sets++
    byOrder.set(s.exerciseOrder, cur)
  }
  const id = newId()
  await db.templates.add({
    id,
    name: w?.name ?? 'Template',
    updatedAt: Date.now(),
    exercises: [...byOrder.entries()].sort((a, b) => a[0] - b[0]).map(([, e]) => e),
  })
  return id
}

/** Timestamp of the last finished workout that used this template (by id, or by name for imported ones). */
export function lastPerformedFor(template: Template, workouts: { name: string; templateId?: ID; startedAt: number; endedAt?: number }[]) {
  const key = nameKey(template.name)
  let last: number | undefined
  for (const w of workouts) {
    if (!w.endedAt) continue
    if (w.templateId === template.id || nameKey(w.name) === key) {
      if (last === undefined || w.startedAt > last) last = w.startedAt
    }
  }
  return last
}
