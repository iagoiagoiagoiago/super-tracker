import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { analyzeFocus, endCycle, startCycle, updateCycleGoal, type FocusAnalysis, type Suggestion, type SuggestionKind } from '../bjj/focus'
import { STATUS_COLOR, STATUS_SHORT } from '../bjj/map'
import { updateTechnique } from '../bjj/ops'
import { BjjNav } from '../components/BjjNav'
import { Sheet } from '../components/Sheet'
import { db } from '../db/db'
import type { FocusCycle, ID, Position, Side, Technique } from '../db/schema'

const SIDES: { value: Side; label: string; title: string }[] = [
  { value: 'bottom', label: 'Bottom · guard', title: 'BOTTOM FOCUS' },
  { value: 'top', label: 'Top · passing', title: 'TOP FOCUS' },
]

const TAG: Record<SuggestionKind, { label: string; color: string }> = {
  leak: { label: 'LEAK', color: '#ff6b5e' },
  dead_end: { label: 'DEAD END', color: '#b86bff' },
  promote: { label: 'PROMOTE', color: STATUS_COLOR.agame },
  stale: { label: 'STALE', color: STATUS_COLOR.learning },
  adherence: { label: 'FOCUS', color: '#8a9098' },
}

export function BjjFocus() {
  const [side, setSide] = useState<Side>('bottom')
  const [starting, setStarting] = useState(false)
  const [editingGoal, setEditingGoal] = useState<FocusCycle | null>(null)
  const navigate = useNavigate()

  const data = useLiveQuery(async () => {
    const [positions, techniques, sessions, cycles] = await Promise.all([
      db.positions.toArray(),
      db.techniques.toArray(),
      db.bjjSessions.toArray(),
      db.focusCycles.toArray(),
    ])
    const now = Date.now()
    const active = new Map<Side, FocusAnalysis>()
    for (const c of cycles.filter((c) => !c.endedAt)) active.set(c.side, analyzeFocus(c, positions, techniques, sessions, now))
    const past = cycles.filter((c) => c.endedAt).sort((a, b) => b.startedAt - a.startedAt).map((c) => analyzeFocus(c, positions, techniques, sessions, now))
    return { positions, active, past }
  })

  const a = data?.active.get(side)
  const posById = new Map(data?.positions.map((p) => [p.id, p]))
  const openOnMap = (sel: { type: 'technique' | 'position'; id: ID }) => navigate('/bjj', { state: { select: sel } })

  return (
    <main className="pt-safe mx-auto flex min-h-full max-w-lg flex-col gap-4 px-4 pb-28">
      <header className="flex items-center justify-between pt-2">
        <BjjNav />
        <Link to="/bjj/log" className="flex h-10 items-center rounded-xl bg-bjj px-3.5 text-sm font-bold text-[#0a0b0c] shadow-[0_0_16px_rgba(182,255,59,0.25)]">
          Log session
        </Link>
      </header>

      <div role="tablist" aria-label="Side" className="grid grid-cols-2 gap-1 rounded-xl bg-[#121417] p-1">
        {SIDES.map((s) => {
          const on = side === s.value
          return (
            <button
              key={s.value}
              role="tab"
              aria-selected={on}
              onClick={() => setSide(s.value)}
              className={`flex h-9 items-center justify-center gap-2 rounded-[9px] text-[13px] font-semibold ${on ? 'bg-[#262a30] text-text' : 'text-muted'}`}
            >
              {data?.active.has(s.value) && <span className="h-1.5 w-1.5 rounded-full bg-bjj shadow-[0_0_6px_var(--color-bjj)]" />}
              {s.label}
            </button>
          )
        })}
      </div>

      {data && !a && (
        <div className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-line px-6 py-10 text-center">
          <span className="h-4 w-4 rounded-full border-2 border-learning bg-black shadow-[0_0_14px_var(--color-learning)]" />
          <p className="text-[15px] font-semibold">No {side} focus yet</p>
          <p className="max-w-xs text-[13px] text-muted">
            Pick one {side === 'bottom' ? 'guard' : 'top'} position to build around. Your sessions then show what's working, what's slipping and what to do next.
          </p>
          <button onClick={() => setStarting(true)} className="mt-1 h-11 rounded-xl bg-text px-5 text-sm font-bold text-bg">
            Start a focus cycle
          </button>
        </div>
      )}

      {a && (
        <>
          <FocusCard
            a={a}
            title={SIDES.find((s) => s.value === side)!.title}
            onEditGoal={() => setEditingGoal(a.cycle)}
            onNew={() => setStarting(true)}
            onEnd={async () => {
              if (window.confirm(`End your ${a.position?.name ?? ''} focus? It moves to past cycles.`)) await endCycle(a.cycle.id)
            }}
          />

          <Section title="Working most" empty="Log sessions with techniques from here to see what you're using.">
            {a.workingMost.map((s) => (
              <Row key={s.technique.id} t={s.technique} meta={[s.hits && `${s.hits} hit`, s.taught && `${s.taught} drilled`].filter(Boolean).join(' · ')} onClick={() => openOnMap({ type: 'technique', id: s.technique.id })} />
            ))}
          </Section>

          <Section title="Neglected" empty="Nothing slipping. Every technique here was logged in the last two weeks.">
            {a.neglected.map((s) => (
              <Row key={s.technique.id} t={s.technique} meta={s.daysSince > 365 ? '1y+' : `${s.daysSince} days`} onClick={() => openOnMap({ type: 'technique', id: s.technique.id })} />
            ))}
          </Section>

          <Section title="Getting caught" empty="Nobody has caught you with anything mapped here this cycle.">
            {a.caught.map((s) => (
              <Row key={s.technique.id} t={s.technique} meta={`${s.caught}×`} metaColor="#ff9b92" onClick={() => openOnMap({ type: 'technique', id: s.technique.id })} />
            ))}
          </Section>

          {a.suggestions.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-faint">Suggestions</h2>
              {a.suggestions.map((s, i) => (
                <SuggestionCard key={i} s={s} posName={s.positionId ? posById.get(s.positionId)?.name : undefined} onOpen={openOnMap} />
              ))}
            </section>
          )}
        </>
      )}

      {data && data.past.filter((p) => p.cycle.side === side).length > 0 && (
        <section className="flex flex-col gap-2 pt-2">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-faint">Past cycles</h2>
          <ul className="divide-y divide-line rounded-[18px] border border-line px-4">
            {data.past
              .filter((p) => p.cycle.side === side)
              .map((p) => (
                <li key={p.cycle.id} className="flex items-baseline justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{p.position?.name ?? 'Deleted position'}</div>
                    {p.cycle.goal && <div className="truncate text-xs text-faint">{p.cycle.goal}</div>}
                  </div>
                  <div className="shrink-0 text-right text-xs text-faint">
                    <div>{fmtRange(p.cycle)}</div>
                    <div>{p.sessions} sessions</div>
                  </div>
                </li>
              ))}
          </ul>
        </section>
      )}

      {data && (
        <StartCycleSheet
          open={starting}
          side={side}
          positions={data.positions}
          replacing={a?.position?.name}
          onClose={() => setStarting(false)}
        />
      )}
      <GoalSheet cycle={editingGoal} onClose={() => setEditingGoal(null)} />
    </main>
  )
}

