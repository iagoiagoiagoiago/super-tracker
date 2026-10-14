import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeftIcon } from '../components/icons'
import { Card, Page, SectionTitle } from '../components/ui'
import { db } from '../db/db'
import { STATUS_COLOR, STATUS_ORDER, STATUS_SHORT } from '../bjj/map'
import { commitJournal, JournalError, parseJournal, planJournal, type JournalPlan, type JournalResult } from '../import/bjjJournal'

type Step = { name: 'pick' } | { name: 'review'; plan: JournalPlan } | { name: 'done'; result: JournalResult }

export function ImportBjj() {
  const [step, setStep] = useState<Step>({ name: 'pick' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function onFile(file: File) {
    setError(null)
    setBusy(true)
    try {
      const plan = await planJournal(db, parseJournal(await file.text()))
      const nothing = !plan.newPositions.length && !plan.newTechniques.length && !plan.newSessions.length && !plan.newBucket.length
      if (nothing) setError('Everything in this file is already in the app.')
      else setStep({ name: 'review', plan })
    } catch (e) {
      setError(e instanceof JournalError ? e.message : 'Could not read this file.')
    } finally {
      setBusy(false)
    }
  }

  async function onImport() {
    if (step.name !== 'review') return
    setBusy(true)
    try {
      setStep({ name: 'done', result: await commitJournal(db, step.plan) })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  const back = (
    <Link to="/settings" aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-xl border border-line text-muted">
      <ChevronLeftIcon size={20} />
    </Link>
  )

  if (step.name === 'pick') {
    return (
      <Page title="Import BJJ journal" action={back}>
        <Card>
          <p className="text-sm leading-relaxed text-muted">
            Adds positions, techniques, past sessions and bucket list items from a journal file. It merges by name with your current map:
            nothing you already have is moved or overwritten, and importing the same file twice adds nothing.
          </p>
        </Card>
        <input
          id="bjj-file"
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onFile(f)
            e.target.value = ''
          }}
        />
        <label htmlFor="bjj-file" className="flex h-12 cursor-pointer items-center justify-center rounded-2xl bg-bjj font-bold text-[#0a0b0c]">
          {busy ? 'Reading…' : 'Choose journal file'}
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
      </Page>
    )
  }

  if (step.name === 'done') {
    const r = step.result
    return (
      <Page title="Imported" action={back}>
        <Card>
          <Rows rows={[['Positions', r.positions], ['Techniques', r.techniques], ['Sessions', r.sessions], ['Bucket list', r.bucket]]} />
        </Card>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => navigate('/bjj')} className="h-12 rounded-2xl bg-bjj font-bold text-[#0a0b0c]">Open map</button>
          <button onClick={() => navigate('/bjj/bucket')} className="h-12 rounded-2xl bg-raised font-bold">Open bucket list</button>
        </div>
      </Page>
    )
  }

  const { plan } = step
  const dates = plan.newSessions.map((s) => s.date).sort()
  const fmt = (d: string) => new Date(`${d}T12:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
  const byStatus = STATUS_ORDER.map((s) => ({ s, n: plan.newTechniques.filter((t) => t.status === s).length }))

  return (
    <Page title="Review import" action={back}>
      <div className="grid grid-cols-2 gap-2">
        <Tile value={plan.newSessions.length} label={dates.length ? `sessions · ${fmt(dates[0])} – ${fmt(dates[dates.length - 1])}` : 'sessions'} />
        <Tile value={plan.newBucket.length} label="bucket list items" />
        <Tile value={plan.newPositions.length} label="new positions" />
        <Tile value={plan.newTechniques.length} label="new techniques" />
      </div>

      {plan.newTechniques.length > 0 && (
        <Card>
          <SectionTitle aside="you can change any of these on the map">Technique statuses</SectionTitle>
          <div className="grid grid-cols-3 gap-1.5 text-[11px] text-faint">
            {byStatus.map(({ s, n }) => (
              <div key={s}>
                <div className="text-[18px] font-bold text-text">{n}</div>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[s] }} />
                  {STATUS_SHORT[s]}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {(plan.existingPositions > 0 || plan.existingTechniques > 0 || plan.skippedSessions > 0 || plan.skippedBucket > 0) && (
        <Card>
          <SectionTitle>Already in the app</SectionTitle>
          <Rows
            rows={[
              ['Positions (kept where they are)', plan.existingPositions],
              ['Techniques (your status kept)', plan.existingTechniques],
              ['Sessions skipped', plan.skippedSessions],
              ['Bucket items already listed', plan.skippedBucket],
            ].filter(([, v]) => (v as number) > 0) as [string, number][]}
          />
        </Card>
      )}

      {(plan.unresolved.length > 0 || plan.brokenTechniques.length > 0) && (
        <Card>
          <SectionTitle>Not linked</SectionTitle>
          <p className="text-xs leading-relaxed text-faint">
            {[...plan.unresolved, ...plan.brokenTechniques].join(', ')}. These stay in the sessions' text but aren't connected to the map.
          </p>
        </Card>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      <button onClick={onImport} disabled={busy} className="h-12 rounded-2xl bg-bjj font-bold text-[#0a0b0c] disabled:opacity-50">
        {busy ? 'Importing…' : 'Import'}
      </button>
    </Page>
  )
}

function Tile({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded-2xl bg-surface p-3">
      <div className="text-[26px] font-bold">{value}</div>
      <div className="text-[11px] leading-snug text-faint">{label}</div>
    </div>
  )
}

function Rows({ rows }: { rows: [string, number][] }) {
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {rows.map(([k, v]) => (
        <li key={k} className="flex justify-between gap-4">
          <span className="text-muted">{k}</span>
          <span className="font-semibold">{v}</span>
        </li>
      ))}
    </ul>
  )
}
