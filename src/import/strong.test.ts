import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { SuperTrackerDB } from '../db/db'
import { e1rm } from '../lib/gym'
import { guessKind, guessMuscleGroup, migrateMuscleGroup } from '../lib/exerciseCatalog'
import { parseCsv } from './csv'
import { commitImport, parseStrongCsv, parseStrongDuration, planImport } from './strong'

const SAMPLE = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
2026-10-06 12:00:00,"ANT",1h 30m,"Bench Press (Barbell)",W,40.0,8.0,0,0.0,"","",
2026-10-06 12:00:00,"ANT",1h 30m,"Bench Press (Barbell)",1,90.0,6.0,0,0.0,"muy buen feeling\\n","",
2026-10-06 12:00:00,"ANT",1h 30m,"Bench Press (Barbell)",Rest Timer,0,0.0,0,180.0,,,
2026-10-06 12:00:00,"ANT",1h 30m,"Bench Press (Barbell)",2,90.0,4.0,0,0.0,,,
2026-10-06 12:00:00,"ANT",1h 30m,"Chest Dip",1,25.0,6.0,0,0.0,,,
2026-10-06 12:00:00,"ANT",1h 30m,"Chest Dip",2,25.0,0.0,0,0.0,,,
2026-10-06 12:00:00,"ANT",1h 30m,"katana triceps",1,15.0,10.0,0,0.0,,,
2026-10-13 12:09:23,"ANT",1h 43m,"Bench Press (Barbell)",1,90.0,6.0,0,0.0,,,
2026-10-13 12:09:23,"ANT",1h 43m,"Weird Thing",1,10.0,10.0,0,0.0,,,
2026-10-09 18:00:00,"ANT",1h 10m,"Bench Press (Barbell)",1,87.5,6.0,0,0.0,,,
`

let n = 0
const dbs: SuperTrackerDB[] = []
const freshDb = () => {
  const d = new SuperTrackerDB(`strong-${++n}`)
  dbs.push(d)
  return d
}
afterEach(async () => {
  for (const d of dbs.splice(0)) await d.delete()
})

describe('csv', () => {
  it('handles quotes, escaped quotes and newlines in fields', () => {
    expect(parseCsv('a,"b,c","d ""e""\nf"\r\n1,2,3')).toEqual([
      ['a', 'b,c', 'd "e"\nf'],
      ['1', '2', '3'],
    ])
  })
})

describe('strong import', () => {
  it('parses workouts, set kinds, rest timers and notes', () => {
    const ws = parseStrongCsv(SAMPLE)
    expect(ws).toHaveLength(3)
    const [first] = ws
    expect(first.durationMs).toBe(90 * 60_000)
    expect(first.exercises.map((e) => e.name)).toEqual(['Bench Press (Barbell)', 'Chest Dip', 'katana triceps'])
    const bench = first.exercises[0]
    expect(bench.sets.map((s) => s.kind)).toEqual(['warmup', 'normal', 'normal'])
    expect(bench.restSeconds).toBe(180)
    expect(bench.sets[1].notes).toBe('muy buen feeling')
    // The 0-rep dip set is an unfilled row and is dropped.
    expect(first.exercises[1].sets).toHaveLength(1)
  })

  it('imports once and skips duplicates on re-import', async () => {
    const db = freshDb()
    const ws = parseStrongCsv(SAMPLE)
    const plan = await planImport(db, ws)
    expect(plan.exercises.find((e) => e.name === 'Weird Thing')?.needsReview).toBe(true)
    expect(plan.exercises.find((e) => e.name === 'Chest Dip')?.kind).toBe('bodyweight_plus')
    const res = await commitImport(db, plan, { templates: plan.templateNames })
    expect(res).toMatchObject({ workouts: 3, exercisesCreated: 4, templates: 1 })
    expect(await db.sets.count()).toBe(8)

    const again = await planImport(db, parseStrongCsv(SAMPLE))
    expect(again.newWorkouts).toHaveLength(0)
    expect(again.skippedWorkouts).toBe(3)
  })

  it('parses durations', () => {
    expect(parseStrongDuration('1h 43m')).toBe(103 * 60_000)
    expect(parseStrongDuration('55m')).toBe(55 * 60_000)
  })
})

describe('muscle migration', () => {
  it('splits legacy groups by name, with a fallback, and leaves specific groups alone', () => {
    expect(migrateMuscleGroup('arms', 'Hammer Curl (Cable)')).toBe('biceps')
    expect(migrateMuscleGroup('arms', 'katana triceps')).toBe('triceps')
    expect(migrateMuscleGroup('back', 'Pull Up')).toBe('lats')
    expect(migrateMuscleGroup('legs', 'Lying Leg Curl (Machine)')).toBe('hamstrings')
    expect(migrateMuscleGroup('legs', 'mystery machine')).toBe('quads')
    expect(migrateMuscleGroup('chest', 'Lat Pulldown')).toBe('chest')
  })
})

describe('gym math', () => {
  it('matches Strong e1RM numbers (Brzycki)', () => {
    expect(Math.round(e1rm(90, 6)!)).toBe(105)
    expect(Math.round(e1rm(90, 4)!)).toBe(98)
    expect(Math.round(e1rm(80, 10)!)).toBe(107)
    expect(Math.round(e1rm(80, 9)!)).toBe(103)
    expect(Math.round(e1rm(10, 12)!)).toBe(14)
    expect(Math.round(e1rm(20, 6)!)).toBe(23)
  })

  it('guesses muscle groups and kinds', () => {
    expect(guessMuscleGroup('Bench Press (Barbell)')).toBe('chest')
    expect(guessMuscleGroup('pin leg extention')).toBe('quads')
    expect(guessMuscleGroup('Seated Leg Curl (Machine)')).toBe('hamstrings')
    expect(guessMuscleGroup('Romanian Deadlift (Barbell)')).toBe('hamstrings')
    expect(guessMuscleGroup('Calf Press on Seated Leg Press')).toBe('calves')
    expect(guessMuscleGroup('Hip Abductor (Machine)')).toBe('glutes')
    expect(guessMuscleGroup('Reverse Fly (Cable)')).toBe('shoulders')
    expect(guessMuscleGroup('carter extension')).toBe('triceps')
    expect(guessMuscleGroup('Preacher Curl (Machine)')).toBe('biceps')
    expect(guessMuscleGroup('T Bar Row')).toBe('upper_back')
    expect(guessMuscleGroup('Lat Pulldown (Cable)')).toBe('lats')
    expect(guessMuscleGroup('machine kelso shrug')).toBe('traps')
    expect(guessMuscleGroup('Chest Dip')).toBe('chest')
    expect(guessKind('Pull Up')).toBe('bodyweight_plus')
    expect(guessKind('Bench Press (Barbell)')).toBe('weight_reps')
  })
})

// Optional check against a real export: STRONG_CSV=/path/to/strong.csv npm test
const realCsv = process.env.STRONG_CSV
describe.skipIf(!realCsv)('real Strong export', () => {
  it('imports without errors', async () => {
    const db = freshDb()
    const plan = await planImport(db, parseStrongCsv(readFileSync(realCsv!, 'utf8')))
    const res = await commitImport(db, plan, { templates: plan.templateNames })
    console.log(res, 'needs review:', plan.exercises.filter((e) => e.needsReview).map((e) => e.name))
    console.log(plan.exercises.map((e) => `${e.muscleGroup.padEnd(9)} ${e.kind.padEnd(15)} ${e.name}`).join('\n'))
    console.log('templates:', plan.templateNames)
    expect(res.workouts).toBeGreaterThan(0)
  })
})
