import { useLiveQuery } from 'dexie-react-hooks'
import { EmptyState, Page } from '../components/ui'
import { db } from '../db/db'
import { formatDateTime } from '../lib/time'

type Entry = { id: string; kind: 'gym' | 'bjj'; title: string; at: number }

export function History() {
  const entries = useLiveQuery(async (): Promise<Entry[]> => {
    const [workouts, sessions] = await Promise.all([db.workouts.toArray(), db.bjjSessions.toArray()])
    return [
      ...workouts.map((w) => ({ id: w.id, kind: 'gym' as const, title: w.name, at: w.startedAt })),
      ...sessions.map((s) => ({ id: s.id, kind: 'bjj' as const, title: 'BJJ', at: s.date })),
    ].sort((a, b) => b.at - a.at)
  })

  return (
    <Page title="History">
      {entries && entries.length === 0 && (
        <EmptyState
          title="No sessions yet"
          body="Gym workouts and BJJ sessions show up here. Your Strong history will appear once it's imported."
        />
      )}
      <ul className="flex flex-col gap-2">
        {entries?.map((e) => (
          <li key={e.id} className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3">
            <span className={`h-2 w-2 rounded-full ${e.kind === 'gym' ? 'bg-gym' : 'bg-bjj'}`} />
            <span className="flex-1 font-semibold">{e.title}</span>
            <span className="text-xs text-faint">{formatDateTime(e.at)}</span>
          </li>
        ))}
      </ul>
    </Page>
  )
}
