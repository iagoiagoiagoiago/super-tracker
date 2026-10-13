import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { TrophyIcon } from '../components/PRBadge'
import { EmptyState, Page } from '../components/ui'
import { useGymData } from '../gym/useGymData'
import { db } from '../db/db'
import type { BjjSession, ID, WorkoutSet } from '../db/schema'
import { classLabel } from '../bjj/sessions'
import { bestSet, summarize, type WorkoutSummary } from '../gym/summaries'
import { describeSet, fmtDuration, fmtTonnage } from '../lib/gym'

type Entry =
  | { kind: 'gym'; at: number; s: WorkoutSummary }
  | { kind: 'bjj'; at: number; session: BjjSession; names: Map<ID, string> }

export function History() {
  const entries = useLiveQuery(async (): Promise<Entry[]> => {
    const [workouts, sets, exercises, sessions, techniques] = await Promise.all([
      db.workouts.toArray(),
      db.sets.toArray(),
      db.exercises.toArray(),
      db.bjjSessions.toArray(),
      db.techniques.toArray(),
    ])
    const exMap = new Map(exercises.map((e) => [e.id, e]))
    const names = new Map(techniques.map((t) => [t.id, t.name]))
    const byWorkout = new Map<string, WorkoutSet[]>()
    for (const s of sets) byWorkout.set(s.workoutId, [...(byWorkout.get(s.workoutId) ?? []), s])
    return [
      ...workouts
        .filter((w) => w.endedAt)
        .map((w) => ({ kind: 'gym' as const, at: w.startedAt, s: summarize(w, byWorkout.get(w.id) ?? [], exMap) })),
      ...sessions.map((s) => ({ kind: 'bjj' as const, at: s.date, session: s, names })),
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
            e.kind === 'gym' ? (
              <WorkoutCard key={e.s.workout.id} s={e.s} prs={gym?.prCountByWorkout.get(e.s.workout.id) ?? 0} />
            ) : (
              <BjjCard key={e.session.id} s={e.session} names={e.names} />
            ),
          )}
        </section>
      ))}
    </Page>
  )
}

function BjjCard({ s, names }: { s: BjjSession; names: Map<ID, string> }) {
  const d = new Date(s.date)
  const line = (ids: ID[]) => ids.map((id) => names.get(id)).filter(Boolean).join(', ')
  return (
    <Link to={`/bjj/session/${s.id}`} className="flex flex-col gap-2 rounded-[18px] border border-[#1f2a14] p-4 active:bg-surface">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-2 text-[17px] font-bold">
          <span className="h-2 w-2 rounded-full bg-bjj shadow-[0_0_8px_var(--color-bjj)]" />
          BJJ · {classLabel(s.classType)}
        </span>
        <span className="shrink-0 text-xs text-faint">{d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
      </div>
      <div className="flex gap-4 text-[13px] text-muted">
        <span>{s.durationMin} min</span>
        <span>RPE {s.rpe}</span>
        {s.rounds ? <span>{s.rounds} rounds</span> : null}
      </div>
      {(s.taught.length > 0 || s.hit.length > 0 || s.caughtBy.length > 0) && (
        <dl className="mt-1 grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
          {s.taught.length > 0 && (
            <>
              <dt className="font-semibold text-faint">Taught</dt>
              <dd className="truncate text-muted">{line(s.taught)}</dd>
            </>
          )}
          {s.hit.length > 0 && (
            <>
              <dt className="font-semibold text-faint">Hit</dt>
              <dd className="truncate text-[#d6ff8f]">{line(s.hit)}</dd>
            </>
          )}
          {s.caughtBy.length > 0 && (
            <>
              <dt className="font-semibold text-faint">Caught</dt>
              <dd className="truncate text-[#ff9b92]">{line(s.caughtBy)}</dd>
            </>
          )}
        </dl>
      )}
      {s.nextFocus && <p className="truncate text-xs text-faint">Next: {s.nextFocus}</p>}
    </Link>
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
