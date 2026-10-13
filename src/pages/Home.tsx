import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { BackupCard } from '../components/BackupCard'
import { GearIcon } from '../components/icons'
import { Card, Page, SectionTitle, Stat } from '../components/ui'
import { db } from '../db/db'
import { formatDayHeader, startOfWeek } from '../lib/time'

export function Home() {
  const week = useLiveQuery(async () => {
    const from = startOfWeek()
    const [gym, bjj] = await Promise.all([
      db.workouts.where('startedAt').aboveOrEqual(from).count(),
      db.bjjSessions.where('date').aboveOrEqual(from).count(),
    ])
    return { gym, bjj }
  })

  return (
    <Page
      eyebrow={formatDayHeader()}
      title="This week"
      action={
        <Link
          to="/settings"
          aria-label="Settings"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-line text-muted"
        >
          <GearIcon size={20} />
        </Link>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        <Stat value={week ? week.gym + week.bjj : '–'} label="sessions" />
        <Stat value={week?.gym ?? '–'} label="gym" />
        <Stat value={week?.bjj ?? '–'} label="BJJ" />
      </div>

      <Card>
        <SectionTitle aside="Phase 7">Consistency</SectionTitle>
        <div className="grid grid-flow-col grid-rows-7 gap-1" aria-hidden="true">
          {Array.from({ length: 84 }, (_, i) => (
            <span key={i} className="h-[18px] rounded-[4px] bg-[#15181b]" />
          ))}
        </div>
        <p className="mt-3 text-xs text-faint">Your last 12 weeks of gym and BJJ will fill this in.</p>
      </Card>

      <BackupCard />
    </Page>
  )
}
