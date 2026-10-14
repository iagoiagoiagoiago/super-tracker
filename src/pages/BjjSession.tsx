import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { STATUS_COLOR } from '../bjj/map'
import { CLASS_TYPES, deleteSession, emptyDraft, saveSession, type SessionDraft } from '../bjj/sessions'
import { ChevronLeftIcon } from '../components/icons'
import { TechniquePicker } from '../components/TechniquePicker'
import { Page } from '../components/ui'
import { db } from '../db/db'
import type { BjjSession, ID, TechniqueStatus } from '../db/schema'

type ListKey = 'taught' | 'hit' | 'caughtBy'

const LISTS: { key: ListKey; title: string; hint: string; pickerTitle: string; status: TechniqueStatus }[] = [
  { key: 'taught', title: 'Taught in class', hint: 'What the coach showed', pickerTitle: 'Taught in class', status: 'learning' },
  { key: 'hit', title: 'Hit in sparring', hint: 'What you landed', pickerTitle: 'Hit in sparring', status: 'hitting' },
  { key: 'caughtBy', title: 'Got caught by', hint: 'What partners landed on you', pickerTitle: 'Got caught by', status: 'learning' },
]

const RPE_LABEL = (r: number) => (r <= 3 ? 'Easy' : r <= 6 ? 'Moderate' : r <= 8 ? 'Hard' : 'All-out')

export function BjjSession() {
  const { id } = useParams()
  const isNew = !id
  const session = useLiveQuery(async () => (id ? ((await db.bjjSessions.get(id)) ?? null) : null), [id])
  if (!isNew && session === undefined) return null
  if (!isNew && session === null) return <Page title="Not found">{null}</Page>
  return <SessionForm key={id ?? 'new'} existing={session ?? undefined} />
}

