import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import worker, { type Env, type EdgeDatabase, privateJpeg } from '../edge/worker.ts';
import { createSeed, createEmptyDatabase } from '../src/data/seed.ts';
import { createWorkspace } from '../src/domain/workspace.ts';
import { apiRequestOptions } from '../src/services/api-request.ts';

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
      const options = apiRequestOptions(method, body, csrf, body instanceof Blob);
      const headers = new Headers(options.headers);
      for (const [name, value] of Object.entries({ Cookie: cookie, Origin: 'https://krypta.test', ...override })) headers.set(name, value);
      const response = await worker.fetch(new Request('https://krypta.test' + path, { ...options, headers }), env);
      if (response.headers.get('Set-Cookie')) cookie = response.headers.get('Set-Cookie')!.split(';')[0];
      const data = response.headers.get('Content-Type')?.includes('application/json') ? await response.json() as any : await response.blob();
      if (data.csrf) csrf = data.csrf;
      return { response, data };
    } };
  }
  return { env, sqlite, photos, browser };
}
const password = 'Test1234';
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
test('shared photo deletion uses the browser request contract and preserves ownership, origin and CSRF checks', async () => {
  const f = fixture(); try {
    const manager = await claim(f), driver = f.browser();
    await manager.call('/api/login', 'POST', { email: 'admin', password });
    const login = await driver.call('/api/login', 'POST', { email: 'driver', password });
    assert.equal(login.response.status, 200);
    const order = login.data.snapshot.db.orders[0];
    const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
    const photo = () => new Blob([bytes], { type: 'image/jpeg' });
    const uploadPath = '/api/photos?order=' + order.id + '&stage=pickup';
    const managerUpload = await manager.call(uploadPath, 'POST', photo());
    const driverUpload = await driver.call(uploadPath, 'POST', photo());
    assert.equal(managerUpload.response.status, 200);
    assert.equal(driverUpload.response.status, 200);
    const managerPath = '/api/photos/' + managerUpload.data.id;
    const driverPath = '/api/photos/' + driverUpload.data.id;
    assert.equal((await driver.call(managerPath, 'DELETE')).response.status, 403);
    assert.equal((await driver.call(driverPath, 'DELETE', undefined, { Origin: 'https://other.test' })).response.status, 403);
    assert.equal((await driver.call(driverPath, 'DELETE', undefined, { 'X-CSRF-Token': 'wrong' })).response.status, 403);
    assert.equal(f.photos.size, 2);
    assert.equal((await driver.call(driverPath, 'DELETE')).response.status, 200);
    assert.equal(f.photos.has('photos/' + driverUpload.data.id), false);
    assert.equal((await manager.call(driverPath)).response.status, 404);
    assert.deepEqual((await driver.call('/api/photos?order=' + order.id)).data.map((row: { id: string }) => row.id), [managerUpload.data.id]);
    assert.equal((await manager.call(managerPath, 'DELETE')).response.status, 200);
    assert.equal(f.photos.size, 0);
  } finally { f.sqlite.close(); }
});

