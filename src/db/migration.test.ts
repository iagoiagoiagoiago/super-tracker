import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { SuperTrackerDB } from './db'

describe('db v3 migration', () => {
  it('re-guesses legacy muscle groups when an old database opens', async () => {
    const name = 'migrate-v2'
    const old = new Dexie(name)
    old.version(2).stores({ exercises: 'id, name, muscleGroup', workouts: 'id, startedAt, endedAt, externalId' })
    await old.open()
    await old.table('exercises').bulkAdd([
      { id: '1', name: 'katana triceps', muscleGroup: 'arms' },
      { id: '2', name: 'T Bar Row', muscleGroup: 'back' },
      { id: '3', name: 'Bench Press (Barbell)', muscleGroup: 'chest' },
    ])
    old.close()

    const db = new SuperTrackerDB(name)
    const groups = Object.fromEntries((await db.exercises.toArray()).map((e) => [e.id, e.muscleGroup]))
    expect(groups).toEqual({ '1': 'triceps', '2': 'upper_back', '3': 'chest' })
    await db.delete()
  })
})
