import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { STATUS_COLOR, STATUS_LABEL, STATUS_ORDER, STATUS_SHORT, nodeColor } from '../bjj/map'
import { addPosition, addTechnique, deletePosition, deleteTechnique, movePosition, updatePosition, updateTechnique } from '../bjj/ops'
import { Sheet } from '../components/Sheet'
import { TechniqueMap, type MapFilter, type MapSelection, type TechniqueMapHandle } from '../components/TechniqueMap'
import { db } from '../db/db'
import type { ID, Position, Side, Technique, TechniqueStatus } from '../db/schema'

const TAB_BAR = 84

export function Bjj() {
  const data = useLiveQuery(async () => {
    const [positions, techniques] = await Promise.all([db.positions.toArray(), db.techniques.toArray()])
    return { positions, techniques }
  })
  const positions = useMemo(() => data?.positions ?? [], [data])
  const techniques = useMemo(() => data?.techniques ?? [], [data])
  const posById = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions])
  const hits = useMemo(() => new Map<ID, number>(), [])

  const [selection, setSelection] = useState<MapSelection>(null)
  const [filter, setFilter] = useState<MapFilter>('all')
  const [mode, setMode] = useState<'map' | 'list'>('map')
  const [connectFrom, setConnectFrom] = useState<ID | null>(null)
  const [newTech, setNewTech] = useState<{ fromId: ID; toId: ID } | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [editPos, setEditPos] = useState<Position | null>(null)
  const [editTech, setEditTech] = useState<Technique | null>(null)
  const mapHandle = useRef<TechniqueMapHandle | null>(null)

  const selectedPos = selection?.type === 'position' ? posById.get(selection.id) : undefined
  const selectedTech = selection?.type === 'technique' ? techniques.find((t) => t.id === selection.id) : undefined

  function onSelect(s: MapSelection) {
    if (connectFrom && s?.type === 'position') {
      if (s.id !== connectFrom) setNewTech({ fromId: connectFrom, toId: s.id })
      setConnectFrom(null)
      return
    }
    setConnectFrom(null)
    setSelection(s)
  }

  async function createPosition(name: string, side: Side, kind: Position['kind']) {
    const h = mapHandle.current
    const c = h?.center() ?? { x: 0, y: 0 }
    const vis = h?.visibleY() ?? { top: -300, bottom: 300 }
    const y = side === 'top' ? Math.min(-70, Math.max(vis.top + 90, c.y)) : Math.max(70, Math.min(vis.bottom - 90, c.y))
    const x = c.x + (Math.random() - 0.5) * 80
    const id = await addPosition({ name, kind, x, y })
    setSelection({ type: 'position', id })
    setMode('map')
  }

  const loaded = data !== undefined
  const empty = loaded && positions.length === 0

  return (
    <main className="fixed inset-0 overflow-hidden bg-black">
      {mode === 'map' && (
        <TechniqueMap
          positions={positions}
          techniques={techniques}
          hits={hits}
          filter={filter}
          selection={selection}
          onSelect={onSelect}
          onMove={(id, x, y) => void movePosition(id, x, y)}
          onConnect={(fromId, toId) => setNewTech({ fromId, toId })}
          handleRef={(h) => (mapHandle.current = h)}
          topInset={150}
          bottomInset={TAB_BAR + 40}
          selectReserve={TAB_BAR + 250}
        />
      )}

      {/* Header overlay */}
      <header className="pt-safe pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black via-black/80 to-transparent px-4 pb-6">
        <div className="pointer-events-auto mx-auto flex max-w-lg flex-col gap-3 pt-2">
          <div className="flex items-center justify-between">
            <h1 className="text-[30px] font-extrabold tracking-tight">Game</h1>
            <div className="flex gap-2">
              <IconButton label={mode === 'map' ? 'Show list' : 'Show map'} onClick={() => setMode(mode === 'map' ? 'list' : 'map')}>
                {mode === 'map' ? <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /> : <><circle cx="6" cy="17" r="2.5" /><circle cx="18" cy="17" r="2.5" /><circle cx="12" cy="6" r="2.5" /><path d="M8 15.5L11 8M16 15.5L13 8M8.5 17h7" /></>}
              </IconButton>
              <IconButton label="Add position" onClick={() => setAddOpen(true)}>
                <path d="M12 5v14M5 12h14" />
              </IconButton>
            </div>
          </div>
          {!empty && (
            <>
              <div className="flex gap-1.5">
                {(['all', 'bucket'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    aria-pressed={filter === f}
                    className={`h-[30px] rounded-full px-3 text-[13px] font-semibold ${filter === f ? 'bg-text text-bg' : 'border border-line bg-black/60 text-muted'}`}
                  >
                    {f === 'all' ? 'All' : `Bucket list · ${techniques.filter((t) => t.status === 'want').length}`}
                  </button>
                ))}
              </div>
              <div className="flex gap-3 text-[11px] text-faint">
                {STATUS_ORDER.map((s) => (
                  <span key={s} className="flex items-center gap-1.5">
                    <span className="h-[7px] w-[7px] rounded-full" style={{ background: STATUS_COLOR[s], boxShadow: `0 0 6px ${STATUS_COLOR[s]}` }} />
                    {STATUS_SHORT[s]}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </header>

      {empty && (
        <div className="absolute inset-x-0 top-1/2 z-10 mx-auto flex max-w-xs -translate-y-1/2 flex-col items-center gap-3 px-6 text-center">
          <span className="h-5 w-5 rounded-full border-2 border-hitting bg-black" style={{ boxShadow: '0 0 18px var(--color-hitting), 0 0 4px var(--color-hitting)' }} />
          <p className="text-[15px] font-semibold">Your map is empty</p>
          <p className="text-[13px] text-muted">Add a position, select it, then drag its + handle onto another position to create a technique.</p>
          <button onClick={() => setAddOpen(true)} className="mt-1 h-11 rounded-xl bg-text px-5 text-sm font-bold text-bg">
            Add first position
          </button>
        </div>
      )}

      {mode === 'list' && (
        <TechniqueList
          techniques={filter === 'bucket' ? techniques.filter((t) => t.status === 'want') : techniques}
          posById={posById}
          onOpen={(t) => {
            setSelection({ type: 'technique', id: t.id })
            setMode('map')
          }}
        />
      )}

      {connectFrom && (
        <Banner onCancel={() => setConnectFrom(null)}>Tap the position this technique leads to</Banner>
      )}

      {mode === 'map' && selectedPos && !connectFrom && (
        <Panel>
          <PositionPanel
            position={selectedPos}
            techniques={techniques}
            posById={posById}
            onConnect={() => setConnectFrom(selectedPos.id)}
            onEdit={() => setEditPos(selectedPos)}
            onOpenTechnique={(t) => setSelection({ type: 'technique', id: t.id })}
          />
        </Panel>
      )}
      {mode === 'map' && selectedTech && !connectFrom && (
        <Panel>
          <TechniquePanel
            technique={selectedTech}
            posById={posById}
            onEdit={() => setEditTech(selectedTech)}
            onOpenPosition={(id) => setSelection({ type: 'position', id })}
          />
        </Panel>
      )}

      <AddPositionSheet open={addOpen} onClose={() => setAddOpen(false)} onCreate={createPosition} />
      <NewTechniqueSheet
        link={newTech}
        posById={posById}
        onClose={() => setNewTech(null)}
        onCreate={async (name, status) => {
          if (!newTech) return
          const id = await addTechnique({ name, status, ...newTech })
          setNewTech(null)
          setSelection({ type: 'technique', id })
        }}
      />
      <EditPositionSheet
        position={editPos}
        onClose={() => setEditPos(null)}
        onDelete={async (p) => {
          const n = techniques.filter((t) => t.fromId === p.id || t.toId === p.id).length
          if (!window.confirm(`Delete "${p.name}"${n ? ` and its ${n} technique${n > 1 ? 's' : ''}` : ''}?`)) return
          await deletePosition(p.id)
          setEditPos(null)
          setSelection(null)
        }}
      />
      <EditTechniqueSheet
        technique={editTech}
        posById={posById}
        onClose={() => setEditTech(null)}
        onDelete={async (t) => {
          if (!window.confirm(`Delete "${t.name}"?`)) return
          await deleteTechnique(t.id)
          setEditTech(null)
          setSelection(null)
        }}
      />
    </main>
  )
}

// ---------- pieces ----------

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-black/70 text-[#c9cdd2]">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  )
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-x-3 z-10 mx-auto max-w-lg" style={{ bottom: `calc(${TAB_BAR + 12}px + env(safe-area-inset-bottom))` }}>
      <div className="max-h-[42vh] overflow-y-auto rounded-[20px] border border-line bg-[#0e1012]/95 p-4 backdrop-blur-md animate-[sheet-in_200ms_ease-out]">
        {children}
      </div>
    </div>
  )
}

function Banner({ children, onCancel }: { children: ReactNode; onCancel: () => void }) {
  return (
    <div className="absolute inset-x-3 z-10 mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-line bg-[#0e1012]/95 px-4 py-3" style={{ bottom: `calc(${TAB_BAR + 12}px + env(safe-area-inset-bottom))` }}>
      <span className="h-2 w-2 animate-pulse rounded-full bg-text" />
      <span className="flex-1 text-sm font-semibold">{children}</span>
      <button onClick={onCancel} className="text-sm font-semibold text-muted">Cancel</button>
    </div>
  )
}

function StatusDot({ status }: { status: TechniqueStatus }) {
  return <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_COLOR[status], boxShadow: `0 0 8px ${STATUS_COLOR[status]}` }} />
}

function StatusPicker({ value, onChange }: { value: TechniqueStatus; onChange: (s: TechniqueStatus) => void }) {
  return (
    <div role="radiogroup" aria-label="Status" className="grid grid-cols-4 gap-1.5">
      {STATUS_ORDER.map((s) => {
        const on = value === s
        return (
          <button
            key={s}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(s)}
            className="flex h-10 items-center justify-center gap-1.5 rounded-[10px] border text-[12px] font-semibold transition-colors"
            style={{
              borderColor: on ? STATUS_COLOR[s] : '#1e2226',
              background: on ? `${STATUS_COLOR[s]}1f` : '#15181b',
              color: on ? '#f2f3f5' : '#8a9098',
              boxShadow: on ? `0 0 12px ${STATUS_COLOR[s]}40` : undefined,
            }}
          >
            {STATUS_SHORT[s]}
          </button>
        )
      })}
    </div>
  )
}

