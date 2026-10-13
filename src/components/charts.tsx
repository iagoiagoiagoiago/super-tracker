import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react'

/** Tiny trend line for stat tiles. No interaction: the tile carries the number. */
export function Sparkline({ values, width = 64, height = 24, color = 'var(--color-accent)' }: { values: number[]; width?: number; height?: number; color?: string }) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden="true" />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (width - 4) + 2},${height - 3 - ((v - min) / span) * (height - 6)}`)
  const last = pts[pts.length - 1].split(',')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" opacity={0.55} />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={color} />
    </svg>
  )
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

function niceTicks(min: number, max: number, count = 3): number[] {
  if (min === max) return [min]
  const raw = (max - min) / (count - 1)
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const start = Math.floor(min / step) * step
  const ticks: number[] = []
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(Math.round(v * 100) / 100)
  return ticks
}

export interface LinePoint {
  t: number
  v: number
}

/**
 * Single-series line chart over time: 2px line, 10% area wash, hairline grid, end-point label,
 * and a crosshair + tooltip that follows touch or mouse.
 */
export function LineChart({
  points,
  height = 180,
  format = (v) => String(Math.round(v)),
  label,
}: {
  points: LinePoint[]
  height?: number
  format?: (v: number) => string
  label: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  if (points.length === 0) return <p className="py-8 text-center text-sm text-faint">No data yet.</p>

  const pad = { l: 34, r: 12, t: 22, b: 22 }
  const values = points.map((p) => p.v)
  const ticks = niceTicks(Math.min(...values), Math.max(...values))
  const yMin = Math.min(ticks[0], ...values)
  const yMax = Math.max(ticks[ticks.length - 1], ...values)
  const t0 = points[0].t
  const t1 = points[points.length - 1].t
  const iw = Math.max(1, width - pad.l - pad.r)
  const ih = height - pad.t - pad.b
  const x = (t: number) => pad.l + (t1 === t0 ? iw / 2 : ((t - t0) / (t1 - t0)) * iw)
  const y = (v: number) => pad.t + ih - ((v - yMin) / (yMax - yMin || 1)) * ih
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t)},${y(p.v)}`).join(' ')
  const area = `${line} L${x(t1)},${pad.t + ih} L${x(t0)},${pad.t + ih} Z`
  const fmtDate = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })

  function onMove(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    let best = 0
    for (let i = 1; i < points.length; i++) if (Math.abs(x(points[i].t) - px) < Math.abs(x(points[best].t) - px)) best = i
    setHover(best)
  }

  const h = hover === null ? null : points[hover]
  const last = points[points.length - 1]
  const tipX = h ? Math.min(Math.max(x(h.t), pad.l + 50), width - 60) : 0

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${label}: ${points.length} sessions, from ${format(points[0].v)} to ${format(last.v)}`}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
          style={{ touchAction: 'pan-y' }}
        >
          {ticks.map((tv) => (
            <g key={tv}>
              <line x1={pad.l} x2={width - pad.r} y1={y(tv)} y2={y(tv)} stroke="#1e2226" strokeWidth={1} />
              <text x={pad.l - 8} y={y(tv) + 4} textAnchor="end" fontSize={11} fill="var(--color-faint)" className="tabular-nums">
                {format(tv)}
              </text>
            </g>
          ))}
          <path d={area} fill="var(--color-accent)" opacity={0.1} />
          <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {!h && (
            <>
              <circle cx={x(last.t)} cy={y(last.v)} r={4} fill="var(--color-accent)" stroke="var(--color-surface)" strokeWidth={2} />
              <text x={Math.min(x(last.t), width - pad.r)} y={y(last.v) - 10} textAnchor="end" fontSize={12} fontWeight={600} fill="var(--color-text)">
                {format(last.v)}
              </text>
            </>
          )}
          <text x={pad.l} y={height - 4} fontSize={11} fill="var(--color-faint)">{fmtDate(t0)}</text>
          <text x={width - pad.r} y={height - 4} fontSize={11} fill="var(--color-faint)" textAnchor="end">{fmtDate(t1)}</text>
          {h && (
            <>
              <line x1={x(h.t)} x2={x(h.t)} y1={pad.t} y2={pad.t + ih} stroke="var(--color-muted)" strokeWidth={1} />
              <circle cx={x(h.t)} cy={y(h.v)} r={5} fill="var(--color-accent)" stroke="var(--color-surface)" strokeWidth={2} />
            </>
          )}
        </svg>
      )}
      {h && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg border border-line bg-[#181b1f] px-2.5 py-1 text-center shadow-lg"
          style={{ left: tipX }}
        >
          <div className="text-[13px] font-bold">{format(h.v)}</div>
          <div className="text-[10px] text-faint">{fmtDate(h.t)}</div>
        </div>
      )}
    </div>
  )
}
