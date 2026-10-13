import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { NodesIcon } from '../components/icons'
import { Sheet } from '../components/Sheet'
import { Page, PhaseTag } from '../components/ui'
import { db } from '../db/db'
import type { Exercise, Template } from '../db/schema'
import { getActiveWorkoutId, lastPerformedFor, startWorkout } from '../gym/workouts'
import { muscleLabel } from '../lib/exerciseCatalog'
import { relativeDays } from '../lib/time'

export function Train() {
  const navigate = useNavigate()
  const [preview, setPreview] = useState<Template | null>(null)

  const data = useLiveQuery(async () => {
    const [templates, exercises, workouts, activeId] = await Promise.all([
      db.templates.toArray(),
      db.exercises.toArray(),
      db.workouts.toArray(),
      getActiveWorkoutId(),
    ])
    return {
      templates: templates.map((t) => ({ t, last: lastPerformedFor(t, workouts) })),
      exercises: new Map(exercises.map((e) => [e.id, e])),
      activeId,
    }
  })

  async function start(template?: Template) {
    if (data?.activeId && !window.confirm('A workout is already in progress. Resume it?')) return
    await startWorkout(template)
    navigate('/workout')
  }

  // Folders: named folders first (alphabetical), then unfiled templates as "My templates".
  const folders = new Map<string, { t: Template; last?: number }[]>()
  for (const item of data?.templates ?? []) {
    const f = item.t.folder ?? ''
    folders.set(f, [...(folders.get(f) ?? []), item])
  }
  const folderEntries = [...folders.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))

  return (
    <Page title="Train">
      {data?.activeId ? (
        <button onClick={() => navigate('/workout')} className="h-14 rounded-2xl bg-done text-base font-bold text-[#03140a]">
          Resume workout
        </button>
      ) : (
        <button onClick={() => start()} className="h-14 rounded-2xl bg-accent text-base font-bold text-white">
          Start an empty workout
        </button>
      )}

      <div className="flex items-center gap-3 rounded-[20px] bg-surface p-4 opacity-70">
        <NodesIcon className="text-bjj" />
        <div className="flex-1">
          <p className="font-bold">Log BJJ session</p>
          <p className="text-xs text-faint">Session summary, tapped from your map</p>
        </div>
        <PhaseTag phase={5} />
      </div>

      <div className="mt-2 flex items-center justify-between">
        <h2 className="text-[24px] font-extrabold">Templates</h2>
        <button onClick={() => navigate('/template/new')} className="h-9 rounded-[10px] bg-accent/15 px-3.5 text-sm font-bold text-accent">
          + Template
        </button>
      </div>

      {data && data.templates.length === 0 && (
        <p className="text-sm text-faint">No templates yet. Create one, or import your Strong history from Settings.</p>
      )}

      {folderEntries.map(([folder, items]) => (
        <section key={folder || 'mine'} className="flex flex-col gap-3">
          <h3 className="text-[15px] font-bold text-muted">
            {folder || 'My templates'} <span className="text-faint">({items.length})</span>
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {items
              .sort((a, b) => (b.last ?? 0) - (a.last ?? 0))
              .map(({ t, last }) => (
                <button
                  key={t.id}
                  onClick={() => setPreview(t)}
                  className="flex min-h-[150px] flex-col gap-2 rounded-[18px] border border-line p-4 text-left active:bg-surface"
                >
                  <span className="text-[17px] font-bold">{t.name}</span>
                  <span className="line-clamp-4 flex-1 text-[13px] leading-snug text-muted">
                    {t.exercises.map((e) => data?.exercises.get(e.exerciseId)?.name).filter(Boolean).join(', ')}
                  </span>
                  <span className="text-xs italic text-faint">{last ? relativeDays(last) : 'Never performed'}</span>
                </button>
              ))}
          </div>
        </section>
      ))}

      <TemplatePreview
        template={preview}
        exercises={data?.exercises}
        last={data?.templates.find((x) => x.t.id === preview?.id)?.last}
        onClose={() => setPreview(null)}
        onEdit={() => preview && navigate(`/template/${preview.id}`)}
        onStart={() => {
          const t = preview
          setPreview(null)
          if (t) void start(t)
        }}
      />
    </Page>
  )
}

function TemplatePreview({
  template,
  exercises,
  last,
  onClose,
  onEdit,
  onStart,
}: {
  template: Template | null
  exercises?: Map<string, Exercise>
  last?: number
  onClose: () => void
  onEdit: () => void
  onStart: () => void
}) {
  return (
    <Sheet
      open={!!template}
      onClose={onClose}
      title={template?.name}
      left={
        <button onClick={onClose} aria-label="Close" className="h-8 w-10 rounded-lg bg-raised text-lg leading-none text-muted">
          ×
        </button>
      }
      right={
        <button onClick={onEdit} className="text-[17px] font-semibold text-accent">
          Edit
        </button>
      }
    >
      <p className="mb-3 text-sm text-faint">Last performed: {last ? relativeDays(last) : 'never'}</p>
      <ul className="flex flex-col gap-3">
        {template?.exercises.map((te, i) => {
          const ex = exercises?.get(te.exerciseId)
          return (
            <li key={i} className="flex flex-col">
              <span className="font-bold">
                {te.sets} × {ex?.name ?? 'Unknown exercise'}
              </span>
              <span className="text-sm text-faint">{ex ? muscleLabel(ex.muscleGroup) : ''}</span>
            </li>
          )
        })}
      </ul>
      <button onClick={onStart} className="mt-6 h-12 w-full rounded-2xl bg-accent font-bold text-white">
        Start workout
      </button>
    </Sheet>
  )
}
