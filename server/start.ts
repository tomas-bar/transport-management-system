import { resolve } from 'node:path';
import { createApplication } from './application.ts';
const port = Number(process.env.KRYPTA_PORT ?? 4174);
const origin = process.env.KRYPTA_PUBLIC_ORIGIN ?? `http://127.0.0.1:${port}`;
if (process.env.NODE_ENV === 'production' && !origin.startsWith('https://')) throw new Error('Production requires an HTTPS KRYPTA_PUBLIC_ORIGIN.');
const app = createApplication({ dbPath: process.env.KRYPTA_DB_PATH ?? resolve('data/server.sqlite'), distPath: resolve('dist'), origin });
app.server.listen(port, process.env.KRYPTA_HOST ?? '127.0.0.1', () => console.log(`Krypta server listening on port ${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.server.close(() => { app.close(); process.exit(0); }));
