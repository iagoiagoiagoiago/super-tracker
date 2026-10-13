import type { ExerciseKind, SetKind, WorkoutSet } from '../db/schema'

/**
 * Estimated one-rep max, Brzycki formula: weight × 36 / (37 − reps).
 * Matches Strong's numbers (90 kg × 6 → 105, 80 kg × 10 → 107). Only for loaded sets of 1–36 reps.
 */
export function e1rm(weight: number | undefined, reps: number | undefined): number | undefined {
  if (!weight || !reps || reps < 1 || reps > 36) return undefined
  if (reps === 1) return weight
  return (weight * 36) / (37 - reps)
}

/** e1RM for a set, or undefined when it doesn't apply (bodyweight-plus, warm-ups, no load). */
export function setE1rm(set: Pick<WorkoutSet, 'weight' | 'reps' | 'kind'>, kind: ExerciseKind): number | undefined {
  if (kind !== 'weight_reps' || set.kind === 'warmup') return undefined
  return e1rm(set.weight, set.reps)
}

/** Formats kg without trailing zeros: 90 → "90", 22.5 → "22.5". */
export function fmtKg(kg: number | undefined): string {
  if (kg === undefined || Number.isNaN(kg)) return ''
  return String(Math.round(kg * 100) / 100)
}

/** "90 kg × 6", "+25 kg × 6", "12 reps", "45 s" — the way Strong prints a set. */
export function describeSet(set: Pick<WorkoutSet, 'weight' | 'reps' | 'seconds'>, kind: ExerciseKind): string {
  switch (kind) {
    case 'weight_reps':
      return `${fmtKg(set.weight ?? 0)} kg × ${set.reps ?? 0}`
    case 'bodyweight_plus':
      return set.weight ? `+${fmtKg(set.weight)} kg × ${set.reps ?? 0}` : `${set.reps ?? 0} reps`
    case 'reps_only':
      return `${set.reps ?? 0} reps`
    case 'duration':
      return `${set.seconds ?? 0} s`
  }
}

/** Label in the Set column: number for normal sets, W / D / F otherwise. */
export function setLabels(sets: Pick<WorkoutSet, 'kind'>[]): string[] {
  let n = 0
  return sets.map((s) => {
    const k = s.kind ?? 'normal'
    if (k === 'warmup') return 'W'
    if (k === 'drop') return 'D'
    if (k === 'failure') {
      n++
      return 'F'
    }
    n++
    return String(n)
  })
}

export const SET_KIND_ORDER: SetKind[] = ['normal', 'warmup', 'drop', 'failure']

/** Total lifted weight (kg × reps) of completed non-warm-up sets. */
export function volume(sets: Pick<WorkoutSet, 'weight' | 'reps' | 'kind' | 'done'>[]): number {
  return sets.reduce((sum, s) => (s.done && s.kind !== 'warmup' ? sum + (s.weight ?? 0) * (s.reps ?? 0) : sum), 0)
}

export function fmtDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60000))
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h ? `${h}h ${m}m` : `${m}m`
}

/** Live stopwatch: "4:07" or "1:04:07". */
export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

export function fmtRest(seconds: number): string {
  const m = Math.floor(seconds / 60)
  return `${m}:${String(seconds % 60).padStart(2, '0')}`
}

export function fmtTonnage(kg: number): string {
  return kg >= 10000 ? `${(kg / 1000).toFixed(1)} t` : `${Math.round(kg)} kg`
}
