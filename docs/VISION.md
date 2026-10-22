# Product vision

Krypta is a transport management application for small passenger and parcel operators. Its first use case includes domestic and cross-border minibus services. Company identity, geographic coverage and interface language are independent product concerns.

## Users and jobs

The main user is an owner or dispatcher planning trips, assigning bookings, maintaining contacts and following up on payments. Drivers need concise operational information: stops, passenger contacts, parcel recipients and arrival progress. Basic computer skills should be sufficient for the core workflows.

A dedicated company installation can live on a subdomain separately from its public website. A future multi-company service remains an option rather than a requirement.

The product replaces disconnected spreadsheets and duplicated route lists with related records. A booking connects a customer, a trip, pickup and delivery visits, load and payment values. A route is a reusable geographic template; a trip is a dated execution of a journey.

## Modules

- Overview: current totals, upcoming trips and unassigned work.
- Trips: schedule, resources, stops, bookings and status transitions.
- Routes: reusable stop sequences and map directions.
- Orders: passenger and parcel bookings with capacity and payment state.
- Fleet, drivers and customers: small registers with operational history.
- Finance: internal revenue, payment and expense reporting.
- Documents: purpose-specific operational and financial PDFs.

## Interaction and content principles

Treat the interface as the product, with no review, environment or version labels. Use concise labels and factual information. Avoid slogans, motivational messages, sales language and repeated explanations of obvious controls. Add help only when it affects a decision or clarifies a real constraint. Keep prototype instructions in technical documentation and chat.

Visual hierarchy must distinguish in-progress trips, today's departures, planned work and payment states. Neutral surfaces and operational blue are the baseline; green signals completed payments or arrivals, amber signals attention. Do not give every value a colored badge. Mobile forms, readable stop lists and reliable actions remain first-class requirements.

Printed documents are independent data views, not screenshots of the app. Driver-facing trip documents exclude finance by default. Stop numbering is consistent across the UI, maps, navigation and documents.

## Development sequence

1. Validate the role-aware review, driver task flow and data integrity.
2. Add authentication, authorization, normalized server persistence and an audit trail before handling real shared data remotely.
3. Move reviewed company roles and driver access to enforced server permissions; add an explicit payment ledger and external integrations.
4. Add optional localization, telemetry, email delivery and dispatch automation behind service boundaries.
5. Evaluate route optimization, time windows and legal working-time requirements as separate domain modules.

Do not simulate future features. GPS positions require real telemetry, optimization requires a defined objective and accounting documents require validated business and legal requirements.
