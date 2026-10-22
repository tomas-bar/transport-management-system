# Krypta development notes

This is a transport management product for small passenger and parcel operators. Keep actual behavior coherent across modules. The name is provisional.

- Keep domain models and business rules in `src/domain`, persistence and external adapters in `src/services`, fictional data in `src/data`, reusable controls in `src/components`, and screen composition in `src/pages`.
- All visible text must be natural Lithuanian: reisas, maršrutas, sustojimas, paėmimo vieta, pristatymo vieta, siunta. Technical documentation, comments, development instructions, and test names must be English. The current UI locale is Lithuanian; the product is not restricted to a country or language. Keep the current interface Lithuanian and make new shared terminology ready for future localization. Use normal hyphens, no em dashes.
- Use the shared button, badge, modal, field, table, map and layout conventions. Preserve desktop and mobile behavior, accessible names, focus handling, large mobile controls, safe table scrolling and print styles.
- New modules must join the real model, repository and navigation. Never add decorative actions or synthetic metrics presented as real.
- Extend `Database` deliberately. Maintain `validateDatabase`, seed data, JSON backup compatibility and both storage adapters. A version change requires an explicit migration, not silent data replacement.
- Persist through the context's validated commands; drivers use typed `driverCommand`, administrators and dispatchers use `commit`. Maintain trip/order/stop relationships, integer EUR cents, unknown weights, whole-trip capacity checks and resource scheduling conflicts.
- Archive referenced vehicles, drivers and customers. Preserve historical IDs. Completed order route/load fields are locked; payments and notes can be corrected.
- Browser commands: `npm ci`, `npm run dev`, `npm run build`, `npm test`, `npm run check:documents`. The retained SQLite server is reference code and is not wired to review sessions.
- Static hosting requires the default `npm run build`. Do not publish the server-mode bundle without its API. Never commit `data/`, SQLite files, runtime secrets or node_modules.
- The server runtime enforces authentication and authorization with company snapshots. Keep server checks authoritative and preserve migrations. No fake GPS, optimization, tax documents or accounting profit claims.

- Product copy must be factual and brief. No slogans, sales language, redundant page descriptions or repeated disclaimers. Explain real constraints only where users need them.
- Use `routeVisits` for physical stop numbering in maps, stop lists, navigation and PDF. Keep underlying order-linked stops intact. Never hide duplicate-coordinate markers underneath each other.
- PDF templates are data-driven A4 documents in `src/services/pdf`, independent of the selected UI tab or viewport. Operational documents exclude financial data. Verify generated PDFs with embedded fonts and pagination before delivery.

- Anchor the runtime data ignore rule as `/data/`. Never ignore `src/data/`; seed data and compatibility migrations must be included in the source repository and downloadable package.
- Keep environment overrides, runtime data and hosting identity out of clean GitHub imports. `.env.server` is tracked public build configuration and must never contain secrets. Run the checks listed in `CONTRIBUTING.md` before submitting changes; keep the CI workflow aligned with those commands. Do not select a project license on the owner's behalf.

- Keep phone trip statuses visible in the card view. Desktop tables and mobile cards must use the same filtered records.
- Use `visitTasks` for optional passenger/parcel and pickup/delivery markers. Operational map details exclude financial data. Keep map controls outside the viewport and enable direct touch dragging and pinch zoom as requested; keep controls outside the map viewport.
- New stop insertion may suggest geographic proximity only. Preserve existing order, confirmed prefix and pickup-before-delivery precedence; never label this heuristic as road optimization.

- Demo fixtures are versioned in `src/data/seed.ts`. Keep `createSeed(anchorDate)` deterministic and isolated from edited stores. Never silently replace existing data on upgrade. Local reset tools must validate data, require explicit confirmation, increment the SQLite revision, and back up the previous state before replacement.

- Preserve the approved owner-private Site as a fallback. Browser mode uses `krypta-design-review` IndexedDB; do not reset edited browser stores. Server mode uses separate company-scoped SQLite storage. Commit and push coherent, validated milestones when authorized by the owner.
- Browser-local sessions and role checks are prototype behavior, not production authentication. Keep session, company scope, role checks and server migration boundaries explicit. Driver pages expose only explicitly permitted trip expense entry and collection of payments for assigned orders, not company financial summaries.
- Persist operational data and workspace events atomically. Keep arrival distinct from handover, pickup before delivery, notification recipient scoping and restore validation.

- Product UI must not contain review/version/environment labels or a list of sample logins. Keep testing instructions in documentation/chat; retain administrator user preview for role testing.

- Server commands: `npm run check:server`, `npm run build:server`, `npm run server`, `npm run dev:server`. Read `docs/SECURITY.md` before changing session, company or upload behavior. Never expose a server-mode build without its API.
- Cloud tasks are already isolated. Use the existing checkout; do not create a Git worktree unless explicitly requested.
