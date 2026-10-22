import { DatabaseSync } from 'node:sqlite';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ReviewSnapshot } from '../src/domain/workspace.ts';

export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;');
    const version = Number((this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
    if (version > 1) throw new Error('The database was created by a newer server.');
    if (version === 0) this.transaction(() => {
      this.db.exec(`
        CREATE TABLE companies (id TEXT PRIMARY KEY, name TEXT NOT NULL, modules TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1) STRICT;
        CREATE TABLE snapshots (company_id TEXT PRIMARY KEY REFERENCES companies(id), revision INTEGER NOT NULL, data TEXT NOT NULL) STRICT;
        CREATE TABLE accounts (id TEXT PRIMARY KEY, company_id TEXT REFERENCES companies(id), member_id TEXT, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','admin','dispatcher','driver')), password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, UNIQUE(company_id,member_id)) STRICT;
        CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, csrf TEXT NOT NULL, created_at INTEGER NOT NULL, last_at INTEGER NOT NULL, preview_id TEXT, user_agent TEXT NOT NULL) STRICT;
        CREATE INDEX session_accounts ON sessions(account_id);
        CREATE TABLE login_limits (key TEXT PRIMARY KEY, started_at INTEGER NOT NULL, attempts INTEGER NOT NULL) STRICT;
        CREATE TABLE audit (id INTEGER PRIMARY KEY, company_id TEXT REFERENCES companies(id), actor_id TEXT, action TEXT NOT NULL, entity_id TEXT NOT NULL, created_at TEXT NOT NULL) STRICT;
        CREATE TABLE snapshot_backups (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), revision INTEGER NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL) STRICT;
        CREATE TABLE attachments (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), order_id TEXT NOT NULL, stage TEXT NOT NULL, actor_id TEXT NOT NULL, mime TEXT NOT NULL, bytes BLOB NOT NULL, created_at TEXT NOT NULL) STRICT;
        CREATE INDEX attachment_orders ON attachments(company_id,order_id);
        CREATE TABLE reminders (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), vehicle_id TEXT NOT NULL, title TEXT NOT NULL, due_date TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0) STRICT;
        CREATE TABLE opportunities (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), title TEXT NOT NULL, url TEXT NOT NULL, notes TEXT NOT NULL, created_at TEXT NOT NULL) STRICT;
        PRAGMA user_version=1;
      `);
    });
  }
  transaction<T>(run: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = run(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  snapshot(companyId: string): { snapshot: ReviewSnapshot; revision: number } {
    const row = this.db.prepare('SELECT data,revision FROM snapshots WHERE company_id=?').get(companyId) as { data: string; revision: number } | undefined;
    if (!row) throw new Error('Įmonė nerasta.');
    return { snapshot: JSON.parse(row.data), revision: row.revision };
  }
  audit(companyId: string | null, actorId: string | null, action: string, entityId = '') {
    this.db.prepare('INSERT INTO audit(company_id,actor_id,action,entity_id,created_at) VALUES(?,?,?,?,?)').run(companyId, actorId, action, entityId, new Date().toISOString());
  }
  close() { this.db.close(); }
}
