# Architecture

## Stack and layout

React 19, TypeScript, Vite, Lucide, Leaflet, jsPDF and AutoTable. The hosted static build uses IndexedDB through `idb`. The local server uses Node.js 24, `node:http` and built-in `node:sqlite`, with no separate DB service or Docker.

```
src/
  components/  shared controls, forms, tables, map and stop editor
  pages/       overview, trips, orders, routes, registries, finances, settings
  domain/      typed models, invariants, lifecycle and totals
  data/        isolated fictional seed data and narrow compatibility migrations
  services/    repository adapters, map APIs, exports
  context.tsx  transactional UI commands and undo
  styles/      layout, typography and semantic theme tokens
  styles.css   ordered style entry point
server/
  app.ts       local HTTP API and SQLite state persistence
  index.ts     loopback-only local startup
```

## Domain relationships

`Customer -> Order -> Trip -> Vehicle + Driver`. `Route` holds a reusable ordered stop template. A trip copies template stops at creation. Template edits never silently change existing trips. Each assigned order adds two stops with `orderId` and pickup/delivery `kind`. Order address edits update those linked stops in place, preserving their sequence and progress metadata. Removing an order from a trip removes only its own linked stops.

`Expense` optionally references a trip and/or vehicle. Vehicle expense totals include explicit vehicle expenses and trip-linked expenses without an explicit vehicle, avoiding double counting. Revenue and received amounts come from non-cancelled orders. Currency values are integer EUR cents; weight is kg, distance is metres and duration seconds in the routing service.

`Trip` and `Order` status changes are coordinated in domain commands. Completion marks linked orders completed. Cancellation returns orders to the unassigned pool while retaining payment amounts. Assigned passenger counts are conservatively compared with whole-trip seats. Known parcel mass is `weight per item * quantity`. Unknown weights remain unknown and trigger a UI warning.

Dates use ISO calendar strings; planned datetime values use `YYYY-MM-DDTHH:mm` in Lithuania's civil time. Cross-zone stop scheduling is a future model change. Automatic numbering starts at KR-1001 and UZ-2001. Stable UUIDs are the actual relation keys.

## Storage and transactions

The `Repository` interface exposes `load()` and `save()`. `VITE_STORAGE_MODE=server` selects the local HTTP adapter, otherwise the IndexedDB adapter is selected. `.env.server` is a public non-secret build setting. No API secret belongs in a Vite variable.

UI commands clone current state, run a mutation, validate the entire schema and relationships, persist, then replace React state. Failed validation or persistence leaves current state intact. One in-memory previous snapshot supports undo through the latest notification. Undo itself is a validated persisted transaction, not a visual reversal.

IndexedDB database `krypta-tms`, object store `state`, keys `main` and `revision`. Revisions are checked within one read-write transaction to reject stale tabs. Clearing browser site data removes this database.

SQLite file `data/krypta.sqlite` contains a single versioned JSON document in `app_state`, plus an integer revision. This is a deliberate lightweight v1 persistence layer, not a normalized reporting database. Bound SQL parameters and atomic conditional UPDATE prevent SQL injection and stale writes. WAL and synchronous FULL are enabled. The same validator checks HTTP payloads and JSON backup imports.

The local HTTP server listens on 127.0.0.1 only. It validates host, Origin, content type, schema, references and payload size. `GET /api/state` returns ETag; `PUT /api/state` requires If-Match and returns 409 for stale state. There is no authentication and no network deployment claim for this server. Node's SQLite API may emit an experimental warning in Node 24.

## Maps and external services

Leaflet renders OpenStreetMap tiles with attribution. `maps.ts` contains replaceable OSRM and Photon adapters, request caches, timeouts and error handling. Photon requests are explicit user actions, rate-limited locally, not bulk geocoding. Endpoint roots can be changed in settings. Public demo services have no SLA. Their usage is intended for modest single-user demonstration; higher-volume deployment requires a contracted or self-hosted service. Address queries and coordinates leave the device when these features are used.

