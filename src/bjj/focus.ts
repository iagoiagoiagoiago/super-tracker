import { db, newId } from '../db/db'
import type { BjjSession, FocusCycle, ID, Position, Side, Technique, TechniqueStatus } from '../db/schema'

const DAY = 86_400_000

/** A technique "learning" this long without appearing in a log is stale. */
export const STALE_DAYS = 21
/** Neglected: a technique of the focus position not logged for this long. */
export const NEGLECT_DAYS = 14
/** Caught this many times by the same technique in a cycle = a leak. */
export const LEAK_MIN = 3
/** Hits in the cycle needed to suggest promoting learning → hitting, and hitting → A-game. */
export const PROMOTE_TO_HITTING = 3
export const PROMOTE_TO_AGAME = 6
/** Hits needed before a technique that leads nowhere is flagged as a dead end. */
export const DEAD_END_MIN = 3

export type SuggestionKind = 'dead_end' | 'leak' | 'stale' | 'promote' | 'adherence'

export interface Suggestion {
  kind: SuggestionKind
  text: string
  techniqueId?: ID
  positionId?: ID
  /** For "promote": the status to move to. */
  promoteTo?: TechniqueStatus
}

export interface TechniqueStat {
  technique: Technique
  hits: number
  taught: number
  caught: number
  lastSeen?: number
}

export interface FocusAnalysis {
  cycle: FocusCycle
  position?: Position
  daysIn: number
  sessions: number
  answered: number
  onFocus: number
  workingMost: TechniqueStat[]
  neglected: (TechniqueStat & { daysSince: number })[]
  caught: TechniqueStat[]
  suggestions: Suggestion[]
}

const touches = (t: Technique, id: ID) => t.fromId === id || t.toId === id

