# Architecture

## Runtime and boundaries

React 19, TypeScript and Vite, with Lucide, Leaflet, idb and jsPDF. The default build remains a browser-local application. The explicit server build uses `server/application.ts` through `ServerProvider`; it does not trust browser sessions or workspace role claims. The old `server/app.ts` is a reference adapter only.

- `src/domain/models.ts`: established operational database schema and entity types.
- `src/domain/logic.ts`: validation, assignment, capacity, resource scheduling and financial rules.
- `src/domain/workspace.ts`: roles, page permissions, company users, notification events, handover confirmations and typed driver commands.
- `src/services/review-repository.ts`: atomic operational + workspace snapshot in a dedicated IndexedDB namespace, with optimistic revision checks.
- `src/context.tsx`: current session, guarded mutations, snapshot persistence, notifications and review impersonation.
- `src/pages`: role-aware composition, including Login, WorkspaceUsers, Notifications and DriverWorkspace.
- `src/components/Journey.tsx`: physical stop progress projection shared across director/dispatcher/driver views.
- `src/styles/review.css`: review theme and role-specific layouts, loaded after the retained component styles.

## Data and commands

The operational `Database` remains version 1, so existing operational JSON exports stay compatible. A separate versioned `Workspace` contains company users, notification preferences, recipient-scoped notifications and task confirmations. The repository stores both as one `ReviewSnapshot` in a single IndexedDB transaction. Validation precedes writes. A revision mismatch rejects a stale write from another tab.

Existing domain relationships remain `Customer -> Order -> Trip -> Driver + Vehicle`. Route templates are copied into trips. Physical visits group adjacent stops at the same coordinates without dropping order references. Driver commands use this same visit projection.

Each task confirmation records trip, order, pickup/delivery kind, actor and timestamp. Arrival and handover remain distinct facts. A task at the next visit records arrival and handover atomically; explicit arrival remains available. Delivery requires a previous pickup confirmation. Undo commands preserve delivery dependencies, record correction events and can reverse implicit arrival only when no later visit or other task depends on it. Completion requires all visits and non-cancelled orders to be complete. Generic operational mutations are rejected for drivers. Orders with handover confirmations cannot silently change trip or addresses.

Administrator and dispatcher pages use existing validated commands. Only administrators may change company settings or users. Driver commands verify the actor's company, active state, role and trip assignment before mutation. Page guards and navigation use the same permission function. No frontend guard is represented as a production security boundary.

## Notifications

`notificationChanges` derives assignment, trip state, delivery and financial events from committed snapshots. Driver arrival, pickup and correction commands add their own events. `groupNotifications` projects recipient-specific history into trip groups without replacing individual notification records. Expanding a group marks only its captured event IDs read, so a newly arriving event remains unread. Another recipient’s read state is never modified. Recipients are relevant active company managers and the assigned driver; an actor is not notified about their own generic change. In-app preferences suppress new deliveries, not existing history. Read state belongs to the recipient. Operational data and resulting notification records commit atomically.

The current adapter stores notifications locally. A server implementation can persist domain events and use an outbox to deliver in-app/email notifications. Email transport, queues and delivery claims are intentionally absent from this review.

## Session adapter

Prototype sessions use sessionStorage; administrators can select an active sample user for role preview from inside the workspace. `admin / admin` is a deliberate review credential, not a password system. Admin impersonation records the administrator to return to and applies the selected user's permissions during preview. Sessions are not a source of trust outside the prototype.

The explicit server build uses `ServerProvider` and the same-origin API for authentication and mutations. The browser adapter remains a separate prototype fallback, never an authentication fallback inside server mode.

## Compatibility and resets

Full review backups contain `{db, workspace}`; operational-only legacy backups remain accepted. Restore validates both parts and retains a valid active administrator. Reseed/clear is explicit, replaces the workspace fixtures and removes obsolete task events. The established app's IndexedDB key and hosting identity are not touched.

