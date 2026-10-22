# Krypta

Transport management for small passenger and parcel operators. The application connects bookings, trips, route stops, vehicles, drivers, customers and trip finances in one operational workspace.

## Run

Use Node.js 24 or later on Windows or Ubuntu.

```sh
npm ci
npm run dev
```

Open http://localhost:4173. `npm run build` produces the static application in `dist/`.

## Features

- Day planning, trip lifecycle, passenger and parcel bookings, capacity and scheduling checks.
- Reusable routes, address lookup, interactive road maps and Google Maps navigation.
- Fleet, driver and customer registries with linked operational history.
- Company administrator, dispatcher and driver workspaces. Administrators can preview a user's workspace.
- Driver arrivals, pickup/delivery confirmations, corrections and trip completion.
- Recipient-specific notifications grouped by trip.
- Trip expenses, optional driver payment collection, partial payments and reversible receipt entries.
- Period finance reports, CSV exports and independent A4 PDF templates with contextual route maps.
- Responsive desktop/mobile layouts and persistent light/dark appearance.
- Validated, atomic browser persistence, revision checks, full JSON backups and explicit sample resets.

## Accounts and data

The current browser-local version uses **admin / admin**. These sessions are a prototype, not server authentication. Do not use real customer records in a public deployment.

Fixtures live in `src/data/seed.ts`; associated accounts are created in `src/domain/workspace.ts`. Contacts are fictional. Settings can restore a repeatable sample dataset for a selected date or clear operational data. Export a full backup before replacing edited records. The browser database is `krypta-design-review`; records do not synchronize between devices. Appearance is stored separately.

Driver payment collection is enabled in Users by editing the driver's permissions. The driver sees assigned trips and their own financial entries, not company reporting.

## Checks

```sh
npm test
npm run build
npm run check:documents
```

## Limits

Authentication, shared server persistence, tenant isolation, email delivery, GPS and automatic route optimization are not part of this version. The retained Node/SQLite adapter is reference code and is not connected to workspace sessions. Map providers have availability limits; failed routing never substitutes invented road distances. Coordinates and addresses are sent to the selected map services.

Amounts use integer EUR cents. Receipts record new payment entries; older cumulative paid values remain supported. Aggregate financial reports attribute cumulative payments to the booking date. Bank reconciliation, taxes and official accounting documents are outside scope.

Code and documentation are English; the current interface is Lithuanian. See [architecture](docs/ARCHITECTURE.md), [product vision](docs/VISION.md) and [development guidance](CONTRIBUTING.md). The product name is provisional. No project license has been selected; bundled assets retain their own notices.