const fmtDate = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const fmtRange = (c: FocusCycle) => `${fmtDate(c.startedAt)} – ${c.endedAt ? fmtDate(c.endedAt) : 'now'}`

function FocusCard({ a, title, onEditGoal, onNew, onEnd }: { a: FocusAnalysis; title: string; onEditGoal: () => void; onNew: () => void; onEnd: () => void }) {
  return (
    <section className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-[18px]">
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.1em] text-faint">
        <span className="h-2 w-2 rounded-full bg-bjj shadow-[0_0_10px_var(--color-bjj)]" />
        {title} · SINCE {fmtDate(a.cycle.startedAt).toUpperCase()}
      </div>
      <div>
        <div className="text-[24px] font-extrabold tracking-tight">{a.position?.name ?? 'Deleted position'}</div>
        <button onClick={onEditGoal} className="mt-1 text-left text-sm text-muted">
          {a.cycle.goal ? `Goal: ${a.cycle.goal}` : <span className="text-accent">+ Add a goal</span>}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Tile value={a.daysIn} label="days in" />
        <Tile value={a.sessions} label="sessions" />
        <Tile value={a.answered ? `${a.onFocus}/${a.answered}` : '–'} label="on focus" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onNew} className="h-10 rounded-xl bg-raised text-[13px] font-semibold text-muted">Switch position</button>
        <button onClick={onEnd} className="h-10 rounded-xl bg-raised text-[13px] font-semibold text-muted">End cycle</button>
      </div>
    </section>
  )
}

function Tile({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded-xl bg-[#15181b] p-2.5">
      <div className="text-[20px] font-bold">{value}</div>
      <div className="text-[11px] text-faint">{label}</div>
    </div>
  )
}

function Section({ title, empty, children }: { title: string; empty: string; children: ReactNode[] }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="text-[13px] font-semibold uppercase tracking-wider text-faint">{title}</h2>
      {children.length ? <ul className="flex flex-col gap-1.5">{children}</ul> : <p className="rounded-[14px] bg-[#0a0b0c] px-4 py-3 text-[13px] text-dim">{empty}</p>}
    </section>
  )
}

function Row({ t, meta, metaColor, onClick }: { t: Technique; meta: string; metaColor?: string; onClick: () => void }) {
  return (
    <li>
      <button onClick={onClick} className="flex w-full items-center gap-3 rounded-[14px] bg-surface px-4 py-3 text-left active:bg-raised">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_COLOR[t.status], boxShadow: `0 0 8px ${STATUS_COLOR[t.status]}` }} />
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{t.name}</span>
        <span className="shrink-0 text-[13px]" style={{ color: metaColor ?? '#8a9098' }}>{meta}</span>
      </button>
    </li>
  )
}

