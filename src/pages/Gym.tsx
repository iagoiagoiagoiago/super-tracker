import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Sparkline } from '../components/charts'
import { PRBadges } from '../components/PRBadge'
import { Card, EmptyState, Page, SectionTitle } from '../components/ui'
import { gymStats, type RangeKey } from '../gym/stats'
import { useGymData } from '../gym/useGymData'
import { muscleLabel } from '../lib/exerciseCatalog'
import { describeSet, fmtDuration, fmtTonnage } from '../lib/gym'
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

  const maxMuscle = Math.max(1, ...(stats?.muscles.map((m) => m.setsPerWeek) ?? []))
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
        <Tile value={stats ? fmtTonnage(stats.volume) : '–'} label="total volume" />
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

      <Card>
        <SectionTitle aside="working sets per week">Sets per muscle</SectionTitle>
        <ul className="flex flex-col gap-2.5">
          {stats?.muscles.map((m) => (
            <li key={m.group} className="grid grid-cols-[78px_minmax(0,1fr)_32px] items-center gap-2.5 text-[13px]">
              <span className="text-[#c9cdd2]">{muscleLabel(m.group)}</span>
              <div className="h-2 overflow-hidden rounded bg-raised">
                <div className="h-full rounded bg-accent" style={{ width: `${(m.setsPerWeek / maxMuscle) * 100}%` }} />
              </div>
              <span className="text-right font-semibold tabular-nums">{m.setsPerWeek.toFixed(m.setsPerWeek < 10 ? 1 : 0)}</span>
            </li>
          ))}
        </ul>
      </Card>

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
