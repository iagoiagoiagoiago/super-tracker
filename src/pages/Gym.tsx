import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Sparkline } from '../components/charts'
import { PRBadges } from '../components/PRBadge'
import { Card, EmptyState, Page, SectionTitle } from '../components/ui'
import { gymStats, type GymStats, type RangeKey } from '../gym/stats'
import { useGymData } from '../gym/useGymData'
import { MUSCLE_GROUPS, muscleLabel, TRACKED_MUSCLES } from '../lib/exerciseCatalog'
import { describeSet, fmtDuration } from '../lib/gym'
import { relativeDays } from '../lib/time'

const RANGES: RangeKey[] = ['4W', '12W', '1Y', 'ALL']

export function Gym() {
  const data = useGymData()
  const [range, setRange] = useState<RangeKey>('4W')
  const stats = useMemo(
    () => (data ? gymStats(range, data.workouts, data.sets, data.exercises, data.prs) : undefined),
    [data, range],
  )
  const recentPRs = useMemo(() => (data ? [...data.prs].reverse().slice(0, 5) : []), [data])
  const setById = useMemo(() => new Map(data?.sets.map((s) => [s.id, s])), [data])

  const header = (
    <Link to="/gym/exercises" className="pb-2 text-[13px] font-semibold text-accent">
      All exercises
    </Link>
  )

  if (data && !data.workouts.some((w) => w.endedAt)) {
    return (
      <Page title="Gym" action={header}>
        <EmptyState title="Bring your history over" body="Import your Strong export and every past workout, PR and exercise comes with it.">
          <Link to="/import/strong" className="mt-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white">
            Import from Strong
          </Link>
        </EmptyState>
      </Page>
    )
  }

  const lifts = [...(stats?.lifts ?? [])].sort((a, b) => b.best - a.best)

  return (
    <Page title="Gym" action={header}>
      <div role="group" aria-label="Time range" className="grid grid-cols-4 gap-1 rounded-xl bg-[#121417] p-1">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            aria-pressed={range === r}
            className={`h-8 rounded-[9px] text-[13px] font-semibold ${range === r ? 'bg-[#262a30] text-text' : 'text-muted'}`}
          >
            {r === 'ALL' ? 'All' : r}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Tile value={stats?.workouts ?? '–'} label="workouts" />
        <Tile value={stats ? stats.setsPerWeek.toFixed(stats.setsPerWeek < 10 ? 1 : 0) : '–'} label="avg sets / week" />
        <Tile value={stats?.avgDurationMs ? fmtDuration(stats.avgDurationMs) : '–'} label="avg duration" />
        <Tile value={stats?.prs ?? '–'} label="new PRs" />
      </div>

      <Card>
        <SectionTitle aside="estimated 1RM">Best lifts</SectionTitle>
        {lifts.length === 0 && <p className="text-xs text-faint">Train a lift twice in this period to see it here.</p>}
        <ul className="flex flex-col gap-3">
          {lifts.map((l) => (
            <li key={l.exercise.id}>
              <Link to={`/gym/exercises/${l.exercise.id}`} className="grid grid-cols-[minmax(0,1fr)_64px_68px] items-center gap-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{l.exercise.name}</div>
                  <div className="text-xs text-faint">{l.bestSet ? describeSet(l.bestSet, l.exercise.kind) : ''}</div>
                </div>
                <Sparkline values={l.points} />
                <div className="text-right">
                  <div className="text-[17px] font-bold">{Math.round(l.best)}</div>
                  <div className={`text-[11px] ${l.delta > 0.5 ? 'text-[#4ade80]' : l.delta < -0.5 ? 'text-danger' : 'text-faint'}`}>
                    {l.delta > 0.5 ? '+' : ''}
                    {Math.abs(l.delta) < 0.5 ? '±0' : Math.round(l.delta)} kg
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      {stats && <MuscleVolume muscles={stats.muscles} />}

      {stats && <ProgressCard progress={stats.progress} muscles={stats.muscles} range={range} />}

      <Card>
        <SectionTitle>Recent PRs</SectionTitle>
        <ul className="flex flex-col gap-2.5">
          {recentPRs.map((p) => {
            const ex = data?.exercises.get(p.exerciseId)
            const set = setById.get(p.setId)
            if (!ex || !set) return null
            return (
              <li key={p.setId}>
                <Link to={`/history/${p.workoutId}`} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{ex.name}</div>
                    <div className="text-xs text-faint">
                      {describeSet(set, ex.kind)}
                      <PRBadges kinds={p.kinds} />
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-faint">{relativeDays(p.at)}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </Card>

      <Card>
        <SectionTitle aside="sessions">Most trained</SectionTitle>
        <ol className="flex flex-col gap-2.5">
          {stats?.mostTrained.map((m, i) => (
            <li key={m.exercise.id}>
              <Link to={`/gym/exercises/${m.exercise.id}`} className="flex items-center gap-3 text-sm">
                <span className="w-4 font-semibold text-dim">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{m.exercise.name}</span>
                <span className="font-semibold tabular-nums">{m.sessions}</span>
              </Link>
            </li>
          ))}
        </ol>
      </Card>
    </Page>
  )
}

function Tile({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded-2xl bg-surface p-3.5">
      <div className="text-[24px] font-bold">{value}</div>
      <div className="mt-0.5 text-xs text-faint">{label}</div>
    </div>
  )
}

function MuscleVolume({ muscles }: { muscles: GymStats['muscles'] }) {
  const max = Math.max(1, ...muscles.map((m) => m.setsPerWeek))
  const by = new Map(muscles.map((m) => [m.group, m.setsPerWeek]))
  const regions = ['Push', 'Pull', 'Legs', 'Other']
  return (
    <Card>
      <SectionTitle aside="working sets per week">Sets per muscle</SectionTitle>
      <div className="flex flex-col gap-4">
        {regions.map((r) => {
          const groups = MUSCLE_GROUPS.filter((g) => g.region === r && (TRACKED_MUSCLES.includes(g.value) || (by.get(g.value) ?? 0) > 0))
          if (!groups.length) return null
          return (
            <div key={r}>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-dim">{r}</h3>
              <ul className="flex flex-col gap-2">
                {groups.map((g) => {
                  const v = by.get(g.value) ?? 0
                  return (
                    <li key={g.value} className="grid grid-cols-[86px_minmax(0,1fr)_32px] items-center gap-2.5 text-[13px]">
                      <span className={v ? 'text-[#c9cdd2]' : 'text-dim'}>{g.label}</span>
                      <div className="h-2 overflow-hidden rounded bg-raised">
                        <div className="h-full rounded bg-accent" style={{ width: `${(v / max) * 100}%` }} />
                      </div>
                      <span className={`text-right font-semibold tabular-nums ${v ? '' : 'text-dim'}`}>{v ? v.toFixed(v < 10 ? 1 : 0) : '0'}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-[11px] text-dim">Compound lifts add ½ set to their helper muscles (dips: chest 1, shoulders ½, triceps ½). Edit them on any exercise page.</p>
    </Card>
  )
}

const fmtRate = (r: number) => `${r > 0 ? '+' : r < 0 ? '−' : '±'}${Math.abs(r).toFixed(1)}%`
const rateColor = (r: number) => (r > 0.5 ? 'text-[#4ade80]' : r < -0.5 ? 'text-danger' : 'text-muted')

function ProgressCard({ progress, muscles, range }: { progress: GymStats['progress']; muscles: GymStats['muscles']; range: RangeKey }) {
  const [mode, setMode] = useState<'exercises' | 'muscles'>('exercises')
  const ex = progress.exercises
  const mu = progress.muscles
  // Up to 3 each; with fewer than 6 items, split them so no lift appears in both lists.
  const pick = <T,>(list: T[]) => {
    const n = Math.min(3, Math.ceil(list.length / 2))
    return { top: list.slice(0, n), bottom: list.slice(n).slice(-3).reverse() }
  }
  const exSplit = pick(ex)
  const muSplit = pick(mu)
  const lowest = muscles
    .filter((m) => TRACKED_MUSCLES.includes(m.group) && m.group !== 'core')
    .sort((a, b) => a.setsPerWeek - b.setsPerWeek)
    .slice(0, 3)
  const empty = mode === 'exercises' ? ex.length === 0 : mu.length === 0

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold">Progress</h2>
        <div role="group" aria-label="Progress by" className="flex gap-1 rounded-lg bg-[#121417] p-0.5">
          {(['exercises', 'muscles'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`h-7 rounded-md px-2.5 text-xs font-semibold ${mode === m ? 'bg-[#262a30] text-text' : 'text-muted'}`}
            >
              {m === 'exercises' ? 'Exercises' : 'Muscles'}
            </button>
          ))}
        </div>
      </div>

      {empty ? (
        <p className="text-xs text-faint">
          {range === '4W' ? 'Four weeks is short for trends. Try 12W or longer, or keep logging.' : 'Train a lift at least 4 times over 3+ weeks to see its trend.'}
        </p>
      ) : mode === 'exercises' ? (
        <>
          <ProgressList title="Fastest" items={exSplit.top.map((p) => ({ key: p.exercise.id, name: p.exercise.name, sub: `${p.sessions} sessions`, rate: p.ratePerMonth, to: `/gym/exercises/${p.exercise.id}` }))} />
          {exSplit.bottom.length > 0 && (
            <ProgressList title="Slowest" items={exSplit.bottom.map((p) => ({ key: p.exercise.id, name: p.exercise.name, sub: `${p.sessions} sessions`, rate: p.ratePerMonth, to: `/gym/exercises/${p.exercise.id}` }))} />
          )}
        </>
      ) : (
        <>
          <ProgressList title="Fastest" items={muSplit.top.map((m) => ({ key: m.group, name: muscleLabel(m.group), sub: `${m.exercises} lift${m.exercises > 1 ? 's' : ''}`, rate: m.ratePerMonth }))} />
          {muSplit.bottom.length > 0 && (
            <ProgressList title="Slowest" items={muSplit.bottom.map((m) => ({ key: m.group, name: muscleLabel(m.group), sub: `${m.exercises} lift${m.exercises > 1 ? 's' : ''}`, rate: m.ratePerMonth }))} />
          )}
        </>
      )}

      {mode === 'muscles' && lowest.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-dim">Lowest volume</h3>
          <ul className="flex flex-col gap-1.5">
            {lowest.map((m) => (
              <li key={m.group} className="flex items-baseline justify-between text-sm">
                <span>{muscleLabel(m.group)}</span>
                <span className={m.setsPerWeek < 1 ? 'text-danger' : 'text-muted'}>{m.setsPerWeek.toFixed(1)} sets / week</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 text-[10px] leading-relaxed text-dim">
        Estimated 1RM change per month, fitted over every session in the period. Lifts with few sessions are toned down.
      </p>
    </Card>
  )
}

function ProgressList({ title, items }: { title: string; items: { key: string; name: string; sub: string; rate: number; to?: string }[] }) {
  return (
    <div className="mb-3 last:mb-0">
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-dim">{title}</h3>
      <ul className="flex flex-col gap-2">
        {items.map((it) => {
          const body = (
            <>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{it.name}</div>
                <div className="text-xs text-faint">{it.sub}</div>
              </div>
              <span className={`shrink-0 text-[15px] font-bold tabular-nums ${rateColor(it.rate)}`}>
                {fmtRate(it.rate)}
                <span className="text-[11px] font-medium text-faint"> /mo</span>
              </span>
            </>
          )
          return (
            <li key={it.key}>
              {it.to ? (
                <Link to={it.to} className="flex items-center justify-between gap-3">{body}</Link>
              ) : (
                <div className="flex items-center justify-between gap-3">{body}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
