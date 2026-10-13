import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeftIcon } from '../components/icons'
import { Card, Page, SectionTitle } from '../components/ui'
import { db } from '../db/db'
import type { ExerciseKind, MuscleGroup } from '../db/schema'
import {
  commitImport,
  parseStrongCsv,
  planImport,
  StrongImportError,
  type ImportPlan,
  type ImportResult,
} from '../import/strong'
import { EXERCISE_KINDS, MUSCLE_GROUPS } from '../lib/exerciseCatalog'

type Step = { name: 'pick' } | { name: 'review'; plan: ImportPlan } | { name: 'done'; result: ImportResult }

export function ImportStrong() {
  const [step, setStep] = useState<Step>({ name: 'pick' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [templates, setTemplates] = useState<Set<string>>(new Set())
  const [showAll, setShowAll] = useState(false)
  const navigate = useNavigate()

  async function onFile(file: File) {
    setError(null)
    setBusy(true)
    try {
      const plan = await planImport(db, parseStrongCsv(await file.text()))
      if (!plan.newWorkouts.length) {
        setError(
          plan.workouts.length
            ? `All ${plan.workouts.length} workouts in this file are already imported.`
            : 'No workouts found in this file.',
        )
        return
      }
      setTemplates(new Set(plan.templateNames))
      setStep({ name: 'review', plan })
    } catch (e) {
      setError(e instanceof StrongImportError ? e.message : 'Could not read this file.')
    } finally {
      setBusy(false)
    }
  }

  function updateExercise(key: string, patch: { muscleGroup?: MuscleGroup; kind?: ExerciseKind }) {
    if (step.name !== 'review') return
    setStep({
      name: 'review',
      plan: {
        ...step.plan,
        exercises: step.plan.exercises.map((e) => (e.key === key ? { ...e, ...patch, needsReview: false } : e)),
      },
    })
  }

  async function onImport() {
    if (step.name !== 'review') return
    setBusy(true)
    try {
      const result = await commitImport(db, step.plan, { templates: [...templates] })
      setStep({ name: 'done', result })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  const back = (
    <Link to="/settings" aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-xl border border-line text-muted">
      <ChevronLeftIcon size={20} />
    </Link>
  )

  if (step.name === 'pick') {
    return (
      <Page title="Import from Strong" action={back}>
        <Card>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-muted">
            <li>In Strong, open Settings → Export Data and save the CSV file.</li>
            <li>Choose that file below. Nothing is imported until you confirm.</li>
            <li>Importing again later only adds workouts that aren't here yet.</li>
          </ol>
        </Card>
        <input
          id="strong-file"
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onFile(f)
            e.target.value = ''
          }}
        />
        <label
          htmlFor="strong-file"
          className="flex h-12 cursor-pointer items-center justify-center rounded-2xl bg-accent font-bold text-white"
        >
          {busy ? 'Reading…' : 'Choose Strong CSV'}
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
      </Page>
    )
  }

  if (step.name === 'done') {
    const r = step.result
    return (
      <Page title="Imported" action={back}>
        <Card>
          <ul className="flex flex-col gap-2 text-sm">
            <li className="flex justify-between"><span className="text-muted">Workouts</span><span className="font-semibold">{r.workouts}</span></li>
            <li className="flex justify-between"><span className="text-muted">Sets</span><span className="font-semibold">{r.sets}</span></li>
            <li className="flex justify-between"><span className="text-muted">New exercises</span><span className="font-semibold">{r.exercisesCreated}</span></li>
            <li className="flex justify-between"><span className="text-muted">Templates</span><span className="font-semibold">{r.templates}</span></li>
          </ul>
        </Card>
        <button onClick={() => navigate('/history')} className="h-12 rounded-2xl bg-accent font-bold text-white">
          See history
        </button>
      </Page>
    )
  }

  const { plan } = step
  const toReview = plan.exercises.filter((e) => e.needsReview)
  const listed = showAll ? plan.exercises : toReview
  const first = new Date(plan.newWorkouts[0].startedAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
  const last = new Date(plan.newWorkouts[plan.newWorkouts.length - 1].startedAt).toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
  })

  return (
    <Page title="Review import" action={back}>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-surface p-3">
          <div className="text-[26px] font-bold">{plan.newWorkouts.length}</div>
          <div className="text-[11px] text-faint">workouts · {first} – {last}</div>
        </div>
        <div className="rounded-2xl bg-surface p-3">
          <div className="text-[26px] font-bold">{plan.exercises.length}</div>
          <div className="text-[11px] text-faint">exercises</div>
        </div>
      </div>
      {plan.skippedWorkouts > 0 && (
        <p className="text-xs text-faint">{plan.skippedWorkouts} workouts are already in the app and will be skipped.</p>
      )}

      {plan.templateNames.length > 0 && (
        <Card>
          <SectionTitle aside="from your recent routines">Templates</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {plan.templateNames.map((name) => {
              const on = templates.has(name)
              return (
                <button
                  key={name}
                  onClick={() => {
                    const next = new Set(templates)
                    if (on) next.delete(name)
                    else next.add(name)
                    setTemplates(next)
                  }}
                  aria-pressed={on}
                  className={`h-9 rounded-full px-3.5 text-[13px] font-semibold ${
                    on ? 'bg-text text-bg' : 'border border-line text-muted'
                  }`}
                >
                  {name}
                </button>
              )
            })}
          </div>
        </Card>
      )}

      <Card>
        <SectionTitle aside={toReview.length ? `${toReview.length} to check` : 'all recognised'}>Muscle groups</SectionTitle>
        {!showAll && toReview.length === 0 && (
          <p className="text-xs text-faint">Every exercise was matched to a muscle group. You can still check them.</p>
        )}
        <ul className="flex flex-col divide-y divide-line">
          {listed.map((e) => (
            <li key={e.key} className="flex flex-col gap-2 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className={`text-sm font-semibold ${e.needsReview ? 'text-danger' : ''}`}>{e.name}</span>
                <span className="shrink-0 text-[11px] text-faint">{e.setCount} sets</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  aria-label={`Muscle group for ${e.name}`}
                  value={e.muscleGroup}
                  onChange={(ev) => updateExercise(e.key, { muscleGroup: ev.target.value as MuscleGroup })}
                  className="h-9 rounded-[10px] bg-raised px-2 text-[13px] text-text"
                >
                  {MUSCLE_GROUPS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <select
                  aria-label={`Type for ${e.name}`}
                  value={e.kind}
                  onChange={(ev) => updateExercise(e.key, { kind: ev.target.value as ExerciseKind })}
                  className="h-9 rounded-[10px] bg-raised px-2 text-[13px] text-text"
                >
                  {EXERCISE_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                  ))}
                </select>
              </div>
            </li>
          ))}
        </ul>
        <button onClick={() => setShowAll(!showAll)} className="mt-2 h-9 w-full rounded-[10px] bg-raised text-[13px] font-semibold text-muted">
          {showAll ? 'Show only ones to check' : `Show all ${plan.exercises.length} exercises`}
        </button>
      </Card>

      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        onClick={onImport}
        disabled={busy}
        className="sticky bottom-24 h-12 rounded-2xl bg-accent font-bold text-white shadow-[0_8px_30px_rgba(0,0,0,0.8)] disabled:opacity-50"
      >
        {busy ? 'Importing…' : `Import ${plan.newWorkouts.length} workouts`}
      </button>
    </Page>
  )
}
