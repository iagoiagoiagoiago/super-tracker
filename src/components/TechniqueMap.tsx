import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { boundsOf, edgeGeometries, edgeWidth, NEUTRAL, nodeColor, STATUS_COLOR } from '../bjj/map'
import type { ID, Position, Technique } from '../db/schema'

export type MapSelection = { type: 'position'; id: ID } | { type: 'technique'; id: ID } | null
export type MapFilter = 'all' | 'bucket'

interface View {
  x: number
  y: number
  k: number
}

type Gesture =
  | { type: 'pan'; sx: number; sy: number; v0: View; moved: boolean }
  | { type: 'node'; id: ID; sx: number; sy: number; ox: number; oy: number; moved: boolean }
  | { type: 'edge'; id: ID; sx: number; sy: number; moved: boolean }
  | { type: 'connect'; fromId: ID }
  | { type: 'pinch'; d0: number; v0: View; wx: number; wy: number }

const MIN_K = 0.35
const MAX_K = 2.5
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** Fits all positions into the visible band between the header (top) and panels/tab bar (bottom). */
function fitView(positions: Position[], w: number, top: number, bottom: number): View {
  const h = Math.max(1, bottom - top)
  const b = boundsOf(positions)
  if (!b) return { x: w / 2, y: top + h / 2, k: 1 }
  const bw = b.maxX - b.minX + 140
  const bh = b.maxY - b.minY + 110
  const k = clamp(Math.min(w / bw, h / bh), 0.45, 1.4)
  return { x: w / 2 - k * ((b.minX + b.maxX) / 2), y: top + h / 2 - k * ((b.minY + b.maxY) / 2), k }
}

export interface TechniqueMapHandle {
  /** World coordinates at the centre of the visible map, used to place new positions. */
  center: () => { x: number; y: number }
  /** Visible world-space y range, so new positions land inside the right zone. */
  visibleY: () => { top: number; bottom: number }
}

