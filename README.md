# Krypta

Transport management for small passenger and parcel operators. Trips, bookings, physical stops, fleet, drivers, customers, notifications and trip finances share one validated operational model. The interface is Lithuanian; code and documentation are English.

## Development

Use Node.js 24 and npm. Each cloud task has its own isolated environment; use the existing checkout without creating a worktree.

```sh
npm ci
npm run dev
```

This starts the complete browser demo on port 4173. `npm run build` produces the same demo for static hosting, without requiring an API. All implemented screens are available: companies and modules, company users and role workspaces, profile/password/session flows, order photos, reminders, freight opportunities and external search, notifications and finance. These are device-local test workflows, not production authentication or shared storage.

Demo accounts, with empty login fields:

| Role | Username | Password |
| --- | --- | --- |
| Company administrator | `admin` | `admin` |
| Platform owner | `owner` | `owner` |
| Dispatcher | `dispatcher` | `admin` |
| First active driver | `driver` | `admin` |

Other initial company users can sign in with their email and `admin`. New users and companies use the passwords explicitly entered in their forms. Changing a demo password persists it and revokes that account's demo sessions. The short initial credentials exist only in the demo adapter; the Node server has no default credentials.

The demo uses `krypta-demo` IndexedDB and a tab-local session. On first launch it copies the existing `krypta-design-review` workspace, preserving edited records and enabling all implemented modules. It never overwrites the original store or reseeds an existing demo. Photos are stored as browser-local blobs and remain after reload. Data does not synchronize between devices. Company roles/module rules are exercised through the existing domain commands, but client checks are not a security boundary. Use fictional data.

The earlier minimal browser mode remains available with `npm run dev:browser` and `npm run build:browser`. Both modes preserve `krypta-appearance`. On Windows or Ubuntu, install Node.js 24 and run the same npm commands; no database setup is needed for the demo.

## Shared Sites test deployment

`npm run build:sites` creates a Worker API plus the complete server-connected frontend. It uses Sites D1 for shared account/workspace snapshots and session verifiers, and private R2 for photos. It is an additional hosting adapter; the Node/SQLite installation remains available unchanged. Sites provisions bindings named `DB` and `BUCKET` through the deployment-only hosting manifest. A clean source checkout can build the frontend and Worker without that manifest; deployment metadata is included only when Sites supplies `.openai/hosting.json`. Schema migrations are in `drizzle/`.

Required hosted secrets are `KRYPTA_INITIAL_PASSWORD` (a unique random bootstrap password of at least 24 characters), `KRYPTA_SETUP_TOKEN` (a random one-time setup secret) and `KRYPTA_SETUP_EXPIRES` (expiry as Unix milliseconds). Store them in Sites runtime secrets, never source files. Open the site's `/#setup=<token>` link once to choose the owner email/name/password. Setup replaces the random initial passwords, invalidates existing sessions and cannot run again after its durable claim flag is set. The owner and initial company accounts share that chosen password for testing; set separate passwords before broader use. No public `admin/admin` or `owner/owner` login is created by this adapter.

The shared test reuses the domain command dispatcher on the server, with server-owned company/role data. Authentication uses random HttpOnly/Secure/SameSite cookies backed by hashed tokens, an 8-hour absolute/30-minute idle lifetime, same-origin/CSRF checks, persisted login throttling and an audit trail. Password verifiers use Web Crypto PBKDF2-SHA256 with 100,000 iterations for this test adapter, rather than the Node runtime's scrypt. This is a shared evaluation deployment, not a claim of equivalent independent security review or production hardening.

Phone/desktop clients read the same shared records when refreshed. Confirmed sample reset saves the preceding operational snapshot and removes attached photos, reminders and saved freight opportunities. Clear additionally deletes that company's retained operational backups and leaves an empty dashboard, keeping company settings and registered accounts. Driver accounts disabled only by a clear action can be restored with the sample driver records. The adapter retains the most recent ten operational backups per company. Its single shared JSON row has a 1.8 MB bound, appropriate for small test fixtures; normalize tables before larger datasets. R2 writes and D1 metadata are coordinated with cleanup, but they are not a cross-service transaction. Full database/object-store backup and retention operations remain a hosting responsibility.

