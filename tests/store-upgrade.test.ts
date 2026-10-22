import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.ts';
import { createSeed } from '../src/data/seed.ts';
import { createWorkspace } from '../src/domain/workspace.ts';

test('version-one database upgrade retains company records, existing sessions and audit history', () => {
  const directory = mkdtempSync(join(tmpdir(), 'krypta-migration-'));
  const path = join(directory, 'records.sqlite');
  const old = new Store(path);
  const data = createSeed('2026-10-22');
  const snapshot = { db: data, workspace: createWorkspace(data) };
  old.db.prepare('INSERT INTO companies VALUES(?,?,?,1)').run('one', 'Retained company', '["operations"]');
  old.db.prepare('INSERT INTO snapshots VALUES(?,7,?)').run('one', JSON.stringify(snapshot));
  old.db.prepare("INSERT INTO accounts VALUES('a',NULL,NULL,'owner@example.test','Owner','owner','fixture-hash',1)").run();
  old.db.prepare('INSERT INTO sessions(token_hash,account_id,csrf,created_at,last_at,preview_id,user_agent) VALUES(?,?,?,?,?,?,?)').run('token', 'a', 'csrf', 100, 100, null, 'Old browser');
  old.audit('one', 'a', 'company.created');
  old.db.prepare('INSERT INTO opportunities(id,company_id,title,url,notes,created_at) VALUES(?,?,?,?,?,?)').run('offer', 'one', 'Retained lead', 'https://example.test', 'Original contact note', '2026-10-22T10:00:00Z');
  // Restore the actual version-one column shape before opening the newer application.
  old.db.exec('ALTER TABLE sessions DROP COLUMN preview_company_id; ALTER TABLE sessions DROP COLUMN preview_mode; ALTER TABLE audit DROP COLUMN effective_user_id; ALTER TABLE opportunities DROP COLUMN details; ALTER TABLE opportunities DROP COLUMN revision; PRAGMA user_version=1;');
  old.close();
  const upgraded = new Store(path);
  try {
    assert.deepEqual(upgraded.snapshot('one'), { snapshot, revision: 7 });
    const lead = upgraded.db.prepare('SELECT * FROM opportunities').get()!;
    assert.equal(lead.notes, 'Original contact note');
    assert.equal(lead.details, '{}');
    assert.equal(lead.revision, 1);
    const session = upgraded.db.prepare('SELECT * FROM sessions').get()!;
    assert.equal(session.token_hash, 'token');
    assert.equal(session.preview_company_id, null);
    assert.equal(session.preview_mode, 'read');
    assert.equal(upgraded.db.prepare('SELECT action FROM audit').get()!.action, 'company.created');
    upgraded.audit('one', 'a', 'workspace.driver', 't1', 'user-d1');
    assert.equal(upgraded.db.prepare("SELECT effective_user_id FROM audit WHERE action='workspace.driver'").get()!.effective_user_id, 'user-d1');
  } finally {
    upgraded.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
