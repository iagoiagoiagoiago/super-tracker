import { db, newId } from '../db/db'
import type { BjjSession, ClassType, ID } from '../db/schema'

export const CLASS_TYPES: { value: ClassType; label: string }[] = [
  { value: 'regular', label: 'Class' },
  { value: 'open_mat', label: 'Open mat' },
  { value: 'drilling', label: 'Drilling' },
  { value: 'wrestling', label: 'Wrestling' },
  { value: 'mma', label: 'MMA' },
  { value: 'fundamentals', label: 'Fundamentals' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'gi', label: 'Gi' },
  { value: 'private', label: 'Private' },
  { value: 'competition', label: 'Competition' },
]

export const classLabel = (c: ClassType) => CLASS_TYPES.find((x) => x.value === c)?.label ?? c

export type SessionDraft = Omit<BjjSession, 'id'>

export function emptyDraft(now = Date.now()): SessionDraft {
  return {
    date: now,
    classType: 'regular',
    durationMin: 90,
    rpe: 7,
    taught: [],
    hit: [],
    caughtBy: [],
    rounds: undefined,
    workedFocus: null,
  }
}

export async function saveSession(draft: SessionDraft, id?: ID): Promise<ID> {
  const clean: SessionDraft = {
    ...draft,
    worked: draft.worked?.trim() || undefined,
    problem: draft.problem?.trim() || undefined,
    nextFocus: draft.nextFocus?.trim() || undefined,
    notes: draft.notes?.trim() || undefined,
  }
  if (id) {
    await db.bjjSessions.put({ id, ...clean })
    return id
  }
  const newSessionId = newId()
  await db.bjjSessions.add({ id: newSessionId, ...clean })
  return newSessionId
}

export const deleteSession = (id: ID) => db.bjjSessions.delete(id)

/** Attendance only: nothing logged beyond the class type. */
export function isBareSession(s: BjjSession): boolean {
  return !s.taught.length && !s.hit.length && !s.caughtBy.length && !s.notes && !s.worked && !s.problem && !s.nextFocus && !s.rounds
}

/** Adds a BJJ class on a past day with nothing else logged (calendar backfill). Stored at local noon. */
export async function addAttendance(day: number): Promise<ID> {
  const d = new Date(day)
  d.setHours(12, 0, 0, 0)
  return saveSession({ ...emptyDraft(d.getTime()), durationMin: undefined, rpe: undefined })
}

export const HIT_WINDOW_DAYS = 90

/** How many sessions each technique was hit in since `since` (one count per session). */
export function hitCounts(sessions: BjjSession[], since: number): Map<ID, number> {
  const m = new Map<ID, number>()
  for (const s of sessions) {
    if (s.date < since) continue
    for (const id of new Set(s.hit)) m.set(id, (m.get(id) ?? 0) + 1)
  }
  return m
}

export interface Usage {
  taught: number
  hit: number
  caught: number
  /** Last session the technique appeared in, any role. */
  lastSeen?: number
}

/** All-time counts of how each technique shows up in session logs. */
export function techniqueUsage(sessions: BjjSession[]): Map<ID, Usage> {
  const m = new Map<ID, Usage>()
  const bump = (id: ID, k: 'taught' | 'hit' | 'caught', date: number) => {
    const u = m.get(id) ?? { taught: 0, hit: 0, caught: 0 }
    u[k]++
    u.lastSeen = Math.max(u.lastSeen ?? 0, date)
    m.set(id, u)
  }
  for (const s of sessions) {
    for (const id of new Set(s.taught)) bump(id, 'taught', s.date)
    for (const id of new Set(s.hit)) bump(id, 'hit', s.date)
    for (const id of new Set(s.caughtBy)) bump(id, 'caught', s.date)
  }
  return m
}

/** What load assumes when a session (usually imported) didn't record its length or intensity. */
export const TYPICAL_DURATION_MIN = 90
export const TYPICAL_RPE = 7

/** Session load in arbitrary units: minutes × RPE (session-RPE method). */
export const sessionLoad = (s: Pick<BjjSession, 'durationMin' | 'rpe'>) => (s.durationMin ?? TYPICAL_DURATION_MIN) * (s.rpe ?? TYPICAL_RPE)
