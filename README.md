# Krypta

Transport management for small passenger and parcel operators. Trips, bookings, physical stops, fleet, drivers, customers, notifications and trip finances share one validated operational model. The interface is Lithuanian; code and documentation are English.

## Development

Use Node.js 24 and npm. Each cloud task has its own isolated environment; use the existing checkout without creating a worktree.

```sh
npm ci
npm run dev
```

This starts the browser-local application on port 4173. Its prototype account is `admin / admin`; login fields are empty. The existing `krypta-design-review` IndexedDB and `krypta-appearance` preference are preserved. This mode is suitable for fictional data and static previews. It does not provide secure authentication, company isolation or device synchronization.

## Shared server application

```sh
npm ci
npm run build:server
npm run account:owner -- owner@example.com < /private/path/owner-password.txt
npm run server
```

The password file must contain a unique password of at least 15 characters, protected from other users. The bootstrap command reads stdin and never logs the password; remove the temporary file securely after provisioning. It creates one platform owner and refuses to overwrite an existing owner. Never put passwords in Git, shell arguments, `VITE_*` variables or documentation. No default server account is created.

The local server listens on loopback port 4174 and stores records in `data/server.sqlite`. Open it locally, sign in with the owner email/password, create a company, select modules and create its administrator. The administrator creates dispatchers and drivers under Users, with separate passwords. Driver accounts require a linked driver record; expense entry and payment collection are separate permissions. Administrators can preview another workspace in an audited, read-only session.

For frontend development against the API, run the server with `KRYPTA_PUBLIC_ORIGIN=http://127.0.0.1:4173`, then run `npm run dev:server` in another terminal. Both production build modes write to `dist/`; rebuild for the intended mode before starting or publishing it. The server application never falls back to prototype authentication if the API is unavailable.

Configuration variables are documented in [.env.example](.env.example). The server reads `KRYPTA_PUBLIC_ORIGIN`, `KRYPTA_HOST`, `KRYPTA_PORT`, `KRYPTA_DB_PATH` and `NODE_ENV` from its process. No external API key or runtime application secret is required: passwords are provisioned into the private database, and sessions use random server-generated tokens. Production requires HTTPS, a reverse proxy and persistent private SQLite storage. See [security and deployment](docs/SECURITY.md). Static hosting alone cannot run the shared backend. Sites backend support and deployment are not verified here.

## Data, accounts and backups

Settings exports JSON operational/workspace backups. Restoring or clearing server data first retains the previous snapshot, keeps registered identities and their permissions, and increments the company revision. Administrators can retrieve prior snapshots through `GET /api/backups` and `GET /api/backups/:id` using their authenticated session. Passwords and sessions are never restored from JSON.

To create deterministic fictional operations, select an anchor date in Settings and explicitly restore samples. Clear removes operational data and keeps company settings and administrator access. Imported sample user memberships have no login password until an administrator sets one under Users. Existing data is never reset on startup or deployment. Browser records must be exported and explicitly imported into the selected server company.

Private photos are excluded from JSON. Before replacing server operations when photos exist, make a full SQLite backup and explicitly delete the photos; otherwise restore is refused to prevent attaching old photos to reused order IDs. For a complete backup, stop the server and copy the private database directory including any WAL files. Test restoration. Never share a database backup as a source archive.

The retained `data:seed` and `data:clear` CLI commands target the old reference SQLite adapter, not shared company workspaces. `data:export` generates operational fixtures that can be explicitly imported through Settings.

## Checks

```sh
npm test
npm run check:server
npm run build
npm run check:documents
npm run build:server
```

Tests cover domain integrity, driver commands, finance, session security, CSRF, company boundaries, module restrictions, optimistic concurrency, private uploads and backup protection. PDF generation checks pagination and bundled fonts. Run desktop and phone browser checks when a browser is available and state whether they ran locally or against a deployed site.

## Boundaries

Amounts use integer EUR cents. Unknown prices and weights retain their meaning. Receipt entries record new payments; legacy aggregate reports still attribute cumulative paid values to booking dates. No accounting ledger migration is implied.

No email transport, password recovery email, MFA, billing, GPS or automatic route optimization is implemented. Map services have availability and usage limits. The initial shared runtime uses one Node process and SQLite, with operational snapshots rather than fully normalized business tables. Production proxy configuration, backup operations and independent security review remain deployment requirements.

The product name is provisional. No project license has been selected. Preserve bundled font and map notices. See [architecture](docs/ARCHITECTURE.md) and [development guidance](CONTRIBUTING.md).
