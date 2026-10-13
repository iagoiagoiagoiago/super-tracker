import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeftIcon } from '../components/icons'
import { Page } from '../components/ui'
import { db } from '../db/db'
import { summarize } from '../gym/summaries'
import { deleteWorkout, saveWorkoutAsTemplate } from '../gym/workouts'
import { describeSet, fmtDuration, fmtTonnage, setE1rm, setLabels } from '../lib/gym'

export function WorkoutDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const s = useLiveQuery(async () => {
    const w = id ? await db.workouts.get(id) : undefined
    if (!w) return null
    const sets = await db.sets.where('workoutId').equals(w.id).toArray()
    const exercises = new Map((await db.exercises.bulkGet([...new Set(sets.map((x) => x.exerciseId))])).filter(Boolean).map((e) => [e!.id, e!]))
    return summarize(w, sets, exercises)
  }, [id])

  if (s === null) return <Page title="Not found">{null}</Page>
  if (!s) return null
  const w = s.workout

  return (
    <Page
      title={w.name}
      eyebrow={new Date(w.startedAt).toLocaleString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })}
      action={
        <Link to="/history" aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-xl border border-line text-muted">
          <ChevronLeftIcon size={20} />
        </Link>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        <Tile value={fmtDuration(s.durationMs)} label="duration" />
        <Tile value={fmtTonnage(s.volume)} label="volume" />
        <Tile value={String(s.blocks.reduce((n, b) => n + b.sets.length, 0))} label="sets" />
      </div>

      {w.notes && <p className="whitespace-pre-line rounded-2xl bg-surface p-4 text-sm text-muted">{w.notes}</p>}

      <div className="flex flex-col gap-5 rounded-[20px] bg-surface p-4">
        {s.blocks.map((b, i) => {
          const labels = setLabels(b.sets)
          const showE1rm = b.exercise.kind === 'weight_reps'
          return (
            <section key={i}>
              <div className="mb-1 flex items-baseline justify-between">
                <Link to={`/gym/exercises/${b.exercise.id}`} className="text-[16px] font-bold">
                  {b.exercise.name}
                </Link>
                {showE1rm && <span className="text-[13px] font-bold">1RM</span>}
              </div>
              <ul className="flex flex-col gap-1">
                {b.sets.map((set, j) => {
                  const est = setE1rm(set, b.exercise.kind)
                  return (
                    <li key={set.id} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-baseline text-[15px] text-muted">
                      <span className={labels[j].match(/\d/) ? '' : 'font-semibold text-faint'}>{labels[j]}</span>
                      <span>
                        {describeSet(set, b.exercise.kind)}
                        {set.notes && <span className="block text-xs text-faint">{set.notes}</span>}
                      </span>
                      <span>{est ? Math.round(est) : ''}</span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={async () => {
            const tid = await saveWorkoutAsTemplate(w.id)
            navigate(`/template/${tid}`)
          }}
          className="h-11 rounded-xl bg-raised text-sm font-semibold"
        >
          Save as template
        </button>
        <button
          onClick={async () => {
            if (!window.confirm('Delete this workout? This cannot be undone.')) return
            await deleteWorkout(w.id)
            navigate('/history', { replace: true })
          }}
          className="h-11 rounded-xl bg-danger/10 text-sm font-semibold text-danger"
        >
          Delete
        </button>
      </div>
    </Page>
  )
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-surface p-3">
      <div className="text-[20px] font-bold">{value}</div>
      <div className="text-[11px] text-faint">{label}</div>
    </div>
  )
}
