import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BackupCard } from '../components/BackupCard'
import { ChevronLeftIcon, ChevronRightIcon } from '../components/icons'
import { Card, Page, SectionTitle } from '../components/ui'
import { BackupError, parseBackup, restoreBackup } from '../db/backup'
import { db } from '../db/db'
import { isStandalone, requestPersistentStorage, type PersistState } from '../db/storage'

export function Settings() {
  const [persist, setPersist] = useState<PersistState | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const installed = isStandalone()

  useEffect(() => {
    requestPersistentStorage().then(setPersist)
  }, [])

  async function onRestoreFile(file: File) {
    setMessage(null)
    try {
      const backup = parseBackup(await file.text())
      const when = new Date(backup.exportedAt).toLocaleString('en-GB')
      if (!window.confirm(`Replace everything on this phone with the backup from ${when}? This can't be undone.`)) return
      await restoreBackup(db, backup)
      setMessage('Backup restored.')
    } catch (e) {
      setMessage(e instanceof BackupError ? e.message : 'Restore failed.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <Page
      title="Settings"
      action={
        <Link to="/" aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-xl border border-line text-muted">
          <ChevronLeftIcon size={20} />
        </Link>
      }
    >
      <Card>
        <SectionTitle>Data on this phone</SectionTitle>
        <ul className="flex flex-col gap-2.5 text-sm">
          <li className="flex justify-between gap-4">
            <span className="text-muted">Installed to home screen</span>
            <span className={installed ? 'text-done' : 'text-danger'}>{installed ? 'Yes' : 'No'}</span>
          </li>
          <li className="flex justify-between gap-4">
            <span className="text-muted">Protected from clearing</span>
            <span className={persist === 'persisted' ? 'text-done' : 'text-danger'}>
              {persist === null ? '…' : persist === 'persisted' ? 'Yes' : persist === 'unsupported' ? 'Unsupported' : 'No'}
            </span>
          </li>
        </ul>
        {!installed && (
          <p className="mt-3 text-xs leading-relaxed text-faint">
            In Safari, tap Share → Add to Home Screen. Installed apps keep their data far more reliably.
          </p>
        )}
      </Card>

      <BackupCard />

      <Link to="/import/strong" className="flex items-center gap-3 rounded-[20px] bg-surface p-4">
        <div className="flex-1">
          <p className="text-[15px] font-bold">Import from Strong</p>
          <p className="mt-0.5 text-xs text-faint">Workouts, exercises and routines from a Strong CSV export</p>
        </div>
        <ChevronRightIcon size={18} className="text-faint" />
      </Link>

      <Link to="/import/bjj" className="flex items-center gap-3 rounded-[20px] bg-surface p-4">
        <div className="flex-1">
          <p className="text-[15px] font-bold">Import BJJ journal</p>
          <p className="mt-0.5 text-xs text-faint">Positions, techniques, past sessions and notes from a journal file</p>
        </div>
        <ChevronRightIcon size={18} className="text-faint" />
      </Link>

      <Card>
        <SectionTitle>Restore</SectionTitle>
        <p className="mb-3 text-xs leading-relaxed text-faint">
          Load a backup file. This replaces all workouts, sessions and your technique map on this phone.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          id="restore-file"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onRestoreFile(f)
          }}
        />
        <label
          htmlFor="restore-file"
          className="flex h-10 cursor-pointer items-center justify-center rounded-[10px] bg-raised text-sm font-semibold"
        >
          Choose backup file
        </label>
        {message && <p className="mt-3 text-xs text-muted">{message}</p>}
      </Card>

      <p className="text-center text-[11px] text-dim">SUPER TRACKER v{__APP_VERSION__}</p>
    </Page>
  )
}
