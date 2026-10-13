# SUPER TRACKER

A personal training tracker for **gym** and **no-gi Brazilian jiu-jitsu**, built as an offline-first
progressive web app for iPhone.

- **Gym** — Strong-style workout logging: templates, set tables with previous performance, rest timer,
  PR detection and estimated 1RM progress.
- **BJJ** — an interactive map of your game: positions are nodes, techniques are glowing edges between them,
  colored by how well you know them. Session logging, a bucket list, and a "currently working on" focus view
  with rule-based suggestions.
- **Dashboard** — consistency heatmap, training load across both sports, strength trends.

All data lives on the device (IndexedDB). No accounts, no server; backups are exported as JSON through the
share sheet.

> Status: in development. See the build phases in [`CLAUDE.md`](CLAUDE.md).

## Stack

React · TypeScript · Vite · Tailwind CSS · Dexie (IndexedDB) · vite-plugin-pwa · Vitest

## Development

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests
npm run lint
npm run build      # production build with service worker
```

To try it on an iPhone, open the deployed URL in Safari and choose **Share → Add to Home Screen**.
