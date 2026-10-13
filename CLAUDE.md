# SUPER TRACKER — project spec

Personal training app for one user (Iago): gym + **no-gi** BJJ in one place. iPhone-first PWA installed to the
home screen. All data stays on the device. Public-facing quality matters: the repo is a CV piece.

## Hard constraints

- **Local-only data.** IndexedDB via Dexie. No backend, no login, no analytics, no network calls for data.
- **Backups are the safety net.** JSON export via the iOS share sheet + restore. Never break backup compatibility
  silently: bump `BACKUP_VERSION` in `src/db/backup.ts` and handle old versions in `parseBackup`/`restoreBackup`.
- **Schema changes:** add a new `this.version(n)` block in `src/db/db.ts` with an upgrade function. Never edit v1.
  IndexedDB can't index booleans — don't add boolean fields to `stores()`.
- **Out of scope:** bodyweight, diet, gi, Apple Health, social features, accounts.
- **Units:** kg. **RPE:** 1–10. **Language:** English UI.

## Stack

React 19 + TypeScript + Vite · Tailwind v4 (tokens in `src/index.css` `@theme`) · Dexie + dexie-react-hooks ·
react-router · vite-plugin-pwa · Vitest (+ fake-indexeddb). Planned: React Flow (technique map), Recharts (charts).
Hosting: Vercel (`vercel.json` rewrites all routes to `index.html`).

Commands: `npm run dev` · `npm run build` · `npm test` · `npm run lint`. CI runs lint, test, build on every push.

## Design system

Dark only. Two visual languages:

- **Gym = Strong-style.** Copy Strong's layout and interactions (not its branding). Clean, practical, near-black.
- **BJJ = neon.** Black background, faint dot grid, glowing nodes, "slimy" gooey neon edges (SVG goo filter),
  slow pulse along edges in the technique's direction. Minimal chrome; details in bottom sheets.

Tokens (`src/index.css`):

| Token | Value | Use |
|---|---|---|
| bg | #000000 | page |
| surface | #0E1012 | cards |
| raised | #1A1D21 | inputs, chips, set fields |
| line | #1E2226 | borders |
| text / muted / faint / dim | #F2F3F5 / #8A9098 / #6B727A / #4A5058 | text levels |
| accent | #3D8BFF | primary actions, gym exercise names, rest timer |
| done | #22C55E | completed sets, Finish |
| danger | #FF6B5E | errors, "getting caught" |
| gym / bjj | #3D8BFF / #B6FF3B | sport tags in charts and heatmap |
| want / learning / hitting / agame | #B86BFF / #22E6FF / #B6FF3B / #FF3DA6 | technique status neons |

Type: Geist Variable (self-hosted via @fontsource), tabular numbers. Titles 30px/800. Touch targets ≥ 44px.
Bottom tab bar: **Home · History · Train · Gym · BJJ**. Respect safe areas (`pt-safe`, `pb-safe`).
The design mockups live in a Claude Design canvas ("SUPER TRACKER Screens").

## Data model (`src/db/schema.ts`)

- Gym: `exercises` (kind: weight_reps | bodyweight_plus | reps_only | duration), `templates`, `workouts`
  (source: app | strong), `sets` (one row per set, `done`, `completedAt`).
- BJJ: `positions` (bubbles; side top|bottom; kind position|submission), `techniques` (arrows fromId → toId,
  status want → learning → hitting → agame), `bjjSessions`, `focusCycles` (one active per side).
- `meta` key/value (e.g. `lastBackupAt`).

## Feature spec

### Gym (Strong clone)
- Start Workout screen: "Start an empty workout", templates in folders as 2-column cards (exercise list,
  last performed). Template preview sheet with exercises and Start button.
- Active workout sheet: timer, green Finish; per exercise a table **Set · Previous · kg · Reps · ✓**.
  Previous = same set number from the last workout with that exercise. Checking a set tints the row green and
  starts the rest bar inline under it (counts down, accent fill). Rest per exercise, shown as dividers ("3:00").
  "+kg" column for bodyweight_plus. Add set, add exercise.
- Rest timer on iOS: store the end timestamp and compute remaining time; JS timers pause in the background.
  Use Screen Wake Lock during workouts.
- History detail: duration, total volume, PR count; per set the e1RM column; PR badges (WEIGHT, 1RM, REPS…).
- **e1RM uses Brzycki: `weight × 36 / (37 − reps)`** — matches Strong's numbers (90×6 → 105, 80×10 → 107).
  Only computed for 1–12 reps; higher-rep sets get no estimate (it explodes: 45×30 → 231).
