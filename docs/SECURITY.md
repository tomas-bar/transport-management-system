# Security and deployment

The browser-local application is a prototype. Its `admin / admin` login is not server authentication. Existing browser records are never uploaded or replaced automatically. The separately built server application uses cookie authentication and company-scoped persistence.

## Decisions and sources

Reviewed on 2026-10-22:

- [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html): use Node's stable scrypt implementation with N=131072, r=8, p=1, a random salt and 128 MiB work memory. Argon2id is preferred by OWASP; avoiding an experimental runtime primitive or another native cryptographic dependency makes scrypt a practical supported alternative. Passwords require at least 15 characters and accept Unicode, spaces and paste. Hashing concurrency and queue length are bounded.
- [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html): 256-bit random session tokens, SHA-256 verifiers in SQLite, HttpOnly/SameSite=Strict cookies, Secure and __Host- prefix on HTTPS, 30-minute idle and 8-hour absolute expiry. Sessions are revoked at logout and password change. Authentication tokens never enter browser storage.
- [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html): all unsafe requests require the configured Origin; authenticated requests also require the session CSRF token. Login uses the same origin check and JSON-only input. SameSite is additional protection.
- [OWASP authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html): company scope comes from the server session, never a request's company ID. Driver responses contain assigned operations and permitted financial entries. Commands repeat authorization on the server. Owner administration does not grant access to company operations. User preview is audited and read-only.
- [OWASP file uploads](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html): authenticated private retrieval, bounded input and decoded dimensions, image decoding/re-encoding, generated IDs and removal of metadata. No original filename is used as a filesystem path. SVG and arbitrary document uploads are unsupported.
- [Node 24 SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html) and [crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html): parameterized queries, foreign keys, transactions and a stable built-in password derivation primitive.

## Storage

One Node process and one persistent SQLite database suit the initial small installation. Schema migrations use `user_version` and refuse databases from a newer server. Companies, accounts, sessions, audit records and private attachments have separate tables. Operational data and notifications remain one validated company snapshot with a revision, preserving the approved model and atomic commands. This is an intentional intermediate storage format, not fully normalized operational persistence. Schema normalization and multiple-server operation remain future work.

Company operations, generated events, revision changes, membership changes and their audit records commit together. Restore first retains the previous snapshot in `snapshot_backups`. Authentication secrets and session tokens are excluded from JSON workspace backups. Restores preserve registered identities and privileges, and never restore passwords.

Photos are private JPEG derivatives stored in SQLite. Input is limited to 8 MiB and 20 million pixels, resized to at most 2400 pixels per side, with 20 photos per order. Explicit deletion removes the live derivative; audit metadata remains. Photos stay until explicitly deleted. Snapshot JSON backups exclude image bytes; full SQLite backups contain photos. Operators must apply a retention policy and expire their database backups as appropriate. No end-to-end encryption, malware scanning service, or encryption at rest is claimed. Deployment should use encrypted persistent volumes and encrypted backups.

## Hosting requirements

Serve the server-mode build and API at the same HTTPS origin through a reverse proxy. Set `KRYPTA_PUBLIC_ORIGIN` to that exact origin, bind Node to loopback behind the proxy, and provide a private persistent volume for `KRYPTA_DB_PATH`. Do not point the database at temporary or static-host storage. Configure TLS, service restart, backups, operating-system security updates and monitoring. The default listener does not trust forwarding headers for authentication or throttling; behind a proxy the shared source IP limits apply conservatively. Account limits remain separate. A deployment needing higher throughput should add a documented trusted-proxy configuration.

Sites deployment capabilities and persistent backend support have not been verified in this session; the Sites tools are unavailable. A static Site alone cannot run this authentication or synchronize data. The owner-private review deployment is preserved. Never advertise the static demo as the secure shared application.

Before real customer use, perform an independent security review, verify the production proxy/cookie behavior, test backup restoration and company migration, and configure operational monitoring. Email verification/recovery, MFA, billing, GPS and external freight integrations are not implemented.