The frontend login may be reachable without ChatGPT sign-in when the owner explicitly makes the Sites audience public. Application API data and private photo retrieval still require a Krypta session. Never remove the Sites gate before verifying those controls. A shorter Sites slug changes the URL label, not an independently owned domain.

## Shared server application

### Windows 10/11 quick setup

Open ordinary Windows PowerShell and run:

```powershell
$setup = Join-Path $env:TEMP ('krypta-setup-' + [guid]::NewGuid().ToString('N') + '.ps1')
Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/tomas-bar/transport-management-system/main/setup-windows.ps1' -OutFile $setup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $setup
```

The launcher clones `main` into `C:\Projects\Krypta`, installs Git through WinGet if missing, downloads the latest Node.js 24 Windows ZIP from nodejs.org with SHA-256 verification, runs `npm ci` and `npm run build:server`, prompts for a new local owner email/password and starts the app. Node/npm live under `%LOCALAPPDATA%\Krypta\tools`; existing system Node installations and permanent execution policies are unchanged. Approve the Git installer if Windows asks. If WinGet is unavailable, setup tries App Installer registration and otherwise stops with the official installation link. It retries downloads three times and stops on other failures; it does not discard source, reset data or switch to demo mode. Use `-InstallPath "$env:USERPROFILE\Projects\Krypta"` for a user-writable alternative directory. Existing source directories must be this repository's Git checkout.

Open **http://127.0.0.1:4174** using that exact address and sign in with the local credentials. They are separate from the hosted Krypta account and data. Create a company and its administrator; companies begin empty. Restore fictional samples explicitly in Settings when desired. SQLite is included in Node; no separate database installation is needed. Passwords are entered masked, confirmed and sent through UTF-8 stdin, never saved as a password file or passed as process arguments. The launcher binds only to this computer and uses `data/server.sqlite` inside its checkout, regardless of inherited server environment variables.

Keep the terminal open; stop with `Ctrl+C`. Later, double-click `C:\Projects\Krypta\start-krypta.cmd`, or run it from the console. This starts the existing server build without downloads or rebuilding. The launcher refuses to start a frontend overwritten by another build mode. To update explicitly, stop the server and run:

```powershell
cd C:\Projects\Krypta
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\setup-windows.ps1 -Update
```

Updates require clean source on `main`, fetch from GitHub and fast-forward only; local source changes, unpublished commits and divergent history stop the update. Setup also stops if port 4174 is already occupied, without terminating any process. Accounts, operational data and photos are not cleared or reseeded. Normal database migrations still run when the server starts. Before updating valuable records, stop the server and copy the entire private `data` directory to a protected backup. Do not commit or share it. This is a foreground local installation, not an automatic Windows service or phone-accessible deployment. Windows execution was not available in the implementation environment; validate the launcher on a Windows machine before relying on unattended installation.

### Manual setup

```sh
npm ci
npm run build:server
npm run account:owner -- owner@example.com < /private/path/owner-password.txt
npm run server
```

The password file must contain a unique password of at least 8 characters, protected from other users. The bootstrap command reads stdin and never logs the password; remove the temporary file securely after provisioning. It creates one platform owner and refuses to overwrite an existing owner. Never put passwords in Git, shell arguments, `VITE_*` variables or documentation. No default server account is created.