export function TechniqueMap({
  positions,
  techniques,
  hits,
  filter,
  selection,
  onSelect,
  onMove,
  onConnect,
  handleRef,
  topInset = 0,
  bottomInset = 0,
  selectReserve = 0,
  readOnly = false,
  highlight,
}: {
  positions: Position[]
  techniques: Technique[]
  hits: Map<ID, number>
  filter: MapFilter
  selection: MapSelection
  onSelect: (s: MapSelection) => void
  onMove: (id: ID, x: number, y: number) => void
  onConnect: (fromId: ID, toId: ID) => void
  handleRef?: (h: TechniqueMapHandle) => void
  /** Screen space covered by overlays (header above, panels and tab bar below). */
  topInset?: number
  bottomInset?: number
  /** Screen height covered from the bottom while something is selected (details panel + tab bar). */
  selectReserve?: number
  /** Picker mode: no moving positions or creating techniques, taps only select. */
  readOnly?: boolean
  /** Techniques to emphasise (e.g. the ones picked in a session log); the rest are dimmed. */
  highlight?: Set<ID>
}) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [userView, setUserView] = useState<View | null>(null)
  const [dragPos, setDragPos] = useState<{ id: ID; x: number; y: number } | null>(null)
  const [cursor, setCursor] = useState<{ fromId: ID; x: number; y: number } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<Gesture | null>(null)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const visTop = topInset
  const visBottom = Math.max(topInset + 1, size.h - bottomInset)
  // Fit once, the first time there is something to show; after that the view only moves when the user moves it.
  if (userView === null && size.w > 0 && positions.length > 0) {
    setUserView(fitView(positions, size.w, visTop, visBottom))
  }
  const view = userView ?? fitView(positions, size.w, visTop, visBottom)
  const viewRef = useRef(view)
  useLayoutEffect(() => {
    viewRef.current = view
    handleRef?.({
      center: () => ({ x: (size.w / 2 - view.x) / view.k, y: ((visTop + visBottom) / 2 - view.y) / view.k }),
      visibleY: () => ({ top: (visTop - view.y) / view.k, bottom: (visBottom - view.y) / view.k }),
    })
  })

  const shown = useMemo(
    () => (dragPos ? positions.map((p) => (p.id === dragPos.id ? { ...p, x: dragPos.x, y: dragPos.y } : p)) : positions),
    [positions, dragPos],
  )
  const posMap = useMemo(() => new Map(shown.map((p) => [p.id, p])), [shown])
  const edges = useMemo(() => edgeGeometries(techniques, posMap), [techniques, posMap])
  const techById = useMemo(() => new Map(techniques.map((t) => [t.id, t])), [techniques])

  const selectedPos = selection?.type === 'position' ? selection.id : null
  const selectedTech = selection?.type === 'technique' ? techById.get(selection.id) : undefined

  const edgeOpacity = (t: Technique) => {
    if (highlight && highlight.size) return highlight.has(t.id) ? 1 : 0.28
    if (filter === 'bucket' && t.status !== 'want') return 0.12
    if (selectedPos && t.fromId !== selectedPos && t.toId !== selectedPos) return 0.2
    if (selectedTech && t.id !== selectedTech.id) return 0.2
    return 1
  }
  const nodeOpacity = (p: Position) => {
    if (filter === 'bucket') return techniques.some((t) => t.status === 'want' && (t.fromId === p.id || t.toId === p.id)) ? 1 : 0.3
    if (selectedTech) return p.id === selectedTech.fromId || p.id === selectedTech.toId ? 1 : 0.35
    return 1
  }

  // ---------- gestures ----------

  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const toWorld = (p: { x: number; y: number }, v = viewRef.current) => ({ x: (p.x - v.x) / v.k, y: (p.y - v.y) / v.k })

  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = local(e)
    pointers.current.set(e.pointerId, p)

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const w = toWorld(mid)
      setDragPos(null)
      setCursor(null)
      gesture.current = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, v0: viewRef.current, wx: w.x, wy: w.y }
      return
    }

    const target = (e.target as Element).closest('[data-node],[data-edge],[data-handle]')
    const handle = target?.getAttribute('data-handle')
    const node = target?.getAttribute('data-node')
    const edge = target?.getAttribute('data-edge')
    if (handle) {
      const w = toWorld(p)
      gesture.current = { type: 'connect', fromId: handle }
      setCursor({ fromId: handle, x: w.x, y: w.y })
    } else if (node) {
      const pos = posMap.get(node)!
      const w = toWorld(p)
      gesture.current = { type: 'node', id: node, sx: p.x, sy: p.y, ox: pos.x - w.x, oy: pos.y - w.y, moved: false }
    } else if (edge) {
      gesture.current = { type: 'edge', id: edge, sx: p.x, sy: p.y, moved: false }
    } else {
      gesture.current = { type: 'pan', sx: p.x, sy: p.y, v0: viewRef.current, moved: false }
    }
  }

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    if (!pointers.current.has(e.pointerId)) return
    const p = local(e)
    pointers.current.set(e.pointerId, p)
    const g = gesture.current
    if (!g) return
    if (g.type === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const k = clamp((g.v0.k * Math.hypot(a.x - b.x, a.y - b.y)) / g.d0, MIN_K, MAX_K)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      setUserView({ k, x: mid.x - g.wx * k, y: mid.y - g.wy * k })
    } else if (g.type === 'pan') {
      if (!g.moved && Math.hypot(p.x - g.sx, p.y - g.sy) < 5) return
      g.moved = true
      setUserView({ ...g.v0, x: g.v0.x + p.x - g.sx, y: g.v0.y + p.y - g.sy })
    } else if (g.type === 'node') {
      if (!g.moved && Math.hypot(p.x - g.sx, p.y - g.sy) < 7) return
      if (readOnly) {
        // In picker mode a drag that starts on a node pans the map instead.
        gesture.current = { type: 'pan', sx: p.x, sy: p.y, v0: viewRef.current, moved: true }
        return
      }
      g.moved = true
      const w = toWorld(p)
      setDragPos({ id: g.id, x: w.x + g.ox, y: w.y + g.oy })
    } else if (g.type === 'edge') {
      if (Math.hypot(p.x - g.sx, p.y - g.sy) > 7) g.moved = true
    } else if (g.type === 'connect') {
      const w = toWorld(p)
      setCursor({ fromId: g.fromId, x: w.x, y: w.y })
    }
  }

  function onPointerUp(e: PointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId)
    const g = gesture.current
    if (!g) return
    if (g.type === 'pinch') {
      if (pointers.current.size === 0) gesture.current = null
      else {
        const [rest] = [...pointers.current.values()]
        gesture.current = { type: 'pan', sx: rest.x, sy: rest.y, v0: viewRef.current, moved: true }
      }
      return
    }
    gesture.current = null
    if (g.type === 'node') {
      if (!g.moved) {
        const deselect = selectedPos === g.id
        onSelect(deselect ? null : { type: 'position', id: g.id })
        const pos = posMap.get(g.id)
        if (!deselect && pos) keepAbovePanel(pos.y)
      } else if (dragPos) onMove(g.id, dragPos.x, dragPos.y)
      setDragPos(null)
    } else if (g.type === 'edge') {
      if (!g.moved) {
        onSelect({ type: 'technique', id: g.id })
        const geo = edges.find((x) => x.id === g.id)
        if (geo) keepAbovePanel(geo.mid.y)
      }
    } else if (g.type === 'pan') {
      if (!g.moved) onSelect(null)
    } else if (g.type === 'connect') {
      const c = cursor
      setCursor(null)
      if (!c) return
      let best: Position | undefined
      let bestD = 34 / viewRef.current.k
      for (const pos of shown) {
        if (pos.id === g.fromId) continue
        const d = Math.hypot(pos.x - c.x, pos.y - c.y)
        if (d < bestD) {
          best = pos
          bestD = d
        }
      }
      if (best) onConnect(g.fromId, best.id)
    }
  }

  /** Scrolls the map up if a freshly selected item would end up hidden behind the details panel. */
  function keepAbovePanel(worldY: number) {
    const v = viewRef.current
    const screenY = v.y + worldY * v.k
    const limit = Math.max(visTop + 60, size.h - selectReserve - 40)
    if (screenY > limit) setUserView({ ...v, y: v.y - (screenY - limit) })
  }

  function onWheel(e: WheelEvent<SVGSVGElement>) {
    const p = local(e)
    const v = viewRef.current
    const w = toWorld(p, v)
    const k = clamp(v.k * Math.exp(-e.deltaY * 0.0015), MIN_K, MAX_K)
    setUserView({ k, x: p.x - w.x * k, y: p.y - w.y * k })
  }

  // ---------- render ----------

  const colorOf = (t: Technique) => STATUS_COLOR[t.status]
  const showTechLabels = (t: Technique) =>
    view.k >= 1.35 ||
    t.id === selectedTech?.id ||
    !!highlight?.has(t.id) ||
    (selectedPos !== null && (t.fromId === selectedPos || t.toId === selectedPos))
  const selected = selectedPos ? posMap.get(selectedPos) : undefined
  const dividerY = view.y

  return (
    <div
      ref={box}
      className="absolute inset-0 overflow-hidden"
      style={{
        backgroundColor: '#000',
        backgroundImage: 'radial-gradient(#15181c 1.1px, transparent 1.1px)',
        backgroundSize: `${22 * view.k}px ${22 * view.k}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
    >
      {size.w > 0 && (
        <svg
          width={size.w}
          height={size.h}
          className="block touch-none select-none"
          role="img"
          aria-label={`Technique map with ${positions.length} positions and ${techniques.length} techniques`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          <defs>
            <filter id="goo" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b" />
              <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" />
            </filter>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3.5" result="g" />
              <feMerge>
                <feMergeNode in="g" />
                <feMergeNode in="g" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Zone divider + labels in screen space */}
          <line x1={0} x2={size.w} y1={dividerY} y2={dividerY} stroke="#262a30" strokeDasharray="3 6" />
          <text x={16} y={dividerY - 10} fill="#4a5058" fontSize={10} fontWeight={600} letterSpacing={1.6}>TOP · PASSING</text>
          <text x={16} y={dividerY + 20} fill="#4a5058" fontSize={10} fontWeight={600} letterSpacing={1.6}>BOTTOM · GUARD</text>

          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {/* Slime: thick blurred strokes + blobs, thresholded so joins melt together */}
            <g filter="url(#goo)" fill="none" strokeLinecap="round">
              {edges.map((g) => {
                const t = techById.get(g.id)!
                return <path key={g.id} d={g.path} stroke={colorOf(t)} strokeWidth={edgeWidth(t.status, hits.get(t.id) ?? 0) * 3.4} opacity={0.5 * edgeOpacity(t)} />
              })}
              {shown.map((p) => (
                <circle key={p.id} cx={p.x} cy={p.y} r={p.kind === 'submission' ? 9 : 16} fill={nodeColor(p.id, techniques)} opacity={0.5 * nodeOpacity(p)} />
              ))}
            </g>

            {/* Neon cores */}
            <g filter="url(#glow)" fill="none" strokeLinecap="round">
              {edges.map((g) => {
                const t = techById.get(g.id)!
                return (
                  <path
                    key={g.id}
                    d={g.path}
                    stroke={colorOf(t)}
                    strokeWidth={edgeWidth(t.status, hits.get(t.id) ?? 0)}
                    strokeDasharray={t.status === 'want' ? '3 5' : undefined}
                    opacity={edgeOpacity(t)}
                  />
                )
              })}
            </g>

            {/* Flow pulse along techniques you actually use, in the direction of the technique */}
            <g fill="none" stroke="#fff" strokeWidth={1.3} strokeLinecap="round" strokeDasharray="2 14" opacity={0.55}>
              {edges.map((g) => {
                const t = techById.get(g.id)!
                const pulse = highlight?.size ? highlight.has(t.id) : t.status === 'hitting' || t.status === 'agame' || t.id === selectedTech?.id
                if (!pulse) return null
                return <path key={g.id} d={g.path} className="map-flow" opacity={edgeOpacity(t)} />
              })}
            </g>

            {/* Direction chevrons */}
            {edges.map((g) => {
              const t = techById.get(g.id)!
              return (
                <path
                  key={g.id}
                  d="M-3.5,-4 L2.5,0 L-3.5,4"
                  transform={`translate(${g.mid.x},${g.mid.y}) rotate(${g.angle})`}
                  fill="none"
                  stroke={colorOf(t)}
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.9 * edgeOpacity(t)}
                />
              )
            })}

            {/* Generous invisible hit targets for edges */}
            {edges.map((g) => (
              <path key={g.id} d={g.path} data-edge={g.id} stroke="transparent" strokeWidth={20 / view.k} fill="none" />
            ))}

            {selected && <circle cx={selected.x} cy={selected.y} r={24} fill="none" stroke={nodeColor(selected.id, techniques)} strokeWidth={1} className="map-breathe" />}

            {/* Nodes */}
            <g filter="url(#glow)">
              {shown.map((p) => {
                const c = nodeColor(p.id, techniques)
                return p.kind === 'submission' ? (
                  <circle key={p.id} cx={p.x} cy={p.y} r={5} fill={c} opacity={nodeOpacity(p)} />
                ) : (
                  <circle key={p.id} cx={p.x} cy={p.y} r={11} fill="#050607" stroke={c === NEUTRAL ? '#8a9098' : c} strokeWidth={1.7} opacity={nodeOpacity(p)} />
                )
              })}
            </g>
            {shown.map((p) => (
              <circle key={p.id} cx={p.x} cy={p.y} r={22} fill="transparent" data-node={p.id} style={{ cursor: 'grab' }} />
            ))}

            {/* Labels */}
            <g fontFamily="Geist Variable, system-ui, sans-serif" textAnchor="middle" style={{ paintOrder: 'stroke' }} stroke="#000" strokeWidth={3} strokeLinejoin="round">
              {shown.map((p) => (
                <text
                  key={p.id}
                  x={p.x}
                  y={p.kind === 'submission' ? p.y - 11 : p.y + 27}
                  fontSize={p.kind === 'submission' ? 9.5 : 11}
                  fontWeight={p.id === selectedPos ? 700 : 500}
                  fill={p.id === selectedPos ? '#f2f3f5' : p.kind === 'submission' ? '#6b727a' : '#9aa0a6'}
                  opacity={nodeOpacity(p)}
                  pointerEvents="none"
                >
                  {p.name}
                </text>
              ))}
              {edges.map((g) => {
                const t = techById.get(g.id)!
                if (!showTechLabels(t)) return null
                return (
                  <text key={g.id} x={g.mid.x} y={g.mid.y - 8} fontSize={9.5} fill="#c9cdd2" pointerEvents="none" opacity={edgeOpacity(t)}>
                    {t.name}
                  </text>
                )
              })}
            </g>

            {/* Connect handle on the selected position + live connection line */}
            {selected && selected.kind === 'position' && !cursor && !readOnly && (
              <g data-handle={selected.id} style={{ cursor: 'crosshair' }}>
                <circle cx={selected.x + 22} cy={selected.y - 22} r={16} fill="transparent" />
                <circle cx={selected.x + 22} cy={selected.y - 22} r={9} fill="#0e1012" stroke="#f2f3f5" strokeWidth={1.4} />
                <path d={`M${selected.x + 22 - 4},${selected.y - 22} h8 M${selected.x + 22},${selected.y - 22 - 4} v8`} stroke="#f2f3f5" strokeWidth={1.6} strokeLinecap="round" />
              </g>
            )}
            {cursor && posMap.get(cursor.fromId) && (
              <line
                x1={posMap.get(cursor.fromId)!.x}
                y1={posMap.get(cursor.fromId)!.y}
                x2={cursor.x}
                y2={cursor.y}
                stroke="#f2f3f5"
                strokeWidth={1.5}
                strokeDasharray="4 5"
                filter="url(#glow)"
              />
            )}
          </g>
        </svg>
      )}
    </div>
  )
}
