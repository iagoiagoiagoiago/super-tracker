import { NavLink } from 'react-router-dom'
import { DumbbellIcon, HistoryIcon, HomeIcon, NodesIcon, PlusIcon } from './icons'

const tabs = [
  { to: '/', label: 'Home', Icon: HomeIcon, end: true },
  { to: '/history', label: 'History', Icon: HistoryIcon },
  { to: '/train', label: 'Train', Icon: PlusIcon },
  { to: '/gym', label: 'Gym', Icon: DumbbellIcon },
  { to: '/bjj', label: 'BJJ', Icon: NodesIcon },
]

export function TabBar() {
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-[#16191c] bg-black/90 backdrop-blur-md">
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
  )
}
