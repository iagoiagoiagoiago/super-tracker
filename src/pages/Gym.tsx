import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { ChevronRightIcon } from '../components/icons'
import { Card, EmptyState, Page, PhaseTag, SectionTitle, Stat } from '../components/ui'
import { db } from '../db/db'

export function Gym() {
  const counts = useLiveQuery(async () => ({
    workouts: await db.workouts.filter((w) => !!w.endedAt).count(),
    exercises: await db.exercises.filter((e) => !e.archived).count(),
  }))

  return (
    <Page
      title="Gym"
      action={
        <Link to="/gym/exercises" className="pb-2 text-[13px] font-semibold text-accent">
          All exercises
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <Stat value={counts?.workouts ?? '–'} label="workouts logged" />
        <Stat value={counts?.exercises ?? '–'} label="exercises" />
      </div>

      {counts?.workouts === 0 && (
        <EmptyState title="Bring your history over" body="Import your Strong export and every past workout, PR and exercise comes with it.">
          <Link to="/import/strong" className="mt-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white">
            Import from Strong
          </Link>
        </EmptyState>
      )}

      <Link to="/gym/exercises" className="flex items-center gap-3 rounded-[20px] bg-surface p-4">
        <span className="flex-1 font-bold">Exercise library</span>
        <ChevronRightIcon size={18} className="text-faint" />
      </Link>

      <Card>
        <SectionTitle aside={<PhaseTag phase={3} />}>Best lifts, PRs and trends</SectionTitle>
        <p className="text-xs text-faint">Estimated 1RM per lift, sets per muscle, recent PRs and most trained exercises.</p>
      </Card>
    </Page>
  )
}
