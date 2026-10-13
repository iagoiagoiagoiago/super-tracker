import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { TrophyIcon } from '../components/PRBadge'
import { EmptyState, Page } from '../components/ui'
import { useGymData } from '../gym/useGymData'
import { db } from '../db/db'
import type { WorkoutSet } from '../db/schema'
import { bestSet, summarize, type WorkoutSummary } from '../gym/summaries'
import { describeSet, fmtDuration, fmtTonnage } from '../lib/gym'

type Entry = { kind: 'gym'; at: number; s: WorkoutSummary } | { kind: 'bjj'; at: number; id: string }

export function History() {
  const entries = useLiveQuery(async (): Promise<Entry[]> => {
    const [workouts, sets, exercises, sessions] = await Promise.all([
      db.workouts.toArray(),
      db.sets.toArray(),
      db.exercises.toArray(),
      db.bjjSessions.toArray(),
    ])
    const exMap = new Map(exercises.map((e) => [e.id, e]))
    const byWorkout = new Map<string, WorkoutSet[]>()
    for (const s of sets) byWorkout.set(s.workoutId, [...(byWorkout.get(s.workoutId) ?? []), s])
    return [
      ...workouts
        .filter((w) => w.endedAt)
        .map((w) => ({ kind: 'gym' as const, at: w.startedAt, s: summarize(w, byWorkout.get(w.id) ?? [], exMap) })),
      ...sessions.map((s) => ({ kind: 'bjj' as const, at: s.date, id: s.id })),
    ].sort((a, b) => b.at - a.at)
  })

  const gym = useGymData()
  const months = new Map<string, Entry[]>()
  for (const e of entries ?? []) {
    const m = new Date(e.at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    months.set(m, [...(months.get(m) ?? []), e])
  }

  return (
    <Page title="History">
      {entries && entries.length === 0 && (
        <EmptyState
          title="No sessions yet"
          body="Finished gym workouts and BJJ sessions show up here. Import your Strong history from Settings."
        />
      )}
      {[...months.entries()].map(([month, list]) => (
        <section key={month} className="flex flex-col gap-3">
          <h2 className="pt-2 text-[13px] font-semibold uppercase tracking-wider text-faint">
            {month} <span className="text-dim">· {list.length}</span>
          </h2>
          {list.map((e) =>
            e.kind === 'gym' ? <WorkoutCard key={e.s.workout.id} s={e.s} prs={gym?.prCountByWorkout.get(e.s.workout.id) ?? 0} /> : null,
          )}
        </section>
      ))}
    </Page>
  )
}

function WorkoutCard({ s, prs }: { s: WorkoutSummary; prs: number }) {
  const d = new Date(s.workout.startedAt)
  return (
    <Link to={`/history/${s.workout.id}`} className="flex flex-col gap-2 rounded-[18px] border border-line p-4 active:bg-surface">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[17px] font-bold">{s.workout.name}</span>
        <span className="shrink-0 text-xs text-faint">
          {d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
        </span>
      </div>
      <div className="flex gap-4 text-[13px] text-muted">
        <span>{fmtDuration(s.durationMs)}</span>
        <span>{fmtTonnage(s.volume)}</span>
        <span>{s.blocks.length} exercises</span>
        {prs > 0 && (
          <span className="flex items-center gap-1 font-semibold text-[#4ade80]">
            <TrophyIcon size={12} />
            {prs} PR{prs > 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-[13px]">
        <span className="font-semibold text-faint">Exercise</span>
        <span className="font-semibold text-faint">Best set</span>
        {s.blocks.slice(0, 6).map((b, i) => {
          const best = bestSet(b)
          return (
            <div key={i} className="contents">
              <span className="truncate text-muted">
                {b.sets.length} × {b.exercise.name}
              </span>
              <span className="text-right text-muted">{best ? describeSet(best, b.exercise.kind) : ''}</span>
            </div>
          )
        })}
        {s.blocks.length > 6 && <span className="text-faint">+{s.blocks.length - 6} more</span>}
      </div>
    </Link>
  )
}
