# Architecture

## Runtimes

React 19, TypeScript and Vite provide the common Lithuanian interface, with Lucide, Leaflet, idb and jsPDF. The operational model and commands are shared across runtimes.

| Runtime | Commands | Persistence and identity |
| --- | --- | --- |
| Complete static demo | `npm run dev`, `npm run build` | Browser IndexedDB, demo accounts and tab-local sessions; all implemented modules |
| Minimal browser prototype | `npm run dev:browser`, `npm run build:browser` | Original `krypta-design-review` workspace and prototype login |
| Shared server | `npm run build:server`, `npm run server` | Node.js 24, private SQLite and cookie authentication |

`VITE_RUNTIME=demo` selects `src/services/demo`, while `VITE_RUNTIME=server` selects the same-origin API. Both use `ServerProvider` for the full workspace UI. The server runtime never falls back to a browser adapter when its API is unavailable. `server/app.ts` remains reference code, not the shared runtime.

## Model and commands

- `src/domain/models.ts` defines the versioned operational schema.
- `logic.ts` validates assignments, capacity, financial values and resource conflicts.
- `workspace.ts` defines company membership, notifications, permissions and driver commands.
- `commands.ts` applies typed mutations, company/module rules and restore compatibility.
- `projection.ts` reduces driver responses to assigned operations and permitted financial records.
- `modules.ts` defines optional modules and their prerequisites, independently of permissions.

The established relationship is `Customer -> Order -> Trip -> Driver + Vehicle`. Operational data and workspace events form one validated `ReviewSnapshot`, with optimistic revision checks. Money uses integer EUR cents; unknown prices/weights remain unknown. Completed orders and confirmed handovers protect route/load fields from incompatible edits. Optional company numbering settings default compatibly to KR-/1001 and UZ-/2001. `references.ts` allocates within each company snapshot and validates changed/new references without rewriting legacy values; only the company manager can renumber records. Display references remain separate from stable internal IDs.

`trip-progress.ts` projects arrival, task completion and next work consistently for route strips, driver cards, manager stops and overview cards. `day-plan.ts` includes multi-day trips and date-scoped unresolved work. These projections never write or invent confirmation timestamps. Physical visits group adjacent stops at the same coordinates while retaining order references. Arrival and handover remain distinct. A next-visit pickup/delivery can record arrival atomically, delivery requires pickup, and corrections preserve dependencies. Trip completion requires all visits and active orders to be completed. Driver actions are limited to explicitly permitted actions on assigned work.

Manager delivery summaries use typed `reviewTrip` commands and optional `workspace.tripReviews`. They record manager-source pickup/delivery confirmations without fabricating arrival events. Partial summaries leave unresolved work active; final closure requires all deliveries. Typed `repeatTrip` commands generate new booking/stop identities, reset execution and payments, optionally retain quoted prices, and pass the existing scheduling/load validators. These commands are shared by all adapters.

Optional `Trip.recordMode` distinguishes drafts and retrospective historical records; absent values retain the established published behavior. Optional historical order metadata preserves backward-compatible version-1 snapshots without rewriting saved stores. `record-mode.ts` guards publication and immutable modes. Drafts may omit resources, do not reserve them, and must pass the normal scheduling/load checks when published. Driver projections, commands and private photo APIs exclude drafts and retrospective backfill. Publication creates one trip assignment event rather than an event for every draft order. Historical trips are completed, accept append-only new order stops and dated expenses, and suppress operational notifications. Backfill never creates driver arrival timestamps or payment receipts. Draft quotations are excluded from aggregate financial screens and PDFs; draft payments and expenses are rejected.

## Complete browser demo

`src/services/demo/api.ts` implements the existing UI request contract with device-local data. It uses the same domain commands, module checks and driver projection as the server. Companies, memberships, test credential verifiers, sessions, optional records and snapshots reside in `krypta-demo` IndexedDB. Photo blobs occupy a separate object store and are saved atomically with their metadata. A global generation rejects competing writes; company revisions reject stale operational commands.

