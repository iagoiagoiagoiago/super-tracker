import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Exercise, ID, Workout, WorkoutSet } from '../db/schema'
import { computePRs, type PREvent } from './stats'

export interface GymData {
  workouts: Workout[]
  sets: WorkoutSet[]
  exercises: Map<ID, Exercise>
  prs: PREvent[]
  prBySet: Map<ID, PREvent>
  prCountByWorkout: Map<ID, number>
}

/** Every gym record plus derived PRs. Recomputes whenever gym data changes (a few ms for years of data). */
export function useGymData(): GymData | undefined {
  return useLiveQuery(async () => {
    const [workouts, sets, exList] = await Promise.all([db.workouts.toArray(), db.sets.toArray(), db.exercises.toArray()])
    const exercises = new Map(exList.map((e) => [e.id, e]))
    const prs = computePRs(workouts, sets, exercises)
    const prCountByWorkout = new Map<ID, number>()
    for (const p of prs) prCountByWorkout.set(p.workoutId, (prCountByWorkout.get(p.workoutId) ?? 0) + p.kinds.length)
    return { workouts, sets, exercises, prs, prBySet: new Map(prs.map((p) => [p.setId, p])), prCountByWorkout }
  })
}