function SuggestionCard({ s, posName, onOpen }: { s: Suggestion; posName?: string; onOpen: (sel: { type: 'technique' | 'position'; id: ID }) => void }) {
  const tag = TAG[s.kind]
  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] border border-line bg-surface p-3.5">
      <span className="self-start rounded-md bg-raised px-2 py-0.5 text-[10px] font-bold tracking-[0.1em]" style={{ color: tag.color }}>
        {tag.label}
      </span>
      <p className="text-sm leading-relaxed text-[#c9cdd2]">{s.text}</p>
      <div className="flex gap-2">
        {s.kind === 'promote' && s.techniqueId && s.promoteTo && (
          <button
            onClick={() => updateTechnique(s.techniqueId!, { status: s.promoteTo })}
            className="h-9 rounded-[10px] px-3 text-[13px] font-bold text-[#0a0b0c]"
            style={{ background: STATUS_COLOR[s.promoteTo] }}
          >
            Move to {STATUS_SHORT[s.promoteTo]}
          </button>
        )}
        {s.kind === 'dead_end' && s.positionId && (
          <button onClick={() => onOpen({ type: 'position', id: s.positionId! })} className="h-9 rounded-[10px] bg-raised px-3 text-[13px] font-semibold">
            Open {posName ?? 'position'} on map
          </button>
        )}
        {(s.kind === 'leak' || s.kind === 'stale') && s.techniqueId && (
          <button onClick={() => onOpen({ type: 'technique', id: s.techniqueId! })} className="h-9 rounded-[10px] bg-raised px-3 text-[13px] font-semibold">
            Open on map
          </button>
        )}
      </div>
    </div>
  )
}

function StartCycleSheet({ open, side, positions, replacing, onClose }: { open: boolean; side: Side; positions: Position[]; replacing?: string; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={`New ${side} focus`}>
      {open && <StartCycleForm key={side} side={side} positions={positions} replacing={replacing} onClose={onClose} />}
    </Sheet>
  )
}

function StartCycleForm({ side, positions, replacing, onClose }: { side: Side; positions: Position[]; replacing?: string; onClose: () => void }) {
  const options = positions.filter((p) => p.side === side && p.kind === 'position').sort((a, b) => a.name.localeCompare(b.name))
  const [positionId, setPositionId] = useState<ID | null>(options[0]?.id ?? null)
  const [goal, setGoal] = useState('')

  if (!options.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-sm text-muted">There are no {side === 'bottom' ? 'guard' : 'top'} positions on your map yet.</p>
        <Link to="/bjj" className="h-11 rounded-xl bg-text px-5 py-3 text-sm font-bold text-bg">Go to the map</Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Position" className="flex flex-wrap gap-2">
        {options.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={positionId === p.id}
            onClick={() => setPositionId(p.id)}
            className={`h-10 rounded-full px-4 text-sm font-semibold ${positionId === p.id ? 'bg-text text-bg' : 'border border-line text-muted'}`}
          >
            {p.name}
          </button>
        ))}
      </div>
      <input
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        placeholder="Goal (optional), e.g. take the back from knee shield"
        aria-label="Goal"
        className="h-12 w-full rounded-xl bg-raised px-4 text-[16px] text-text placeholder:text-faint outline-none focus:outline-2 focus:outline-accent"
      />
      {replacing && <p className="text-xs text-faint">This ends your current {replacing} focus and moves it to past cycles.</p>}
      <button
        disabled={!positionId}
        onClick={async () => {
          if (!positionId) return
          await startCycle(side, positionId, goal)
          onClose()
        }}
        className="h-12 rounded-2xl bg-bjj font-bold text-[#0a0b0c] disabled:opacity-40"
      >
        Start focus
      </button>
    </div>
  )
}

function GoalSheet({ cycle, onClose }: { cycle: FocusCycle | null; onClose: () => void }) {
  return (
    <Sheet open={!!cycle} onClose={onClose} title="Focus goal">
      {cycle && <GoalForm key={cycle.id} cycle={cycle} onClose={onClose} />}
    </Sheet>
  )
}

function GoalForm({ cycle, onClose }: { cycle: FocusCycle; onClose: () => void }) {
  const [goal, setGoal] = useState(cycle.goal ?? '')
  return (
    <div className="flex flex-col gap-3">
      <input
        autoFocus
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        placeholder="What should this cycle get you?"
        aria-label="Goal"
        className="h-12 w-full rounded-xl bg-raised px-4 text-[16px] text-text placeholder:text-faint outline-none focus:outline-2 focus:outline-accent"
      />
      <button
        onClick={async () => {
          await updateCycleGoal(cycle.id, goal)
          onClose()
        }}
        className="h-12 rounded-2xl bg-text font-bold text-bg"
      >
        Save
      </button>
    </div>
  )
}
