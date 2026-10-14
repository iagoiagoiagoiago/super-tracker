import type { BucketItem, ID } from '../db/schema'

// Pure helpers for data made before the bucket list existed (DB < v5, backups < v2). No db import: db.ts uses this.

interface LegacyPosition {
  id: ID
  name: string
}
interface LegacyTechnique {
  id: ID
  name: string
  fromId: ID
  toId: ID
  status: string
  notes?: string
  createdAt?: number
}
interface LegacySession {
  taught?: ID[]
  hit?: ID[]
  caughtBy?: ID[]
}

/**
 * Turns techniques with the old "want" status into bucket items. A want technique that a session refers to (taught,
 * hit, caught by) is real history, so it stays on the map as "learning" instead. Positions that only existed for
 * removed techniques are removed too; positions that had no techniques at all are left alone.
 */
export function wantsToBucket(positions: LegacyPosition[], techniques: LegacyTechnique[], sessions: LegacySession[]) {
  const used = new Set(sessions.flatMap((s) => [...(s.taught ?? []), ...(s.hit ?? []), ...(s.caughtBy ?? [])]))
  const names = new Map(positions.map((p) => [p.id, p.name]))
  const wants = techniques.filter((t) => t.status === 'want')
  const removed = wants.filter((t) => !used.has(t.id))
  const removedIds = new Set(removed.map((t) => t.id))
  const kept = techniques.filter((t) => !removedIds.has(t.id))
  const touched = (ts: LegacyTechnique[]) => new Set(ts.flatMap((t) => [t.fromId, t.toId]))
  const before = touched(techniques)
  const after = touched(kept)
  const now = Date.now()
  const items: BucketItem[] = removed.map((t) => {
    const route = names.has(t.fromId) && names.has(t.toId) ? `${names.get(t.fromId)} → ${names.get(t.toId)}` : ''
    const note = [route, t.notes?.trim()].filter(Boolean).join('\n')
    return { id: crypto.randomUUID(), text: t.name, note: note || undefined, reps: [], createdAt: t.createdAt ?? now }
  })
  return {
    items,
    removedTechniqueIds: removed.map((t) => t.id),
    promotedTechniqueIds: wants.filter((t) => used.has(t.id)).map((t) => t.id),
    removedPositionIds: positions.filter((p) => before.has(p.id) && !after.has(p.id)).map((p) => p.id),
  }
}
