import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { analyzeFocus } from '../bjj/focus'
import { STATUS_COLOR, STATUS_ORDER, STATUS_SHORT } from '../bjj/map'
import { BackupCard } from '../components/BackupCard'
import { Sparkline } from '../components/charts'
import { ChevronRightIcon, GearIcon } from '../components/icons'
import { Card, Page, SectionTitle } from '../components/ui'
import { GYM_ASSUMED_RPE, weekStreak, weeklyLoad } from '../dashboard/activity'
import { LoadChart, Legend, MonthCalendar } from '../dashboard/charts'
import { db } from '../db/db'
import { gymStats, liftTrend } from '../gym/stats'
import { META_PINNED_LIFTS } from '../db/schema'
import { useGymData } from '../gym/useGymData'
import { formatDayHeader } from '../lib/time'

export function Home() {
  const gym = useGymData()
  const bjj = useLiveQuery(async () => {
    const [sessions, techniques, positions, cycles] = await Promise.all([
      db.bjjSessions.toArray(),
      db.techniques.toArray(),
      db.positions.toArray(),
      db.focusCycles.toArray(),
    ])
    const now = Date.now()
    const focus = cycles.filter((c) => !c.endedAt).map((c) => analyzeFocus(c, positions, techniques, sessions, now))
    const pinned = ((await db.meta.get(META_PINNED_LIFTS))?.value as string[] | undefined) ?? []
    return { sessions, techniques, focus, now, pinned }
  })

  const view = useMemo(() => {
    if (!gym || !bjj) return null
    const { now, sessions } = bjj
    const load = weeklyLoad(gym.workouts, sessions, now, 8)
    const thisWeek = load[load.length - 1]
    return {
      now,
      load,
      thisWeek,
      streak: weekStreak(gym.workouts, sessions, now),
      // Pinned lifts if any; otherwise the most-trained loaded lifts of the last 12 weeks.
      lifts: bjj.pinned.length
        ? bjj.pinned.flatMap((id) => {
            const ex = gym.exercises.get(id)
            return ex ? [liftTrend(ex, gym.workouts, gym.sets, now - 84 * 86_400_000, now)] : []
          })
        : gymStats('12W', gym.workouts, gym.sets, gym.exercises, gym.prs, now).lifts.slice(0, 3),
      pinnedMode: bjj.pinned.length > 0,
      statusCounts: STATUS_ORDER.map((s) => ({ s, n: bjj.techniques.filter((t) => t.status === s).length })),
    }
  }, [gym, bjj])

  const totalTech = view?.statusCounts.reduce((n, x) => n + x.n, 0) ?? 0
  const weekSessions = view ? view.thisWeek.gymSessions + view.thisWeek.bjjSessions : 0

  return (
    <Page
      eyebrow={formatDayHeader()}
      title="This week"
      action={
        <Link to="/settings" aria-label="Settings" className="flex h-10 w-10 items-center justify-center rounded-xl border border-line text-muted">
          <GearIcon size={20} />
        </Link>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        <Tile value={view ? weekSessions : '–'} label={view ? `${view.thisWeek.gymSessions} gym · ${view.thisWeek.bjjSessions} BJJ` : 'sessions'} />
        <Tile value={view ? compactLoad(view.thisWeek.gym + view.thisWeek.bjj) : '–'} label="load (min × RPE)" />
        <Tile value={view?.streak ?? '–'} label={view?.streak === 1 ? 'week streak' : 'weeks streak'} />
      </div>

      {view && (
        <>
          <Card>
            <SectionTitle aside={<Legend />}>Consistency</SectionTitle>
            <MonthCalendar workouts={gym!.workouts} sessions={bjj!.sessions} now={view.now} />
          </Card>

          <Card>
            <SectionTitle aside={<Legend />}>Training load</SectionTitle>
            <LoadChart weeks={view.load} />
            <p className="mt-2 text-[10px] text-dim">Minutes × RPE. Gym sessions count at RPE {GYM_ASSUMED_RPE}.</p>
          </Card>

          {view.lifts.length > 0 && (
            <Link to="/gym" className="block">
              <Card>
                <SectionTitle aside="e1RM · 12 weeks">Strength</SectionTitle>
                {!view.pinnedMode && <p className="-mt-2 mb-3 text-[11px] text-dim">Most trained lifts. Pin your key lifts from any exercise page.</p>}
                <ul className="flex flex-col gap-3">
                  {view.lifts.map((l) => (
                    <li key={l.exercise.id} className="grid grid-cols-[minmax(0,1fr)_64px_60px] items-center gap-2.5">
                      <span className="truncate text-sm font-semibold">{l.exercise.name}</span>
                      <Sparkline values={l.points} />
                      <span className="text-right">
                        <span className="text-[17px] font-bold">{l.best ? Math.round(l.best) : '–'}</span>
                        <span className={`block text-[11px] ${l.delta > 0.5 ? 'text-[#4ade80]' : l.delta < -0.5 ? 'text-danger' : 'text-faint'}`}>
                          {l.delta > 0.5 ? '+' : ''}
                          {Math.abs(l.delta) < 0.5 ? '±0' : Math.round(l.delta)} kg
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </Link>
          )}

          <Card>
            <SectionTitle aside={totalTech ? `${totalTech} techniques` : undefined}>BJJ game</SectionTitle>
            {totalTech === 0 ? (
              <Link to="/bjj" className="flex items-center justify-between text-sm text-muted">
                Start your technique map
                <ChevronRightIcon size={16} />
              </Link>
            ) : (
              <>
                <div className="flex h-2 gap-[2px] overflow-hidden rounded" role="img" aria-label={view.statusCounts.map((x) => `${STATUS_SHORT[x.s]} ${x.n}`).join(', ')}>
                  {view.statusCounts.filter((x) => x.n).map((x) => (
                    <div key={x.s} style={{ flex: x.n, background: STATUS_COLOR[x.s], boxShadow: `0 0 8px ${STATUS_COLOR[x.s]}60` }} />
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-4 gap-1.5 text-[11px] text-faint">
                  {view.statusCounts.map((x) => (
                    <div key={x.s}>
                      <div className="text-[18px] font-bold text-text">{x.n}</div>
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[x.s] }} />
                        {STATUS_SHORT[x.s]}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {bjj && bjj.focus.length > 0 && (
              <Link to="/bjj/focus" className="mt-3 flex items-center gap-2.5 rounded-xl bg-[#15181b] px-3.5 py-3">
                <span className="h-2 w-2 shrink-0 rounded-full bg-bjj shadow-[0_0_8px_var(--color-bjj)]" />
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  Focus: {bjj.focus.map((f) => f.position?.name).filter(Boolean).join(' · ')}
                </span>
                {(() => {
                  const n = bjj.focus.reduce((k, f) => k + f.suggestions.length, 0)
                  return n ? <span className="shrink-0 text-xs text-muted">{n} tip{n > 1 ? 's' : ''}</span> : null
                })()}
                <ChevronRightIcon size={16} className="shrink-0 text-faint" />
              </Link>
            )}
          </Card>
        </>
      )}

      <BackupCard />
    </Page>
  )
}

const compactLoad = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

function Tile({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded-2xl bg-surface p-3">
      <div className="text-[26px] font-bold leading-tight">{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-faint">{label}</div>
    </div>
  )
}
