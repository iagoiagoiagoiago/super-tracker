import { describe, expect, it } from 'vitest'
import type { BjjSession } from '../db/schema'
import { emptyDraft, hitCounts, sessionLoad } from './sessions'

const s = (date: number, hit: string[]): BjjSession => ({ id: String(date), ...emptyDraft(date), hit })

describe('bjj sessions', () => {
  it('counts hits once per session inside the window', () => {
    const counts = hitCounts([s(10, ['a', 'a', 'b']), s(20, ['a']), s(1, ['b'])], 5)
    expect(counts.get('a')).toBe(2)
    expect(counts.get('b')).toBe(1)
  })

  it('computes session load as minutes × RPE', () => {
    expect(sessionLoad({ durationMin: 90, rpe: 7 })).toBe(630)
  })
})
