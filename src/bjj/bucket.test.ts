import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import { addBucketItem, logRep, setDone, sortBucket, undoRep, updateBucketItem } from './bucket'

afterEach(() => db.bucketItems.clear())

describe('bucket list', () => {
  it('adds items, logs and undoes reps, and keeps text when only the note changes', async () => {
    expect(await addBucketItem('   ')).toBeNull()
    const id = (await addBucketItem('  Back triangle entries '))!
    await logRep(id, 100)
    await logRep(id, 200)
    await undoRep(id)
    await updateBucketItem(id, { note: ' from crucifix ' })
    expect(await db.bucketItems.get(id)).toMatchObject({ text: 'Back triangle entries', note: 'from crucifix', reps: [100] })
  })

  it('lists open items newest first and done items apart', async () => {
    const a = (await addBucketItem('a'))!
    await new Promise((r) => setTimeout(r, 2))
    const b = (await addBucketItem('b'))!
    await new Promise((r) => setTimeout(r, 2))
    const c = (await addBucketItem('c'))!
    await setDone(b, true)
    await logRep(a) // a rep doesn't reorder: rows stay put while you tap
    const { open, done } = sortBucket(await db.bucketItems.toArray())
    expect(open.map((i) => i.id)).toEqual([c, a])
    expect(done.map((i) => i.id)).toEqual([b])
  })
})
