import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeftIcon } from '../components/icons'
import { Card, Page, SectionTitle } from '../components/ui'
import { db } from '../db/db'
import type { ExerciseKind, MuscleGroup, WorkoutSet } from '../db/schema'
import { EXERCISE_KINDS, MUSCLE_GROUPS } from '../lib/exerciseCatalog'
import { describeSet, fmtRest, setE1rm, setLabels } from '../lib/gym'

export function ExerciseDetail() {
  const { id } = useParams()
  const data = useLiveQuery(async () => {
    const exercise = id ? await db.exercises.get(id) : undefined
    if (!exercise) return null
    const sets = await db.sets.where('exerciseId').equals(exercise.id).filter((s) => s.done).toArray()
    const workouts = new Map(
      (await db.workouts.bulkGet([...new Set(sets.map((s) => s.workoutId))])).filter(Boolean).map((w) => [w!.id, w!]),
    )
    const byWorkout = new Map<string, WorkoutSet[]>()
    for (const s of sets) byWorkout.set(s.workoutId, [...(byWorkout.get(s.workoutId) ?? []), s])
    const sessions = [...byWorkout.entries()]
      .map(([wid, ss]) => ({ workout: workouts.get(wid)!, sets: ss.sort((a, b) => a.exerciseOrder - b.exerciseOrder || a.setNumber - b.setNumber) }))
      .filter((x) => x.workout)
      .sort((a, b) => b.workout.startedAt - a.workout.startedAt)
    const best = Math.max(0, ...sets.map((s) => setE1rm(s, exercise.kind) ?? 0))
    const heaviest = Math.max(0, ...sets.filter((s) => s.kind !== 'warmup').map((s) => s.weight ?? 0))
    return { exercise, sessions, best, heaviest }
  }, [id])

  if (data === null) return <Page title="Not found">{null}</Page>
  if (!data) return null
  const { exercise, sessions } = data

  return (
    <Page
      title={exercise.name}
      action={
        <Link to="/gym/exercises" aria-label="Back" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line text-muted">
          <ChevronLeftIcon size={20} />
        </Link>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        <Tile value={data.best ? `${Math.round(data.best)}` : '–'} label="best e1RM kg" />
        <Tile value={data.heaviest ? `${data.heaviest}` : '–'} label="heaviest kg" />
        <Tile value={String(sessions.length)} label="sessions" />
      </div>

      <Card>
        <SectionTitle>Settings</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <select
            aria-label="Muscle group"
            value={exercise.muscleGroup}
            onChange={(e) => db.exercises.update(exercise.id, { muscleGroup: e.target.value as MuscleGroup })}
            className="h-10 rounded-[10px] bg-raised px-2 text-sm text-text"
          >
            {MUSCLE_GROUPS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
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
      </Card>

      <h2 className="pt-1 text-[15px] font-bold">History</h2>
      {sessions.length === 0 && <p className="text-sm text-faint">Not logged yet.</p>}
      {sessions.slice(0, 40).map(({ workout, sets }) => {
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
                return (
                  <li key={s.id} className="grid grid-cols-[24px_minmax(0,1fr)_auto]">
                    <span className="text-faint">{labels[i]}</span>
                    <span>{describeSet(s, exercise.kind)}</span>
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

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-surface p-3">
      <div className="text-[22px] font-bold">{value}</div>
      <div className="text-[11px] text-faint">{label}</div>
    </div>
  )
}