The local server listens on loopback port 4174 and stores records in `data/server.sqlite`. Open it locally, sign in with the owner email/password, create a company, select modules and create its administrator. The company administrator is labelled Įmonės vadovas in the interface and creates dispatchers and drivers under Users, with separate passwords. Driver accounts require a linked driver record; expense entry and payment collection are separate permissions. The platform owner can list company users and explicitly enter their workspace. Company administrators can enter users from their own company only. Preview defaults to read-only; an in-app confirmation enables operational actions under the selected user's permissions. The server audit retains the real account and effective user. Profile/password, user credentials and backup restore remain unavailable while acting as another user. Return navigation restores the original owner or administrator.

For frontend development against the API, run the server with `KRYPTA_PUBLIC_ORIGIN=http://127.0.0.1:5173`, then run `npm run dev:server` on port 5173 in another terminal. All frontend build modes write to `dist/`; rebuild for the intended mode before starting or publishing it. The server application never falls back to prototype authentication if the API is unavailable. Other devices load shared changes when refreshed; stale writes are rejected. No live push transport is implemented.

Configuration variables are documented in [.env.example](.env.example). The server reads `KRYPTA_PUBLIC_ORIGIN`, `KRYPTA_HOST`, `KRYPTA_PORT`, `KRYPTA_DB_PATH` and `NODE_ENV` from its process. No new environment variables or external API keys are required for the current freight tools. No runtime application secret is required: passwords are provisioned into the private database, and sessions use random server-generated tokens. Production requires HTTPS, a reverse proxy and persistent private SQLite storage. See [security and deployment](docs/SECURITY.md). Static hosting alone cannot run the shared backend. Sites supports the static demo. The current Node/SQLite server requires a compatible Node host; it is not deployed by uploading the static bundle.

## Optional modules

Companies can enable finance, private order photos, vehicle reminders and freight opportunities and external search. Operations is the shared prerequisite; permissions are checked separately from module availability. Turning a module off retains its history. Photos support phone capture/upload, private enlarged viewing and explicit deletion. Reminders use user-entered dates and appear in the day plan when relevant vehicles are scheduled. No legal expiry interval is invented.

Trip timelines distinguish arrival with pending work from fully confirmed stops. On phones, manager stop controls expand under each stop through Veiksmai, leaving addresses and task details full width. Manager and driver task rows share pickup/delivery labels, order names and separate parcel recipient details. Driver cards show specific outcomes and guarded corrections; photos have a separate manager tab and a collapsible driver section. The day plan includes ongoing multi-day trips and concrete unresolved actions for the selected date.

New trips begin as drafts, with optional vehicle/driver selection. Drafts do not reserve resources, appear in driver workspaces or send notifications. Publishing validates resources, scheduling and load before exposing the assignment. Draft quotations are excluded from aggregate finance reports, and payments/expenses require publication. Repeat Trip also defaults to a draft.

For retrospective entry, choose Historical Trip or Historical Order in the new-record form. Historical trips are completed records with past dates and known resources; managers can append new completed orders and dated expenses without operational notifications. Existing route records and completed order links remain protected. Entered cumulative paid amounts remain historical balances, not invented receipts or transactions. Historical backfill stays outside driver workspaces and driver photo access.

Managers can register delivery progress in one trip summary, save a partial result, or close the trip after confirming every delivery. These are retrospective manager confirmations, with their author and registration time, not invented driver arrival times. Closing a trip never changes payments. Repeat Trip copies the route/resources and only selected bookings to new dates; prices are optional and all new paid amounts are zero. Expenses, receipts and execution history stay on the original trip. Resource and load validation apply to the new trip.

Notifications state the actual trip outcome and show current status and driver in the group header. Expandable history shows individual read/unread labels. Opening a group keeps events unread until an explicit event, group or all-event action; read state remains personal. The bell opens a modal with a dimmed backdrop. A transaction-date payment journal records receipts and reversals separately from the established booking-date aggregate reports; historical paid totals are never converted into invented transactions.

