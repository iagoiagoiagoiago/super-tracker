import type { ID, Position, Side, Technique, TechniqueStatus } from '../db/schema'

/** Neon status colors. Hex (not CSS vars) because SVG presentation attributes don't resolve var(). */
export const STATUS_COLOR: Record<TechniqueStatus, string> = {
  want: '#b86bff',
  learning: '#22e6ff',
  hitting: '#b6ff3b',
  agame: '#ff3da6',
}

export const STATUS_LABEL: Record<TechniqueStatus, string> = {
  want: 'Want to learn',
  learning: 'Learning',
  hitting: 'Hitting',
  agame: 'A-game',
}

export const STATUS_SHORT: Record<TechniqueStatus, string> = {
  want: 'Want',
  learning: 'Learning',
  hitting: 'Hitting',
  agame: 'A-game',
}

export const STATUS_ORDER: TechniqueStatus[] = ['want', 'learning', 'hitting', 'agame']

export const NEUTRAL = '#5e656d'

/** Positions above the divider (y < 0) are top / passing; below are bottom / guard. */
export const sideOfY = (y: number): Side => (y < 0 ? 'top' : 'bottom')

/** A position glows with the best status among the techniques touching it. */
export function nodeColor(positionId: ID, techniques: Technique[]): string {
  let best = -1
  for (const t of techniques) {
    if (t.fromId !== positionId && t.toId !== positionId) continue
    best = Math.max(best, STATUS_ORDER.indexOf(t.status))
  }
  return best < 0 ? NEUTRAL : STATUS_COLOR[STATUS_ORDER[best]]
}

export interface EdgeGeometry {
  id: ID
  path: string
  /** Point halfway along the curve (for labels and the direction chevron). */
  mid: { x: number; y: number }
  /** Tangent angle at the midpoint, in degrees. */
  angle: number
}

const NODE_R = 12

/**
 * Quadratic curve between two positions. Edges between the same pair (either direction) fan out on alternating
 * sides so none overlap; a single edge still bends slightly, which reads as organic rather than wired.
 */
export function edgeGeometries(techniques: Technique[], positions: Map<ID, Position>): EdgeGeometry[] {
  const groups = new Map<string, Technique[]>()
  for (const t of techniques) {
    if (!positions.has(t.fromId) || !positions.has(t.toId)) continue
    const key = [t.fromId, t.toId].sort().join('|')
    groups.set(key, [...(groups.get(key) ?? []), t])
  }
  const out: EdgeGeometry[] = []
  for (const group of groups.values()) {
    group.forEach((t, i) => {
      const a = positions.get(t.fromId)!
      const b = positions.get(t.toId)!
      if (a.id === b.id) return
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy) || 1
      // Normal relative to a canonical direction so A→B and B→A bend to opposite sides.
      const canonical = a.id < b.id ? 1 : -1
      const nx = (-dy / len) * canonical
      const ny = (dx / len) * canonical
      const slot = i - (group.length - 1) / 2 // …, -0.5, 0.5, … or 0 for a single edge
      const bend = Math.min(60, len * 0.18) * (group.length === 1 ? 0.6 : slot * 1.6 || 0.6)
      const cx = (a.x + b.x) / 2 + nx * bend
      const cy = (a.y + b.y) / 2 + ny * bend
      // Shorten ends so the line meets the node rim, not its centre.
      const sx = a.x + ((cx - a.x) / Math.hypot(cx - a.x, cy - a.y)) * NODE_R
      const sy = a.y + ((cy - a.y) / Math.hypot(cx - a.x, cy - a.y)) * NODE_R
      const ex = b.x + ((cx - b.x) / Math.hypot(cx - b.x, cy - b.y)) * NODE_R
      const ey = b.y + ((cy - b.y) / Math.hypot(cx - b.x, cy - b.y)) * NODE_R
      const mid = { x: 0.25 * sx + 0.5 * cx + 0.25 * ex, y: 0.25 * sy + 0.5 * cy + 0.25 * ey }
      const angle = (Math.atan2(ey - sy, ex - sx) * 180) / Math.PI
      out.push({ id: t.id, path: `M${sx},${sy} Q${cx},${cy} ${ex},${ey}`, mid, angle })
    })
  }
  return out
}

/** Stroke width grows with how often the technique was hit in sparring (session logs, Phase 5). */
export function edgeWidth(status: TechniqueStatus, hits: number): number {
  const base = { want: 1.2, learning: 1.6, hitting: 2, agame: 2.4 }[status]
  return base + Math.min(2, Math.log2(1 + hits) * 0.5)
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function boundsOf(positions: Position[]): Bounds | null {
  if (!positions.length) return null
  return {
    minX: Math.min(...positions.map((p) => p.x)),
    minY: Math.min(...positions.map((p) => p.y), -60),
    maxX: Math.max(...positions.map((p) => p.x)),
    maxY: Math.max(...positions.map((p) => p.y), 60),
  }
}
