import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ExercisePicker } from '../components/ExercisePicker'
import { Page } from '../components/ui'
import { db, newId } from '../db/db'
import type { Template, TemplateExercise } from '../db/schema'

export function TemplateEditor() {
  const { id } = useParams()
  const isNew = id === 'new'
  // undefined = loading, null = not found
  const template = useLiveQuery(async () => (isNew || !id ? null : ((await db.templates.get(id)) ?? null)), [id, isNew])
  if (!isNew && template === undefined) return null
  return <TemplateForm key={id} template={isNew ? undefined : (template ?? undefined)} />
}

function TemplateForm({ template }: { template?: Template }) {
  const navigate = useNavigate()
  const exercises = useLiveQuery(async () => new Map((await db.exercises.toArray()).map((e) => [e.id, e])))
  const [name, setName] = useState(template?.name ?? '')
  const [folder, setFolder] = useState(template?.folder ?? '')
  const [items, setItems] = useState<TemplateExercise[]>(template?.exercises ?? [])
  const [picker, setPicker] = useState(false)

  async function save() {
    const data = { name: name.trim() || 'Template', folder: folder.trim() || undefined, exercises: items, updatedAt: Date.now() }
    if (template) await db.templates.update(template.id, data)
    else await db.templates.add({ id: newId(), ...data })
    navigate('/train')
  }

  async function remove() {
    if (!template || !window.confirm(`Delete template "${template.name}"?`)) return
    await db.templates.delete(template.id)
    navigate('/train')
  }

  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= items.length) return
    const next = [...items]
    ;[next[i], next[j]] = [next[j], next[i]]
    setItems(next)
  }

  const setSets = (i: number, delta: number) =>
    setItems(items.map((x, j) => (j === i ? { ...x, sets: Math.min(10, Math.max(1, x.sets + delta)) } : x)))

  return (
    <Page
      title={template ? 'Edit template' : 'New template'}
      action={
        <button onClick={save} className="mb-1 h-10 rounded-xl bg-accent px-5 font-bold text-white">
          Save
        </button>
      }
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Template name"
        aria-label="Template name"
        className="h-12 rounded-xl bg-raised px-4 text-lg font-bold text-text placeholder:text-faint outline-none focus:outline-2 focus:outline-accent"
      />
      <input
        value={folder}
        onChange={(e) => setFolder(e.target.value)}
        placeholder="Folder (optional)"
        aria-label="Folder"
        className="h-11 rounded-xl bg-raised px-4 text-[15px] text-text placeholder:text-faint outline-none focus:outline-2 focus:outline-accent"
      />

      <ul className="flex flex-col gap-2">
        {items.map((it, i) => (
          <li key={`${it.exerciseId}-${i}`} className="flex items-center gap-2 rounded-2xl bg-surface p-3">
            <div className="flex flex-col">
              <button onClick={() => move(i, -1)} aria-label="Move up" className="h-6 w-7 text-faint">▲</button>
              <button onClick={() => move(i, 1)} aria-label="Move down" className="h-6 w-7 text-faint">▼</button>
            </div>
            <span className="min-w-0 flex-1 truncate font-semibold">{exercises?.get(it.exerciseId)?.name ?? '…'}</span>
            <div className="flex items-center gap-1 rounded-xl bg-raised p-1">
              <button onClick={() => setSets(i, -1)} aria-label="Fewer sets" className="h-8 w-8 rounded-lg text-lg text-muted">−</button>
              <span className="w-12 text-center text-sm font-semibold">{it.sets} sets</span>
              <button onClick={() => setSets(i, 1)} aria-label="More sets" className="h-8 w-8 rounded-lg text-lg text-muted">+</button>
            </div>
            <button onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Remove exercise" className="h-8 w-8 rounded-lg text-lg text-danger">
              ×
            </button>
          </li>
        ))}
      </ul>

      <button onClick={() => setPicker(true)} className="h-12 rounded-2xl bg-accent/15 font-bold text-accent">
        Add exercise
      </button>
      {template && (
        <button onClick={remove} className="h-12 rounded-2xl bg-danger/10 font-bold text-danger">
          Delete template
        </button>
      )}

      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={(exerciseId) => setItems((cur) => [...cur, { exerciseId, sets: 3 }])} />
    </Page>
  )
}