Freight discovery prepares external web searches using a selected trip's cities/date and optional source domain. Saved opportunities contain addresses, shipment weight/dimensions, price, contact, negotiation status and a trip reference, with date/status/text filters and stale-edit protection. Their route comparison reuses OSRM to compare the existing route with a geographic insertion suggestion. Additional-cost estimates require entered vehicle/labor rates, handling time and other expenses; they are not market prices or full business profit. Fixed Lithuanian/German/English contact drafts can be copied manually. There is no live exchange feed or AI integration. See [verified access findings and limitations](docs/FREIGHT_SOURCES.md).

Company Settings provides independent trip and order prefixes and numbering starting points, with the next reference preview. Existing references are preserved. The company manager can edit individual references in their forms, including historical records; internal IDs and links never change. New or edited references must be unique within that company and record type. Existing legacy formats stay readable. Prefix digits are separate from the numeric suffix.

## Data, accounts and backups

Settings exports JSON operational/workspace backups. JSON restore and sample reset retain the previous snapshot, keep registered identities and their permissions, and increment the company revision. The explicitly confirmed Clear action instead deletes company operations, photos, reminders, freight opportunities and retained operational backups. It keeps company settings and accounts; other companies are unaffected. Administrators can retrieve prior snapshots through `GET /api/backups` and `GET /api/backups/:id` using their authenticated session. Passwords and sessions are never restored from JSON. Optional module tables and photos require an operator-level full database backup; the Settings JSON is an operational/workspace backup.

The fictional fleet contains two Sprinters and one Caddy. New companies start with empty operations and no fictional contact information. To create deterministic fictional operations, select an anchor date in Settings and explicitly restore samples. Clear removes operational data and keeps company settings and administrator access. Imported sample user memberships have no login password until an administrator sets one under Users. Existing data is never reset on startup or deployment. Browser records must be exported and explicitly imported into the selected server company. The browser demo uses the same clear/sample-reset behavior; its JSON backups exclude photos and credentials.

Clear and sample reset use the revision-checked `POST /api/company-data/reset` route with an explicit confirmation. The effective user must be a company administrator. An owner acting as that administrator can use these controls; read-only previews, dispatchers and drivers cannot. Settings offers entry into acting mode when viewing the company read-only. Arbitrary JSON restore and credential changes remain blocked during acting mode.

Private photos are excluded from JSON. Before replacing server operations when photos exist, make a full SQLite backup and explicitly delete the photos; otherwise restore is refused to prevent attaching old photos to reused order IDs. For a complete backup, stop the server and copy the private database directory including any WAL files. Test restoration. Never share a database backup as a source archive.

The retained `data:seed` and `data:clear` CLI commands target the old reference SQLite adapter, not shared company workspaces. `data:export` generates operational fixtures that can be explicitly imported through Settings.

## Checks

```sh
npm test
# Focused static-demo workflow checks:
node --experimental-strip-types --test tests/demo.test.ts
npm run check:server
npx tsc -p tsconfig.edge.json
npm run build
npm run check:documents
npm run build:server
npm run build:sites
```

Tests cover domain integrity, driver commands, finance, session security, CSRF, company boundaries, module restrictions, optimistic concurrency, private uploads and backup protection. PDF generation checks pagination and bundled fonts. Run desktop and phone browser checks when a browser is available and state whether they ran locally or against a deployed site.

## Boundaries

Amounts use integer EUR cents. Unknown prices and weights retain their meaning. Receipt entries record new payments; legacy aggregate reports still attribute cumulative paid values to booking dates. No accounting ledger migration is implied.

No email transport, password recovery email, MFA, billing, GPS or automatic route optimization is implemented. Map services have availability and usage limits. The initial shared runtime uses one Node process and SQLite, with operational snapshots rather than fully normalized business tables. Production proxy configuration, backup operations and independent security review remain deployment requirements.

The product name is provisional. No project license has been selected. Preserve bundled font and map notices. See [architecture](docs/ARCHITECTURE.md). This is an owner-maintained project; the development and verification instructions above apply to local and cloud work.
