import { useState } from 'react'
import type { DayCell, WeekLoad } from './activity'

const GYM = 'var(--color-gym)'
const BJJ = 'var(--color-bjj)'
const EMPTY = '#15181b'

const fmtDay = (t: number) => new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
const fmtWeek = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n)))

export function Legend() {
  return (
    <div className="flex gap-3 text-[11px] text-muted">
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-[2px]" style={{ background: GYM }} />
        Gym
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-[2px]" style={{ background: BJJ }} />
        BJJ
      </span>
    </div>
  )
}

/** 12-week × 7-day consistency grid. Days with both sports are split diagonally. Tap a day for details. */
export function Heatmap({ grid, today }: { grid: DayCell[][]; today: number }) {
  const [picked, setPicked] = useState<DayCell | null>(null)
  const active = picked ?? grid.flat().find((c) => c.date === today) ?? null

  const fill = (c: DayCell) => {
    if (c.future) return 'transparent'
    if (c.gym.length && c.bjj.length) return `linear-gradient(135deg, ${GYM} 0 50%, ${BJJ} 50% 100%)`
    if (c.gym.length) return GYM
    if (c.bjj.length) return BJJ
    return EMPTY
  }

  // Month label over the first column whose Monday starts a new month.
  const months = grid.map((col, i) => {
    const m = new Date(col[0].date).getMonth()
    const prev = i ? new Date(grid[i - 1][0].date).getMonth() : -1
    return m !== prev ? new Date(col[0].date).toLocaleDateString('en-GB', { month: 'short' }) : ''
  })

  const describe = (c: DayCell) => {
    const parts = [...c.gym, ...(c.bjj.length ? [c.bjj.length > 1 ? `BJJ ×${c.bjj.length}` : 'BJJ'] : [])]
    return parts.length ? parts.join(' · ') : c.future ? 'Upcoming' : 'Rest day'
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[14px_minmax(0,1fr)] gap-x-1.5">
        <span />
        <div className="grid grid-cols-12 gap-1 text-[10px] text-dim">
          {months.map((m, i) => (
            <span key={i} className="overflow-visible whitespace-nowrap">{m}</span>
          ))}
        </div>
        <div className="grid grid-rows-7 gap-1 text-[9px] leading-none text-dim">
          {['M', '', 'W', '', 'F', '', ''].map((d, i) => (
            <span key={i} className="flex items-center">{d}</span>
          ))}
        </div>
        <div className="grid grid-flow-col grid-cols-12 grid-rows-7 gap-1" role="grid" aria-label="Training days, last 12 weeks">
          {grid.flat().map((c) => (
            <button
              key={c.date}
              onClick={() => setPicked(c)}
              aria-label={`${fmtDay(c.date)}: ${describe(c)}`}
              className={`aspect-square rounded-[4px] ${c.future ? 'border border-[#15181b]' : ''} ${active?.date === c.date ? 'ring-2 ring-text ring-offset-1 ring-offset-surface' : ''}`}
              style={{ background: fill(c) }}
            />
          ))}
        </div>
      </div>
      {active && (
        <p className="text-xs text-muted" aria-live="polite">
          <span className="font-semibold text-text">{fmtDay(active.date)}</span> · {describe(active)}
        </p>
      )}
    </div>
  )
}

/** Weekly training load, gym and BJJ stacked. Tap a week for its numbers. */
export function LoadChart({ weeks }: { weeks: WeekLoad[] }) {
  const [picked, setPicked] = useState(weeks.length - 1)
  const max = Math.max(1, ...weeks.map((w) => w.gym + w.bjj))
  const H = 120
  const w = weeks[picked]
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted" aria-live="polite">
        <span className="font-semibold text-text">Week of {fmtWeek(w.start)}</span> · total {compact(w.gym + w.bjj)}
        {' · '}gym {w.gymSessions} ({compact(w.gym)}) · BJJ {w.bjjSessions} ({compact(w.bjj)})
      </p>
      <div className="relative" style={{ height: H }}>
        <div className="absolute inset-x-0 top-0 border-t border-line" />
        <span className="absolute -top-2 right-0 bg-surface pl-1 text-[10px] text-dim">{compact(max)}</span>
        <div className="absolute inset-x-0 bottom-0 border-t border-line" />
        <div className="absolute inset-0 grid grid-cols-8 items-end gap-2">
          {weeks.map((wk, i) => {
            const gymH = (wk.gym / max) * (H - 4)
            const bjjH = (wk.bjj / max) * (H - 4)
            return (
              <button
                key={wk.start}
                onClick={() => setPicked(i)}
                aria-label={`Week of ${fmtWeek(wk.start)}: gym ${wk.gym}, BJJ ${wk.bjj}`}
                className="flex h-full flex-col items-center justify-end"
                style={{ opacity: i === picked ? 1 : 0.55 }}
              >
                <div className="flex w-full max-w-6 flex-col justify-end gap-[2px]">
                  {bjjH > 0 && <div className="rounded-t-[4px]" style={{ height: bjjH, background: BJJ, borderRadius: gymH > 0 ? '4px 4px 0 0' : '4px 4px 0 0' }} />}
                  {gymH > 0 && <div style={{ height: gymH, background: GYM, borderRadius: bjjH > 0 ? 0 : '4px 4px 0 0' }} />}
                </div>
              </button>
            )
          })}
        </div>
      </div>
      <div className="grid grid-cols-8 gap-2 text-center text-[10px] text-dim">
        {weeks.map((wk, i) => (
          <span key={wk.start} className={i === picked ? 'font-semibold text-muted' : ''}>
            {i === weeks.length - 1 ? 'Now' : new Date(wk.start).getDate()}
          </span>
        ))}
      </div>
    </div>
  )
}
