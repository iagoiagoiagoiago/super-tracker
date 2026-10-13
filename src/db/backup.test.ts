import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { SuperTrackerDB } from './db'
import { BackupError, createBackup, parseBackup, restoreBackup } from './backup'

let n = 0
const freshDb = () => new SuperTrackerDB(`test-${++n}`)
const dbs: SuperTrackerDB[] = []

afterEach(async () => {
  for (const d of dbs.splice(0)) await d.delete()
})

describe('backup', () => {
  it('round-trips every table through export and restore', async () => {
    const a = freshDb()
    dbs.push(a)
    await a.exercises.add({
      id: 'e1',
      name: 'Bench Press (Barbell)',
      muscleGroup: 'chest',
      kind: 'weight_reps',
      restSeconds: 180,
      archived: false,
      createdAt: 1,
    })
    await a.workouts.add({ id: 'w1', name: 'ANT', startedAt: 10, endedAt: 20, source: 'app' })
    await a.sets.add({
      id: 's1',
      workoutId: 'w1',
      exerciseId: 'e1',
      exerciseOrder: 0,
      setNumber: 1,
      weight: 90,
      reps: 6,
      done: true,
      completedAt: 15,
    })
    await a.positions.add({ id: 'p1', name: 'Half guard', side: 'bottom', kind: 'position', x: 0, y: 0, createdAt: 1 })

    const text = JSON.stringify(await createBackup(a))

    const b = freshDb()
    dbs.push(b)
    await b.exercises.add({
      id: 'stale',
      name: 'Should be wiped',
      muscleGroup: 'other',
      kind: 'reps_only',
      restSeconds: 60,
      archived: false,
      createdAt: 1,
    })
    await restoreBackup(b, parseBackup(text))

    expect(await b.exercises.toArray()).toHaveLength(1)
    expect((await b.sets.get('s1'))?.weight).toBe(90)
    expect((await b.positions.get('p1'))?.name).toBe('Half guard')
  })

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('not json')).toThrow(BackupError)
    expect(() => parseBackup('{"hello":1}')).toThrow(BackupError)
    expect(() => parseBackup(JSON.stringify({ format: 'super-tracker-backup', version: 99, tables: {} }))).toThrow(
      /newer version/,
    )
  })
})
