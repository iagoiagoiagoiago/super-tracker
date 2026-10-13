const DAY = 24 * 60 * 60 * 1000

/** Monday 00:00 local time of the week containing `date`. */
export function startOfWeek(date = new Date()): number {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = (d.getDay() + 6) % 7 // Monday = 0
  return d.getTime() - day * DAY
}

export function daysAgo(ts: number, now = Date.now()): number {
  return Math.floor((now - ts) / DAY)
}

export function relativeDays(ts: number, now = Date.now()): string {
  const d = daysAgo(ts, now)
  if (d <= 0) return 'today'
  if (d === 1) return 'yesterday'
  return `${d} days ago`
}

export function formatDayHeader(date = new Date()): string {
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