function SessionForm({ existing }: { existing?: BjjSession }) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<SessionDraft>(() => {
    if (!existing) return emptyDraft()
    const { id: _id, ...rest } = existing
    void _id
    return rest
  })
  const [picker, setPicker] = useState<ListKey | null>(null)
  const [saving, setSaving] = useState(false)

  const map = useLiveQuery(async () => {
    const [positions, techniques, focus] = await Promise.all([db.positions.toArray(), db.techniques.toArray(), db.focusCycles.toArray()])
    return { positions, techniques, activeFocus: focus.filter((f) => !f.endedAt) }
  })
  const techById = useMemo(() => new Map(map?.techniques.map((t) => [t.id, t])), [map])
  const posById = useMemo(() => new Map(map?.positions.map((p) => [p.id, p])), [map])

  const set = <K extends keyof SessionDraft>(k: K, v: SessionDraft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const toggle = (key: ListKey, tid: ID) =>
    setDraft((d) => ({ ...d, [key]: d[key].includes(tid) ? d[key].filter((x) => x !== tid) : [...d[key], tid] }))

  async function save() {
    setSaving(true)
    await saveSession(draft, existing?.id)
    navigate('/history', { replace: true })
  }

  async function remove() {
    if (!existing || !window.confirm('Delete this session?')) return
    await deleteSession(existing.id)
    navigate('/history', { replace: true })
  }

  const local = new Date(draft.date - new Date(draft.date).getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  const activeFocus = map?.activeFocus ?? []
  const current = picker ? LISTS.find((l) => l.key === picker)! : null

  return (
    <Page
      title={existing ? 'BJJ session' : 'Log BJJ'}
      action={
        <Link to={existing ? '/history' : '/train'} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-xl border border-line text-muted">
          <ChevronLeftIcon size={20} />
        </Link>
      }
    >
      <Field label="When">
        <input
          type="datetime-local"
          value={local}
          onChange={(e) => e.target.value && set('date', new Date(e.target.value).getTime())}
          aria-label="Date and time"
          className="h-11 w-full rounded-xl bg-raised px-3 text-[16px] text-text [color-scheme:dark]"
        />
      </Field>

      <Field label="Class">
        <div className="grid grid-cols-3 gap-1.5">
          {CLASS_TYPES.map((c) => (
            <Chip key={c.value} on={draft.classType === c.value} onClick={() => set('classType', c.value)}>
              {c.label}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="Duration" aside={draft.durationMin ? `${draft.durationMin} min` : 'not recorded'}>
        <div className="grid grid-cols-[repeat(4,minmax(0,1fr))_auto] gap-1.5">
          {[60, 75, 90, 120].map((m) => (
            <Chip key={m} on={draft.durationMin === m} onClick={() => set('durationMin', m)}>
              {m}
            </Chip>
          ))}
          <div className="flex rounded-[10px] bg-raised">
            <button aria-label="15 minutes less" onClick={() => set('durationMin', Math.max(15, (draft.durationMin ?? 90) - 15))} className="h-10 w-9 text-lg text-muted">−</button>
            <button aria-label="15 minutes more" onClick={() => set('durationMin', Math.min(300, (draft.durationMin ?? 90) + 15))} className="h-10 w-9 text-lg text-muted">+</button>
          </div>
        </div>
      </Field>

      <Field label="Intensity" aside={draft.rpe ? `RPE ${draft.rpe} · ${RPE_LABEL(draft.rpe)}` : 'not recorded'}>
        <div role="radiogroup" aria-label="Intensity (RPE)" className="grid grid-cols-10 gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((r) => {
            const on = r <= (draft.rpe ?? 0)
            return (
              <button
                key={r}
                role="radio"
                aria-checked={draft.rpe === r}
                aria-label={`RPE ${r}`}
                onClick={() => set('rpe', r)}
                className="flex h-10 items-center justify-center rounded-lg text-[13px] font-bold transition-colors"
                style={{
                  background: on ? `rgba(182, 255, 59, ${0.12 + r * 0.06})` : '#15181b',
                  color: on ? (r >= 7 ? '#0a0b0c' : '#e8ffc4') : '#6b727a',
                }}
              >
                {r}
              </button>
            )
          })}
        </div>
      </Field>

      <Field label="Sparring rounds" aside={draft.rounds ? undefined : 'optional'}>
        <div className="flex items-center gap-3">
          <button aria-label="One round less" onClick={() => set('rounds', draft.rounds && draft.rounds > 1 ? draft.rounds - 1 : undefined)} className="h-10 w-10 rounded-[10px] bg-raised text-lg text-muted">−</button>
          <span className="w-10 text-center text-xl font-bold">{draft.rounds ?? '–'}</span>
          <button aria-label="One round more" onClick={() => set('rounds', (draft.rounds ?? 0) + 1)} className="h-10 w-10 rounded-[10px] bg-raised text-lg text-muted">+</button>
        </div>
      </Field>

      {activeFocus.length > 0 && (
        <Field label="Worked on your focus today?" aside={activeFocus.map((f) => posById.get(f.positionId)?.name).filter(Boolean).join(' · ')}>
          <div className="grid grid-cols-2 gap-1.5">
            <Chip on={draft.workedFocus === true} onClick={() => set('workedFocus', draft.workedFocus === true ? null : true)}>Yes</Chip>
            <Chip on={draft.workedFocus === false} onClick={() => set('workedFocus', draft.workedFocus === false ? null : false)}>No</Chip>
          </div>
        </Field>
      )}

      {LISTS.map((l) => (
        <Field key={l.key} label={l.title} aside={l.hint}>
          <div className="flex flex-wrap gap-1.5">
            {draft[l.key].map((tid) => {
              const t = techById.get(tid)
              if (!t) return null
              return (
                <button
                  key={tid}
                  onClick={() => toggle(l.key, tid)}
                  aria-label={`Remove ${t.name}`}
                  className="flex h-9 items-center gap-2 rounded-full border border-line bg-[#121417] pr-2.5 pl-3 text-[13px] font-semibold"
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[t.status], boxShadow: `0 0 6px ${STATUS_COLOR[t.status]}` }} />
                  {t.name}
                  <span className="text-faint">×</span>
                </button>
              )
            })}
            <button onClick={() => setPicker(l.key)} className="h-9 rounded-full border border-dashed border-[#2f353b] px-3.5 text-[13px] font-semibold text-muted">
              {draft[l.key].length ? '+ More' : 'Pick on map'}
            </button>
          </div>
        </Field>
      ))}

      <Field label="Reflection" aside="optional">
        <div className="flex flex-col gap-2">
          <TextArea value={draft.worked} placeholder="What worked" onChange={(v) => set('worked', v)} />
          <TextArea value={draft.problem} placeholder="A problem I ran into" onChange={(v) => set('problem', v)} />
          <TextArea value={draft.nextFocus} placeholder="Focus for next session" onChange={(v) => set('nextFocus', v)} />
        </div>
      </Field>

      <Field label="Notes" aside="optional">
        <TextArea value={draft.notes} placeholder="Class content, details, who you rolled with…" onChange={(v) => set('notes', v)} rows={4} />
      </Field>

      <button onClick={save} disabled={saving} className="h-12 rounded-2xl bg-bjj font-bold text-[#0a0b0c] disabled:opacity-50">
        {existing ? 'Save changes' : 'Save session'}
      </button>
      {existing && (
        <button onClick={remove} className="h-11 rounded-xl bg-danger/10 font-semibold text-danger">
          Delete session
        </button>
      )}

      {current && map && (
        <TechniquePicker
          open
          title={current.pickerTitle}
          positions={map.positions}
          techniques={map.techniques}
          selected={draft[current.key]}
          defaultStatus={current.status}
          onToggle={(tid) => toggle(current.key, tid)}
          onClose={() => setPicker(null)}
        />
      )}
    </Page>
  )
}

function Field({ label, aside, children }: { label: string; aside?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-faint">{label}</h2>
        {aside && <span className="truncate text-xs text-muted">{aside}</span>}
      </div>
      {children}
    </section>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`h-10 rounded-[10px] text-[13px] font-semibold transition-colors ${on ? 'bg-text text-bg' : 'bg-raised text-muted'}`}
    >
      {children}
    </button>
  )
}

function TextArea({ value, placeholder, onChange, rows = 2 }: { value?: string; placeholder: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <textarea
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      rows={rows}
      className="w-full resize-none rounded-xl bg-raised p-3.5 text-[15px] text-text placeholder:text-faint outline-none focus:outline-2 focus:outline-accent"
    />
  )
}
