# Development

Use Node.js 24 and npm. Run `npm ci`, then `npm run dev` for the browser-local
application or `npm run local` for the SQLite application. See the README for
development against the local API.

Keep domain rules in `src/domain`, external services and persistence in
`src/services`, reusable controls in `src/components`, and screens in `src/pages`.
Use English for code and technical documentation, and Lithuanian for the current
interface. The product name is provisional; renaming must preserve storage keys
and existing record identifiers.

Before submitting a change, run:

```sh
npm test
npm run build
npm run check:documents
npm run build:local
```

The two build modes share `dist/`. Use `npm run build` again before static hosting.
For UI work, also check desktop and phone layouts, keyboard interaction, empty
states, and data persistence. Record any verification that could not be completed.

Do not commit credentials, local environment overrides, databases, backups, logs,
dependencies, or generated output. `src/data/` contains fictional seed records and
must remain tracked. `.env.server` contains only the public storage-mode flag;
never add secrets or API keys to it or to any `VITE_` variable.

Public source availability does not grant an open-source license. The project
owner has not selected a project license. Preserve the font license included in
`public/fonts/` and attribution required by external map providers.