export function analyzeFocus(
  cycle: FocusCycle,
  positions: Position[],
  techniques: Technique[],
  sessions: BjjSession[],
  now: number,
): FocusAnalysis {
  const posById = new Map(positions.map((p) => [p.id, p]))
  const position = posById.get(cycle.positionId)
  const end = cycle.endedAt ?? now
  const inCycle = sessions.filter((s) => s.date >= cycle.startedAt && s.date <= end)

  // Per-technique counts inside the cycle, and last time each technique appeared in any log ever.
  const stats = new Map<ID, TechniqueStat>()
  const techById = new Map(techniques.map((t) => [t.id, t]))
  const stat = (id: ID) => {
    let s = stats.get(id)
    if (!s) {
      s = { technique: techById.get(id)!, hits: 0, taught: 0, caught: 0 }
      stats.set(id, s)
    }
    return s
  }
  for (const t of techniques) stat(t.id)
  for (const s of sessions) {
    for (const id of new Set([...s.taught, ...s.hit, ...s.caughtBy])) {
      if (!techById.has(id)) continue
      const st = stat(id)
      st.lastSeen = Math.max(st.lastSeen ?? 0, s.date)
    }
  }
  for (const s of inCycle) {
    for (const id of new Set(s.hit)) if (techById.has(id)) stat(id).hits++
    for (const id of new Set(s.taught)) if (techById.has(id)) stat(id).taught++
    for (const id of new Set(s.caughtBy)) if (techById.has(id)) stat(id).caught++
  }

  const own = techniques.filter((t) => touches(t, cycle.positionId))
  const ownStats = own.map((t) => stats.get(t.id)!)

  const workingMost = ownStats
    .filter((s) => s.hits + s.taught > 0)
    .sort((a, b) => b.hits - a.hits || b.taught - a.taught)
    .slice(0, 4)

  const daysSince = (s: TechniqueStat) => Math.floor((now - (s.lastSeen ?? s.technique.createdAt)) / DAY)
  const neglected = ownStats
    .filter((s) => (s.technique.status === 'learning' || s.technique.status === 'hitting') && daysSince(s) >= NEGLECT_DAYS)
    .map((s) => ({ ...s, daysSince: daysSince(s) }))
    .sort((a, b) => b.daysSince - a.daysSince)
    .slice(0, 4)

  // What gets you while working this side: anything touching the focus position, plus what opponents do from the
  // other side (on a bottom focus you get passed by top techniques; on a top focus you get swept by guard techniques).
  const caughtRelevant = techniques
    .filter((t) => touches(t, cycle.positionId) || (posById.get(t.fromId) && posById.get(t.fromId)!.side !== cycle.side))
    .map((t) => stats.get(t.id)!)
    .filter((s) => s.caught > 0)
    .sort((a, b) => b.caught - a.caught)
  const caught = caughtRelevant.slice(0, 4)

  // ---------- suggestions ----------
  const suggestions: Suggestion[] = []
  const name = (id: ID) => posById.get(id)?.name ?? 'that position'

  for (const s of ownStats) {
    const t = s.technique
    // Dead end: you keep landing somewhere you have nothing mapped from.
    if (t.fromId === cycle.positionId && s.hits >= DEAD_END_MIN) {
      const target = posById.get(t.toId)
      const hasFollowUp = techniques.some((x) => x.fromId === t.toId)
      if (target && target.kind === 'position' && !hasFollowUp) {
        suggestions.push({
          kind: 'dead_end',
          techniqueId: t.id,
          positionId: t.toId,
          text: `${t.name} lands you in ${target.name} ${s.hits} times this cycle, but nothing is mapped from ${target.name}. Add a follow-up.`,
        })
      }
    }
    // Stale: "learning" for weeks without showing up in a log.
    if (t.status === 'learning' && daysSince(s) >= STALE_DAYS) {
      suggestions.push({
        kind: 'stale',
        techniqueId: t.id,
        text: `${t.name} has been "learning" for ${daysSince(s)} days without being logged. Drill it or drop it.`,
      })
    }
    // Promote: you're clearly landing it.
    if (t.status === 'learning' && s.hits >= PROMOTE_TO_HITTING) {
      suggestions.push({ kind: 'promote', techniqueId: t.id, promoteTo: 'hitting', text: `${t.name} hit ${s.hits} times in sparring. Move it to Hitting?` })
    } else if (t.status === 'hitting' && s.hits >= PROMOTE_TO_AGAME) {
      suggestions.push({ kind: 'promote', techniqueId: t.id, promoteTo: 'agame', text: `${t.name} hit ${s.hits} times this cycle. Make it A-game?` })
    }
  }

  // Leak: the same technique keeps getting you.
  for (const s of caughtRelevant) {
    if (s.caught < LEAK_MIN) continue
    suggestions.push({
      kind: 'leak',
      techniqueId: s.technique.id,
      text: `Caught by ${s.technique.name} ${s.caught} times this cycle. Add or drill a counter from ${name(cycle.positionId)}.`,
    })
  }

  const answered = inCycle.filter((s) => s.workedFocus !== null && s.workedFocus !== undefined).length
  const onFocus = inCycle.filter((s) => s.workedFocus === true).length
  if (answered >= 3 && onFocus / answered < 0.4) {
    suggestions.push({
      kind: 'adherence',
      text: `You worked on ${name(cycle.positionId)} in ${onFocus} of ${answered} sessions. Start rounds from there on purpose.`,
    })
  }

  const order: SuggestionKind[] = ['leak', 'dead_end', 'promote', 'stale', 'adherence']
  suggestions.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))

  return {
    cycle,
    position,
    daysIn: Math.max(0, Math.floor((end - cycle.startedAt) / DAY)),
    sessions: inCycle.length,
    answered,
    onFocus,
    workingMost,
    neglected,
    caught,
    suggestions,
  }
}

// ---------- persistence ----------

/** Starts a cycle for a side, ending the current one on that side (one active cycle per side). */
export async function startCycle(side: Side, positionId: ID, goal?: string): Promise<ID> {
  return db.transaction('rw', db.focusCycles, async () => {
    const now = Date.now()
    const active = (await db.focusCycles.where('side').equals(side).toArray()).filter((c) => !c.endedAt)
    for (const c of active) await db.focusCycles.update(c.id, { endedAt: now })
    const id = newId()
    await db.focusCycles.add({ id, side, positionId, goal: goal?.trim() || undefined, startedAt: now })
    return id
  })
}

export const endCycle = (id: ID) => db.focusCycles.update(id, { endedAt: Date.now() })
export const updateCycleGoal = (id: ID, goal: string) => db.focusCycles.update(id, { goal: goal.trim() || undefined })
