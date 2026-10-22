# Krypta

A transport management application for small passenger and parcel operators. It connects scheduled trips, route templates, bookings, fleet, drivers, customers and basic operational finance. The current interface locale is Lithuanian. The product and data model are not restricted to a specific country or language.

## Features

- Dashboard with live record totals, upcoming trips and distinct in-progress/today states. Phone trip lists use cards with the status and departure always visible.
- Trip creation, editing, assignment, completion and cancellation.
- Passenger and parcel bookings with related pickup/delivery stops, capacity and resource-conflict checks.
- Fleet, driver and customer registers with history and archiving.
- Reusable routes, ordered physical stops, arrival marks, Leaflet maps, road routing through OSRM and explicit address lookup through Photon.
- Google Maps directions split into named segments with a shared boundary. Map markers distinguish passengers/parcels and pickup/delivery, with optional task filters and arrival actions. A full-screen view and explicit touch-control mode avoid hijacking phone scrolling. An optional Esri imagery layer is loaded only when selected.
- A4 PDF templates: route sheet, passenger manifest, parcel manifest, operational trip sheet and financial report. Operational PDFs exclude prices and other financial values.
- Optional booking price/payment fields, revenue, received payments, expenses, period filters, CSV exports and JSON backup/restore. An unentered price is distinct from an explicitly free booking.
- Bulk assignment, payment and cancellation, plus undo for the most recent saved change.

## Requirements and quick start

Use **Node.js 24 or later**, including npm. Extract the source and run these commands from the project directory on Windows or Ubuntu.

### Local SQLite application

```sh
npm ci
npm run local
```

Open **http://localhost:4174**. This is a local address, not a publicly accessible URL. The command builds the server-mode frontend and starts the loopback-only HTTP server. Stop it with `Ctrl+C`. After the initial build, `npm run server` starts the existing build.

Records are stored in `data/krypta.sqlite`. SQLite is included in Node.js; a separate database service is not required. Node 24 may print an experimental SQLite API warning.

### Browser-local demo and frontend development

```sh
npm ci
npm run dev
```

Open **http://localhost:4173**. This mode uses IndexedDB. The hosted static demo uses the same adapter: each browser has its own records, with no cross-device synchronization.

### Other commands

```sh
npm run build        # static IndexedDB build in dist/
npm run build:local  # frontend for the local HTTP/SQLite server
npm run server       # local server, requires a previous local build
npm run dev:local    # Vite on localhost:5173 with /api proxy
npm test             # domain, navigation and SQLite API checks
npm run check:documents # sample PDF generation and pagination checks
```

For frontend development against SQLite, run `npm run server` in a second terminal before `npm run dev:local`. Both build modes write to `dist/`. Run the default build before static publication; a server-mode bundle requires its API.

## Data and backups

`src/data/seed.ts` defines the fictional sample dataset. Dates are relative to the first launch date. A new store contains two vehicles, two drivers, five customers, two routes, five trips, nine bookings and five expense entries. Existing data is never replaced on application upgrade. A small idempotent migration updates only exact legacy sample registrations, preserving custom values.

In Settings, export/import a JSON backup, restore samples or clear all operational records. SQLite and IndexedDB are separate stores; move data between them with JSON export/import. Back up a SQLite file with the server stopped by copying the entire `data` directory, including any remaining WAL files.

To start with real records, use the local SQLite mode, export a backup, clear the sample dataset, enter company details and populate customers, fleet, drivers and routes. Real remote use needs authentication and authorization first. Address searches and route coordinates are sent to the selected external map services.

### Repeatable test data

Settings lets you select an anchor date, restore the sample dataset or download
that same dataset as an importable JSON file. The sample contains an active trip
with arrival progress, planned and confirmed trips, completed history, passenger
and parcel bookings, partial payments, an unknown price and an unknown weight.
All people and businesses are fictional. Email addresses use reserved test
names and phone numbers are deliberately non-dialable.