function TechRow({ t, other, arrow, onClick }: { t: Technique; other?: string; arrow: '→' | '←'; onClick: () => void }) {
  return (
    <li>
      <button onClick={onClick} className="flex w-full items-center gap-2.5 py-2 text-left">
        <StatusDot status={t.status} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t.name}</span>
        <span className="shrink-0 truncate text-xs text-faint">
          {arrow} {other}
        </span>
      </button>
    </li>
  )
}

function PositionPanel({
  position,
  techniques,
  posById,
  onConnect,
  onEdit,
  onOpenTechnique,
}: {
  position: Position
  techniques: Technique[]
  posById: Map<ID, Position>
  onConnect: () => void
  onEdit: () => void
  onOpenTechnique: (t: Technique) => void
}) {
  const out = techniques.filter((t) => t.fromId === position.id)
  const into = techniques.filter((t) => t.toId === position.id)
  const color = nodeColor(position.id, techniques)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-bold">{position.name}</div>
          <div className="text-xs text-faint">
            {position.kind === 'submission' ? 'Submission' : position.side === 'top' ? 'Top · passing' : 'Bottom · guard'} · {into.length} in · {out.length} out
          </div>
        </div>
        <button onClick={onEdit} className="h-8 rounded-lg bg-raised px-3 text-xs font-semibold text-muted">Edit</button>
      </div>
      {out.length + into.length > 0 && (
        <ul className="divide-y divide-line border-t border-line">
          {out.map((t) => <TechRow key={t.id} t={t} arrow="→" other={posById.get(t.toId)?.name} onClick={() => onOpenTechnique(t)} />)}
          {into.map((t) => <TechRow key={t.id} t={t} arrow="←" other={posById.get(t.fromId)?.name} onClick={() => onOpenTechnique(t)} />)}
        </ul>
      )}
      {position.kind === 'position' && (
        <button onClick={onConnect} className="h-10 rounded-xl bg-text text-sm font-bold text-bg">
          + Technique from here
        </button>
      )}
      {position.kind === 'position' && out.length === 0 && (
        <p className="text-center text-[11px] text-faint">Tip: drag the + handle on the map onto another position.</p>
      )}
    </div>
  )
}

