# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Fork of [joaodcp/cp-rt-ui](https://github.com/joaodcp/cp-rt-ui) — a live train
tracker for Portuguese rail (CP). Next.js 14 (App Router) + TypeScript + React 18,
MapLibre via `react-map-gl/maplibre`, SWR, Tailwind (shadcn-style components),
vaul for the mobile sheet, Serwist for the PWA, optional `pg` for history.

## Commands

```bash
npm run dev      # next dev with hot reload — http://localhost:3000
npm run build    # production build; also generates public/sw.js via Serwist
npm run start    # serve the production build
npm run lint     # eslint (next lint)

npx tsc --noEmit                       # typecheck the main project
npx tsc --noEmit -p tsconfig.sw.json   # typecheck just the service worker
```

There is no test suite. Validation is manual — see "Validating work locally".

## The two-backend architecture

```
[Frontend Next.js] ──→ [Backend A: comboios.live/api/*]   live data, public,
                                                          no key needed (fallback
                                                          via lib/upstream.ts)

                  ←──  [Backend B: Postgres from repo
                        comboios_scrapper]                history; only used by
                                                          /api/{history,reliability,stats}/*
                                                          when DATABASE_URL is set
```

The frontend works STANDALONE (no Backend B). Setting `DATABASE_URL` unlocks the
historical features. Without it those endpoints return 404 cleanly and
`ReliabilityBadge` falls back to an "in Nd" placeholder.

