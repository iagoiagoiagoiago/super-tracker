import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteNote, saveNote } from '../bjj/notes'
import { ChevronLeftIcon } from '../components/icons'
import { db } from '../db/db'
import type { BjjNote } from '../db/schema'

export function BjjNoteEditor() {
  const { id } = useParams()
  const isNew = id === 'new'
  const note = useLiveQuery(async () => (isNew || !id ? null : ((await db.bjjNotes.get(id)) ?? null)), [id, isNew])
  if (!isNew && note === undefined) return null
  return <NoteForm key={id} note={note ?? undefined} />
}

const toInputDate = (t?: number) => (t ? new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 10) : '')

function NoteForm({ note }: { note?: BjjNote }) {
  const navigate = useNavigate()
  const [title, setTitle] = useState(note?.title ?? '')
  const [body, setBody] = useState(note?.body ?? '')
  const [date, setDate] = useState(() => toInputDate(note ? note.date : Date.now()))
  const [pinned, setPinned] = useState(!!note?.pinned)

  async function save() {
    const d = date ? new Date(`${date}T12:00:00`).getTime() : undefined
    await saveNote({ title, body, date: d, pinned }, note?.id)
    navigate('/bjj/notes', { replace: true })
  }

  async function remove() {
    if (!note || !window.confirm(`Delete “${note.title}”?`)) return
    await deleteNote(note.id)
    navigate('/bjj/notes', { replace: true })
  }

  return (
    <main className="pt-safe mx-auto flex min-h-full max-w-lg flex-col gap-3 px-4 pb-28">
      <header className="flex items-center justify-between pt-2">
        <Link to="/bjj/notes" aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-xl border border-line text-muted">
          <ChevronLeftIcon size={20} />
        </Link>
        <div className="flex gap-2">
          <button
            onClick={() => setPinned(!pinned)}
            aria-pressed={pinned}
            className={`h-10 rounded-xl px-3.5 text-sm font-semibold ${pinned ? 'bg-bjj/15 text-bjj' : 'bg-raised text-muted'}`}
          >
            {pinned ? 'Pinned' : 'Pin'}
          </button>
          <button onClick={save} className="h-10 rounded-xl bg-text px-5 text-sm font-bold text-bg">
            Save
          </button>
        </div>
      </header>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        aria-label="Title"
        className="bg-transparent text-[26px] font-extrabold tracking-tight text-text placeholder:text-dim outline-none"
      />
      <label className="flex items-center gap-3 text-sm text-muted">
        <span className="text-faint">Written</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Date written"
          className="h-9 rounded-lg bg-raised px-2 text-[15px] text-text [color-scheme:dark]"
        />
        {date && (
          <button onClick={() => setDate('')} className="text-xs text-faint">
            clear
          </button>
        )}
      </label>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Game plan, takeaways, details…"
        aria-label="Note"
        className="min-h-[55vh] w-full resize-none rounded-2xl bg-surface p-4 text-[16px] leading-relaxed text-text placeholder:text-faint outline-none focus:outline-2 focus:outline-accent"
      />
      {note && (
        <button onClick={remove} className="h-11 rounded-xl bg-danger/10 font-semibold text-danger">
          Delete note
        </button>
      )}
    </main>
  )
}
