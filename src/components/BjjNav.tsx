import { NavLink } from 'react-router-dom'

/** Large-title switcher between the technique map and the focus view. */
export function BjjNav() {
  const cls = ({ isActive }: { isActive: boolean }) =>
    `text-[30px] font-extrabold tracking-tight transition-colors ${isActive ? 'text-text' : 'text-[#3a3f45] hover:text-dim'}`
  return (
    <nav aria-label="BJJ views" className="flex items-baseline gap-4">
      <NavLink to="/bjj" end className={cls}>
        Map
      </NavLink>
      <NavLink to="/bjj/focus" className={cls}>
        Focus
      </NavLink>
    </nav>
  )
}
