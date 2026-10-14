import { db, newId } from '../db/db'
import type { BjjNote, ID } from '../db/schema'

export type NoteDraft = Pick<BjjNote, 'title' | 'body' | 'date' | 'pinned'>

export async function saveNote(draft: NoteDraft, id?: ID): Promise<ID> {
  const now = Date.now()
  const clean = { ...draft, title: draft.title.trim() || 'Untitled', body: draft.body.replace(/\s+$/, '') }
  if (id) {
    await db.bjjNotes.update(id, { ...clean, updatedAt: now })
    return id
  }
  const nid = newId()
  await db.bjjNotes.add({ id: nid, ...clean, createdAt: now, updatedAt: now })
  return nid
}

export const deleteNote = (id: ID) => db.bjjNotes.delete(id)
export const setPinned = (id: ID, pinned: boolean) => db.bjjNotes.update(id, { pinned, updatedAt: Date.now() })

/** Pinned first, then by written date (or last edit), newest first. */
export function sortNotes(notes: BjjNote[]): BjjNote[] {
  const key = (n: BjjNote) => n.date ?? n.updatedAt
  return [...notes].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || key(b) - key(a))
}

export function matchesNote(n: BjjNote, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const hay = `${n.title}\n${n.body}`.toLowerCase()
  return q.split(/\s+/).every((w) => hay.includes(w))
}
