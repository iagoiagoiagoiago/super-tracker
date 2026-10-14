import { NavLink } from 'react-router-dom'

/** Large-title switcher between the technique map, the focus view and the journal. */
export function BjjNav() {
  const cls = ({ isActive }: { isActive: boolean }) =>
    `text-[23px] font-extrabold tracking-tight transition-colors ${isActive ? 'text-text' : 'text-[#3a3f45] hover:text-dim'}`
  return (
    <nav aria-label="BJJ views" className="flex items-baseline gap-2.5">
      <NavLink to="/bjj" end className={cls}>
        Map
      </NavLink>
      <NavLink to="/bjj/focus" className={cls}>
        Focus
      </NavLink>
      <NavLink to="/bjj/notes" className={cls}>
        Notes
      </NavLink>
    </nav>
  )
}
