// Data model for SUPER TRACKER. All data lives in IndexedDB on the device.
// IDs are UUID strings so records stay unique across backup/restore.
// Timestamps are epoch milliseconds.

export type ID = string

// ---------- Gym ----------

export type MuscleGroup =
  | 'chest'
  | 'shoulders'
  | 'triceps'
  | 'biceps'
  | 'lats'
  | 'upper_back'
  | 'traps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core'
  | 'full_body'
  | 'other'

/** How a set is recorded. Mirrors Strong's exercise categories. */
export type ExerciseKind =
  | 'weight_reps' // 90 kg × 6
  | 'bodyweight_plus' // +25 kg × 6 (weighted dips, pull-ups)
  | 'reps_only' // 12 reps
  | 'duration' // seconds

export interface Exercise {
  id: ID
  name: string
  muscleGroup: MuscleGroup
  /**
   * Helper muscles that get a half set for every working set (dips → shoulders, triceps). Undefined = use the
   * name-based guess (`guessHelpers`); an explicit array, even empty, is the user's choice.
   */
  secondaryMuscles?: MuscleGroup[]
  kind: ExerciseKind
  /** Default rest after each set, in seconds. */
  restSeconds: number
  archived: boolean
  createdAt: number
}

export interface TemplateExercise {
  exerciseId: ID
  sets: number
  restSeconds?: number
}

export interface Template {
  id: ID
  name: string
  folder?: string
  exercises: TemplateExercise[]
  updatedAt: number
}

export interface Workout {
  id: ID
  name: string
  startedAt: number
  /** Undefined while the workout is in progress. */
  endedAt?: number
  templateId?: ID
  notes?: string
  source: 'app' | 'strong'
  /** Stable key from the import source (Strong: the workout's start timestamp) to skip duplicates on re-import. */
  externalId?: string
}

/** Strong's set types: normal (numbered), W = warm-up, D = drop set, F = failure. */
export type SetKind = 'normal' | 'warmup' | 'drop' | 'failure'

export interface WorkoutSet {
  id: ID
  workoutId: ID
  exerciseId: ID
  /** Position of the exercise within the workout. */
  exerciseOrder: number
  /** Position of the set within the exercise (all kinds), starting at 1. */
  setNumber: number
  kind?: SetKind
  /** kg. For bodyweight_plus this is the added weight. */
  weight?: number
  reps?: number
  seconds?: number
  rpe?: number
  notes?: string
  done: boolean
  completedAt?: number
}

// ---------- BJJ ----------

export type Side = 'top' | 'bottom'

/** Your level with a technique on the map. Things you only want to try live in the bucket list instead. */
export type TechniqueStatus = 'learning' | 'hitting' | 'agame'

/** A bubble on the map: a position, or a submission end point. */
export interface Position {
  id: ID
  name: string
  side: Side
  kind: 'position' | 'submission'
  /** Map coordinates. */
  x: number
  y: number
  notes?: string
  createdAt: number
}

/** An arrow on the map: a technique that moves you from one position to another. */
export interface Technique {
  id: ID
  name: string
  fromId: ID
  toId: ID
  status: TechniqueStatus
  notes?: string
  createdAt: number
  updatedAt: number
}

export type ClassType =
  | 'regular' // a normal no-gi class: technique + sparring
  | 'open_mat'
  | 'drilling'
  | 'fundamentals'
  | 'advanced'
  | 'wrestling' // wrestling / judo / takedowns
  | 'mma'
  | 'gi' // the occasional gi class
  | 'private'
  | 'competition'

export interface BjjSession {
  id: ID
  date: number
  classType: ClassType
  /** Minutes. Optional: imported history often doesn't record it. */
  durationMin?: number
  /** Session RPE, 1–10. Optional for the same reason. */
  rpe?: number
  /** Techniques taught in class. */
  taught: ID[]
  /** Techniques you landed in sparring. */
  hit: ID[]
  /** Techniques opponents landed on you (may be techniques you don't do yourself). */
  caughtBy: ID[]
  rounds?: number
  /** Answer to "Worked on focus position today?" — null if no active focus cycle. */
  workedFocus: boolean | null
  worked?: string
  problem?: string
  nextFocus?: string
  /** Free text: class content, details, anything else. */
  notes?: string
  source?: 'app' | 'import'
  /** Stable key from an import file, so re-importing skips sessions already here. */
  externalId?: string
}

/** Something you want to pull off. Free text; each check logs one rep (a time you landed or drilled it). */
export interface BucketItem {
  id: ID
  text: string
  /** Optional details: setup, where you saw it. */
  note?: string
  /** Timestamps of logged reps, oldest first. */
  reps: number[]
  createdAt: number
  /** Set when you mark it as pulled off; it moves to the Done section. */
  doneAt?: number
  externalId?: string
}

export interface FocusCycle {
  id: ID
  side: Side
  positionId: ID
  goal?: string
  startedAt: number
  endedAt?: number
}

// ---------- App ----------

export interface MetaEntry {
  key: string
  value: unknown
}

export const META_LAST_BACKUP = 'lastBackupAt'
/** ID of the workout currently in progress, if any. */
export const META_ACTIVE_WORKOUT = 'activeWorkoutId'
/** Running rest timer: { setId, endsAt, total } (ms timestamps / seconds). */
export const META_ACTIVE_REST = 'activeRest'

/** Exercise IDs pinned to the Home strength card. */
export const META_PINNED_LIFTS = 'pinnedLifts'

export interface ActiveRest {
  setId: ID
  endsAt: number
  total: number
}
