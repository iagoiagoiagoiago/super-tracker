import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { SuperTrackerDB } from '../db/db'
import { commitJournal, JournalError, parseJournal, planJournal } from './bjjJournal'

const SAMPLE = {
  format: 'super-tracker-bjj',
  version: 1,
  positions: [
    { name: 'Half guard', side: 'bottom', x: 0, y: 100 },
    { name: 'Closed guard', side: 'bottom', x: 0, y: 200 },
    { name: 'Tarikoplata', side: 'bottom', kind: 'submission', x: 0, y: 260 },
    { name: 'Back', side: 'top', x: 0, y: -100 },
    { name: 'RNC', side: 'top', kind: 'submission', x: 50, y: -150 },
  ],
  techniques: [
    { name: 'Knee shield back take', from: 'Half guard', to: 'Back', status: 'hitting', notes: 'underhook first' },
    { name: 'RNC', from: 'Back', to: 'RNC', status: 'agame' },
    { name: 'Tarikoplata', from: 'Closed guard', to: 'Tarikoplata', status: 'want' },
    { name: 'Back take from half', from: 'Half guard', to: 'Back', status: 'want' },
  ],
  sessions: [
    { id: 's1', date: '2025-05-24', classType: 'open_mat', hit: ['Knee shield back take', 'Mystery move'], notes: 'good day' },
    { id: 's2', date: '2026-01-20', taught: ['rnc', 'Back take from half'] },
  ],
  bucket: [{ text: 'Kata gatame from mount' }, { text: 'tarikoplata' }],
  notes: [{ id: 'n1', title: 'Game plan', body: 'A game: top', pinned: true }], // ignored
}

let n = 0
const dbs: SuperTrackerDB[] = []
const fresh = () => {
  const d = new SuperTrackerDB(`journal-${++n}`)
  dbs.push(d)
  return d
}
afterEach(async () => {
  for (const d of dbs.splice(0)) await d.delete()
})

describe('BJJ journal import', () => {
  it('imports map, sessions and bucket list, and resolves technique names', async () => {
    const db = fresh()
    const plan = await planJournal(db, parseJournal(JSON.stringify(SAMPLE)))
    expect(plan.unresolved).toEqual(['Mystery move'])
    // Tarikoplata (want, never logged) → bucket item, and its two positions are not created.
    // Back take from half (want, but taught in s2) → on the map as learning.
    expect(await commitJournal(db, plan)).toEqual({ positions: 3, techniques: 3, sessions: 2, bucket: 2 })
    const bucket = await db.bucketItems.toArray()
    expect(bucket.map((b) => b.text).sort()).toEqual(['Kata gatame from mount', 'Tarikoplata'])
    expect(bucket.find((b) => b.text === 'Tarikoplata')!.note).toBe('Closed guard → Tarikoplata')
    expect((await db.techniques.toArray()).find((t) => t.name === 'Back take from half')!.status).toBe('learning')

    const s1 = (await db.bjjSessions.where('externalId').equals('s1').first())!
    const kneeShield = (await db.techniques.toArray()).find((t) => t.name === 'Knee shield back take')!
    expect(s1.hit).toEqual([kneeShield.id])
    expect(s1).toMatchObject({ classType: 'open_mat', source: 'import', notes: 'good day' })
    expect(new Date(s1.date).getDate()).toBe(24)
    const s2 = (await db.bjjSessions.where('externalId').equals('s2').first())!
    expect(s2.classType).toBe('regular')
    expect(s2.taught).toHaveLength(2) // matched case-insensitively
    expect(s2.durationMin).toBeUndefined()
  })

  it('merges into an existing map without overriding your statuses, and skips repeats', async () => {
    const db = fresh()
    await db.positions.bulkAdd([
      { id: 'hg', name: 'half guard', side: 'bottom', kind: 'position', x: 500, y: 500, createdAt: 1 },
      { id: 'bk', name: 'Back', side: 'top', kind: 'position', x: 0, y: -1, createdAt: 1 },
    ])
    await db.techniques.add({ id: 't', name: 'Knee shield back take', fromId: 'hg', toId: 'bk', status: 'learning', createdAt: 1, updatedAt: 1 })

    const first = await planJournal(db, parseJournal(JSON.stringify(SAMPLE)))
    expect(first.newPositions.map((p) => p.name)).toEqual(['RNC'])
    expect(first.existingTechniques).toBe(1)
    await commitJournal(db, first)
    const t = (await db.techniques.get('t'))!
    expect(t.status).toBe('learning')
    expect(t.notes).toBe('underhook first')
    expect((await db.positions.get('hg'))!.x).toBe(500)

    const again = await planJournal(db, parseJournal(JSON.stringify(SAMPLE)))
    expect(again).toMatchObject({ newSessions: [], skippedSessions: 2, newBucket: [], skippedBucket: 3, newTechniques: [], newPositions: [] })
  })

  it('rejects bad files with a clear reason', () => {
    expect(() => parseJournal('{')).toThrow(JournalError)
    expect(() => parseJournal(JSON.stringify({ ...SAMPLE, format: 'x' }))).toThrow(/not a SUPER TRACKER/)
    expect(() => parseJournal(JSON.stringify({ ...SAMPLE, techniques: [...SAMPLE.techniques, SAMPLE.techniques[0]] }))).toThrow(/twice/)
    expect(() => parseJournal(JSON.stringify({ ...SAMPLE, sessions: [{ id: 'x', date: '24/05/2025' }] }))).toThrow(/Bad date/)
  })
})

// Optional check against a real journal: BJJ_JOURNAL=/path/to/journal.json npm test
const real = process.env.BJJ_JOURNAL
describe.skipIf(!real)('real BJJ journal', () => {
  it('imports cleanly', async () => {
    const db = fresh()
    const plan = await planJournal(db, parseJournal(readFileSync(real!, 'utf8')))
    console.log({ unresolved: plan.unresolved, broken: plan.brokenTechniques }, await commitJournal(db, plan))
    expect(plan.brokenTechniques).toEqual([])
    expect(plan.unresolved).toEqual([])
  })
})