`createSeed(date)` in `src/data/seed.ts` is the versioned source of truth. Passing
the same `YYYY-MM-DD` anchor recreates the same records, identifiers and dates;
each call returns independent objects. Application upgrades never automatically
replace records in an existing browser or SQLite store. To see a newer sample,
restore it explicitly in Settings.

For local SQLite testing, stop the server and run:

```sh
npm run data:seed -- --confirm
npm run local
```

The seed command replaces the local dataset and makes a JSON backup beside the
database in `data/backups/` first. Other useful commands:

```sh
npm run data:seed -- --date 2026-10-22 --confirm
npm run data:clear -- --confirm
npm run data:export -- --date 2026-10-22
```

Clear removes operational records and preserves company/service settings.
Export writes `tmp/demo-data.json` without changing a database; import that file
through Settings. Pass `--confirm` to overwrite an existing export. Seed and
clear accept `--db path` or `KRYPTA_DB_PATH`; export accepts `--out path`. Commands
print their actual paths. CLI backups use the same validated JSON format as UI
backups and can be restored through Settings. Refresh open tabs after CLI writes.

## PDF output

The print dropdown generates a document from the data, independently of the active tab, zoom level or screen width. PDFs open in a new tab for saving or printing. If a popup is unavailable, the file downloads instead. Embedded DejaVu Sans fonts support accented characters; their license is included under `public/fonts/`.

Route sheets include numbered physical stops and explicit arrival states. Passenger and parcel manifests include operational contact and address details. Financial information appears only in the financial report. `scripts/check-documents.ts` writes five sample documents under ignored `tmp/pdfs/` and checks multi-page output.

## Current boundaries

- Single-user scope, no authentication, roles, telemetry, notifications, accounting integrations or automatic route optimization.
- Public OSRM and Photon instances have no availability guarantee. Requests are cached, time-limited and initiated deliberately. Endpoints are configurable under Advanced settings. Higher-volume deployment needs a contracted or self-hosted service.
- Routing returns real road geometry. Failed routing never substitutes a straight-line estimate. Durations exclude stops, traffic and driver rest; heavy-vehicle restrictions are not evaluated.
- New booking stops are suggested by minimum added geographic distance while preserving the existing sequence, pickup-before-delivery order and confirmed arrival prefix. This is an insertion heuristic, not road-based optimization; dispatchers can change the sequence.
- Capacity checks are conservative for the whole trip, without reusing seats on different legs. Unknown parcel weights remain explicitly unknown.
- Revenue and received payments are separate totals. Payments are cumulative booking values attributed to the journey date, not a transaction ledger. Estimated result is revenue minus recorded expenses, not accounting profit. There are no official invoices or tax documents.
- Planned times currently use the configured Europe/Vilnius civil-time convention. Per-stop time zones and a multilingual interface are future work.
- Revisions reject stale writes from another tab. There is no collaborative synchronization.
- Browser preview infrastructure was unavailable in the development environment. TypeScript, domain/API checks and generated PDF rendering were checked; live desktop/mobile browser QA remains a separate check.

The provisional display identity is in `src/config.ts`. Keep storage IDs stable when renaming. Technical documentation, comments and test names are English; UI copy is factual, brief and localized. See [architecture](docs/ARCHITECTURE.md), [vision](docs/VISION.md) and [agent guidance](AGENTS.md).

## Repository and development

The repository name can remain independent of the display name. Node.js 24 is
declared in `.nvmrc`; editor and Git settings keep UTF-8 text and line endings
consistent on Windows and Ubuntu. GitHub Actions runs tests, both build modes and
PDF generation on pushes and pull requests. See [contributing](CONTRIBUTING.md).

Runtime databases, backups, dependencies, local environment overrides, build
output and hosting metadata are excluded from a clean GitHub import. Fictional
seed data and font assets are included. `.env.server` is tracked public build
configuration, not a place for credentials. `KRYPTA_PORT` and `KRYPTA_DB_PATH` may
be set in the local shell when running the server; its listener remains on
loopback.

No project license has been selected. Publishing the source does not grant an
open-source license. The bundled fonts retain their own license.