function TechniquePanel({
  technique,
  posById,
  onEdit,
  onOpenPosition,
}: {
  technique: Technique
  posById: Map<ID, Position>
  onEdit: () => void
  onOpenPosition: (id: ID) => void
}) {
  const from = posById.get(technique.fromId)
  const to = posById.get(technique.toId)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-bold">{technique.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-faint">
            <button onClick={() => from && onOpenPosition(from.id)} className="font-semibold text-muted underline-offset-2 hover:underline">{from?.name}</button>
            <span>→</span>
            <button onClick={() => to && onOpenPosition(to.id)} className="font-semibold text-muted underline-offset-2 hover:underline">{to?.name}</button>
          </div>
        </div>
        <button onClick={onEdit} className="h-8 shrink-0 rounded-lg bg-raised px-3 text-xs font-semibold text-muted">Edit</button>
      </div>
      <StatusPicker value={technique.status} onChange={(status) => updateTechnique(technique.id, { status })} />
      {technique.notes && <p className="whitespace-pre-line text-[13px] leading-relaxed text-muted">{technique.notes}</p>}
    </div>
  )
}

function TechniqueList({ techniques, posById, onOpen }: { techniques: Technique[]; posById: Map<ID, Position>; onOpen: (t: Technique) => void }) {
  return (
    <div className="absolute inset-0 overflow-y-auto px-4 pt-[calc(env(safe-area-inset-top)+150px)]" style={{ paddingBottom: TAB_BAR + 24 }}>
      <div className="mx-auto flex max-w-lg flex-col gap-5">
        {techniques.length === 0 && <p className="pt-10 text-center text-sm text-faint">No techniques here yet.</p>}
        {[...STATUS_ORDER].reverse().map((s) => {
          const list = techniques.filter((t) => t.status === s).sort((a, b) => a.name.localeCompare(b.name))
          if (!list.length) return null
          return (
            <section key={s}>
              <h2 className="mb-1 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-faint">
                <StatusDot status={s} />
                {STATUS_LABEL[s]} <span className="text-dim">· {list.length}</span>
              </h2>
              <ul className="divide-y divide-line">
                {list.map((t) => (
                  <li key={t.id}>
                    <button onClick={() => onOpen(t)} className="flex w-full flex-col py-3 text-left">
                      <span className="font-semibold">{t.name}</span>
                      <span className="text-xs text-faint">
                        {posById.get(t.fromId)?.name} → {posById.get(t.toId)?.name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}

// ---------- sheets ----------

const inputCls =
  'h-12 w-full rounded-xl bg-raised px-4 text-[16px] text-text placeholder:text-faint outline-none focus:outline-2 focus:outline-accent'

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-1 rounded-xl bg-[#0a0b0c] p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(([v, l]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={`h-9 rounded-[9px] text-[13px] font-semibold ${value === v ? 'bg-[#262a30] text-text' : 'text-muted'}`}>
          {l}
        </button>
      ))}
    </div>
  )
}

function AddPositionSheet({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (name: string, side: Side, kind: Position['kind']) => Promise<void> }) {
  const [name, setName] = useState('')
  const [side, setSide] = useState<Side>('bottom')
  const [kind, setKind] = useState<Position['kind']>('position')
  const submit = async () => {
    if (!name.trim()) return
    await onCreate(name, side, kind)
    setName('')
    onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} title="Add position">
      <div className="flex flex-col gap-3">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder={kind === 'submission' ? 'e.g. Heel hook' : 'e.g. Half guard'} aria-label="Name" className={inputCls} />
        <Segmented label="Side" value={side} onChange={setSide} options={[['bottom', 'Bottom · guard'], ['top', 'Top · passing']]} />
        <Segmented label="Kind" value={kind} onChange={setKind} options={[['position', 'Position'], ['submission', 'Submission']]} />
        <button onClick={submit} disabled={!name.trim()} className="h-12 rounded-2xl bg-text font-bold text-bg disabled:opacity-40">
          Add to map
        </button>
      </div>
    </Sheet>
  )
}

function NewTechniqueSheet({
  link,
  posById,
  onClose,
  onCreate,
}: {
  link: { fromId: ID; toId: ID } | null
  posById: Map<ID, Position>
  onClose: () => void
  onCreate: (name: string, status: TechniqueStatus) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [status, setStatus] = useState<TechniqueStatus>('learning')
  const submit = async () => {
    if (!name.trim()) return
    await onCreate(name, status)
    setName('')
  }
  return (
    <Sheet open={!!link} onClose={onClose} title="New technique">
      {link && (
        <div className="flex flex-col gap-3">
          <p className="text-center text-sm text-muted">
            <span className="font-semibold text-text">{posById.get(link.fromId)?.name}</span> → <span className="font-semibold text-text">{posById.get(link.toId)?.name}</span>
          </p>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="e.g. Knee shield back take" aria-label="Technique name" className={inputCls} />
          <StatusPicker value={status} onChange={setStatus} />
          <button onClick={submit} disabled={!name.trim()} className="h-12 rounded-2xl bg-text font-bold text-bg disabled:opacity-40">
            Add technique
          </button>
        </div>
      )}
    </Sheet>
  )
}

function EditPositionSheet({ position, onClose, onDelete }: { position: Position | null; onClose: () => void; onDelete: (p: Position) => void }) {
  return (
    <Sheet open={!!position} onClose={onClose} title="Edit position">
      {position && <EditPositionForm key={position.id} position={position} onClose={onClose} onDelete={onDelete} />}
    </Sheet>
  )
}

function EditPositionForm({ position, onClose, onDelete }: { position: Position; onClose: () => void; onDelete: (p: Position) => void }) {
  const [name, setName] = useState(position.name)
  const [kind, setKind] = useState(position.kind)
  const [notes, setNotes] = useState(position.notes ?? '')
  return (
    <div className="flex flex-col gap-3">
      <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" className={inputCls} />
      <Segmented label="Kind" value={kind} onChange={setKind} options={[['position', 'Position'], ['submission', 'Submission']]} />
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (grips, details, cues)" aria-label="Notes" rows={3} className="w-full rounded-xl bg-raised p-4 text-[15px] text-text placeholder:text-faint outline-none focus:outline-2 focus:outline-accent" />
      <p className="text-xs text-faint">Drag the position across the dashed line to move it between top and bottom.</p>
      <button
        onClick={async () => {
          await updatePosition(position.id, { name: name.trim() || position.name, kind, notes: notes.trim() || undefined })
          onClose()
        }}
        className="h-12 rounded-2xl bg-text font-bold text-bg"
      >
        Save
      </button>
      <button onClick={() => onDelete(position)} className="h-11 rounded-xl bg-danger/10 font-semibold text-danger">
        Delete position
      </button>
    </div>
  )
}

function EditTechniqueSheet({ technique, posById, onClose, onDelete }: { technique: Technique | null; posById: Map<ID, Position>; onClose: () => void; onDelete: (t: Technique) => void }) {
  return (
    <Sheet open={!!technique} onClose={onClose} title="Edit technique">
      {technique && <EditTechniqueForm key={technique.id} technique={technique} posById={posById} onClose={onClose} onDelete={onDelete} />}
    </Sheet>
  )
}

function EditTechniqueForm({ technique, posById, onClose, onDelete }: { technique: Technique; posById: Map<ID, Position>; onClose: () => void; onDelete: (t: Technique) => void }) {
  const [name, setName] = useState(technique.name)
  const [notes, setNotes] = useState(technique.notes ?? '')
  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-sm text-muted">
        {posById.get(technique.fromId)?.name} → {posById.get(technique.toId)?.name}
      </p>
      <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Technique name" className={inputCls} />
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (setup, key details, common mistakes)" aria-label="Notes" rows={4} className="w-full rounded-xl bg-raised p-4 text-[15px] text-text placeholder:text-faint outline-none focus:outline-2 focus:outline-accent" />
      <button
        onClick={async () => {
          await updateTechnique(technique.id, { name: name.trim() || technique.name, notes: notes.trim() || undefined })
          onClose()
        }}
        className="h-12 rounded-2xl bg-text font-bold text-bg"
      >
        Save
      </button>
      <button
        onClick={async () => {
          await updateTechnique(technique.id, { fromId: technique.toId, toId: technique.fromId })
          onClose()
        }}
        className="h-11 rounded-xl bg-raised font-semibold text-muted"
      >
        Reverse direction
      </button>
      <button onClick={() => onDelete(technique)} className="h-11 rounded-xl bg-danger/10 font-semibold text-danger">
        Delete technique
      </button>
    </div>
  )
}