OSRM returns road geometry, distance and duration. No straight-line substitute is presented as a road route. Timing excludes stops, traffic and legal rest periods. Map markers represent planned stops, not GPS telemetry. Google Maps URLs are split into at most four physical visits per part with a shared boundary. Segment labels contain the actual start and end cities; latitude/longitude order, waypoints and boundaries have regression checks. The planner does not optimize stop order.

## Validation and future migration

`npm run build` checks TypeScript and produces the static build. `npm run build:local` selects the HTTP adapter. `npm test` covers related-state transitions, load limits, dates, financial semantics, invalid backups, SQLite persistence, stale writes and foreign-origin rejection. UI preview was unavailable in the managed environment; visual and mobile browser QA is still needed.

A PostgreSQL migration can keep domain types and the repository boundary while replacing snapshot persistence with normalized tables, foreign keys and per-entity commands. Add authentication, tenancy, server-side authorization, audit logs and role checks before exposing real data remotely. Introduce explicit schema migrations before changing version 1, preserve UUIDs and cents, and retain readable backup conversion paths.

Routing, telemetry, notifications and accounting should remain separate service adapters. Do not add simulated GPS, unsupported accounting guarantees or fake optimization.

## Physical visits and documents

`domain/route-plan.ts` projects adjacent stop records at the same coordinates into a physical visit. Underlying stop IDs and order references stay intact. Repeated non-adjacent visits to the same address remain distinct. The map, stop editor, Google Maps segments and PDF templates use this projection for numbering. Group movement and arrival updates operate on all underlying records. Legacy arrival marks remain visible when any of the duplicated records already recorded arrival.

Map viewport fitting uses current stop bounds, not a previous road geometry or a pending animation. Resize refitting is disabled after manual map interaction. Colliding labels receive a screen-space offset and a leader to their actual coordinates; markers do not change geographic positions.

PDF rendering is isolated in `services/pdf/documents.ts`. Templates accept typed data and fonts, and return a jsPDF document. They do not inspect the DOM, current UI tab or viewport. A4 headers, table pagination, explicit stop statuses and page footers are shared. Operational trip, passenger and parcel templates exclude monetary data. Finance has a separate report. Fonts are served from `public/fonts`; the browser loads the renderer on demand and opens the PDF from a user-initiated action.

## Content and localization boundary

Technical documents, comments, test names and development instructions are English. Current UI text is Lithuanian and is kept brief and task-specific. This locale is an initial presentation choice, not a geographic product restriction. No translation framework or additional locale is introduced in this revision. Replace regional formatting behind a configuration boundary when localization is implemented.

## Operational maps and mobile views

Phone trip lists use a card projection of the same records and filters as the desktop table, so status, departure, vehicle and load remain visible without horizontal scrolling. Payment fields are optional and collapsed by default. `Order.priceSet` is an optional backward-compatible flag: missing legacy positive prices are known, missing zero prices are unknown, and an explicit zero price can represent a free booking.

`visitTasks` projects order type, pickup/delivery direction, quantity and contacts onto a physical visit. It intentionally exposes no monetary fields. Marker HTML uses only generated numbers, fixed SVGs and enum-derived CSS classes; user content is rendered through React. The same projection drives task filtering and the selected-stop panel. Arrival writes reuse the validated context transaction, and completing a trip confirms all stops. Historical completed trips are shown as arrived without replacing their stored records.

Embedded maps disable one-finger dragging on coarse-pointer devices until the user enables control or enters full-screen mode. Full-screen mode locks page scrolling, traps keyboard focus, restores it on close and keeps controls outside the map viewport. Imagery uses the public Esri World Imagery raster endpoint with source attribution; no imagery is requested until explicitly selected. Providers may rate-limit or change availability.

`insertOrderStops` is a geographic minimum-added-distance heuristic. It evaluates pickup/delivery insertion positions while preserving the driver's existing stop order and confirmed arrival prefix, and always places pickup before delivery. It does not optimize the whole route or claim road-network distance savings. Final road geometry/distance still comes from OSRM after the sequence changes. Existing stop address edits retain their position and progress metadata.
