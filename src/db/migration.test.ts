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

describe('db v5 migration', () => {
  it('turns want techniques into bucket items and drops journal notes', async () => {
    const name = 'migrate-v4'
    const old = new Dexie(name)
    old.version(4).stores({
      positions: 'id, side, kind',
      techniques: 'id, fromId, toId, status',
      bjjSessions: 'id, date, externalId',
      bjjNotes: 'id, updatedAt, externalId',
    })
    await old.open()
    await old.table('positions').bulkAdd([
      { id: 'cg', name: 'Closed guard' },
      { id: 'tk', name: 'Tarikoplata' },
      { id: 'hg', name: 'Half guard' },
      { id: 'bk', name: 'Back' },
      { id: 'lonely', name: 'Brand new position' },
    ])
    await old.table('techniques').bulkAdd([
      { id: 't1', name: 'Tarikoplata', fromId: 'cg', toId: 'tk', status: 'want', notes: 'from overhook', createdAt: 5 },
      { id: 't2', name: 'Knee shield back take', fromId: 'hg', toId: 'bk', status: 'hitting', createdAt: 1 },
      { id: 't3', name: 'Lockdown sweep', fromId: 'hg', toId: 'bk', status: 'want', createdAt: 1 },
    ])
    await old.table('bjjSessions').add({ id: 's', date: 1, caughtBy: ['t3'], taught: [], hit: [] })
    await old.table('bjjNotes').add({ id: 'n', title: 'x', body: 'y', updatedAt: 1 })
    old.close()

    const db = new SuperTrackerDB(name)
    const items = await db.bucketItems.toArray()
    expect(items).toMatchObject([{ text: 'Tarikoplata', note: 'Closed guard → Tarikoplata\nfrom overhook', reps: [], createdAt: 5 }])
    expect((await db.techniques.toArray()).map((t) => [t.id, t.status]).sort()).toEqual([['t2', 'hitting'], ['t3', 'learning']])
    // Closed guard and Tarikoplata only existed for the want technique; an untouched new position stays.
    expect((await db.positions.toArray()).map((p) => p.id).sort()).toEqual(['bk', 'hg', 'lonely'])
    expect(db.tables.map((t) => t.name)).not.toContain('bjjNotes')
    await db.delete()
  })
})
