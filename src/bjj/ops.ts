import { db, newId } from '../db/db'
import type { ID, Position, Technique, TechniqueStatus } from '../db/schema'
import { sideOfY } from './map'

export async function addPosition(input: { name: string; kind: Position['kind']; x: number; y: number }): Promise<ID> {
  const id = newId()
  await db.positions.add({
    id,
    name: input.name.trim(),
    kind: input.kind,
    side: sideOfY(input.y),
    x: Math.round(input.x),
    y: Math.round(input.y),
    createdAt: Date.now(),
  })
  return id
}

export async function movePosition(id: ID, x: number, y: number): Promise<void> {
  await db.positions.update(id, { x: Math.round(x), y: Math.round(y), side: sideOfY(y) })
}

export async function updatePosition(id: ID, patch: Partial<Pick<Position, 'name' | 'kind' | 'notes'>>) {
  await db.positions.update(id, patch)
}

/** Deletes a position and every technique that starts or ends there. */
export async function deletePosition(id: ID): Promise<void> {
  await db.transaction('rw', [db.positions, db.techniques], async () => {
    await db.techniques.where('fromId').equals(id).delete()
    await db.techniques.where('toId').equals(id).delete()
    await db.positions.delete(id)
  })
}

export async function addTechnique(input: { name: string; fromId: ID; toId: ID; status: TechniqueStatus }): Promise<ID> {
  const id = newId()
  const now = Date.now()
  await db.techniques.add({ id, name: input.name.trim(), fromId: input.fromId, toId: input.toId, status: input.status, createdAt: now, updatedAt: now })
  return id
}

export async function updateTechnique(id: ID, patch: Partial<Pick<Technique, 'name' | 'status' | 'notes' | 'fromId' | 'toId'>>) {
  await db.techniques.update(id, { ...patch, updatedAt: Date.now() })
}

export async function deleteTechnique(id: ID): Promise<void> {
  await db.techniques.delete(id)
}
