/**
 * Imports a BJJ journal from JSON: technique-map positions and techniques, past sessions and journal notes.
 *
 * Format (`format: "super-tracker-bjj"`, `version: 1`):
 * - positions: { name, side: "top" | "bottom", kind?: "position" | "submission", x, y, notes? }
 * - techniques: { name, from, to, status, notes? }        // from/to = position names; names unique in the file
 * - sessions: { id, date: "YYYY-MM-DD", classType?, durationMin?, rpe?, rounds?,
 *               taught?, hit?, caughtBy?,                  // technique names from this file or the existing map
 *               worked?, problem?, nextFocus?, notes? }
 * - notes: { id, title, body, date?: "YYYY-MM-DD", pinned? }
 *
 * Merging is by name, case-insensitive, so it's safe to import into a map you already started: existing positions
 * keep their place, existing techniques keep the status you gave them (notes are only filled in where empty),
 * and sessions/notes already imported (same `id`) are skipped.
 */
import { newId, type SuperTrackerDB } from '../db/db'
import type { BjjNote, BjjSession, ClassType, ID, Position, Side, Technique, TechniqueStatus } from '../db/schema'
import { nameKey } from '../lib/exerciseCatalog'

export const BJJ_FORMAT = 'super-tracker-bjj'

export interface JournalPosition {
  name: string
  side: Side
  kind?: Position['kind']
  x: number
  y: number
  notes?: string
}
export interface JournalTechnique {
  name: string
  from: string
  to: string
  status: TechniqueStatus
  notes?: string
}
export interface JournalSession {
  id: string
  date: string
  classType?: ClassType
  durationMin?: number
  rpe?: number
  rounds?: number
  taught?: string[]
  hit?: string[]
  caughtBy?: string[]
  worked?: string
  problem?: string
  nextFocus?: string
  notes?: string
}
export interface JournalNote {
  id: string
  title: string
  body: string
  date?: string
  pinned?: boolean
}
export interface Journal {
  format: typeof BJJ_FORMAT
  version: 1
  positions?: JournalPosition[]
  techniques?: JournalTechnique[]
  sessions?: JournalSession[]
  notes?: JournalNote[]
}

export class JournalError extends Error {}

const STATUSES: TechniqueStatus[] = ['want', 'learning', 'hitting', 'agame']
const CLASS_TYPES: ClassType[] = ['regular', 'open_mat', 'drilling', 'fundamentals', 'advanced', 'wrestling', 'mma', 'gi', 'private', 'competition']

/** "2025-05-24" → local noon that day (noon keeps the calendar day stable across time zones and DST). */
export function journalDate(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) throw new JournalError(`Bad date "${s}" (use YYYY-MM-DD).`)
  return new Date(+m[1], +m[2] - 1, +m[3], 12).getTime()
}

export function parseJournal(text: string): Journal {
  let j: Journal
  try {
    j = JSON.parse(text)
  } catch {
    throw new JournalError('This file is not valid JSON.')
  }
  if (!j || j.format !== BJJ_FORMAT) throw new JournalError('This is not a SUPER TRACKER BJJ journal file.')
  if (j.version !== 1) throw new JournalError('This journal file was made for a different version of the app.')

  const posNames = new Set<string>()
  for (const p of j.positions ?? []) {
    if (!p.name?.trim()) throw new JournalError('A position has no name.')
    if (p.side !== 'top' && p.side !== 'bottom') throw new JournalError(`Position "${p.name}" needs side "top" or "bottom".`)
    if (posNames.has(nameKey(p.name))) throw new JournalError(`Position "${p.name}" appears twice.`)
    posNames.add(nameKey(p.name))
  }
  const techNames = new Set<string>()
  for (const t of j.techniques ?? []) {
    if (!STATUSES.includes(t.status)) throw new JournalError(`Technique "${t.name}" has an unknown status "${t.status}".`)
    if (techNames.has(nameKey(t.name))) throw new JournalError(`Technique "${t.name}" appears twice; names must be unique in the file.`)
    techNames.add(nameKey(t.name))
  }
  for (const s of j.sessions ?? []) {
    journalDate(s.date)
    if (s.classType && !CLASS_TYPES.includes(s.classType)) throw new JournalError(`Session ${s.date} has an unknown class type "${s.classType}".`)
  }
  for (const n of j.notes ?? []) if (n.date) journalDate(n.date)
  return j
}

// ---------- plan ----------

export interface JournalPlan {
  journal: Journal
  newPositions: JournalPosition[]
  existingPositions: number
  newTechniques: JournalTechnique[]
  existingTechniques: number
  newSessions: JournalSession[]
  skippedSessions: number
  newNotes: JournalNote[]
  skippedNotes: number
  /** Technique names referenced by sessions that match nothing (they stay in the session's text only). */
  unresolved: string[]
  /** Techniques whose from/to position doesn't exist anywhere. */
  brokenTechniques: string[]
}

const techKey = (name: string, from: string, to: string) => `${nameKey(name)}|${nameKey(from)}|${nameKey(to)}`

