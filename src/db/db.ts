import Dexie, { type EntityTable } from 'dexie'
import { migrateMuscleGroup } from '../lib/exerciseCatalog'
import type {
  BjjSession,
  Exercise,
  FocusCycle,
  MetaEntry,
  Position,
  Technique,
  Template,
  Workout,
  WorkoutSet,
} from './schema'

export class SuperTrackerDB extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>
  templates!: EntityTable<Template, 'id'>
  workouts!: EntityTable<Workout, 'id'>
  sets!: EntityTable<WorkoutSet, 'id'>
  positions!: EntityTable<Position, 'id'>
  techniques!: EntityTable<Technique, 'id'>
  bjjSessions!: EntityTable<BjjSession, 'id'>
  focusCycles!: EntityTable<FocusCycle, 'id'>
  meta!: EntityTable<MetaEntry, 'key'>

  constructor(name = 'super-tracker') {
    super(name)
    // Only indexed fields are listed. Add a new version() block for schema changes — never edit v1.
    this.version(1).stores({
      exercises: 'id, name, muscleGroup',
      templates: 'id, name, folder',
      workouts: 'id, startedAt, endedAt',
      sets: 'id, workoutId, exerciseId, [exerciseId+completedAt]',
      positions: 'id, side, kind',
      techniques: 'id, fromId, toId, status',
      bjjSessions: 'id, date',
      focusCycles: 'id, side, startedAt, endedAt',
      meta: 'key',
    })
    // v2: index workouts by import key so re-importing Strong data skips existing workouts.
    this.version(2).stores({
      workouts: 'id, startedAt, endedAt, externalId',
    })
    // v3: arms / back / legs split into specific muscles (biceps, lats, quads…), re-guessed from exercise names.
    this.version(3)
      .stores({})
      .upgrade((tx) =>
        tx
          .table('exercises')
          .toCollection()
          .modify((e: { muscleGroup: string; name: string }) => {
            e.muscleGroup = migrateMuscleGroup(e.muscleGroup, e.name)
          }),
      )
  }
}

export const db = new SuperTrackerDB()

export const TABLE_NAMES = [
  'exercises',
  'templates',
  'workouts',
  'sets',
  'positions',
  'techniques',
  'bjjSessions',
  'focusCycles',
  'meta',
] as const

export type TableName = (typeof TABLE_NAMES)[number]

export const newId = (): string => crypto.randomUUID()
