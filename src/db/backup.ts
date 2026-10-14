import { TABLE_NAMES, type SuperTrackerDB, type TableName } from './db'
import { META_LAST_BACKUP } from './schema'
import { migrateMuscleGroup } from '../lib/exerciseCatalog'
import { wantsToBucket } from '../bjj/legacy'

export const BACKUP_FORMAT = 'super-tracker-backup'
/** v2: bucketItems replaces bjjNotes and the "want" technique status (v1 files are converted on restore). */
export const BACKUP_VERSION = 2

export interface Backup {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: number
  tables: Record<TableName, unknown[]>
}

export async function createBackup(db: SuperTrackerDB): Promise<Backup> {
  const tables = {} as Record<TableName, unknown[]>
  await db.transaction('r', TABLE_NAMES.map((t) => db.table(t)), async () => {
    for (const name of TABLE_NAMES) {
      tables[name] = await db.table(name).toArray()
    }
  })
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: Date.now(), tables }
}

export class BackupError extends Error {}

export function parseBackup(text: string): Backup {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new BackupError('This file is not valid JSON.')
  }
  const b = data as Partial<Backup>
  if (!b || b.format !== BACKUP_FORMAT) {
    throw new BackupError('This is not a SUPER TRACKER backup file.')
  }
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    throw new BackupError('This backup was made by a newer version of the app.')
  }
  if (!b.tables || typeof b.tables !== 'object') {
    throw new BackupError('The backup file is missing its data.')
  }
  for (const name of TABLE_NAMES) {
    const rows = (b.tables as Record<string, unknown>)[name]
    if (rows !== undefined && !Array.isArray(rows)) {
      throw new BackupError(`The backup's "${name}" data is malformed.`)
    }
  }
  return b as Backup
}

/** Replaces everything on the device with the backup's contents, atomically. */
export async function restoreBackup(db: SuperTrackerDB, backup: Backup): Promise<void> {
  const tables = upgradeTables(backup)
  await db.transaction('rw', TABLE_NAMES.map((t) => db.table(t)), async () => {
    for (const name of TABLE_NAMES) {
      const table = db.table(name)
      await table.clear()
      let rows = tables[name] ?? []
      // Backups made before the muscle split still say arms / back / legs.
      if (name === 'exercises') {
        rows = (rows as { muscleGroup: string; name: string }[]).map((e) => ({ ...e, muscleGroup: migrateMuscleGroup(e.muscleGroup, e.name) }))
      }
      if (rows.length) await table.bulkAdd(rows)
    }
  })
}

export function backupFileName(date = new Date()): string {
  const d = date.toISOString().slice(0, 10)
  return `super-tracker-backup-${d}.json`
}

/**
 * Hands the backup to the user: the iOS share sheet when available (save to Files / iCloud / AirDrop),
 * otherwise a regular download. Returns false if the user cancelled the share sheet.
 */
export async function exportBackup(db: SuperTrackerDB): Promise<boolean> {
  const backup = await createBackup(db)
  const file = new File([JSON.stringify(backup)], backupFileName(), { type: 'application/json' })

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'SUPER TRACKER backup' })
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return false
      throw err
    }
  } else {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  await db.meta.put({ key: META_LAST_BACKUP, value: backup.exportedAt })
  return true
}

/** Brings an older backup's tables up to the current shape. */
export function upgradeTables(backup: Backup): Partial<Record<TableName, unknown[]>> {
  const tables: Partial<Record<TableName, unknown[]>> = { ...backup.tables }
  if (backup.version < 2) {
    type Row = { id: string }
    const positions = (tables.positions ?? []) as Parameters<typeof wantsToBucket>[0]
    const techniques = (tables.techniques ?? []) as Parameters<typeof wantsToBucket>[1]
    const out = wantsToBucket(positions, techniques, (tables.bjjSessions ?? []) as Parameters<typeof wantsToBucket>[2])
    const gone = new Set([...out.removedTechniqueIds, ...out.removedPositionIds])
    const promoted = new Set(out.promotedTechniqueIds)
    tables.techniques = techniques.filter((t) => !gone.has(t.id)).map((t) => (promoted.has(t.id) ? { ...t, status: 'learning' } : t))
    tables.positions = positions.filter((p) => !gone.has((p as Row).id))
    tables.bucketItems = [...((tables.bucketItems ?? []) as unknown[]), ...out.items]
  }
  return tables
}
