// Read-only bootstrap probe. Never create, migrate or reset a database here.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const path = process.env.KRYPTA_DB_PATH ?? resolve('data/server.sqlite');
if (!existsSync(path)) {
  console.log('missing');
} else {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const hasAccounts = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='accounts'").get();
    console.log(hasAccounts && db.prepare("SELECT 1 FROM accounts WHERE role='owner'").get() ? 'exists' : 'missing');
  } finally { db.close(); }
}
