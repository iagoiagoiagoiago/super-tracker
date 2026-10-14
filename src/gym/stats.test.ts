import { describe, expect, it } from 'vitest'
import type { Exercise, Workout, WorkoutSet } from '../db/schema'
import { computePRs, exerciseSeries, gymStats, progressRates } from './stats'

const bench: Exercise = { id: 'b', name: 'Bench', muscleGroup: 'chest', kind: 'weight_reps', restSeconds: 180, archived: false, createdAt: 0 }
const dip: Exercise = { id: 'd', name: 'Dip', muscleGroup: 'chest', kind: 'bodyweight_plus', restSeconds: 180, archived: false, createdAt: 0 }
const exercises = new Map([bench, dip].map((e) => [e.id, e]))

const DAY = 86_400_000
const w = (id: string, day: number): Workout => ({ id, name: 'ANT', startedAt: day * DAY, endedAt: day * DAY + 3_600_000, source: 'app' })
let n = 0
const s = (workoutId: string, exerciseId: string, weight: number, reps: number, kind: WorkoutSet['kind'] = 'normal'): WorkoutSet => ({
  id: `s${++n}`,
  workoutId,
  exerciseId,
  exerciseOrder: exerciseId === 'b' ? 0 : 1,
  setNumber: n,
  kind,
  weight,
  reps,
  done: true,
})

describe('computePRs', () => {
  it('skips the first session, marks only the first set reaching a new best, ignores warm-ups', () => {
    const workouts = [w('w1', 1), w('w2', 2), w('w3', 3)]
    const sets = [
      s('w1', 'b', 80, 6),
      s('w1', 'd', 20, 6),
      s('w2', 'b', 100, 1, 'warmup'), // warm-up: never a record
      s('w2', 'b', 85, 6), // weight + e1rm + volume
      s('w2', 'b', 85, 6), // ties the set above: no record
      s('w2', 'd', 20, 8), // reps
      s('w3', 'b', 80, 10), // volume + e1rm (80×10 → 107 > 85×6 → 99)
    ]
    const prs = computePRs(workouts, sets, exercises)
    expect(prs.map((p) => [p.workoutId, p.exerciseId, p.kinds.sort().join(',')])).toEqual([
      ['w2', 'b', 'e1rm,volume,weight'],
      ['w2', 'd', 'reps'],
      ['w3', 'b', 'e1rm,volume'],
    ])
  })
})

describe('gymStats', () => {
  it('summarises a range', () => {
    const workouts = [w('w1', 1), w('w2', 8), w('w3', 15)]
    const sets = [s('w1', 'b', 80, 6), s('w2', 'b', 85, 6), s('w3', 'b', 90, 6), s('w3', 'd', 25, 6)]
    const prs = computePRs(workouts, sets, exercises)
    const st = gymStats('4W', workouts, sets, exercises, prs, 16 * DAY)
    expect(st.workouts).toBe(3)
    expect(st.lifts[0].exercise.id).toBe('b')
    expect(Math.round(st.lifts[0].best)).toBe(105)
    expect(st.lifts[0].delta).toBeGreaterThan(0)
    expect(st.mostTrained[0]).toMatchObject({ sessions: 3 })
    expect(st.muscles[0].group).toBe('chest')
    expect(st.prs).toBe(2)
  })

  it('counts half sets for helper muscles of compound lifts', () => {
    const workouts = [w('w1', 1)]
    const sets = [s('w1', 'b', 80, 6), s('w1', 'b', 80, 6), s('w1', 'd', 10, 8), s('w1', 'd', 10, 8, 'warmup')]
    const fly: Exercise = { ...bench, id: 'f', name: 'Chest Fly' }
    const st = gymStats('4W', workouts, [...sets, s('w1', 'f', 20, 12)], new Map([...exercises, ['f', fly]]), [], 2 * DAY)
    const per = new Map(st.muscles.map((m) => [m.group, m.setsPerWeek * st.weeks]))
    // 2 bench + 1 dip + 1 fly working sets; the fly is isolation; the warm-up never counts.
    expect(per.get('chest')).toBe(4)
    expect(per.get('triceps')).toBe(1.5)
    expect(per.get('shoulders')).toBe(1.5)
    expect(st.setsPerWeek * st.weeks).toBe(4)
  })

  it('uses the per-exercise helper choice over the guess', () => {
    const custom = new Map([['b', { ...bench, secondaryMuscles: ['triceps' as const] }]])
    const st = gymStats('4W', [w('w1', 1)], [s('w1', 'b', 80, 6)], custom, [], 2 * DAY)
    const per = new Map(st.muscles.map((m) => [m.group, m.setsPerWeek * st.weeks]))
    expect(per.get('triceps')).toBe(0.5)
    expect(per.get('shoulders')).toBe(0)
  })

  it('builds per-session series', () => {
    const workouts = [w('w1', 1), w('w2', 2)]
    const sets = [s('w1', 'b', 80, 6), s('w1', 'b', 70, 10), s('w2', 'b', 90, 4)]
    const pts = exerciseSeries(bench, new Map(workouts.map((x) => [x.id, x])), sets)
    expect(pts).toHaveLength(2)
    expect(pts[0].weight).toBe(80)
    expect(pts[0].volume).toBe(80 * 6 + 70 * 10)
  })
})

describe('progressRates', () => {
  it('ranks lifts by fitted e1RM change per month and needs enough sessions', () => {
    const row: Exercise = { ...bench, id: 'r', name: 'Row', muscleGroup: 'upper_back' }
    const exs = new Map([bench, row].map((e) => [e.id, e]))
    const workouts = [0, 7, 14, 21, 28].map((d) => w(`p${d}`, d))
    const sets = [
      ...workouts.map((x, i) => s(x.id, 'b', 100 + i * 2.5, 5)), // bench climbing
      ...workouts.map((x, i) => ({ ...s(x.id, 'r', 80 - i, 8), exerciseOrder: 1 })), // row slipping
      s('p0', 'd', 20, 6), // too few sessions for a dip trend, and not loaded anyway
    ]
    const sessions = new Map<string, Set<string>>()
    for (const x of sets) sessions.set(x.exerciseId, (sessions.get(x.exerciseId) ?? new Set()).add(x.workoutId))
    const p = progressRates(exs, new Map(workouts.map((x) => [x.id, x])), sets, sessions)
    expect(p.exercises.map((e) => e.exercise.id)).toEqual(['b', 'r'])
    expect(p.exercises[0].ratePerMonth).toBeGreaterThan(0)
    expect(p.exercises[1].ratePerMonth).toBeLessThan(0)
    expect(p.muscles.map((m) => m.group)).toEqual(['chest', 'upper_back'])
  })
})
