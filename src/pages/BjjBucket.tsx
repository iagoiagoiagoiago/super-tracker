import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { addBucketItem, deleteBucketItem, logRep, setDone, sortBucket, undoRep, updateBucketItem } from '../bjj/bucket'
import { BjjNav } from '../components/BjjNav'
import { Sheet } from '../components/Sheet'
import { db } from '../db/db'
import type { BucketItem, ID } from '../db/schema'
import { relativeDays } from '../lib/time'

const fmtDay = (t: number) => new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

/**
 * Bucket list: things you want to pull off, written however you like. Tap the circle each time you land or drill
 * one to log a rep; mark it done once it's yours. Deliberately low-effort next to the session log.
 */
export function BjjBucket() {
  const items = useLiveQuery(() => db.bucketItems.toArray())
  const [text, setText] = useState('')
  const [openId, setOpenId] = useState<ID | null>(null)
  const [showDone, setShowDone] = useState(false)
  // The last rep you logged, so a mis-tap can be undone right there for a few seconds.
  const [lastRep, setLastRep] = useState<{ id: ID; at: number } | null>(null)

  const { open, done } = sortBucket(items ?? [])
  const reps = (items ?? []).reduce((n, i) => n + i.reps.length, 0)
  const current = items?.find((i) => i.id === openId) ?? null

  async function add() {
    if (await addBucketItem(text)) setText('')
  }
  async function rep(item: BucketItem) {
    const at = await logRep(item.id)
    navigator.vibrate?.(12)
    setLastRep({ id: item.id, at })
    window.setTimeout(() => setLastRep((cur) => (cur?.at === at ? null : cur)), 4000)
  }

  return (
    <main className="pt-safe mx-auto flex min-h-full max-w-lg flex-col gap-4 px-4 pb-28">
      <header className="flex items-center justify-between pt-2">
        <BjjNav />
        <Link to="/bjj/log" aria-label="Log session" className="flex h-10 w-10 items-center justify-center rounded-xl bg-bjj text-[#0a0b0c] shadow-[0_0_16px_rgba(182,255,59,0.25)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
          </svg>
        </Link>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
        className="flex gap-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Something you want to pull off…"
          aria-label="New bucket list item"
          enterKeyHint="done"
          className="h-12 min-w-0 flex-1 rounded-xl bg-raised px-4 text-[16px] text-text placeholder:text-faint outline-none focus:outline-2 focus:outline-bjj"
        />
        <button type="submit" disabled={!text.trim()} aria-label="Add" className="h-12 w-12 shrink-0 rounded-xl bg-bjj text-[22px] font-bold text-[#0a0b0c] disabled:opacity-30">
          +
        </button>
      </form>

      {items && items.length > 0 && (
        <p className="text-xs text-faint">
          {open.length} to pull off · {reps} rep{reps === 1 ? '' : 's'} logged{done.length ? ` · ${done.length} done` : ''}
        </p>
      )}

      {items && items.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-line px-6 py-10 text-center">
          <span className="h-4 w-4 rounded-full border-2 border-bjj bg-black shadow-[0_0_14px_var(--color-bjj)]" />
          <p className="text-[15px] font-semibold">Nothing on the list yet</p>
          <p className="max-w-xs text-[13px] text-muted">Write down moves you want to land. Tap the circle every time you hit one in rolling.</p>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {open.map((item) => (
          <ItemRow key={item.id} item={item} undo={lastRep?.id === item.id} onRep={() => void rep(item)} onUndo={() => { void undoRep(item.id); setLastRep(null) }} onOpen={() => setOpenId(item.id)} />
        ))}
      </ul>

      {done.length > 0 && (
        <section className="flex flex-col gap-2">
          <button onClick={() => setShowDone(!showDone)} aria-expanded={showDone} className="flex h-10 items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-faint">
            <span className={`inline-block transition-transform ${showDone ? 'rotate-90' : ''}`}>›</span>
            Pulled off <span className="text-dim">· {done.length}</span>
          </button>
          {showDone && (
            <ul className="flex flex-col gap-2">
              {done.map((item) => (
                <ItemRow key={item.id} item={item} undo={false} onRep={() => void rep(item)} onUndo={() => {}} onOpen={() => setOpenId(item.id)} />
              ))}
            </ul>
          )}
        </section>
      )}

      <Sheet open={!!current} onClose={() => setOpenId(null)} title={current?.doneAt ? 'Pulled off' : 'Bucket list'}>
        {current && <ItemForm key={current.id} item={current} onClose={() => setOpenId(null)} />}
      </Sheet>
    </main>
  )
}

function ItemRow({ item, undo, onRep, onUndo, onOpen }: { item: BucketItem; undo: boolean; onRep: () => void; onUndo: () => void; onOpen: () => void }) {
  const n = item.reps.length
  const last = item.reps[n - 1]
  const done = !!item.doneAt
  return (
    <li className={`flex items-center gap-3 rounded-[16px] border px-3 py-2 ${done ? 'border-line/60' : 'border-line bg-surface'}`}>
      <button
        onClick={onRep}
        aria-label={`Log a rep of ${item.text}${n ? ` (${n} so far)` : ''}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 text-[15px] font-bold tabular-nums transition-colors active:scale-95"
        style={
          n
            ? { borderColor: 'var(--color-bjj)', background: 'rgba(182,255,59,0.12)', color: '#d6ff8f', boxShadow: '0 0 12px rgba(182,255,59,0.18)' }
            : { borderColor: '#2a2f35', color: '#4a5058' }
        }
      >
        {/* Re-keying on the count replays the pop each time a rep lands. */}
        <span key={n} className={n ? 'animate-[pop_220ms_ease-out]' : ''}>
          {n ? n : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          )}
        </span>
      </button>
      <button onClick={onOpen} className="min-w-0 flex-1 py-1.5 text-left">
        <span className={`block text-[15px] font-semibold ${done ? 'text-muted' : ''}`}>{item.text}</span>
        <span className="block truncate text-xs text-faint">
          {n ? `${n} rep${n > 1 ? 's' : ''} · last ${relativeDays(last)}` : item.note ? item.note.split('\n')[0] : 'No reps yet'}
        </span>
      </button>
      {undo && (
        <button onClick={onUndo} className="h-9 shrink-0 rounded-lg bg-raised px-3 text-xs font-semibold text-muted">
          Undo
        </button>
      )}
    </li>
  )
}

function ItemForm({ item, onClose }: { item: BucketItem; onClose: () => void }) {
  const [text, setText] = useState(item.text)
  const [note, setNote] = useState(item.note ?? '')
  const history = [...item.reps].reverse()
  const save = () => updateBucketItem(item.id, { text, note })
  return (
    <div className="flex flex-col gap-3">
      <input value={text} onChange={(e) => setText(e.target.value)} onBlur={save} aria-label="Text" className="h-12 w-full rounded-xl bg-raised px-4 text-[16px] text-text outline-none focus:outline-2 focus:outline-bjj" />
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={save}
        placeholder="Notes: setup, where you saw it, key details"
        aria-label="Notes"
        rows={3}
        className="w-full rounded-xl bg-raised p-4 text-[15px] text-text placeholder:text-faint outline-none focus:outline-2 focus:outline-bjj"
      />

      <div className="rounded-xl bg-[#121417] p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] font-semibold">
            {item.reps.length} rep{item.reps.length === 1 ? '' : 's'}
          </span>
          <span className="flex gap-2">
            {item.reps.length > 0 && (
              <button onClick={() => void undoRep(item.id)} className="h-9 rounded-lg px-2 text-xs font-semibold text-muted">
                − Remove last
              </button>
            )}
            <button onClick={() => void logRep(item.id)} className="h-9 rounded-lg bg-bjj/15 px-3 text-xs font-bold text-[#d6ff8f]">
              + Rep
            </button>
          </span>
        </div>
        {history.length > 0 && (
          <ul className="mt-2 flex max-h-36 flex-col gap-1 overflow-y-auto text-xs text-faint">
            {history.map((t, i) => (
              <li key={`${t}-${i}`}>{fmtDay(t)}</li>
            ))}
          </ul>
        )}
      </div>

      <button
        onClick={async () => {
          await save()
          await setDone(item.id, !item.doneAt)
          onClose()
        }}
        className="h-12 rounded-2xl bg-text font-bold text-bg"
      >
        {item.doneAt ? 'Back on the list' : 'Pulled it off — mark done'}
      </button>
      <button
        onClick={async () => {
          if (!window.confirm(`Delete "${item.text}"?`)) return
          await deleteBucketItem(item.id)
          onClose()
        }}
        className="h-11 rounded-xl bg-danger/10 font-semibold text-danger"
      >
        Delete
      </button>
    </div>
  )
}
