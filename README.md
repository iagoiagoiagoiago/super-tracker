# SUPER TRACKER

An offline-first training tracker for **gym** and **no-gi Brazilian jiu-jitsu**, built as a progressive web app
for iPhone. Everything is stored on the device; there are no accounts and no server.

## Features

**Gym (Strong-style logging)**
- Templates in folders, Strong-style active workout: previous-session column, auto-fill on check, inline rest
  timer with −15/+15/skip and sound, warm-up/drop/failure sets, weighted bodyweight exercises, screen wake lock.
  An in-progress workout survives the app being closed.
- History with per-set estimated 1RM (Brzycki, matching Strong's numbers) and automatic PR detection
  (weight, 1RM, volume, reps).
- Gym stats: best lifts with trends, sets per muscle per week, recent PRs, most-trained exercises, and an
  interactive progress chart per exercise.
- **Strong CSV import** with set types, rest timers and notes, duplicate-safe re-import, automatic
  muscle-group mapping with a review step, and templates generated from recent routines.

**BJJ (a map of your game)**
- A neon technique map: positions are nodes, techniques are glowing directed edges between them, split into
  top/passing and bottom/guard. Gooey SVG edges, flow pulses along the techniques you actually use, and line
  thickness that grows with how often you hit each technique. Pan, pinch-zoom, drag nodes, drag-to-connect.
- Technique statuses (want to learn → learning → hitting → A-game) with a bucket-list filter and a list view.
- Session logging by tapping techniques on a mini map: what was taught, what you hit, what caught you.
- **Focus cycles**: one focus position per side, with what you're working most, what's neglected, what keeps
  catching you, and rule-based suggestions (leaks, dead ends, stale techniques, one-tap promotions).

**Home dashboard**
- 12-week consistency heatmap, weekly training load (minutes × RPE) across both sports, week streak,
  pinned strength trends, BJJ game overview and a backup reminder.

**Data safety**
- IndexedDB via Dexie, persistent-storage request, JSON backup through the iOS share sheet, and restore.

## Stack

React 19 · TypeScript · Vite · Tailwind CSS v4 · Dexie (IndexedDB) · vite-plugin-pwa · Vitest.
The technique map and all charts are hand-built SVG; there is no chart or graph library.

## Project structure

```
src/
  db/          schema, Dexie database, backup/restore
  import/      Strong CSV parser and importer
  gym/         workout engine, PRs and stats
  bjj/         map geometry, session logging, focus analysis
  dashboard/   activity grid, weekly load, streak
  components/  technique map, charts, sheets, pickers
  pages/       screens
```

Domain logic is kept in pure functions with unit tests (`*.test.ts`); [`CLAUDE.md`](CLAUDE.md) holds the full
product and design spec.

## Development

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests
npm run lint
npm run build      # production build with service worker
```

To install on an iPhone, open the deployed URL in Safari and choose **Share → Add to Home Screen**.
