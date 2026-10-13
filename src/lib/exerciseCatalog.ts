import type { ExerciseKind, MuscleGroup } from '../db/schema'

export const MUSCLE_GROUPS: { value: MuscleGroup; label: string }[] = [
  { value: 'chest', label: 'Chest' },
  { value: 'back', label: 'Back' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'arms', label: 'Arms' },
  { value: 'legs', label: 'Legs' },
  { value: 'core', label: 'Core' },
  { value: 'full_body', label: 'Full body' },
  { value: 'other', label: 'Other' },
]

export const EXERCISE_KINDS: { value: ExerciseKind; label: string }[] = [
  { value: 'weight_reps', label: 'Weight × reps' },
  { value: 'bodyweight_plus', label: 'Bodyweight + kg' },
  { value: 'reps_only', label: 'Reps only' },
  { value: 'duration', label: 'Duration' },
]

export const muscleLabel = (g: MuscleGroup) => MUSCLE_GROUPS.find((m) => m.value === g)?.label ?? 'Other'

// Order matters: the first rule whose pattern matches wins, so specific patterns come before general ones.
const RULES: [RegExp, MuscleGroup][] = [
  [/calf|leg press|leg curl|leg ext|squat|lunge|adductor|abductor|hip thrust|glute|deadlift|\brdl\b|step.?up|v-squat/, 'legs'],
  [/crunch|\babs?\b|plank|sit.?up|leg raise|core|rollout/, 'core'],
  [/reverse fly|rear delt|face pull|lateral raise|shoulder press|military|overhead press|viking|standing press|upright row|\bohp\b|press militar|incline shoulder/, 'shoulders'],
  [/tricep|pushdown|carter|katana|skull|\bjm press\b|close grip|dip \(?tri|triceps dip/, 'arms'],
  [/curl|bicep/, 'arms'],
  [/bench|chest|pec|fly|flye|butterfly|push.?up|\bdip\b/, 'chest'],
  [/row|pull.?up|chin.?up|pulldown|pullover|shrug|kelso|lat\b|back ext/, 'back'],
  [/bike|cycling|run|row(ing)? machine|elliptical|burpee|thruster|clean|snatch/, 'full_body'],
]

/** Best guess of an exercise's main muscle group from its name. Returns undefined when nothing matches. */
export function guessMuscleGroup(name: string): MuscleGroup | undefined {
  const n = name.toLowerCase()
  for (const [re, group] of RULES) if (re.test(n)) return group
  return undefined
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
