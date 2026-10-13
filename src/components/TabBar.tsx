import { useLiveQuery } from 'dexie-react-hooks'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import { getActiveWorkoutId } from '../gym/workouts'
import { fmtClock } from '../lib/gym'
import { useNow } from '../lib/hooks'
import { DumbbellIcon, HistoryIcon, HomeIcon, NodesIcon, PlusIcon } from './icons'

const tabs = [
  { to: '/', label: 'Home', Icon: HomeIcon, end: true },
  { to: '/history', label: 'History', Icon: HistoryIcon },
  { to: '/train', label: 'Train', Icon: PlusIcon },
  { to: '/gym', label: 'Gym', Icon: DumbbellIcon },
  { to: '/bjj', label: 'BJJ', Icon: NodesIcon },
]

export function TabBar() {
  const { pathname } = useLocation()
  if (pathname.startsWith('/workout')) return null
  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-[#16191c] bg-black/90 backdrop-blur-md">
      <ActiveWorkoutPill />
      <nav>
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {tabs.map(({ to, label, Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex h-16 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors ${
                    isActive ? 'text-text' : 'text-[#5e656d]'
                  }`
                }
              >
                <Icon />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

/** Shown above the tabs while a workout is running, like Strong's minimised workout. */
function ActiveWorkoutPill() {
  const navigate = useNavigate()
  const active = useLiveQuery(async () => {
    const id = await getActiveWorkoutId()
    return id ? ((await db.workouts.get(id)) ?? null) : null
  })
  const now = useNow(1000, !!active)
  if (!active) return null
  return (
    <button
      onClick={() => navigate('/workout')}
      className="mx-auto flex h-12 w-full max-w-lg items-center justify-between border-b border-[#16191c] px-5"
    >
      <span className="flex items-center gap-2 font-bold">
        <span className="h-2 w-2 animate-pulse rounded-full bg-done" />
        {active.name}
      </span>
      <span className="text-sm text-muted tabular-nums">{fmtClock(now - active.startedAt)}</span>
    </button>
  )
}
