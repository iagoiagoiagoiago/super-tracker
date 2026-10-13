import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db, newId } from '../db/db'
import type { ID } from '../db/schema'
import { guessKind, guessMuscleGroup, muscleLabel, nameKey, normalizeName } from '../lib/exerciseCatalog'
import { Sheet } from './Sheet'

/** Searchable exercise list, most recently used first. Can create a new exercise from the search text. */
export function ExercisePicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (exerciseId: ID) => void
}) {
  const [query, setQuery] = useState('')
  const data = useLiveQuery(async () => {
    if (!open) return undefined
    const [exercises, sets] = await Promise.all([db.exercises.toArray(), db.sets.toArray()])
    const lastUsed = new Map<ID, number>()
    for (const s of sets) {
      if (s.completedAt && s.completedAt > (lastUsed.get(s.exerciseId) ?? 0)) lastUsed.set(s.exerciseId, s.completedAt)
    }
    return exercises
      .filter((e) => !e.archived)
      .sort((a, b) => (lastUsed.get(b.id) ?? 0) - (lastUsed.get(a.id) ?? 0) || a.name.localeCompare(b.name))
  }, [open])

  const q = nameKey(query)
  const results = useMemo(
    () => (data ?? []).filter((e) => !q || q.split(' ').every((w) => nameKey(e.name).includes(w))),
    [data, q],
  )
  const exact = data?.some((e) => nameKey(e.name) === q)

  function close() {
    setQuery('')
    onClose()
  }

  async function create() {
    const name = normalizeName(query)
    const id = newId()
    await db.exercises.add({
      id,
      name,
      muscleGroup: guessMuscleGroup(name) ?? 'other',
      kind: guessKind(name),
      restSeconds: 180,
      archived: false,
      createdAt: Date.now(),
    })
    onPick(id)
    close()
  }

  return (
    <Sheet open={open} onClose={close} title="Add exercise" tall>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search"
        className="mb-3 h-11 w-full rounded-xl bg-raised px-4 text-[16px] text-text placeholder:text-faint focus:outline-2 focus:outline-accent"
      />
      {q && !exact && (
        <button onClick={create} className="mb-2 flex h-12 w-full items-center gap-2 rounded-xl border border-dashed border-line px-4 text-left text-sm">
          <span className="text-accent">+ Create</span>
          <span className="truncate font-semibold">“{normalizeName(query)}”</span>
        </button>
      )}
      <ul className="flex flex-col">
        {results.map((e) => (
          <li key={e.id}>
            <button
              onClick={() => {
                onPick(e.id)
                close()
              }}
              className="flex w-full items-center justify-between gap-3 border-b border-line py-3 text-left"
            >
              <span className="font-semibold">{e.name}</span>
              <span className="shrink-0 text-xs text-faint">{muscleLabel(e.muscleGroup)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
