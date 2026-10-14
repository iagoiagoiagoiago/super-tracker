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
    expect((await b.exercises.get('e1'))?.muscleGroup).toBe('chest')
    expect((await b.sets.get('s1'))?.weight).toBe(90)
    expect((await b.positions.get('p1'))?.name).toBe('Half guard')
  })

  it('migrates pre-split muscle groups in old backups', async () => {
    const old = {
      format: 'super-tracker-backup',
      version: 1,
      exportedAt: 1,
      tables: { exercises: [{ id: 'x', name: 'Hammer Curl (Cable)', muscleGroup: 'arms', kind: 'weight_reps', restSeconds: 90, archived: false, createdAt: 1 }] },
    }
    const b = freshDb()
    dbs.push(b)
    await restoreBackup(b, parseBackup(JSON.stringify(old)))
    expect((await b.exercises.get('x'))?.muscleGroup).toBe('biceps')
  })

  it('converts want techniques in v1 backups into bucket items', async () => {
    const old = {
      format: 'super-tracker-backup',
      version: 1,
      exportedAt: 1,
      tables: {
        positions: [
          { id: 'a', name: 'Standing' },
          { id: 'b', name: 'Side control' },
        ],
        techniques: [{ id: 't', name: 'Ankle pick', fromId: 'a', toId: 'b', status: 'want', createdAt: 1, updatedAt: 1 }],
        bjjSessions: [],
        bjjNotes: [{ id: 'n', title: 'gone', body: '' }],
      },
    }
    const b = freshDb()
    dbs.push(b)
    await restoreBackup(b, parseBackup(JSON.stringify(old)))
    expect(await b.techniques.count()).toBe(0)
    expect(await b.positions.count()).toBe(0)
    expect((await b.bucketItems.toArray()).map((i) => i.text)).toEqual(['Ankle pick'])
  })

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('not json')).toThrow(BackupError)
    expect(() => parseBackup('{"hello":1}')).toThrow(BackupError)
    expect(() => parseBackup(JSON.stringify({ format: 'super-tracker-backup', version: 99, tables: {} }))).toThrow(
      /newer version/,
    )
  })
})
