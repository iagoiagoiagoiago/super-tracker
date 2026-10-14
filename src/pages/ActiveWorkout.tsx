import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ExercisePicker } from '../components/ExercisePicker'
import { Sheet } from '../components/Sheet'
import { db } from '../db/db'
import { META_ACTIVE_REST, META_ACTIVE_WORKOUT, type ActiveRest, type Exercise, type ID, type SetKind, type WorkoutSet } from '../db/schema'
import {
  addExercise,
  addSet,
  adjustRest,
  cancelWorkout,
  finishWorkout,
  previousSets,
  moveExercise,
  removeExercise,
  replaceExercise,
  removeSet,
  setSlotKeys,
  skipRest,
  toggleSet,
  updateSet,
} from '../gym/workouts'
import { describeSet, fmtClock, fmtKg, fmtRest, setLabels } from '../lib/gym'
import { restDoneAlert, unlockAudio, useNow, useWakeLock } from '../lib/hooks'

const COLS = 'grid grid-cols-[40px_minmax(0,1fr)_64px_64px_44px] gap-2'

export function ActiveWorkout() {
  const navigate = useNavigate()
  const data = useLiveQuery(async () => {
    const id = (await db.meta.get(META_ACTIVE_WORKOUT))?.value as ID | undefined
    const workout = id ? await db.workouts.get(id) : undefined
    if (!workout || workout.endedAt) return { workout: null }
    const sets = await db.sets.where('workoutId').equals(workout.id).toArray()
    const exercises = new Map((await db.exercises.bulkGet([...new Set(sets.map((s) => s.exerciseId))])).filter(Boolean).map((e) => [e!.id, e!]))
    const rest = (await db.meta.get(META_ACTIVE_REST))?.value as ActiveRest | undefined
    return { workout, sets, exercises, rest }
  })

  const workout = data?.workout
  const exerciseIds = useMemo(() => [...new Set((data?.workout ? data.sets : []).map((s) => s.exerciseId))].sort().join(','), [data])
  const previous = useLiveQuery(async () => {
    if (!workout) return new Map<ID, WorkoutSet[]>()
    const ids = exerciseIds ? exerciseIds.split(',') : []
    return new Map(await Promise.all(ids.map(async (id) => [id, await previousSets(id, workout.id, workout.startedAt)] as const)))
  }, [exerciseIds, workout?.id])

  const now = useNow(250, !!workout)
  useWakeLock(!!workout)

  // Rest finished → alert once and clear it.
  const alerted = useRef<string | null>(null)
  const rest = data?.workout ? data.rest : undefined
  useEffect(() => {
    if (rest && now >= rest.endsAt && alerted.current !== rest.setId + rest.endsAt) {
      alerted.current = rest.setId + rest.endsAt
      restDoneAlert()
      void skipRest()
    }
  }, [now, rest])

  const [picker, setPicker] = useState(false)
  const [menu, setMenu] = useState<{ order: number; exercise: Exercise } | null>(null)
  const [setSheet, setSetSheet] = useState<WorkoutSet | null>(null)
  const [replacing, setReplacing] = useState<number | null>(null)
  const [reordering, setReordering] = useState(false)

  if (data && !data.workout) return <Navigate to="/train" replace />
  if (!data?.workout || !workout) return null
  const { sets, exercises } = data

  const blocks = new Map<number, WorkoutSet[]>()
  for (const s of [...sets].sort((a, b) => a.exerciseOrder - b.exerciseOrder || a.setNumber - b.setNumber)) {
    blocks.set(s.exerciseOrder, [...(blocks.get(s.exerciseOrder) ?? []), s])
  }
  const doneCount = sets.filter((s) => s.done).length
  const pending = sets.length - doneCount

  async function onFinish() {
    if (!workout) return
    if (doneCount === 0) {
      if (!window.confirm('No completed sets. Discard this workout?')) return
    } else if (pending > 0 && !window.confirm(`Finish workout? ${pending} unchecked set${pending > 1 ? 's' : ''} will be removed.`)) {
      return
    }
    const result = await finishWorkout(workout.id)
    navigate(result === 'saved' ? `/history/${workout.id}` : '/train', { replace: true })
  }

  async function onCancel() {
    if (!workout || !window.confirm('Cancel this workout? Everything logged in it will be deleted.')) return
    await cancelWorkout(workout.id)
    navigate('/train', { replace: true })
  }

  return (
    <main className="pt-safe mx-auto min-h-full max-w-lg bg-[#0a0b0c] pb-16">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-[#0a0b0c]/95 px-4 pt-2 pb-2 backdrop-blur">
        <button
          onClick={() => navigate(-1)}
          aria-label="Minimise workout"
          className="flex h-10 w-12 items-center justify-center rounded-xl bg-raised text-muted"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <span className="text-[15px] font-semibold text-muted tabular-nums">{fmtClock(now - workout.startedAt)}</span>
        <button onClick={onFinish} className="h-10 rounded-xl bg-done px-5 font-bold text-[#03140a]">
          Finish
        </button>
      </div>

      <div className="px-4 pt-3 pb-2">
        <input
          value={workout.name}
          onChange={(e) => db.workouts.update(workout.id, { name: e.target.value })}
          aria-label="Workout name"
          className="w-full bg-transparent text-[30px] font-extrabold tracking-tight outline-none"
        />
        <p className="text-sm text-faint">
          {new Date(workout.startedAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
          {doneCount} set{doneCount === 1 ? '' : 's'} done
        </p>
      </div>

      {[...blocks.entries()].map(([order, bSets]) => {
        const ex = exercises.get(bSets[0].exerciseId)
        if (!ex) return null
        const labels = setLabels(bSets)
        const slots = setSlotKeys(bSets)
        const prev = previous?.get(ex.id) ?? []
        const prevBySlot = new Map(setSlotKeys(prev).map((k, i) => [k, prev[i]]))
        const weightHead = ex.kind === 'bodyweight_plus' ? '+kg' : ex.kind === 'weight_reps' ? 'kg' : ''
        const repsHead = ex.kind === 'duration' ? 'Sec' : 'Reps'
        return (
          <section key={order} className="pt-4">
            <div className="flex items-center justify-between px-4 pb-1">
              <h2 className="text-[18px] font-bold text-accent">{ex.name}</h2>
              <button
                onClick={() => setMenu({ order, exercise: ex })}
                aria-label={`${ex.name} options`}
                className="h-7 w-10 rounded-lg bg-raised text-[15px] font-black leading-none text-accent"
              >
                ···
              </button>
            </div>
            <div className={`${COLS} px-4 py-1.5 text-center text-[12px] font-semibold uppercase tracking-wider text-faint`}>
              <span>Set</span>
              <span>Previous</span>
              <span>{weightHead}</span>
              <span>{repsHead}</span>
              <span aria-hidden="true">✓</span>
            </div>
            {bSets.map((s, i) => {
              const p = prevBySlot.get(slots[i])
              const resting = rest?.setId === s.id
              const isLast = i === bSets.length - 1
              return (
                <div key={s.id}>
                  <SetRow
                    set={s}
                    label={labels[i]}
                    previous={p}
                    exercise={ex}
                    onLabel={() => setSetSheet(s)}
                    onToggle={() => {
                      unlockAudio()
                      void toggleSet(s.id, p)
                    }}
                  />
                  {resting && rest ? (
                    <RestBar rest={rest} now={now} />
                  ) : (
                    !isLast &&
                    ex.restSeconds > 0 && (
                      <div className="flex items-center gap-2.5 px-4 py-0.5 text-[12px] font-semibold text-faint">
                        <div className="h-0.5 flex-1 rounded bg-[#1e2226]" />
                        <span>{fmtRest(ex.restSeconds)}</span>
                        <div className="h-0.5 flex-1 rounded bg-[#1e2226]" />
                      </div>
                    )
                  )}
                </div>
              )
            })}
            <div className="px-4 pt-2">
              <button
                onClick={() => addSet(workout.id, order, ex.id)}
                className="h-9 w-full rounded-[10px] bg-[#15181b] text-sm font-semibold text-[#c9cdd2]"
              >
                + Add set{ex.restSeconds ? ` (${fmtRest(ex.restSeconds)})` : ''}
              </button>
            </div>
          </section>
        )
      })}

      <div className="flex flex-col gap-3 px-4 pt-8">
        <button onClick={() => setPicker(true)} className="h-12 rounded-2xl bg-accent/15 font-bold text-accent">
          Add exercise
        </button>
        <button onClick={onCancel} className="h-12 rounded-2xl bg-danger/10 font-bold text-danger">
          Cancel workout
        </button>
      </div>

      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={(id) => addExercise(workout.id, id)} />

      <Sheet open={!!menu} onClose={() => setMenu(null)} title={menu?.exercise.name}>
        {menu && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Rest timer</p>
              <div className="grid grid-cols-4 gap-2">
                {[0, 60, 90, 120, 150, 180, 240, 300].map((sec) => {
                  const on = (exercises.get(menu.exercise.id)?.restSeconds ?? 0) === sec
                  return (
                    <button
                      key={sec}
                      onClick={() => db.exercises.update(menu.exercise.id, { restSeconds: sec })}
                      aria-pressed={on}
                      className={`h-10 rounded-[10px] text-sm font-semibold ${on ? 'bg-accent text-white' : 'bg-raised text-muted'}`}
                    >
                      {sec ? fmtRest(sec) : 'Off'}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setReplacing(menu.order)
                  setMenu(null)
                }}
                className="h-11 rounded-xl bg-raised font-semibold"
              >
                Replace exercise
              </button>
              <button
                onClick={() => {
                  setReordering(true)
                  setMenu(null)
                }}
                className="h-11 rounded-xl bg-raised font-semibold"
              >
                Reorder exercises
              </button>
            </div>
            <button
              onClick={async () => {
                await removeExercise(workout.id, menu.order)
                setMenu(null)
              }}
              className="h-11 rounded-xl bg-danger/10 font-semibold text-danger"
            >
              Remove exercise
            </button>
          </div>
        )}
      </Sheet>

      <ExercisePicker
        open={replacing !== null}
        onClose={() => setReplacing(null)}
        onPick={async (id) => {
          if (replacing === null) return
          const block = blocks.get(replacing) ?? []
          const done = block.filter((s) => s.done).length
          if (done && !window.confirm(`Move the ${done} completed set${done > 1 ? 's' : ''} to the new exercise?`)) return
          await replaceExercise(workout.id, replacing, id)
        }}
      />

      <Sheet
        open={reordering}
        onClose={() => setReordering(false)}
        title="Reorder"
        right={
          <button onClick={() => setReordering(false)} className="text-[17px] font-semibold text-accent">
            Done
          </button>
        }
      >
        <ul className="flex flex-col gap-2">
          {[...blocks.entries()].map(([order, bSets], i, arr) => {
            const ex = exercises.get(bSets[0].exerciseId)
            return (
              <li key={order} className="flex items-center gap-3 rounded-xl bg-raised py-1.5 pr-1.5 pl-4">
                <span className="w-5 text-sm font-semibold text-faint">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{ex?.name}</span>
                <span className="text-xs text-faint">{bSets.length} sets</span>
                <button
                  onClick={() => moveExercise(workout.id, order, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${ex?.name} up`}
                  className="h-10 w-10 rounded-lg bg-[#262a30] text-muted disabled:opacity-25"
                >
                  ▲
                </button>
                <button
                  onClick={() => moveExercise(workout.id, order, 1)}
                  disabled={i === arr.length - 1}
                  aria-label={`Move ${ex?.name} down`}
                  className="h-10 w-10 rounded-lg bg-[#262a30] text-muted disabled:opacity-25"
                >
                  ▼
                </button>
              </li>
            )
          })}
        </ul>
      </Sheet>

      <Sheet open={!!setSheet} onClose={() => setSetSheet(null)} title="Set type">
        {setSheet && (
          <div className="flex flex-col gap-2">
            {(
              [
                ['normal', 'Normal set', ''],
                ['warmup', 'Warm-up', 'W'],
                ['drop', 'Drop set', 'D'],
                ['failure', 'Failure', 'F'],
              ] as [SetKind, string, string][]
            ).map(([k, label, tag]) => (
              <button
                key={k}
                onClick={async () => {
                  await updateSet(setSheet.id, { kind: k })
                  setSetSheet(null)
                }}
                className={`flex h-12 items-center gap-3 rounded-xl px-4 text-left font-semibold ${
                  (setSheet.kind ?? 'normal') === k ? 'bg-accent/15 text-accent' : 'bg-raised'
                }`}
              >
                <span className="w-5 text-center text-faint">{tag || '#'}</span>
                {label}
              </button>
            ))}
            <button
              onClick={async () => {
                await removeSet(setSheet.id)
                setSetSheet(null)
              }}
              className="mt-2 h-12 rounded-xl bg-danger/10 font-semibold text-danger"
            >
              Delete set
            </button>
          </div>
        )}
      </Sheet>
    </main>
  )
}

function SetRow({
  set,
  label,
  previous,
  exercise,
  onToggle,
  onLabel,
}: {
  set: WorkoutSet
  label: string
  previous?: WorkoutSet
  exercise: Exercise
  onToggle: () => void
  onLabel: () => void
}) {
  const done = set.done
  const field = `flex h-9 items-center justify-center rounded-[10px] text-[17px] font-semibold ${done ? 'bg-transparent' : 'bg-raised'}`
  const usesWeight = exercise.kind === 'weight_reps' || exercise.kind === 'bodyweight_plus'
  const repsKey = exercise.kind === 'duration' ? 'seconds' : 'reps'
  const labelColor = label === 'W' ? 'text-[#f5b84d]' : label === 'D' ? 'text-learning' : label === 'F' ? 'text-danger' : ''

  return (
    <div className={`${COLS} items-center px-4 py-[5px] transition-colors duration-200 ${done ? 'bg-done/15' : ''}`}>
      <button onClick={onLabel} aria-label={`Set ${label} type`} className={`${field} ${labelColor}`}>
        {label}
      </button>
      <span className="truncate text-center text-[15px] text-[#575e66]">{previous ? describeSet(previous, exercise.kind) : '—'}</span>
      {usesWeight ? (
        <NumField
          className={field}
          value={set.weight}
          placeholder={previous?.weight}
          decimal
          label="Weight"
          onCommit={(v) => updateSet(set.id, { weight: v })}
        />
      ) : (
        <span />
      )}
      <NumField
        className={field}
        value={set[repsKey]}
        placeholder={previous?.[repsKey]}
        label={repsKey === 'seconds' ? 'Seconds' : 'Reps'}
        onCommit={(v) => updateSet(set.id, { [repsKey]: v })}
      />
      <button
        onClick={onToggle}
        aria-label={done ? 'Mark set not done' : 'Complete set'}
        aria-pressed={done}
        className={`flex h-9 items-center justify-center rounded-[10px] ${done ? 'animate-[pop_220ms_ease-out] bg-done text-[#03140a]' : 'bg-raised text-muted'}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7" />
        </svg>
      </button>
    </div>
  )
}

/** Numeric input that keeps the user's raw text while typing ("22." stays "22.") and saves parsed numbers. */
function NumField({
  value,
  placeholder,
  onCommit,
  decimal = false,
  className,
  label,
}: {
  value?: number
  placeholder?: number
  onCommit: (v: number | undefined) => void
  decimal?: boolean
  className: string
  label: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (value === undefined ? '' : fmtKg(value))
  return (
    <input
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      aria-label={label}
      value={shown}
      placeholder={placeholder === undefined ? '' : fmtKg(placeholder)}
      onFocus={(e) => {
        setDraft(shown)
        e.target.select()
      }}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        const text = e.target.value.replace(',', '.')
        if (!/^\d*\.?\d*$/.test(text)) return
        setDraft(text)
        const n = parseFloat(text)
        onCommit(text === '' || Number.isNaN(n) ? undefined : decimal ? n : Math.round(n))
      }}
      className={`${className} w-full min-w-0 text-center text-text outline-none placeholder:text-[#3d434a] focus:outline-2 focus:outline-accent`}
    />
  )
}

function RestBar({ rest, now }: { rest: ActiveRest; now: number }) {
  const remaining = Math.max(0, Math.ceil((rest.endsAt - now) / 1000))
  const pct = Math.min(100, (remaining / rest.total) * 100)
  return (
    <div className="flex items-center gap-2 px-4 py-1.5">
      <button onClick={() => adjustRest(-15)} className="h-[34px] rounded-[10px] bg-raised px-2.5 text-xs font-bold text-muted">
        −15
      </button>
      <button
        onClick={() => skipRest()}
        aria-label={`Rest ${fmtRest(remaining)} remaining. Tap to skip.`}
        className="relative h-[34px] flex-1 overflow-hidden rounded-[10px] bg-raised"
      >
        <span className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-300 ease-linear" style={{ width: `${pct}%` }} />
        <span className="relative text-base font-bold text-white tabular-nums">{fmtRest(remaining)}</span>
      </button>
      <button onClick={() => adjustRest(15)} className="h-[34px] rounded-[10px] bg-raised px-2.5 text-xs font-bold text-muted">
        +15
      </button>
    </div>
  )
}
