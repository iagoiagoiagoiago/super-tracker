import { useMemo, useState } from 'react'
import { STATUS_COLOR, STATUS_ORDER, STATUS_SHORT } from '../bjj/map'
import { addPosition, addTechnique } from '../bjj/ops'
import type { ID, Position, Technique, TechniqueStatus } from '../db/schema'
import { nameKey } from '../lib/exerciseCatalog'
import { Sheet } from './Sheet'
import { TechniqueMap, type MapSelection } from './TechniqueMap'

/**
 * Pick techniques by tapping them on a mini map (or searching the list). Techniques that aren't on the map yet
 * can be created right here, so logging a class never sends you away to edit the map first.
 */
export function TechniquePicker({
  open,
  title,
  positions,
  techniques,
  selected,
  defaultStatus,
  onToggle,
  onClose,
}: {
  open: boolean
  title: string
  positions: Position[]
  techniques: Technique[]
  selected: ID[]
  defaultStatus: TechniqueStatus
  onToggle: (id: ID) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [focusPos, setFocusPos] = useState<ID | null>(null)
  const [creating, setCreating] = useState(false)
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const posById = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions])

  const q = nameKey(query)
  const list = techniques
    .filter((t) => !focusPos || t.fromId === focusPos || t.toId === focusPos)
    .filter((t) => {
      if (!q) return true
      const hay = nameKey(`${t.name} ${posById.get(t.fromId)?.name ?? ''} ${posById.get(t.toId)?.name ?? ''}`)
      return q.split(' ').every((w) => hay.includes(w))
    })
    .sort((a, b) => Number(selectedSet.has(b.id)) - Number(selectedSet.has(a.id)) || a.name.localeCompare(b.name))

  function onMapSelect(s: MapSelection) {
    if (s?.type === 'technique') onToggle(s.id)
    else if (s?.type === 'position') setFocusPos(s.id === focusPos ? null : s.id)
    else setFocusPos(null)
  }

  function close() {
    setQuery('')
    setFocusPos(null)
    setCreating(false)
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title={title}
      tall
      right={
        <button onClick={close} className="text-[17px] font-semibold text-accent">
          Done
        </button>
      }
    >
      {techniques.length > 0 && (
        <div className="relative -mx-4 mb-3 h-[38vh] overflow-hidden border-y border-line">
          <TechniqueMap
            positions={positions}
            techniques={techniques}
            hits={new Map()}
            filter="all"
            selection={focusPos ? { type: 'position', id: focusPos } : null}
            onSelect={onMapSelect}
            onMove={() => {}}
            onConnect={() => {}}
            readOnly
            highlight={selectedSet}
            topInset={10}
            bottomInset={10}
          />
          <p className="pointer-events-none absolute right-3 bottom-2 text-[10px] text-faint">Tap a line to pick · tap a position to filter</p>
        </div>
      )}

      {creating ? (
        <NewTechniqueForm
          positions={positions}
          defaultFrom={focusPos ?? undefined}
          defaultStatus={defaultStatus}
          initialName={query}
          onCancel={() => setCreating(false)}
          onCreated={(id) => {
            onToggle(id)
            setCreating(false)
            setQuery('')
          }}
        />
      ) : (
        <>
          <div className="mb-2 flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={focusPos ? `Search from ${posById.get(focusPos)?.name}` : 'Search techniques'}
              aria-label="Search techniques"
              className="h-11 min-w-0 flex-1 rounded-xl bg-raised px-4 text-[16px] text-text placeholder:text-faint outline-none focus:outline-2 focus:outline-accent"
            />
            <button onClick={() => setCreating(true)} className="h-11 shrink-0 rounded-xl bg-text px-3.5 text-sm font-bold text-bg">
              + New
            </button>
          </div>
          {focusPos && (
            <button onClick={() => setFocusPos(null)} className="mb-1 text-xs font-semibold text-accent">
              Showing {posById.get(focusPos)?.name} only · show all
            </button>
          )}
          {techniques.length === 0 && <p className="py-6 text-center text-sm text-faint">Your map is empty. Tap “+ New” to add the first technique.</p>}
          <ul className="divide-y divide-line">
            {list.map((t) => {
              const on = selectedSet.has(t.id)
              return (
                <li key={t.id}>
                  <button onClick={() => onToggle(t.id)} aria-pressed={on} className="flex w-full items-center gap-3 py-3 text-left">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border"
                      style={{ borderColor: on ? STATUS_COLOR[t.status] : '#2a2f35', background: on ? `${STATUS_COLOR[t.status]}26` : 'transparent' }}
                    >
                      {on && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={STATUS_COLOR[t.status]} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M5 12.5l4.5 4.5L19 7" />
                        </svg>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{t.name}</span>
                      <span className="block truncate text-xs text-faint">
                        {posById.get(t.fromId)?.name} → {posById.get(t.toId)?.name}
                      </span>
                    </span>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_COLOR[t.status] }} />
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Sheet>
  )
}

const NEW_POS = '__new__'

function NewTechniqueForm({
  positions,
  defaultFrom,
  defaultStatus,
  initialName,
  onCancel,
  onCreated,
}: {
  positions: Position[]
  defaultFrom?: ID
  defaultStatus: TechniqueStatus
  initialName: string
  onCancel: () => void
  onCreated: (id: ID) => void
}) {
  const [name, setName] = useState(initialName)
  const [fromId, setFromId] = useState<string>(defaultFrom ?? positions[0]?.id ?? NEW_POS)
  const [toId, setToId] = useState<string>(positions.find((p) => p.id !== (defaultFrom ?? positions[0]?.id))?.id ?? NEW_POS)
  const [fromNew, setFromNew] = useState('')
  const [toNew, setToNew] = useState('')
  const [status, setStatus] = useState<TechniqueStatus>(defaultStatus)
  const sorted = [...positions].sort((a, b) => a.name.localeCompare(b.name))

  const valid =
    name.trim() &&
    (fromId !== NEW_POS || fromNew.trim()) &&
    (toId !== NEW_POS || toNew.trim()) &&
    !(fromId !== NEW_POS && fromId === toId)

  async function resolve(id: string, newName: string, near?: Position): Promise<ID> {
    if (id !== NEW_POS) return id
    // New positions start beside their partner so the map stays tidy; side is decided by the y coordinate.
    return addPosition({ name: newName, kind: 'position', x: (near?.x ?? 0) + 120, y: near?.y ?? 120 })
  }

  async function submit() {
    if (!valid) return
    const fromPos = positions.find((p) => p.id === fromId)
    const toPos = positions.find((p) => p.id === toId)
    const f = await resolve(fromId, fromNew, toPos)
    const t = await resolve(toId, toNew, fromPos ?? positions.find((p) => p.id === f))
    const id = await addTechnique({ name, fromId: f, toId: t, status })
    onCreated(id)
  }

  const select = (value: string, onChange: (v: string) => void, label: string) => (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="h-11 w-full rounded-xl bg-raised px-3 text-[15px] text-text">
      {sorted.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
      <option value={NEW_POS}>+ New position…</option>
    </select>
  )
  const inputCls = 'h-11 w-full rounded-xl bg-raised px-4 text-[16px] text-text placeholder:text-faint outline-none focus:outline-2 focus:outline-accent'

  return (
    <div className="flex flex-col gap-3">
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Technique name" aria-label="Technique name" className={inputCls} />
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex flex-col gap-2">
          {select(fromId, setFromId, 'From position')}
          {fromId === NEW_POS && <input value={fromNew} onChange={(e) => setFromNew(e.target.value)} placeholder="New position" aria-label="New from position" className={inputCls} />}
        </div>
        <span className="text-faint">→</span>
        <div className="flex flex-col gap-2">
          {select(toId, setToId, 'To position')}
          {toId === NEW_POS && <input value={toNew} onChange={(e) => setToNew(e.target.value)} placeholder="New position" aria-label="New to position" className={inputCls} />}
        </div>
      </div>
      <div role="radiogroup" aria-label="Status" className="grid grid-cols-4 gap-1.5">
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            role="radio"
            aria-checked={status === s}
            onClick={() => setStatus(s)}
            className="h-10 rounded-[10px] border text-[12px] font-semibold"
            style={{ borderColor: status === s ? STATUS_COLOR[s] : '#1e2226', background: status === s ? `${STATUS_COLOR[s]}1f` : '#15181b', color: status === s ? '#f2f3f5' : '#8a9098' }}
          >
            {STATUS_SHORT[s]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onCancel} className="h-11 rounded-xl bg-raised font-semibold text-muted">Cancel</button>
        <button onClick={submit} disabled={!valid} className="h-11 rounded-xl bg-text font-bold text-bg disabled:opacity-40">Add & pick</button>
      </div>
    </div>
  )
}