- **Backend A** — `lib/upstream.ts`. In production (Joao's deploy) `WORKER_BASE_URL`
  + `WORKER_KEY` route to a private Cloudflare Worker with bearer auth. Without
  those env vars (local dev / forks) it hits the public `comboios.live/api` proxy
  — same data, +1 hop, upstream-cached. The `app/api/{vehicles,stations,stats,
  trips,version}` routes are thin pass-throughs over `fetchUpstream`.
- **Backend B** — `lib/historyDb.ts`. Lazily builds a `pg.Pool` only if
  `DATABASE_URL` is set; `isHistoryConfigured()` gates the history endpoints.
  Pool errors are caught so transient DB issues never crash the Next server.

## Frontend data flow

`app/page.tsx` is the single client component holding all map state. It:

- Polls `/api/vehicles`, `/api/stations`, `/api/stats` via SWR on intervals,
  and `/api/trips/[n]` when a train is selected.
- Derives client-only fields not present in the API: `heading` (turf.bearing
  between consecutive polls) and `delayTrend` (delta vs `prevDelaysRef`, with a
  30s threshold to filter noise). Both are added to the `Vehicle` type in
  `types/cp-v2.ts`.
- Renders vehicles/stations/routes as MapLibre `Source`/`Layer`s; the vehicle
  icon is a `SymbolLayer` rotated by `heading`.
- Selecting a train or station opens one shared `components/DetailPanel`: a
  desktop side panel that slides in from the right (retractable to an edge tab)
  or, on mobile, a vaul bottom sheet (3 snap points). `DetailPanel` picks the
  layout via `utils/useIsMobile.ts`; `VehicleDetailContent` /
  `StationDetailContent` render the body. Only ever one panel — selecting
  another entity swaps its content. Train and station selection are mutually
  exclusive (`onVehicleSelected` / `onStationSelected` clear each other).

Supporting modules: `utils/eta.ts` (physical ETA by projecting position+speed
onto the route line — `turf.nearestPointOnLine` + `turf.lineSlice`),
`utils/fleet.ts`, `utils/stations.ts`, `utils/time.ts`. History UI lives in
`components/ReliabilityBadge` driven by the `hooks/useReliability.ts` hook.
i18n is i18next (`i18n/`, `en.json`/`pt.json`), browser language-detected.

## Conventions / gotchas

- **`app/sw.ts` is excluded from the main tsconfig.** It uses WebWorker types via
  `tsconfig.sw.json`. Don't add it back to the main `include` or DOM types break.
  Serwist is `disable`d in development (see `next.config.mjs`) to avoid HMR
  conflicts — the SW only builds/registers in production.
- **Backend B endpoints return 404 (not 500) when the DB is unavailable.** This is
  intentional — `useReliability` treats 404 as "not yet" and shows the placeholder.
  Don't change that contract.
- **Heading icon orientation**: `cp_vehicle_oriented_w_inv.png` (90×134) is the
  rotated icon. If trains appear sideways, rotate the source PNG or add an offset
  to `icon-rotate` in `vehiclesIconLayerStyle`. A second layer,
  `vehiclesArrowLayerStyle` (SDF `arrow.png`), draws a direction-of-travel arrow
  just ahead of the dot — both layers need `heading`, so they only appear once a
  train has been observed moving between two polls.
- **`heading` and `delayTrend` are added client-side**, not returned by the API.
- **PWA icons in `public/icons/` are placeholders** (sips-generated, padded with
  `#0B6CF2`). Replace with branded artwork before a public launch.
- Path alias `@/*` maps to the repo root.

## History endpoints (Backend B)

All query Postgres via `lib/historyDb.ts` and 404 when the DB is unconfigured or
the relevant tables aren't migrated:

- `GET /api/reliability/train/[number]` — on-time score + `byDayOfWeek[]` + `line`
- `GET /api/reliability/station/[code]` — station on-time %, distinct trains,
  avg/p90 delay, and `recentArrivals[]` (scheduled vs real). `code` is the live
  "94-NNNNN" station code. 404 below 5 observations.
- `GET /api/predictions/train/[number]` — mean historical delay per (station, DoW)
- `GET /api/heatmap/speed` — GeoJSON FeatureCollection of segments by avg speed
- `GET /api/heatmap/dwell` — per-station avg dwell + excess-over-scheduled
- `GET /api/stats/line/[code]` — line-level score (`code` = GTFS route_id)

## History UI

- **Network heatmap** — always-available top-bar toggle (`app/page.tsx`, state
  `showRouteHeatmap`, `heatmapActive`). When on it draws the **whole** rail
  network coloured by avg speed (`/api/heatmap/speed`, red→yellow→green) plus
  every station as a red stop marker (`/api/heatmap/dwell`). Global by design —
  no dependency on a selected train or on Backend A, so it can't be knocked out
  by a comboios.live outage. (It was briefly per-train; reverted — too fragile.)
  Speed-line geometry follows real OSM track curves (seeded via
  `scripts/railGeometry.ts`, GPS-traced in production).
- **Day-of-week reliability panel** — `components/ReliabilityPanel`, renders
  `score.byDayOfWeek` as a 7-bar on-time chart. In the desktop popup + bottom
  sheet. Uses `useReliability` (deduped with `ReliabilityBadge`).
- **Adjusted-ETA hint** — `hooks/usePredictions.ts` + `TrainStopsList`. Shows the
  mean historical delay for today's weekday next to each upcoming stop.
- **Station punctuality panel** — `components/StationReliabilityPanel`, driven by
  `hooks/useStationReliability.ts`. In the station detail panel, below the live "next
  arrivals" list. Shows the station's on-time %, a plain-language verdict, and
  recent arrivals with scheduled vs real time. Hidden when Backend B has no data.

## The trips endpoint GTFS fallback

`app/api/trips/[tripNumber]` is called with the **train number**. Backend A's
realtime `/trips` upstream currently returns an empty `{occupancy:null}` for
every train, so the route falls back to Backend B: it builds a `Trip` from the
scraper's static GTFS (`gtfs_trips`/`gtfs_stop_times`/`gtfs_stops`) when the
realtime trip is empty and `DATABASE_URL` is set. GTFS `stop_id` ("94_NNNNN") is
converted to the live hyphen format ("94-NNNNN") so the heatmap/predictions
joins match. The fallback object carries `source: "gtfs-schedule"`. Without
Backend B, an empty trip still degrades gracefully (stops list shows "Loading").

## Pending work

Cancellation tracking is still absent, so `reliability.cancellationPercent` is
hardcoded to 0. The GTFS fallback is schedule-only (no realtime ETA/delay) — if
Backend A's `/trips` upstream is restored it takes precedence automatically.

The speed heatmap displays segments where the underlying
`route_segments.avg_speed_kmh` includes occasional GPS-noise outliers (~558
km/h observed on real prod data, while CP's fastest train is ~220 km/h).
Brief positional jitter creates a tiny travel time with a real distance.
A few segments may appear bright green when they shouldn't. Pre-existing
in the scraper's aggregator; can be fixed by capping `avg_speed_kmh` in
either the aggregator (`comboios_scrapper/src/aggregator.ts`) or the
heatmap query in `app/api/heatmap/speed/route.ts`.

## Production deployment notes (Coolify)

If you're deploying this to Coolify alongside the scraper repo:

- The Postgres BD container's IP changes per redeploy. **Always use the
  container hostname**, not an IP, in `DATABASE_URL`. The hostname looks
  like `db-x11j2gf0du0mz56h52zvbuhb` and is available once the BD Service
  has "Connect To Predefined Network" enabled in Coolify, joining the
  shared `coolify` network. Same applies to the scraper.
- The historical Backend B endpoints rely on the scraper's aggregator
  populating `segment_paths` + `route_segments` + `station_dwell_events`
  with `scheduled_dwell_seconds`. The aggregator only runs once nightly
  on yesterday's data; for first-time deploy use the scraper's
  `dist/scripts/backfill-aggregations.js` + `dist/scripts/backfill-gtfs.js`
  to populate from accumulated history in one pass.

## Validating work locally

```bash
# 1. Start local Postgres (in the scraper repo)
cd ../comboios_scrapper && docker compose up postgres -d

# 2. Apply migrations + load seed
DATABASE_URL='postgres://postgres:postgres@localhost:5432/comboios' npm run seed

# 3. Run the frontend connected to it
cd ../comboios_app
DATABASE_URL='postgres://postgres:postgres@localhost:5432/comboios' npm run dev

# 4. Open http://localhost:3000, click a train → green ReliabilityBadge.
#    Or curl: http://localhost:3000/api/reliability/train/528
```

Last validated 2026-05-01 (local): curl returned `samples: 240, onTimePercent:
98.33%, source: "dwell"`; badge confirmed in the train 4401 popup.

Last validated 2026-05-20 (production at comboios-app.arturoocampo.com):
`/api/heatmap/speed` returns 1961 segments, `/api/heatmap/dwell` has
`avgExcessSeconds` on 407/413 stations, `/api/reliability/train/528`
returns real prod data (`samples: 230, source: "dwell"`). Frontend heatmap
visible end-to-end. See `comboios_scrapper/CLAUDE.md` "Last validated
state" for the deploy sequence that got there.
