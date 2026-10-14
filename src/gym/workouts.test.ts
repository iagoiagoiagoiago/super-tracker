import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import type { WorkoutSet } from '../db/schema'
import { moveExercise, replaceExercise } from './workouts'

const set = (id: string, exerciseId: string, exerciseOrder: number, done: boolean, weight = 50): WorkoutSet => ({
  id, workoutId: 'w', exerciseId, exerciseOrder, setNumber: 1, kind: 'normal', weight, reps: 8, done,
})

beforeEach(async () => {
  await db.sets.clear()
  await db.sets.bulkAdd([set('a1', 'A', 0, true), set('a2', 'A', 0, false), set('b1', 'B', 1, false), set('c1', 'C', 2, false)])
})

const order = async () =>
  [...new Map((await db.sets.toArray()).sort((x, y) => x.exerciseOrder - y.exerciseOrder).map((s) => [s.exerciseId, s.exerciseOrder])).keys()]

describe('mid-workout editing', () => {
  it('moves exercises up and down, ignoring moves past the ends', async () => {
    await moveExercise('w', 2, -1)
    expect(await order()).toEqual(['A', 'C', 'B'])
    await moveExercise('w', 0, 1)
    expect(await order()).toEqual(['C', 'A', 'B'])
    await moveExercise('w', 0, -1)
    expect(await order()).toEqual(['C', 'A', 'B'])
  })

  it('replaces an exercise, keeping completed sets and clearing unchecked values', async () => {
    await replaceExercise('w', 0, 'Z')
    expect((await db.sets.get('a1'))).toMatchObject({ exerciseId: 'Z', weight: 50, done: true })
    const a2 = await db.sets.get('a2')
    expect(a2?.exerciseId).toBe('Z')
    expect(a2?.weight).toBeUndefined()
    expect(a2?.reps).toBeUndefined()
    expect((await db.sets.get('b1'))?.exerciseId).toBe('B')
  })
})
