import { useMemo, useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from '../components/icons'
import type { BjjSession, Workout } from '../db/schema'
import { dayStart, firstActiveMonth, monthGrid, type DayCell, type WeekLoad } from './activity'

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

/**
 * One month as a Monday-first calendar. Gym days blue, BJJ lime, both split diagonally. ‹ › switch months,
 * from the first month with training up to the current month. Tap a day for what you did.
 */
export function MonthCalendar({
  workouts,
  sessions,
  now,
}: {
  workouts: Workout[]
  sessions: BjjSession[]
  now: number
}) {
  const today = new Date(now)
  const [ym, setYm] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [picked, setPicked] = useState<number | null>(null)
  const view = useMemo(() => monthGrid(ym.year, ym.month, workouts, sessions, now), [ym, workouts, sessions, now])
  const first = useMemo(() => firstActiveMonth(workouts, sessions, now), [workouts, sessions, now])

  const idx = (y: number, m: number) => y * 12 + m
  const canPrev = idx(ym.year, ym.month) > idx(first.year, first.month)
  const canNext = idx(ym.year, ym.month) < idx(today.getFullYear(), today.getMonth())
  const shift = (d: number) => {
    const n = idx(ym.year, ym.month) + d
    setYm({ year: Math.floor(n / 12), month: n % 12 })
    setPicked(null)
  }

  const todayStart = dayStart(now)
  const cells = view.weeks.flat()
  const active = cells.find((c) => c && c.date === picked) ?? cells.find((c) => c && c.date === todayStart) ?? null

  const fill = (c: DayCell) => {
    if (c.gym.length && c.bjj.length) return `linear-gradient(135deg, ${GYM} 0 50%, ${BJJ} 50% 100%)`
    if (c.gym.length) return GYM
    if (c.bjj.length) return BJJ
    return c.future ? 'transparent' : EMPTY
  }
  const describe = (c: DayCell) => {
    const parts = [...c.gym, ...(c.bjj.length ? [c.bjj.length > 1 ? `BJJ ×${c.bjj.length}` : 'BJJ'] : [])]
    return parts.length ? parts.join(' · ') : c.future ? 'Upcoming' : 'Rest day'
  }
  const title = new Date(ym.year, ym.month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const navBtn = 'flex h-9 w-9 items-center justify-center rounded-lg bg-raised text-muted disabled:opacity-25'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button onClick={() => shift(-1)} disabled={!canPrev} aria-label="Previous month" className={navBtn}>
          <ChevronLeftIcon size={18} />
        </button>
        <div className="text-center">
          <div className="text-[15px] font-bold">{title}</div>
          <div className="text-[11px] text-faint">
            {view.activeDays} days · {view.gymSessions} gym · {view.bjjSessions} BJJ
          </div>
        </div>
        <button onClick={() => shift(1)} disabled={!canNext} aria-label="Next month" className={navBtn}>
          <ChevronRightIcon size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-semibold text-dim">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5" role="grid" aria-label={`Training days in ${title}`}>
        {cells.map((c, i) =>
          c ? (
            <button
              key={c.date}
              onClick={() => setPicked(c.date)}
              aria-label={`${fmtDay(c.date)}: ${describe(c)}`}
              className={`relative flex aspect-square items-center justify-center rounded-[8px] text-[12px] font-semibold ${
                c.future ? 'border border-[#15181b] text-dim' : ''
              } ${active?.date === c.date ? 'ring-2 ring-text ring-offset-2 ring-offset-surface' : ''}`}
              style={{ background: fill(c), color: c.gym.length || c.bjj.length ? '#0a0b0c' : undefined }}
            >
              <span className={c.gym.length || c.bjj.length ? '' : c.date === todayStart ? 'text-text' : 'text-dim'}>
                {new Date(c.date).getDate()}
              </span>
            </button>
          ) : (
            <span key={`pad-${i}`} />
          ),
        )}
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
