import { PhaseTag } from '../components/ui'

const statuses = [
  { label: 'Want', color: 'var(--color-want)' },
  { label: 'Learning', color: 'var(--color-learning)' },
  { label: 'Hitting', color: 'var(--color-hitting)' },
  { label: 'A-game', color: 'var(--color-agame)' },
]

export function Bjj() {
  return (
    <main
      className="pt-safe relative mx-auto flex min-h-full max-w-lg flex-col px-4 pb-28"
      style={{
        backgroundImage: 'radial-gradient(#15181c 1px, transparent 1px)',
        backgroundSize: '22px 22px',
      }}
    >
      <header className="flex flex-col gap-3 pt-2">
        <h1 className="text-[30px] font-extrabold tracking-tight">Game</h1>
        <div className="flex gap-3 text-[11px] text-faint">
          {statuses.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span className="h-[7px] w-[7px] rounded-full" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }} />
              {s.label}
            </span>
          ))}
        </div>
      </header>

      <div className="my-6 flex flex-1 flex-col">
        <div className="flex flex-1 flex-col">
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <span
              className="h-5 w-5 rounded-full border-2 border-hitting bg-black"
              style={{ boxShadow: '0 0 18px var(--color-hitting), 0 0 4px var(--color-hitting)' }}
            />
            <p className="text-[15px] font-semibold">Your map is empty</p>
            <p className="max-w-[16rem] text-[13px] text-muted">Add your first position, then drag techniques between them.</p>
            <PhaseTag phase={4} />
          </div>
          <div className="pb-3 text-[10px] font-semibold tracking-[0.16em] text-dim">TOP · PASSING</div>
        </div>
        <div className="border-t border-dashed border-[#262a30]" />
        <div className="flex-1 pt-3 text-[10px] font-semibold tracking-[0.16em] text-dim">BOTTOM · GUARD</div>
      </div>
    </main>
  )
}
