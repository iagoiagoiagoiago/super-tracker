import { describe, expect, it } from 'vitest'
import type { BjjSession, FocusCycle, Position, Technique } from '../db/schema'
import { analyzeFocus } from './focus'
import { emptyDraft } from './sessions'

const DAY = 86_400_000
const NOW = 100 * DAY

const pos = (id: string, y: number, kind: Position['kind'] = 'position'): Position => ({ id, name: id, side: y < 0 ? 'top' : 'bottom', kind, x: 0, y, createdAt: 0 })
const tech = (id: string, fromId: string, toId: string, status: Technique['status'], createdAt = 0): Technique => ({
  id, name: id, fromId, toId, status, createdAt, updatedAt: createdAt,
})
let n = 0
const session = (day: number, p: Partial<BjjSession> = {}): BjjSession => ({ id: `s${++n}`, ...emptyDraft(day * DAY), ...p })

const positions = [pos('half', 50), pos('back', -50), pos('side', -40), pos('sub', -80, 'submission')]
const cycle: FocusCycle = { id: 'c', side: 'bottom', positionId: 'half', startedAt: 80 * DAY }

describe('analyzeFocus', () => {
  it('ranks working-most, finds neglected and caught techniques', () => {
    const techniques = [
      tech('kneeShieldBack', 'half', 'back', 'hitting'),
      tech('underhookSweep', 'half', 'side', 'learning'),
      tech('lockdown', 'half', 'side', 'learning'),
      tech('kneeCut', 'side', 'back', 'learning'), // an opponent's pass from top: not yours, but it catches you
      tech('backToSub', 'back', 'sub', 'agame'),
    ]
    const sessions = [
      session(85, { hit: ['kneeShieldBack'], caughtBy: ['kneeCut'], workedFocus: true }),
      session(90, { hit: ['kneeShieldBack', 'underhookSweep'], caughtBy: ['kneeCut'], workedFocus: true }),
      session(95, { taught: ['underhookSweep'], caughtBy: ['kneeCut'], workedFocus: false }),
      session(70, { hit: ['lockdown'] }), // before the cycle: lockdown last logged 30 days ago
    ]
    const a = analyzeFocus(cycle, positions, techniques, sessions, NOW)
    expect(a.sessions).toBe(3)
    expect(a.onFocus).toBe(2)
    expect(a.daysIn).toBe(20)
    expect(a.workingMost.map((s) => s.technique.id)).toEqual(['kneeShieldBack', 'underhookSweep'])
    expect(a.neglected.map((s) => [s.technique.id, s.daysSince])).toEqual([['lockdown', 30]])
    expect(a.caught[0]).toMatchObject({ caught: 3 })

    const kinds = a.suggestions.map((s) => `${s.kind}:${s.techniqueId}`)
    expect(kinds).toContain('leak:kneeCut')
    expect(kinds).toContain('stale:lockdown')
    expect(kinds).not.toContain('dead_end:kneeShieldBack') // back has a follow-up (backToSub)
  })

  it('counts opponents\' techniques from the other side as getting caught', () => {
    const techniques = [tech('kneeCutHqSide', 'back', 'side', 'learning'), tech('unrelatedBottom', 'half2', 'half2b', 'learning')]
    const ps = [...positions, pos('half2', 60), pos('half2b', 70)]
    const sessions = [81, 84, 88].map((d) => session(d, { caughtBy: ['kneeCutHqSide', 'unrelatedBottom'] }))
    const a = analyzeFocus(cycle, ps, techniques, sessions, NOW)
    expect(a.caught.map((s) => s.technique.id)).toEqual(['kneeCutHqSide'])
    expect(a.suggestions.find((s) => s.kind === 'leak')?.techniqueId).toBe('kneeCutHqSide')
  })

  it('flags dead ends and promotions', () => {
    const techniques = [tech('sweep', 'half', 'side', 'learning')]
    const sessions = [81, 84, 88].map((d) => session(d, { hit: ['sweep'] }))
    const a = analyzeFocus(cycle, positions, techniques, sessions, NOW)
    expect(a.suggestions.find((s) => s.kind === 'dead_end')?.positionId).toBe('side')
    expect(a.suggestions.find((s) => s.kind === 'promote')?.promoteTo).toBe('hitting')
  })

  it('flags low focus adherence', () => {
    const sessions = [81, 84, 88, 90].map((d, i) => session(d, { workedFocus: i === 0 }))
    const a = analyzeFocus(cycle, positions, [], sessions, NOW)
    expect(a.suggestions.map((s) => s.kind)).toContain('adherence')
  })
})
