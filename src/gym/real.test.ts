import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SuperTrackerDB } from '../db/db'
import { commitImport, parseStrongCsv, planImport } from '../import/strong'
import { computePRs, gymStats } from './stats'

const realCsv = process.env.STRONG_CSV
describe.skipIf(!realCsv)('real export stats', () => {
  it('computes PRs and stats', async () => {
    const db = new SuperTrackerDB('real-stats')
    const plan = await planImport(db, parseStrongCsv(readFileSync(realCsv!, 'utf8')))
    await commitImport(db, plan, { templates: [] })
    const [workouts, sets, exs] = await Promise.all([db.workouts.toArray(), db.sets.toArray(), db.exercises.toArray()])
    const ex = new Map(exs.map((e) => [e.id, e]))
    const prs = computePRs(workouts, sets, ex)
    const last = workouts.sort((a, b) => b.startedAt - a.startedAt).slice(0, 3)
    for (const w of last) {
      console.log(w.name, new Date(w.startedAt).toISOString(), prs.filter((p) => p.workoutId === w.id).map((p) => ex.get(p.exerciseId)!.name + ':' + p.kinds.join('/')))
    }
    const st = gymStats('4W', workouts, sets, ex, prs, Math.max(...workouts.map((w) => w.startedAt)) + 3600_000)
    console.log({ workouts: st.workouts, volume: Math.round(st.volume), avg: Math.round(st.avgDurationMs / 60000), prs: st.prs })
    console.log(st.lifts.map((l) => `${l.exercise.name} ${Math.round(l.best)} Δ${Math.round(l.delta)} n=${l.points.length}`))
    console.log(st.muscles.map((m) => `${m.group} ${m.setsPerWeek.toFixed(1)}`))
    console.log(st.mostTrained.map((m) => `${m.exercise.name} ${m.sessions}`))
    console.log('total PR events', prs.length)
    await db.delete()
    expect(prs.length).toBeGreaterThan(0)
  })
})