First initialization copies the original browser workspace without altering it. All available modules are enabled for that initial company. Later deployments do not reseed edited stores. The platform owner creates companies and administrators; each company retains separate operations. Newly created companies begin empty and can explicitly restore deterministic sample operations under Settings. Restore retains registered memberships, saves the previous snapshot and does not invent passwords for imported memberships. JSON exports omit credentials and photo bytes; restore is refused while photos exist to avoid attaching old images to reused order IDs.

Profile, password change, session revocation, company/module administration, reminders, freight notes and photo workflows can all be exercised without an API. Photo input is limited, decoded, resized and re-encoded through the browser; viewing uses temporary blob URLs. These flows simulate product behavior. Browser-only identity and company checks are not a production trust boundary and do not synchronize devices. Initial credentials are documented in README, never prefilled or listed in the product.

The earlier browser prototype retains its original adapter and store. Appearance uses the shared `krypta-appearance` preference.

## Shared server

`server/application.ts` serves the API and server-mode frontend at one origin. `server/store.ts` migrates SQLite tables for companies, accounts, sessions, audit, backups, attachments and optional modules. Operations remain versioned company snapshots rather than fully normalized tables. Identity comes from authenticated sessions, not client company/role claims. Membership, snapshot, revision and audit writes commit together.

Sessions use HttpOnly cookies and an in-memory CSRF token. Company access, role permissions, enabled modules and driver assignments are checked on the server. Platform ownership does not implicitly grant company-operation access. Owner/company-administrator preview is read-only by default. Explicit acting mode permits operational actions under the selected user's permissions, records both identities in server audit and preserves return navigation. Owner company user lists expose no credentials. Private photos are re-encoded JPEG derivatives retrieved through authenticated access checks. Exact controls and deployment requirements are in `SECURITY.md`.

The existing Node/SQLite runtime needs an appropriate persistent Node host. Sites can host the complete static demo; deploying that bundle does not start the shared server. Browser records move to the shared runtime only through explicit export/import.

## Notifications and optional modules

`notificationChanges` derives concise assignment, trip-outcome, delivery and finance events. Actor IDs remain in event data. Group projections show current trip state and avoid repeating header context. Opening or expanding notifications never changes read state. Explicit per-event, group or all-event controls mark captured IDs read for the effective recipient only; later events retain their unread state. The bell opens a dimmed modal with keyboard focus trapping and return. Operations and resulting notifications are committed together. No email transport or live push transport is implemented.

Finance commands preserve receipt/reversal history, integer cents, actor attribution and payment limits. `payment-report.ts` reports transaction dates for new receipts/reversals; older cumulative paid values keep their booking-date reporting convention. Historical totals are never converted into invented payments.

Order photos, vehicle reminders and manually saved HTTPS freight opportunities are independent optional records, retained when their modules are disabled. Date-based vehicle reminders supplement existing scheduling/capacity checks. Freight opportunities retain structured contact, location, price and negotiation details, with per-record revision checks. SQL migration 3 preserves legacy notes/links. External search is a normal generated web-search URL; road comparison and additional-cost estimates live in `domain/freight.ts` and `components/FreightReview.tsx`. See `FREIGHT_SOURCES.md` for source access and calculation limits.

## Appearance and documents

The shared appearance service persists light/dark mode. Semantic surfaces, text and status colors live in `src/styles/appearance.css`. PDF options use the company print preference and remain independent of UI theme and viewport.

PDF templates are data-driven A4 documents. Operational documents exclude finance. Printable maps use real OSRM geometry and bundled Natural Earth country/city data, preserving geographic aspect ratio and fitting the whole route. Bundled source/asset terms are documented with the assets. Standard OpenStreetMap community tiles are not fetched for offline print export. Routing failure is reported, with the ordinary route sheet still available. Existing PDF rendering checks cover pagination and fonts.