test('owner acting as company manager can clear storage and restore samples without changing other companies or credentials', async () => {
  const f = fixture(); try {
    const owner = await claim(f);
    await owner.call('/api/login', 'POST', { email: 'owner@testing.test', password });
    const companies = (await owner.call('/api/companies')).data;
    const companyId = companies[0].id;
    const created = await owner.call('/api/companies', 'POST', { name: 'Empty company', modules: ['operations', 'photos', 'maintenance', 'freight'], email: 'new@testing.test', adminName: 'New manager', password });
    assert.equal(created.response.status, 200);
    const other = f.browser();
    const fresh = await other.call('/api/login', 'POST', { email: 'new@testing.test', password });
    assert.equal(fresh.data.snapshot.db.trips.length, 0);
    assert.equal(fresh.data.snapshot.db.orders.length, 0);
    assert.equal(fresh.data.snapshot.db.vehicles.length, 0);
    assert.equal(fresh.data.snapshot.db.settings.email, '');
    assert.deepEqual(fresh.data.snapshot.workspace.notifications, []);
    assert.equal(fresh.data.snapshot.workspace.users.length, 1);
    const reset = (revision: number, mode = 'clear', extra = {}) => ({ revision, mode, confirmed: true, anchorDate: '2026-10-23', ...extra });
    await other.call('/api/company-data/reset', 'POST', reset(fresh.data.revision, 'samples'));
    const otherBefore = (await other.call('/api/session')).data;
    let session = (await owner.call('/api/preview', 'POST', { id: 'admin', companyId })).data;
    assert.equal((await owner.call('/api/company-data/reset', 'POST', reset(session.revision))).response.status, 403);
    session = (await owner.call('/api/preview', 'POST', { id: 'admin', companyId, mode: 'act' })).data;
    session = (await owner.call('/api/company-data/reset', 'POST', reset(session.revision, 'samples'))).data;
    assert.equal((await owner.call('/api/backups')).data.length, 1);
    const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
    const upload = await owner.call('/api/photos?order=' + session.snapshot.db.orders[0].id + '&stage=pickup', 'POST', new Blob([bytes], { type: 'image/jpeg' }));
    assert.equal(upload.response.status, 200);
    const otherPhoto = await other.call('/api/photos?order=' + otherBefore.snapshot.db.orders[0].id + '&stage=pickup', 'POST', new Blob([bytes], { type: 'image/jpeg' }));
    assert.equal(otherPhoto.response.status, 200);
    await owner.call('/api/reminders', 'POST', { title: 'Inspection', vehicleId: session.snapshot.db.vehicles[0].id, dueDate: '2026-11-01' });
    await owner.call('/api/opportunities', 'POST', { title: 'Saved offer', url: 'https://example.test/offer', notes: '' });
    assert.equal((await owner.call('/api/company-data/reset', 'POST', reset(session.revision, 'clear', { confirmed: false }))).response.status, 400);
    assert.equal((await owner.call('/api/company-data/reset', 'POST', reset(session.revision - 1))).response.status, 409);
    assert.equal((await owner.call('/api/company-data/reset', 'POST', reset(session.revision), { 'X-CSRF-Token': 'wrong' })).response.status, 403);
    assert.equal((await owner.call('/api/company-data/reset', 'POST', reset(session.revision), { Origin: 'https://other.test' })).response.status, 403);
    assert.equal((await owner.call('/api/commands', 'POST', { revision: session.revision, command: { type: 'restore', discardPhotos: true, snapshot: session.snapshot } })).response.status, 403);
    assert.equal(f.photos.size, 2);
    const cleared = await owner.call('/api/company-data/reset', 'POST', reset(session.revision));
    assert.equal(cleared.response.status, 200);
    for (const key of ['trips', 'orders', 'vehicles', 'drivers', 'customers', 'routes', 'expenses']) assert.deepEqual(cleared.data.snapshot.db[key], []);
    assert.deepEqual(cleared.data.snapshot.workspace.notifications, []);
    assert.deepEqual(cleared.data.snapshot.workspace.confirmations, []);
    assert.deepEqual(cleared.data.snapshot.db.settings, session.snapshot.db.settings);
    assert.equal(f.photos.size, 1);
    assert.equal((await other.call('/api/photos/' + otherPhoto.data.id)).response.status, 200);
    assert.equal((await owner.call('/api/photos/' + otherPhoto.data.id)).response.status, 404);
    assert.deepEqual((await owner.call('/api/reminders')).data, []);
    assert.deepEqual((await owner.call('/api/opportunities')).data, []);
    assert.deepEqual((await owner.call('/api/backups')).data, []);
    assert.deepEqual((await other.call('/api/session')).data.snapshot, otherBefore.snapshot);
    const restored = await owner.call('/api/company-data/reset', 'POST', reset(cleared.data.revision, 'samples'));
    assert.equal(restored.response.status, 200);
    assert.equal(restored.data.snapshot.db.trips.length, 5);
    assert.equal(restored.data.snapshot.db.settings.company, session.snapshot.db.settings.company);
    const driver = f.browser();
    assert.equal((await driver.call('/api/login', 'POST', { email: 'driver', password })).response.status, 200);
    assert.equal((await driver.call('/api/company-data/reset', 'POST', reset(restored.data.revision))).response.status, 403);
    const admin = f.browser();
    assert.equal((await admin.call('/api/login', 'POST', { email: 'admin', password })).response.status, 200);
    assert.equal((await owner.call('/api/preview', 'POST', { id: null })).data.user.role, 'owner');
  } finally { f.sqlite.close(); }
});
