import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../db/db'
import { exportBackup } from '../db/backup'
import { META_LAST_BACKUP } from '../db/schema'
import { relativeDays } from '../lib/time'

/** Backup reminder: shows when the last backup happened and exports a new one. */
export function BackupCard() {
  const info = useLiveQuery(async () => {
    const last = (await db.meta.get(META_LAST_BACKUP))?.value as number | undefined
    return { last, stale: last === undefined || Date.now() - last > 7 * 24 * 60 * 60 * 1000 }
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const last = info?.last
  const stale = info?.stale ?? false

  async function onBackup() {
    setBusy(true)
    setError(null)
    try {
      await exportBackup(db)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backup failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3.5 ${stale ? 'border-[#3a2a1a]' : 'border-line'}`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{last ? `Last backup ${relativeDays(last)}` : 'Never backed up'}</p>
        <p className="mt-0.5 text-xs text-faint">{error ?? 'Your data only lives on this phone'}</p>
      </div>
      <button
        onClick={onBackup}
        disabled={busy}
        className="h-9 rounded-[10px] bg-accent px-3.5 text-[13px] font-bold text-white disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Back up'}
      </button>
    </div>
  )
}
