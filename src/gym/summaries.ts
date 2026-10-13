import type { Exercise, ID, Workout, WorkoutSet } from '../db/schema'
import { setE1rm, volume } from '../lib/gym'

export interface ExerciseBlock {
  exercise: Exercise
  sets: WorkoutSet[]
}

export interface WorkoutSummary {
  workout: Workout
  blocks: ExerciseBlock[]
  volume: number
  durationMs: number
}

/** Groups sets into ordered exercise blocks. */
export function blocksOf(sets: WorkoutSet[], exercises: Map<ID, Exercise>): ExerciseBlock[] {
  const byOrder = new Map<number, WorkoutSet[]>()
  for (const s of sets) byOrder.set(s.exerciseOrder, [...(byOrder.get(s.exerciseOrder) ?? []), s])
  return [...byOrder.entries()]
    .sort((a, b) => a[0] - b[0])
    .flatMap(([, ss]) => {
      const exercise = exercises.get(ss[0].exerciseId)
      return exercise ? [{ exercise, sets: ss.sort((a, b) => a.setNumber - b.setNumber) }] : []
    })
}

export function summarize(workout: Workout, sets: WorkoutSet[], exercises: Map<ID, Exercise>): WorkoutSummary {
  return {
    workout,
    blocks: blocksOf(sets, exercises),
    volume: volume(sets),
    durationMs: (workout.endedAt ?? workout.startedAt) - workout.startedAt,
  }
}

/** The set Strong shows as "best": highest e1RM, else heaviest, else most reps. Warm-ups excluded. */
export function bestSet(block: ExerciseBlock): WorkoutSet | undefined {
  const work = block.sets.filter((s) => s.kind !== 'warmup')
  const pool = work.length ? work : block.sets
  return pool.reduce<WorkoutSet | undefined>((best, s) => {
    if (!best) return s
    const a = setE1rm(s, block.exercise.kind) ?? 0
    const b = setE1rm(best, block.exercise.kind) ?? 0
    if (a !== b) return a > b ? s : best
    if ((s.weight ?? 0) !== (best.weight ?? 0)) return (s.weight ?? 0) > (best.weight ?? 0) ? s : best
    return (s.reps ?? 0) > (best.reps ?? 0) ? s : best
  }, undefined)
}
