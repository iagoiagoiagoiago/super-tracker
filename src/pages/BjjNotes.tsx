import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { matchesNote, sortNotes } from '../bjj/notes'
import { BjjNav } from '../components/BjjNav'
import { db } from '../db/db'

export function BjjNotes() {
  const notes = useLiveQuery(async () => sortNotes(await db.bjjNotes.toArray()))
  const [query, setQuery] = useState('')
  const shown = (notes ?? []).filter((n) => matchesNote(n, query))
  const pinned = shown.filter((n) => n.pinned)
  const rest = shown.filter((n) => !n.pinned)

  return (
    <main className="pt-safe mx-auto flex min-h-full max-w-lg flex-col gap-4 px-4 pb-28">
      <header className="flex items-center justify-between pt-2">
        <BjjNav />
        <Link to="/bjj/notes/new" aria-label="New note" className="flex h-10 items-center rounded-xl bg-text px-3.5 text-sm font-bold text-bg">
          + Note
        </Link>
      </header>

      {notes && notes.length > 0 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${notes.length} notes`}
          aria-label="Search notes"
          className="h-11 rounded-xl bg-raised px-4 text-[16px] text-text placeholder:text-faint outline-none focus:outline-2 focus:outline-accent"
        />
      )}

      {notes && notes.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-line px-6 py-10 text-center">
          <p className="text-[15px] font-semibold">Your BJJ journal</p>
          <p className="max-w-xs text-[13px] text-muted">
            Game plans, things a coach told you, instructional notes, competition takeaways. Anything that isn't a single session.
          </p>
          <Link to="/bjj/notes/new" className="mt-1 rounded-xl bg-text px-5 py-3 text-sm font-bold text-bg">
            Write the first note
          </Link>
        </div>
      )}

      {pinned.length > 0 && <NoteList title="Pinned" notes={pinned} query={query} />}
      {rest.length > 0 && <NoteList title={pinned.length ? 'All notes' : undefined} notes={rest} query={query} />}
      {notes && notes.length > 0 && shown.length === 0 && <p className="text-center text-sm text-faint">No notes match “{query}”.</p>}
    </main>
  )
}

function NoteList({ title, notes, query }: { title?: string; notes: ReturnType<typeof sortNotes>; query: string }) {
  return (
    <section className="flex flex-col gap-2">
      {title && <h2 className="text-[13px] font-semibold uppercase tracking-wider text-faint">{title}</h2>}
      {notes.map((n) => (
        <Link key={n.id} to={`/bjj/notes/${n.id}`} className="flex flex-col gap-1.5 rounded-[18px] border border-line bg-surface p-4 active:bg-raised">
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 font-bold">
              {n.pinned && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-bjj shadow-[0_0_6px_var(--color-bjj)]" />}
              <span className="truncate">{n.title}</span>
            </span>
            {n.date && (
              <span className="shrink-0 text-xs text-faint">
                {new Date(n.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
          <p className="line-clamp-3 whitespace-pre-line text-[13px] leading-relaxed text-muted">{snippet(n.body, query)}</p>
        </Link>
      ))}
    </section>
  )
}

/** When searching, start the preview at the first match so the reason it matched is visible. */
function snippet(body: string, query: string): string {
  const w = query.trim().toLowerCase().split(/\s+/)[0]
  if (!w) return body
  const i = body.toLowerCase().indexOf(w)
  if (i < 80) return body
  const start = body.lastIndexOf('\n', i) + 1
  return '…' + body.slice(start)
}
