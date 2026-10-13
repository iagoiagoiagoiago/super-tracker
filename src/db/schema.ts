// Data model for SUPER TRACKER. All data lives in IndexedDB on the device.
// IDs are UUID strings so records stay unique across backup/restore.
// Timestamps are epoch milliseconds.

export type ID = string

// ---------- Gym ----------

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'legs'
  | 'shoulders'
  | 'arms'
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
}

export interface WorkoutSet {
  id: ID
  workoutId: ID
  exerciseId: ID
  /** Position of the exercise within the workout. */
  exerciseOrder: number
  /** Position of the set within the exercise, starting at 1. */
  setNumber: number
  /** kg. For bodyweight_plus this is the added weight. */
  weight?: number
  reps?: number
  seconds?: number
  rpe?: number
  done: boolean
  completedAt?: number
}

// ---------- BJJ ----------

export type Side = 'top' | 'bottom'

export type TechniqueStatus = 'want' | 'learning' | 'hitting' | 'agame'

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

export type ClassType = 'fundamentals' | 'advanced' | 'open_mat' | 'drilling' | 'private' | 'competition'

export interface BjjSession {
  id: ID
  date: number
  classType: ClassType
  durationMin: number
  /** Session RPE, 1–10. */
  rpe: number
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
