import { describe, expect, it } from 'vitest'
import { guessHelpers, guessMuscleGroup, helperMuscles } from './exerciseCatalog'

const helpers = (name: string) => guessHelpers(name, guessMuscleGroup(name)!)

describe('helper muscles', () => {
  it('splits compound presses', () => {
    expect(helpers('Chest Dip')).toEqual(['shoulders', 'triceps'])
    expect(helpers('Bench Press (Barbell)')).toEqual(['shoulders', 'triceps'])
    expect(helpers('Incline Chest Press (Machine)')).toEqual(['shoulders', 'triceps'])
    expect(helpers('Shoulder Press (Plate Loaded)')).toEqual(['triceps'])
    expect(helpers('Triceps Dip')).toEqual(['chest', 'shoulders'])
    expect(helpers('JM press')).toEqual(['chest'])
  })

  it('splits pulls and legs', () => {
    expect(helpers('Pull Up')).toEqual(['biceps', 'upper_back'])
    expect(helpers('Lat Pulldown (Cable)')).toEqual(['biceps', 'upper_back'])
    expect(helpers('T Bar Row')).toEqual(['lats', 'biceps'])
    expect(helpers('Squat (Smith Machine)')).toEqual(['glutes'])
    expect(helpers('Romanian Deadlift (Barbell)')).toEqual(['glutes'])
    expect(helpers('Deadlift (Barbell)')).toEqual(['glutes', 'upper_back', 'traps'])
    expect(helpers('Reverse Fly (Cable)')).toEqual(['upper_back'])
  })

  it('gives isolation work no helpers', () => {
    for (const n of ['Chest Fly', 'machine butterfly', 'Pec Deck (Machine)', 'Lateral Raise (Cable)', 'Preacher Curl (Machine)',
      'Triceps Pushdown (Cable - Straight Bar)', 'Leg Extension (Machine)', 'Calf Press on Seated Leg Press', 'Pullover (Machine)', 'machine kelso shrug'])
      expect(helpers(n), n).toEqual([])
  })

  it('prefers the user choice and never lists the main muscle', () => {
    const dip = { name: 'Chest Dip', muscleGroup: 'chest' as const }
    expect(helperMuscles(dip)).toEqual(['shoulders', 'triceps'])
    expect(helperMuscles({ ...dip, secondaryMuscles: [] })).toEqual([])
    expect(helperMuscles({ ...dip, muscleGroup: 'triceps', secondaryMuscles: ['triceps', 'chest'] })).toEqual(['chest'])
  })
})
