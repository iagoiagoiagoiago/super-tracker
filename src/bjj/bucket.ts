import { db, newId } from '../db/db'
import type { BucketItem, ID } from '../db/schema'

// ---------- operations ----------

export async function addBucketItem(text: string, note?: string): Promise<ID | null> {
  const t = text.trim()
  if (!t) return null
  const id = newId()
  await db.bucketItems.add({ id, text: t, note: note?.trim() || undefined, reps: [], createdAt: Date.now() })
  return id
}

/** Logs one rep now (or at `at`) and returns its timestamp. */
export async function logRep(id: ID, at = Date.now()): Promise<number> {
  const item = await db.bucketItems.get(id)
  if (item) await db.bucketItems.update(id, { reps: [...item.reps, at] })
  return at
}

export async function undoRep(id: ID) {
  const item = await db.bucketItems.get(id)
  if (item?.reps.length) await db.bucketItems.update(id, { reps: item.reps.slice(0, -1) })
}

export async function updateBucketItem(id: ID, patch: { text?: string; note?: string }) {
  const clean: Partial<BucketItem> = {}
  if (patch.text !== undefined && patch.text.trim()) clean.text = patch.text.trim()
  if (patch.note !== undefined) clean.note = patch.note.trim() || undefined
  await db.bucketItems.update(id, clean)
}

export const setDone = (id: ID, done: boolean) => db.bucketItems.update(id, { doneAt: done ? Date.now() : undefined })

export const deleteBucketItem = (id: ID) => db.bucketItems.delete(id)

/** Open items newest first (a stable order, so rows don't jump while you tap), then done ones, latest first. */
export function sortBucket(items: BucketItem[]): { open: BucketItem[]; done: BucketItem[] } {
  return {
    open: items.filter((i) => !i.doneAt).sort((a, b) => b.createdAt - a.createdAt),
    done: items.filter((i) => i.doneAt).sort((a, b) => b.doneAt! - a.doneAt!),
  }
}