export async function planJournal(db: SuperTrackerDB, journal: Journal): Promise<JournalPlan> {
  const [positions, techniques, sessions, notes] = await Promise.all([
    db.positions.toArray(),
    db.techniques.toArray(),
    db.bjjSessions.toArray(),
    db.bjjNotes.toArray(),
  ])
  const posByKey = new Map(positions.map((p) => [nameKey(p.name), p]))
  const posName = new Map(positions.map((p) => [p.id, p.name]))
  const existingTech = new Set(techniques.map((t) => techKey(t.name, posName.get(t.fromId) ?? '', posName.get(t.toId) ?? '')))
  const existingTechNames = new Set(techniques.map((t) => nameKey(t.name)))

  const newPositions = (journal.positions ?? []).filter((p) => !posByKey.has(nameKey(p.name)))
  const allPositionKeys = new Set([...posByKey.keys(), ...newPositions.map((p) => nameKey(p.name))])

  const brokenTechniques: string[] = []
  const newTechniques: JournalTechnique[] = []
  let existingTechniques = 0
  for (const t of journal.techniques ?? []) {
    if (!allPositionKeys.has(nameKey(t.from)) || !allPositionKeys.has(nameKey(t.to))) {
      brokenTechniques.push(t.name)
      continue
    }
    if (existingTech.has(techKey(t.name, t.from, t.to))) existingTechniques++
    else newTechniques.push(t)
  }

  const seenSessions = new Set(sessions.map((s) => s.externalId).filter(Boolean))
  const newSessions = (journal.sessions ?? []).filter((s) => !seenSessions.has(s.id))
  const seenNotes = new Set(notes.map((n) => n.externalId).filter(Boolean))
  const newNotes = (journal.notes ?? []).filter((n) => !seenNotes.has(n.id))

  const fileTechNames = new Set((journal.techniques ?? []).filter((t) => !brokenTechniques.includes(t.name)).map((t) => nameKey(t.name)))
  const unresolved = new Set<string>()
  for (const s of newSessions) {
    for (const name of [...(s.taught ?? []), ...(s.hit ?? []), ...(s.caughtBy ?? [])]) {
      if (!fileTechNames.has(nameKey(name)) && !existingTechNames.has(nameKey(name))) unresolved.add(name)
    }
  }

  return {
    journal,
    newPositions,
    existingPositions: (journal.positions?.length ?? 0) - newPositions.length,
    newTechniques,
    existingTechniques,
    newSessions,
    skippedSessions: (journal.sessions?.length ?? 0) - newSessions.length,
    newNotes,
    skippedNotes: (journal.notes?.length ?? 0) - newNotes.length,
    unresolved: [...unresolved],
    brokenTechniques,
  }
}

// ---------- commit ----------

export interface JournalResult {
  positions: number
  techniques: number
  sessions: number
  notes: number
}

export async function commitJournal(db: SuperTrackerDB, plan: JournalPlan): Promise<JournalResult> {
  return db.transaction('rw', [db.positions, db.techniques, db.bjjSessions, db.bjjNotes], async () => {
    const now = Date.now()
    const { journal } = plan

    // Positions: add missing ones; fill notes on existing ones that have none.
    const existing = await db.positions.toArray()
    const posByKey = new Map(existing.map((p) => [nameKey(p.name), p.id]))
    const newPositions: Position[] = plan.newPositions.map((p) => {
      const id = newId()
      posByKey.set(nameKey(p.name), id)
      return { id, name: p.name.trim(), side: p.side, kind: p.kind ?? 'position', x: Math.round(p.x), y: Math.round(p.y), notes: p.notes, createdAt: now }
    })
    await db.positions.bulkAdd(newPositions)
    for (const p of journal.positions ?? []) {
      const cur = existing.find((e) => nameKey(e.name) === nameKey(p.name))
      if (cur && !cur.notes && p.notes) await db.positions.update(cur.id, { notes: p.notes })
    }

    // Techniques: add missing ones; never overwrite a status you set. Index by name for session references.
    const techs = await db.techniques.toArray()
    const posName = new Map((await db.positions.toArray()).map((p) => [p.id, p.name]))
    const techByKey = new Map(techs.map((t) => [techKey(t.name, posName.get(t.fromId) ?? '', posName.get(t.toId) ?? ''), t]))
    const techIdByName = new Map<string, ID>(techs.map((t) => [nameKey(t.name), t.id]))
    const newTechs: Technique[] = []
    for (const t of journal.techniques ?? []) {
      if (plan.brokenTechniques.includes(t.name)) continue
      const cur = techByKey.get(techKey(t.name, t.from, t.to))
      if (cur) {
        if (!cur.notes && t.notes) await db.techniques.update(cur.id, { notes: t.notes })
        techIdByName.set(nameKey(t.name), cur.id)
        continue
      }
      const id = newId()
      newTechs.push({
        id,
        name: t.name.trim(),
        fromId: posByKey.get(nameKey(t.from))!,
        toId: posByKey.get(nameKey(t.to))!,
        status: t.status,
        notes: t.notes,
        createdAt: now,
        updatedAt: now,
      })
      techIdByName.set(nameKey(t.name), id)
    }
    await db.techniques.bulkAdd(newTechs)

    const ids = (names?: string[]) => [...new Set((names ?? []).map((n) => techIdByName.get(nameKey(n))).filter((x): x is ID => !!x))]
    const sessions: BjjSession[] = plan.newSessions.map((s) => ({
      id: newId(),
      externalId: s.id,
      source: 'import',
      date: journalDate(s.date),
      classType: s.classType ?? 'regular',
      durationMin: s.durationMin,
      rpe: s.rpe,
      rounds: s.rounds,
      taught: ids(s.taught),
      hit: ids(s.hit),
      caughtBy: ids(s.caughtBy),
      workedFocus: null,
      worked: s.worked,
      problem: s.problem,
      nextFocus: s.nextFocus,
      notes: s.notes,
    }))
    await db.bjjSessions.bulkAdd(sessions)

    const notes: BjjNote[] = plan.newNotes.map((n) => ({
      id: newId(),
      externalId: n.id,
      title: n.title,
      body: n.body,
      date: n.date ? journalDate(n.date) : undefined,
      pinned: n.pinned,
      createdAt: now,
      updatedAt: now,
    }))
    await db.bjjNotes.bulkAdd(notes)

    return { positions: newPositions.length, techniques: newTechs.length, sessions: sessions.length, notes: notes.length }
  })
}
