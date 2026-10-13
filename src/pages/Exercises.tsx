import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeftIcon } from '../components/icons'
import { Page } from '../components/ui'
import { db } from '../db/db'
import { MUSCLE_GROUPS, nameKey } from '../lib/exerciseCatalog'

export function Exercises() {
  const [query, setQuery] = useState('')
  const data = useLiveQuery(async () => {
    const [exercises, sets] = await Promise.all([db.exercises.toArray(), db.sets.toArray()])
    const sessions = new Map<string, Set<string>>()
    for (const s of sets) {
      if (!s.done) continue
      const w = sessions.get(s.exerciseId) ?? new Set()
      w.add(s.workoutId)
      sessions.set(s.exerciseId, w)
    }
    return exercises
      .filter((e) => !e.archived)
      .map((e) => ({ e, count: sessions.get(e.id)?.size ?? 0 }))
      .sort((a, b) => a.e.name.localeCompare(b.e.name))
  })

  const q = nameKey(query)
  const filtered = (data ?? []).filter((x) => !q || q.split(' ').every((w) => nameKey(x.e.name).includes(w)))

  return (
    <Page
      title="Exercises"
      action={
        <Link to="/gym" aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-xl border border-line text-muted">
          <ChevronLeftIcon size={20} />
        </Link>
      }
    >
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${data?.length ?? ''} exercises`}
        aria-label="Search exercises"
        className="h-11 rounded-xl bg-raised px-4 text-[16px] text-text placeholder:text-faint outline-none focus:outline-2 focus:outline-accent"
      />
      {MUSCLE_GROUPS.map((g) => {
        const list = filtered.filter((x) => x.e.muscleGroup === g.value)
        if (!list.length) return null
        return (
          <section key={g.value}>
            <h2 className="mb-1 text-[13px] font-semibold uppercase tracking-wider text-faint">{g.label}</h2>
            <ul>
              {list.map(({ e, count }) => (
                <li key={e.id}>
                  <Link to={`/gym/exercises/${e.id}`} className="flex items-center justify-between gap-3 border-b border-line py-3">
                    <span className="font-semibold">{e.name}</span>
                    <span className="shrink-0 text-xs text-faint">{count ? `${count}×` : ''}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </Page>
  )
}