- **PRs** (`src/gym/stats.ts`): per exercise, walking finished workouts in order; WEIGHT / 1RM / VOLUME for
  weight_reps, WEIGHT / REPS for bodyweight_plus. Warm-ups never count, the first session is the baseline,
  and only the first set reaching a new best in a workout gets the badge. Matches Strong on the real data.
- Volume = Σ weight × reps of completed non-warm-up sets. Bodyweight isn't tracked, so bodyweight_plus sets count
  only the added weight (Strong adds bodyweight, so its totals are higher for dips and pull-ups).
- Gym tab: period switch (4W/12W/1Y), headline stats (workouts, volume, avg duration, new PRs), best lifts
  (e1RM + sparkline + delta), sets per muscle per week, recent PRs, most trained, link to exercise library.
- **Strong CSV import** (`src/import/strong.ts`): columns Date, Workout Name, Duration, Exercise Name, Set Order,
  Weight, Reps, Distance, Seconds, Notes, Workout Notes, RPE. Set Order is a number, W/D/F, or "Rest Timer" (its
  Seconds = the exercise's rest). Rows with 0 reps and 0 s are unfilled sets and are skipped. Notes contain literal
  `\n`. Workouts are keyed `strong:<Date>` so re-imports skip duplicates. Templates are offered for routines done
  at least twice in the last 120 days of the export. Never commit the user's export; check against it with
  `STRONG_CSV=/path/to/file.csv npm test`.
- Active workout state lives in the DB (`meta.activeWorkoutId`, `meta.activeRest`) so closing the app loses nothing.

### BJJ
- Technique map: positions are bubbles, techniques are arrows. Top/passing zone above a dashed divider,
  bottom/guard below. Neon color = status; edge thickness/brightness = how often it's hit. Filters: All /
  Bucket list (status want) / Focus. The map starts **empty**: adding a position and dragging an arrow between
  two bubbles must be effortless. Techniques can also be created from the session log.
- Map implementation (`src/components/TechniqueMap.tsx`, `src/bjj/map.ts`): custom SVG, no graph library.
  World coordinates with the divider at y = 0 (a position's side is derived from its y on drag). Layers: goo
  (thick blurred strokes + blobs through a threshold filter = the slime), glow cores, white flow dashes on
  hitting/A-game techniques, direction chevrons, invisible wide hit paths, nodes, labels. Gestures: drag
  background = pan, pinch/wheel = zoom, drag node = move, tap node/edge = select, drag the + handle of the
  selected node onto another node = new technique (or "+ Technique from here", then tap the target).
  Fits all positions once on first open, then only the user moves the view. Edge width uses `edgeWidth(status,
  hits)`; hits come from session logs in Phase 5.
- Session log (summary, mostly tapping): class type, duration, RPE, taught, hit, what got me, rounds,
  "worked on focus?" (only when a focus cycle is active), what worked / problem / next focus.
- Session log implementation (`src/pages/BjjSession.tsx`, `src/bjj/sessions.ts`): one page for new and existing
  sessions (`/bjj/log`, `/bjj/session/:id`). Techniques are picked in `TechniquePicker` (read-only mini map with
  multi-highlight + search list; "+ New" creates a technique, and new positions if needed, without leaving the
  log). Map edge thickness = sessions hit in the last 90 days (`hitCounts`); technique panel shows hit/taught/
  caught counts (`techniqueUsage`). Load = minutes × RPE (`sessionLoad`), used by the dashboard.
- Focus tab: one focus position per side (top + bottom), each a cycle with start date and goal; archived cycles
  form a history. Sections: working most, neglected, getting caught, next up (bucket list from this position).
  Rule-based suggestions: dead end, leak, stale, ready to promote.

### Home dashboard
Week stats, 12-week consistency heatmap (gym blue / BJJ lime), weekly load (duration × RPE, stacked by sport),
strength trends, BJJ game status counts + focus link, backup reminder (warn after 7 days).

## Build phases

1. **Foundation** ✅ — scaffold, PWA, Dexie schema, tab navigation, backup/restore, persistent storage, CI.
2. **Gym logger** ✅ — exercise library, templates, active workout, history, Strong CSV import.
3. **Gym stats** ✅ — PR detection, e1RM, charts, Gym tab.
4. **Technique map** ✅ — positions, techniques, statuses, filters.
5. **BJJ log** ✅ — session summary with tapping on the map.
6. Focus tab — cycles per side, technique panel, suggestion rules.
7. Dashboard — heatmap, load, trends, BJJ growth.

Ship each phase as a working, deployed increment the user can test on his phone.