To migrate beyond snapshots, normalize users, companies, trips, bookings, stops, task events and notification deliveries with foreign keys. Introduce explicit schema migrations and preserve record IDs. Add server concurrency, authentication and authorization before moving real records into a remotely accessible deployment.

## Printing

The optional `Workspace.printMode` defaults to monochrome for older stores. Each document has its own print options; styles are not mutable global state. Company defaults can be overridden in an individual print menu. Finance templates filter by the selected date interval and distinguish expenses-only and received-payment output. Payments remain cumulative order values attributed to the order date, not a transaction ledger.

The optional printed map consumes real OSRM geometry and bundled, metadata-trimmed Natural Earth 1:50m country/city data. It preserves geographic aspect ratio, adds contextual padding, clips country shapes to the print frame and fits all route points. No standard OpenStreetMap community tiles are fetched for print/offline export. Source and public-domain terms are documented in `public/maps/NOTICE.md`. If routing fails, the document action reports an error; the standard route sheet without a diagram remains available. PDF pages are rendered for visual QA independently of browser preview availability.

## Appearance and trip finance

`useAppearance` persists the light/dark choice in localStorage under `krypta-appearance`. Semantic surface/text/status overrides live in `src/styles/appearance.css`. An early document theme assignment avoids a light flash. PDF options use the company print default, never the UI theme.

`src/domain/trip-finance.ts` defines guarded expense/receipt/void commands. Driver expense entry and payment collection are separate optional capabilities. Legacy driver records default to expense entry enabled, collection disabled. Managers retain trip-finance access. All commands verify the company, active user and trip access; driver actions are limited to assigned trips.

Receipts are optional workspace records with integer cents, method, actor, date, creation time and void metadata. Active receipt sums cannot exceed the order's cumulative paid value. Generic corrections that would make paid lower than the receipt total are rejected. A void preserves history and deducts the exact receipt amount. Receipt trip references remain historical if an order is subsequently unassigned or moved. Driver voids are constrained to their own receipts and the currently assigned order; managers can correct historical records.

Expense entries use the established Database collection, so fleet/trip totals and reports update together. Optional submission metadata records who entered them. Restoring an old backup remains valid. The receipt journal covers new entries only; legacy paid totals and period reports retain their documented booking-date convention until a ledger migration is implemented.

The application can eventually be deployed as a dedicated installation on a company subdomain, independently of that company's public website. The shared server build provides the initial authentication and persistence boundary; a production deployment still requires the HTTPS and persistent-storage operations documented in `SECURITY.md`.

## Shared server runtime

`server/store.ts` migrates private SQLite storage with foreign-key scoped companies, accounts, sessions, audit, backup, attachment and optional module tables. Operational data stays a versioned company snapshot rather than normalized business tables. Every write verifies its revision and applies `src/domain/commands.ts` on the server. Actors come from authenticated accounts, and driver responses are reduced to assigned work and permitted financial entries. Identity and membership writes commit together.

`ServerProvider` uses a same-origin API and an in-memory CSRF token; authentication uses an HttpOnly cookie. Existing IndexedDB is never migrated implicitly. The platform owner creates companies and administrators, with no implicit company data access. Module configuration belongs to the company and is checked separately from user permissions. Disabling a module preserves its data. Administrator preview is read-only and audited. See `docs/SECURITY.md` for exact controls, sources and deployment requirements.

## Operational modules

Company module configuration is persisted separately from membership permissions. `terminology.ts` centralizes new shared payment, photo and trip-outcome terminology without changing stored identifiers. Notification projections display current group status and remove redundant legacy context without rewriting history. New events store actor IDs.

Private order photos are re-encoded JPEG derivatives under authenticated company/assignment checks. Reminders and manually saved opportunities are separate company tables; disabling a module keeps its records. `payment-report.ts` projects receipt and reversal movements by transaction date while keeping legacy cumulative totals outside that journal. Contact warnings and scheduled-vehicle reminders supplement existing capacity and resource checks.
