import { describe, expect, it } from 'vitest'
import type { Position, Technique } from '../db/schema'
import { edgeGeometries, nodeColor, sideOfY, STATUS_COLOR, NEUTRAL } from './map'

const pos = (id: string, x: number, y: number): Position => ({ id, name: id, side: sideOfY(y), kind: 'position', x, y, createdAt: 0 })
const tech = (id: string, fromId: string, toId: string, status: Technique['status'] = 'learning'): Technique => ({
  id, name: id, fromId, toId, status, createdAt: 0, updatedAt: 0,
})

describe('map geometry', () => {
  const positions = new Map([pos('a', 0, 100), pos('b', 200, -100), pos('c', 400, 100)].map((p) => [p.id, p]))

  it('splits sides at the divider', () => {
    expect(sideOfY(-1)).toBe('top')
    expect(sideOfY(10)).toBe('bottom')
  })

  it('fans out edges between the same pair so they never overlap', () => {
    const geo = edgeGeometries([tech('t1', 'a', 'b'), tech('t2', 'b', 'a'), tech('t3', 'a', 'b')], positions)
    expect(geo).toHaveLength(3)
    const mids = geo.map((g) => `${Math.round(g.mid.x)},${Math.round(g.mid.y)}`)
    expect(new Set(mids).size).toBe(3)
  })

  it('skips edges whose positions are missing', () => {
    expect(edgeGeometries([tech('t', 'a', 'zzz')], positions)).toHaveLength(0)
  })

  it('colors a node by its best technique status', () => {
    const ts = [tech('t1', 'a', 'b', 'want'), tech('t2', 'b', 'c', 'agame')]
    expect(nodeColor('a', ts)).toBe(STATUS_COLOR.want)
    expect(nodeColor('b', ts)).toBe(STATUS_COLOR.agame)
    expect(nodeColor('zzz', ts)).toBe(NEUTRAL)
  })
})
