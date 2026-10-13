import { useLiveQuery } from 'dexie-react-hooks'
import { Card, EmptyState, Page, PhaseTag, SectionTitle, Stat } from '../components/ui'
import { db } from '../db/db'

export function Gym() {
  const counts = useLiveQuery(async () => ({
    workouts: await db.workouts.count(),
    exercises: await db.exercises.filter((e) => !e.archived).count(),
  }))

  return (
    <Page title="Gym" action={<span className="pb-2 text-[13px] text-faint">All exercises</span>}>
      <div className="grid grid-cols-2 gap-2">
        <Stat value={counts?.workouts ?? '–'} label="workouts logged" />
        <Stat value={counts?.exercises ?? '–'} label="exercises" />
      </div>

      {counts?.workouts === 0 && (
        <EmptyState
          title="Import your Strong history"
          body="Best lifts, sets per muscle, recent PRs and most trained exercises are all calculated from your logged sets."
        >
          <PhaseTag phase={2} />
        </EmptyState>
      )}

      <Card>
        <SectionTitle aside="estimated 1RM">Best lifts</SectionTitle>
        <p className="text-xs text-faint">Appears after your first workouts.</p>
      </Card>
    </Page>
  )
}
