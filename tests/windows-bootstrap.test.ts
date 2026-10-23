import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Store } from '../server/store.ts';
import { verifyPassword } from '../server/security.ts';

function sandbox() {
  const directory = mkdtempSync(join(tmpdir(), 'krypta-bootstrap-'));
  const path = join(directory, 'server.sqlite');
  const run = (script: string, args: string[] = [], password?: string) => spawnSync(process.execPath,
    ['--experimental-strip-types', resolve(script), ...args],
    { env: { ...process.env, KRYPTA_DB_PATH: path }, encoding: 'utf8', input: password });
  return { path, run, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

test('Windows bootstrap probe leaves a missing or empty database untouched', () => {
  const fixture = sandbox();
  try {
    const missing = fixture.run('scripts/owner-status.mjs');
    assert.equal(missing.status, 0, missing.stderr);
    assert.equal(missing.stdout.trim(), 'missing');
    assert.equal(existsSync(fixture.path), false);
    const store = new Store(fixture.path);
    store.close();
    const before = readFileSync(fixture.path);
    const empty = fixture.run('scripts/owner-status.mjs');
    assert.equal(empty.status, 0, empty.stderr);
    assert.equal(empty.stdout.trim(), 'missing');
    assert.deepEqual(readFileSync(fixture.path), before);
  } finally { fixture.cleanup(); }
});

test('Windows bootstrap provisions UTF-8 stdin credentials and preserves an existing owner', async () => {
  const fixture = sandbox();
  const password = 'Ąžuolas 🔐 123';
  try {
    const created = fixture.run('scripts/owner.ts', ['owner@example.test'], password);
    assert.equal(created.status, 0, created.stderr);
    assert.equal(created.stdout.includes(password), false);
    const status = fixture.run('scripts/owner-status.mjs');
    assert.equal(status.status, 0, status.stderr);
    assert.equal(status.stdout.trim(), 'exists');
    const refused = fixture.run('scripts/owner.ts', ['other@example.test'], 'Different 123');
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /An owner already exists/);
    const store = new Store(fixture.path);
    try {
      const accounts = store.db.prepare('SELECT email,password_hash FROM accounts').all();
      assert.equal(accounts.length, 1);
      assert.equal(accounts[0].email, 'owner@example.test');
      assert.equal(await verifyPassword(password, String(accounts[0].password_hash)), true);
    } finally { store.close(); }
  } finally { fixture.cleanup(); }
});

test('Windows bootstrap fails on a damaged database without replacing its bytes', () => {
  const fixture = sandbox();
  try {
    const bytes = Buffer.from('unrecognized existing data');
    writeFileSync(fixture.path, bytes);
    const result = fixture.run('scripts/owner-status.mjs');
    assert.notEqual(result.status, 0);
    assert.deepEqual(readFileSync(fixture.path), bytes);
  } finally { fixture.cleanup(); }
});
