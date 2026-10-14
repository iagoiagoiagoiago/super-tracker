import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { LineChart } from '../components/charts'
import { ChevronLeftIcon } from '../components/icons'
import { PRBadges } from '../components/PRBadge'
import { Card, Page, SectionTitle } from '../components/ui'
import { db } from '../db/db'
import { META_PINNED_LIFTS, type Exercise, type ExerciseKind, type MuscleGroup, type WorkoutSet } from '../db/schema'
import { useLiveQuery } from 'dexie-react-hooks'
import { exerciseSeries, type SessionPoint } from '../gym/stats'
import { useGymData } from '../gym/useGymData'
import { EXERCISE_KINDS, MUSCLE_GROUPS, TRACKED_MUSCLES, guessHelpers, helperMuscles, muscleLabel } from '../lib/exerciseCatalog'
import { describeSet, fmtKg, fmtRest, fmtTonnage, setE1rm, setLabels } from '../lib/gym'

type Metric = 'e1rm' | 'weight' | 'volume' | 'reps'

const METRICS: Record<Metric, { label: string; chart: string; get: (p: SessionPoint) => number | undefined; fmt: (v: number) => string }> = {
  e1rm: { label: '1RM', chart: 'Best estimated 1RM', get: (p) => p.e1rm, fmt: (v) => `${Math.round(v)}` },
  weight: { label: 'Heaviest', chart: 'Heaviest weight', get: (p) => p.weight, fmt: (v) => fmtKg(v) },
  volume: { label: 'Volume', chart: 'Session volume', get: (p) => p.volume || undefined, fmt: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}t` : `${Math.round(v)}`) },
  reps: { label: 'Reps', chart: 'Most reps in a set', get: (p) => p.reps, fmt: (v) => `${v}` },
}

function metricsFor(kind: ExerciseKind): Metric[] {
  if (kind === 'weight_reps') return ['e1rm', 'weight', 'volume']
  if (kind === 'bodyweight_plus') return ['weight', 'reps']
  return ['reps']
}

export function ExerciseDetail() {
  const { id } = useParams()
  const data = useGymData()
  const exercise = id ? data?.exercises.get(id) : undefined
  if (data && !exercise) return <Page title="Not found">{null}</Page>
  if (!data || !exercise) return null
  return <ExerciseView key={exercise.id} exercise={exercise} data={data} />
}

function ExerciseView({ exercise, data }: { exercise: Exercise; data: NonNullable<ReturnType<typeof useGymData>> }) {
  const options = metricsFor(exercise.kind)
  const [metric, setMetric] = useState<Metric>(options[0])

  const view = useMemo(() => {
    const workouts = new Map(data.workouts.map((w) => [w.id, w]))
    const sets = data.sets.filter((s) => s.exerciseId === exercise.id && s.done)
    const series = exerciseSeries(exercise, workouts, sets)
    const byWorkout = new Map<string, WorkoutSet[]>()
    for (const s of sets) byWorkout.set(s.workoutId, [...(byWorkout.get(s.workoutId) ?? []), s])
    const sessions = [...byWorkout.entries()]
      .map(([wid, ss]) => ({ workout: workouts.get(wid)!, sets: ss.sort((a, b) => a.exerciseOrder - b.exerciseOrder || a.setNumber - b.setNumber) }))
      .filter((x) => x.workout?.endedAt)
      .sort((a, b) => b.workout.startedAt - a.workout.startedAt)

    const work = sets.filter((s) => s.kind !== 'warmup' && workouts.get(s.workoutId)?.endedAt)
    const maxBy = (f: (s: WorkoutSet) => number) => work.reduce<WorkoutSet | undefined>((b, s) => (f(s) > (b ? f(b) : 0) ? s : b), undefined)
    const records = [
      { label: 'Best e1RM', set: maxBy((s) => setE1rm(s, exercise.kind) ?? 0), value: (s: WorkoutSet) => `${Math.round(setE1rm(s, exercise.kind) ?? 0)} kg`, show: exercise.kind === 'weight_reps' },
      { label: exercise.kind === 'bodyweight_plus' ? 'Most added weight' : 'Heaviest weight', set: maxBy((s) => s.weight ?? 0), value: (s: WorkoutSet) => `${fmtKg(s.weight)} kg`, show: exercise.kind !== 'reps_only' && exercise.kind !== 'duration' },
      { label: 'Best set volume', set: maxBy((s) => (s.weight ?? 0) * (s.reps ?? 0)), value: (s: WorkoutSet) => fmtTonnage((s.weight ?? 0) * (s.reps ?? 0)), show: exercise.kind === 'weight_reps' },
      { label: 'Most reps', set: maxBy((s) => s.reps ?? 0), value: (s: WorkoutSet) => `${s.reps} reps`, show: exercise.kind !== 'duration' },
    ].filter((r) => r.show && r.set)
    return { series, sessions, records, workouts }
  }, [data, exercise])

  const pinned = useLiveQuery(async () => ((await db.meta.get(META_PINNED_LIFTS))?.value as string[] | undefined) ?? [])
  const isPinned = pinned?.includes(exercise.id) ?? false
  const togglePin = async () => {
    const cur = pinned ?? []
    const next = isPinned ? cur.filter((id) => id !== exercise.id) : [...cur, exercise.id].slice(-4)
    await db.meta.put({ key: META_PINNED_LIFTS, value: next })
  }

  const m = METRICS[metric]
  const points = view.series.flatMap((p) => {
    const v = m.get(p)
    return v ? [{ t: p.t, v }] : []
  })

  return (
    <Page
      title={exercise.name}
      action={
        <Link to="/gym/exercises" aria-label="Back" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line text-muted">
          <ChevronLeftIcon size={20} />
        </Link>
      }
    >
      <Card>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-bold">{m.chart}</h2>
          {options.length > 1 && (
            <div role="group" aria-label="Chart metric" className="flex gap-1 rounded-lg bg-[#121417] p-0.5">
              {options.map((o) => (
                <button
                  key={o}
                  onClick={() => setMetric(o)}
                  aria-pressed={metric === o}
                  className={`h-7 rounded-md px-2.5 text-xs font-semibold ${metric === o ? 'bg-[#262a30] text-text' : 'text-muted'}`}
                >
                  {METRICS[o].label}
                </button>
              ))}
            </div>
          )}
        </div>
        <LineChart points={points} format={m.fmt} label={m.chart} />
      </Card>

      {exercise.kind === 'weight_reps' && (
        <button
          onClick={togglePin}
          aria-pressed={isPinned}
          className={`flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold ${isPinned ? 'bg-accent/15 text-accent' : 'bg-raised text-muted'}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" />
          </svg>
          {isPinned ? 'Pinned to Home' : 'Pin to Home'}
        </button>
      )}

      {view.records.length > 0 && (
        <Card>
          <SectionTitle>Records</SectionTitle>
          <ul className="flex flex-col gap-2.5">
            {view.records.map((r) => {
              const w = view.workouts.get(r.set!.workoutId)
              return (
                <li key={r.label}>
                  <Link to={`/history/${r.set!.workoutId}`} className="flex items-baseline justify-between gap-3">
                    <div>
                      <div className="text-sm text-muted">{r.label}</div>
                      <div className="text-xs text-faint">
                        {describeSet(r.set!, exercise.kind)} · {w ? new Date(w.startedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                      </div>
                    </div>
                    <span className="text-[17px] font-bold">{r.value(r.set!)}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <Card>
        <SectionTitle>Settings</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <select
            aria-label="Muscle group"
            value={exercise.muscleGroup}
            onChange={(e) => db.exercises.update(exercise.id, { muscleGroup: e.target.value as MuscleGroup })}
            className="h-10 rounded-[10px] bg-raised px-2 text-sm text-text"
          >
            {MUSCLE_GROUPS.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
          <select
            aria-label="Type"
            value={exercise.kind}
            onChange={(e) => db.exercises.update(exercise.id, { kind: e.target.value as ExerciseKind })}
            className="h-10 rounded-[10px] bg-raised px-2 text-sm text-text"
          >
            {EXERCISE_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
          <select
            aria-label="Rest timer"
            value={exercise.restSeconds}
            onChange={(e) => db.exercises.update(exercise.id, { restSeconds: Number(e.target.value) })}
            className="col-span-2 h-10 rounded-[10px] bg-raised px-2 text-sm text-text"
          >
            {[0, 60, 90, 120, 150, 180, 240, 300].map((s) => (
              <option key={s} value={s}>Rest {s ? fmtRest(s) : 'off'}</option>
            ))}
          </select>
        </div>
        <HelperMuscles exercise={exercise} />
      </Card>

      <h2 className="pt-1 text-[15px] font-bold">History <span className="text-faint">· {view.sessions.length}</span></h2>
      {view.sessions.length === 0 && <p className="text-sm text-faint">Not logged yet.</p>}
      {view.sessions.slice(0, 40).map(({ workout, sets }) => {
        const labels = setLabels(sets)
        return (
          <Link key={workout.id} to={`/history/${workout.id}`} className="rounded-[18px] border border-line p-4">
            <div className="mb-1 flex justify-between text-sm">
              <span className="font-bold">{workout.name}</span>
              <span className="text-faint">
                {new Date(workout.startedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
            <ul className="text-[14px] text-muted">
              {sets.map((s, i) => {
                const est = setE1rm(s, exercise.kind)
                const pr = data.prBySet.get(s.id)
                return (
                  <li key={s.id} className="grid grid-cols-[24px_minmax(0,1fr)_auto]">
                    <span className="text-faint">{labels[i]}</span>
                    <span>
                      {describeSet(s, exercise.kind)}
                      {pr && <PRBadges kinds={pr.kinds} />}
                    </span>
                    <span>{est ? Math.round(est) : ''}</span>
                  </li>
                )
              })}
            </ul>
          </Link>
        )
      })}
    </Page>
  )
}

/** Toggle the muscles that get a half set from this lift. Starts from the name-based suggestion. */
function HelperMuscles({ exercise }: { exercise: Exercise }) {
  const active = helperMuscles(exercise)
  const suggested = guessHelpers(exercise.name, exercise.muscleGroup)
  const custom = exercise.secondaryMuscles !== undefined && active.join() !== suggested.join()
  const options = MUSCLE_GROUPS.filter((g) => TRACKED_MUSCLES.includes(g.value) && g.value !== exercise.muscleGroup)
  const toggle = (g: MuscleGroup) => {
    const next = active.includes(g) ? active.filter((x) => x !== g) : [...active, g]
    // Keep the main-muscle order of MUSCLE_GROUPS so the list reads the same everywhere.
    void db.exercises.update(exercise.id, { secondaryMuscles: MUSCLE_GROUPS.map((m) => m.value).filter((v) => next.includes(v)) })
  }
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-semibold">
          Also works <span className="font-normal text-faint">· ½ set each</span>
        </h3>
        {custom && (
          <button onClick={() => void db.exercises.update(exercise.id, { secondaryMuscles: undefined })} className="text-xs font-semibold text-accent">
            Reset
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((g) => {
          const on = active.includes(g.value)
          return (
            <button
              key={g.value}
              onClick={() => toggle(g.value)}
              aria-pressed={on}
              className={`h-10 rounded-full px-3.5 text-[13px] font-semibold ${on ? 'bg-accent/20 text-accent ring-1 ring-accent/50' : 'bg-raised text-faint'}`}
            >
              {g.label}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-[11px] text-dim">
        Each working set counts 1 for {muscleLabel(exercise.muscleGroup).toLowerCase()} and ½ for every muscle picked here.
      </p>
    </div>
  )
}
