import type { Exercise, ExerciseKind, MuscleGroup } from '../db/schema'

export const MUSCLE_GROUPS: { value: MuscleGroup; label: string; region: string }[] = [
  { value: 'chest', label: 'Chest', region: 'Push' },
  { value: 'shoulders', label: 'Shoulders', region: 'Push' },
  { value: 'triceps', label: 'Triceps', region: 'Push' },
  { value: 'lats', label: 'Lats', region: 'Pull' },
  { value: 'upper_back', label: 'Upper back', region: 'Pull' },
  { value: 'traps', label: 'Traps', region: 'Pull' },
  { value: 'biceps', label: 'Biceps', region: 'Pull' },
  { value: 'quads', label: 'Quads', region: 'Legs' },
  { value: 'hamstrings', label: 'Hamstrings', region: 'Legs' },
  { value: 'glutes', label: 'Glutes', region: 'Legs' },
  { value: 'calves', label: 'Calves', region: 'Legs' },
  { value: 'core', label: 'Core', region: 'Other' },
  { value: 'full_body', label: 'Full body', region: 'Other' },
  { value: 'other', label: 'Other', region: 'Other' },
]

/** Groups that get a "low volume" warning; full body and other are too vague to judge. */
export const TRACKED_MUSCLES = MUSCLE_GROUPS.filter((m) => m.region !== 'Other' || m.value === 'core').map((m) => m.value)

/** Pre-split groups from older data (v1/v2 DB, old backups) and their fallback when the name gives no hint. */
const LEGACY_FALLBACK: Record<string, MuscleGroup> = { arms: 'biceps', back: 'upper_back', legs: 'quads' }

/** Turns a legacy broad group into a specific one, using the exercise name when it can. */
export function migrateMuscleGroup(group: string, name: string): MuscleGroup {
  if (!(group in LEGACY_FALLBACK)) return group as MuscleGroup
  return guessMuscleGroup(name) ?? LEGACY_FALLBACK[group]
}

export const EXERCISE_KINDS: { value: ExerciseKind; label: string }[] = [
  { value: 'weight_reps', label: 'Weight × reps' },
  { value: 'bodyweight_plus', label: 'Bodyweight + kg' },
  { value: 'reps_only', label: 'Reps only' },
  { value: 'duration', label: 'Duration' },
]

export const muscleLabel = (g: MuscleGroup) => MUSCLE_GROUPS.find((m) => m.value === g)?.label ?? 'Other'

// Order matters: the first rule whose pattern matches wins, so specific patterns come before general ones.
const RULES: [RegExp, MuscleGroup][] = [
  [/calf|calves/, 'calves'],
  [/leg curl|hamstring|romanian|\brdl\b|stiff.?leg|good.?morning|nordic|deadlift|back ext/, 'hamstrings'],
  [/hip thrust|glute|abductor|kickback|pull.?through/, 'glutes'],
  [/squat|leg press|leg ext|lunge|step.?up|hack|adductor|sissy/, 'quads'],
  [/crunch|\babs?\b|plank|sit.?up|leg raise|core|rollout|wood.?chop/, 'core'],
  [/shrug|kelso/, 'traps'],
  [/reverse fly|rear delt|face pull|lateral raise|shoulder press|military|overhead press|viking|standing press|upright row|\bohp\b|press militar|incline shoulder|arnold/, 'shoulders'],
  [/tricep|pushdown|carter|katana|skull|\bjm press\b|close grip|kickback|dip \(?tri/, 'triceps'],
  [/curl|bicep/, 'biceps'],
  [/bench|chest|pec|fly|flye|butterfly|push.?up|\bdip\b/, 'chest'],
  [/pull.?up|chin.?up|pulldown|pullover|\blat\b|straight.?arm/, 'lats'],
  [/row/, 'upper_back'],
  [/bike|cycling|run|elliptical|burpee|thruster|clean|snatch/, 'full_body'],
]

/** Best guess of an exercise's main muscle group from its name. Returns undefined when nothing matches. */
export function guessMuscleGroup(name: string): MuscleGroup | undefined {
  const n = name.toLowerCase()
  for (const [re, group] of RULES) if (re.test(n)) return group
  return undefined
}

/** Each working set counts 1 for the main muscle and this much for every helper muscle. */
export const HELPER_SET = 0.5

const NOT_PRESS = /fly|flye|butterfly|pec ?dec|crossover/

// Compound lifts: [name pattern, required main muscle, helpers]. Isolation work matches nothing and has no helpers.
const HELPER_RULES: [RegExp, MuscleGroup, MuscleGroup[]][] = [
  [/bench|press|push.?up|\bdips?\b/, 'chest', ['shoulders', 'triceps']],
  [/\bdips?\b/, 'triceps', ['chest', 'shoulders']],
  [/jm press|close.?grip/, 'triceps', ['chest']],
  [/upright row/, 'shoulders', ['traps']],
  [/press|military|\bohp\b|arnold/, 'shoulders', ['triceps']],
  [/reverse fly|rear delt|face pull/, 'shoulders', ['upper_back']],
  [/pull.?up|chin.?up|pulldown/, 'lats', ['biceps', 'upper_back']],
  [/row/, 'upper_back', ['lats', 'biceps']],
  [/squat|leg press|hack|lunge|step.?up/, 'quads', ['glutes']],
  [/romanian|\brdl\b|stiff.?leg|good.?morning/, 'hamstrings', ['glutes']],
  [/deadlift/, 'hamstrings', ['glutes', 'upper_back', 'traps']],
  [/hip thrust/, 'glutes', ['hamstrings']],
]

/** Suggested helper muscles for a lift, from its name and main muscle. */
export function guessHelpers(name: string, main: MuscleGroup): MuscleGroup[] {
  const n = name.toLowerCase()
  if (main === 'chest' && NOT_PRESS.test(n)) return []
  for (const [re, m, helpers] of HELPER_RULES) if (m === main && re.test(n)) return helpers
  return []
}

/** The helper muscles that count for an exercise: the user's choice if made, else the guess. Never the main muscle. */
export function helperMuscles(e: Pick<Exercise, 'name' | 'muscleGroup' | 'secondaryMuscles'>): MuscleGroup[] {
  return (e.secondaryMuscles ?? guessHelpers(e.name, e.muscleGroup)).filter((g) => g !== e.muscleGroup)
}

/** Bodyweight movements logged as added weight in Strong ("+25 kg"). */
const BODYWEIGHT_PLUS = /pull.?up|chin.?up|\bdips?\b|muscle.?up|push.?up/

export function guessKind(name: string, hasSeconds = false): ExerciseKind {
  const n = name.toLowerCase()
  if (hasSeconds && !/press|curl|row/.test(n)) return 'duration'
  if (BODYWEIGHT_PLUS.test(n) && !/machine|assisted|cable/.test(n)) return 'bodyweight_plus'
  return 'weight_reps'
}

export const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ')
export const nameKey = (name: string) => normalizeName(name).toLowerCase()
