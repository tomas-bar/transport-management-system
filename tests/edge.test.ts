import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import worker, { type Env, type EdgeDatabase, privateJpeg } from '../edge/worker.ts';
import { createSeed, createEmptyDatabase } from '../src/data/seed.ts';
import { createWorkspace } from '../src/domain/workspace.ts';

function fixture() {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec(readFileSync(new URL('../drizzle/0000_shared_workspace.sql', import.meta.url), 'utf8'));
  const db: EdgeDatabase = { prepare(sql) {
    let values: any[] = [];
    return { bind(...input: any[]) { values = input; return this; }, async first<T>() { return (sqlite.prepare(sql).get(...values) ?? null) as T | null; }, async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }; } };
  } };
  const photos = new Map<string, ArrayBuffer>();
  const env: Env = { DB: db, BUCKET: { async put(key, blob) { photos.set(key, blob instanceof Blob ? await blob.arrayBuffer() : blob); }, async get(key) { const data = photos.get(key); return data ? { async arrayBuffer() { return data; } } : null; }, async delete(key) { for (const id of typeof key === 'string' ? [key] : key) photos.delete(id); } }, ASSETS: { async fetch() { return new Response('page'); } }, KRYPTA_INITIAL_PASSWORD: 'Initial random testing password 123456', KRYPTA_SETUP_TOKEN: 'one-time-test-setup-token', KRYPTA_SETUP_EXPIRES: String(Date.now() + 60000) };
  function browser() {
    let cookie = '', csrf = '';
    return { async call(path: string, method = 'GET', body?: any, override: Record<string, string> = {}) {
      const headers: Record<string, string> = { Cookie: cookie, Origin: 'https://krypta.test', 'X-CSRF-Token': csrf, ...(body !== undefined ? { 'Content-Type': body instanceof Blob ? body.type : 'application/json' } : {}), ...override };
      const response = await worker.fetch(new Request('https://krypta.test' + path, { method, headers, body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body) }), env);
      if (response.headers.get('Set-Cookie')) cookie = response.headers.get('Set-Cookie')!.split(';')[0];
      const data = response.headers.get('Content-Type')?.includes('application/json') ? await response.json() as any : await response.blob();
      if (data.csrf) csrf = data.csrf;
      return { response, data };
    } };
  }
  return { env, sqlite, photos, browser };
}
const password = 'A private account password 123';
async function claim(f: ReturnType<typeof fixture>) {
  const browser = f.browser();
  assert.equal((await browser.call('/api/setup', 'POST', { token: f.env.KRYPTA_SETUP_TOKEN, email: 'owner@testing.test', name: 'Owner', password })).response.status, 200);
  return browser;
}
test('shared Worker saves across independent sessions and enforces login, CSRF, logout and one-time setup', async () => {
  const f = fixture(); try {
    const first = await claim(f), second = f.browser(), anonymous = f.browser();
    assert.equal((await anonymous.call('/api/session')).response.status, 401);
    assert.equal((await first.call('/api/login', 'POST', { email: 'admin', password: 'admin' })).response.status, 401);
    const login = await first.call('/api/login', 'POST', { email: 'admin', password }); assert.equal(login.response.status, 200);
    assert.match(login.response.headers.get('Set-Cookie')!, /HttpOnly; Secure; SameSite=Strict/);
    const db = login.data.snapshot.db; db.settings.company = 'Shared phone change';
    assert.equal((await first.call('/api/commands', 'POST', { revision: login.data.revision, command: { type: 'commit', db } }, { Origin: 'https://other.test' })).response.status, 403);
    assert.equal((await first.call('/api/commands', 'POST', { revision: login.data.revision, command: { type: 'commit', db } }, { 'X-CSRF-Token': 'wrong' })).response.status, 403);
    assert.equal((await first.call('/api/commands', 'POST', { revision: login.data.revision, command: { type: 'commit', db } })).response.status, 200);
    const remote = await second.call('/api/login', 'POST', { email: 'admin', password }); assert.equal(remote.data.snapshot.db.settings.company, 'Shared phone change');
    assert.equal((await first.call('/api/commands', 'POST', { revision: login.data.revision, command: { type: 'commit', db } })).response.status, 409);
    assert.equal((await first.call('/api/logout', 'POST', {})).response.status, 200);
    assert.equal((await first.call('/api/session')).response.status, 401);
    assert.equal((await anonymous.call('/api/setup', 'POST', { token: f.env.KRYPTA_SETUP_TOKEN, email: 'other@testing.test', name: 'Other', password })).response.status, 409);
  } finally { f.sqlite.close(); }
});
test('shared photos are private and confirmed reset removes their blobs while retaining access and a backup', async () => {
  const f = fixture(); try {
    const browser = await claim(f); let { data: session } = await browser.call('/api/login', 'POST', { email: 'admin', password });
    const order = session.snapshot.db.orders[0];
    const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
    const upload = await browser.call('/api/photos?order=' + order.id + '&stage=pickup', 'POST', new Blob([bytes], { type: 'image/jpeg' })); assert.equal(upload.response.status, 200);
    assert.equal(f.photos.size, 1);
    assert.equal((await f.browser().call('/api/photos/' + upload.data.id)).response.status, 401);
    assert.equal((await browser.call('/api/photos/' + upload.data.id)).response.status, 200);
    const empty = createEmptyDatabase(session.snapshot.db.settings);
    const clear = await browser.call('/api/commands', 'POST', { revision: session.revision, command: { type: 'restore', discardPhotos: true, snapshot: { db: empty, workspace: createWorkspace(empty) } } }); assert.equal(clear.response.status, 200);
    assert.equal(clear.data.snapshot.db.trips.length, 0); assert.equal(f.photos.size, 0);
    const seed = createSeed('2026-10-23');
    const reset = await browser.call('/api/commands', 'POST', { revision: clear.data.revision, command: { type: 'restore', discardPhotos: true, snapshot: { db: seed, workspace: createWorkspace(seed) } } }); assert.equal(reset.response.status, 200);
    assert.equal(reset.data.snapshot.db.trips.length, seed.trips.length);
    assert.equal((await browser.call('/api/backups')).data.length, 2);
    assert.equal((await browser.call('/api/session')).response.status, 200);
    assert.equal((await f.browser().call('/api/login', 'POST', { email: 'driver', password })).response.status, 200);
    await assert.rejects(privateJpeg(new Blob(['bad'], { type: 'image/jpeg' })), /formatas|nuotrauka/);
  } finally { f.sqlite.close(); }
});
