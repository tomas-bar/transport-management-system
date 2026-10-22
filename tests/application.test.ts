import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import sharp from 'sharp';
import { createApplication } from '../server/application.ts';
import { hashPassword, verifyPassword, digest } from '../server/security.ts';
import { createSeed } from '../src/data/seed.ts';
import { createWorkspace } from '../src/domain/workspace.ts';

const password = 'A long fixture password 73!';
const passwordHash = await hashPassword(password);
const origin = 'http://localhost:4174';
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'krypta-api-'));
  let time = Date.now();
  const app = createApplication({ dbPath: join(dir, 'server.sqlite'), distPath: dir, origin, now: () => time });
  const db = app.store.db;
  db.prepare("INSERT INTO accounts VALUES('owner',NULL,NULL,'owner@example.test','Owner','owner',?,1)").run(passwordHash);
  for (const id of ['one', 'two']) {
    const data = createSeed('2026-10-22'), workspace = createWorkspace(data);
    workspace.companyId = id; workspace.users.forEach(u => u.companyId = id);
    db.prepare('INSERT INTO companies VALUES(?,?,?,1)').run(id, id, JSON.stringify(['operations', 'finance', 'photos', 'maintenance', 'freight']));
    db.prepare('INSERT INTO snapshots VALUES(?,1,?)').run(id, JSON.stringify({ db: data, workspace }));
    for (const u of workspace.users) db.prepare('INSERT INTO accounts VALUES(?,?,?,?,?,?,?,1)').run(id + '-' + u.id, id, u.id, id + '-' + u.id + '@example.test', u.name, u.role, passwordHash);
  }
  await new Promise<void>(r => app.server.listen(0, '127.0.0.1', r));
  const address = app.server.address(); assert(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const request = (path: string, method = 'GET', input?: unknown, auth?: { cookie: string; csrf: string }, extra: Record<string, string> = {}) => fetch(base + path, { method, headers: { Origin: origin, ...(input !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(auth ? { Cookie: auth.cookie, 'X-CSRF-Token': auth.csrf } : {}), ...extra }, body: input === undefined ? undefined : JSON.stringify(input) });
  async function login(email = 'one-admin@example.test') {
    const res = await request('/api/login', 'POST', { email, password }); assert.equal(res.status, 200, await res.clone().text());
    const data = await res.json(); return { cookie: res.headers.get('set-cookie')!.split(';')[0], csrf: data.csrf, data, res };
  }
  return { ...app, db, request, login, base, advance: (ms: number) => time += ms, async close() { await new Promise<void>(r => app.server.close(() => r())); app.close(); rmSync(dir, { recursive: true, force: true }); } };
}
test('password hashes are salted, verify correctly and reject weak new passwords', async () => {
  assert(await verifyPassword(password, passwordHash));
  assert(!await verifyPassword('wrong password', passwordHash));
  assert.match(passwordHash, /^scrypt\$131072\$8\$1\$/);
  await assert.rejects(hashPassword('admin'), /15/);
});
test('authentication requires a cookie, rejects forged sessions and enforces CSRF and origin', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.request('/api/session')).status, 401);
    const auth = await f.login();
    assert.match(auth.res.headers.get('set-cookie')!, /HttpOnly; SameSite=Strict/);
    assert.equal((await f.request('/api/commands', 'POST', { command: { type: 'read' }, revision: 1 }, { ...auth, csrf: 'forged' })).status, 403);
    assert.equal((await f.request('/api/logout', 'POST', {}, auth, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await f.request('/api/session', 'GET', undefined, { cookie: 'krypta-local=forged', csrf: '' })).status, 401);
    const stored = f.db.prepare('SELECT token_hash FROM sessions').get() as { token_hash: string };
    assert.equal(stored.token_hash, digest(auth.cookie.split('=')[1]));
    assert.equal((await f.request('/api/logout', 'POST', {}, auth)).status, 200);
    assert.equal((await f.request('/api/session', 'GET', undefined, auth)).status, 401);
  } finally { await f.close(); }
});
test('company scope and driver projection prevent access to unrelated operations and finance', async () => {
  const f = await fixture();
  try {
    const auth = await f.login('one-user-d1@example.test');
    assert.equal(auth.data.snapshot.workspace.companyId, 'one');
    assert(auth.data.snapshot.db.trips.every((t: any) => t.driverId === 'd1'));
    assert(auth.data.snapshot.db.orders.every((o: any) => o.price === 0 && o.paid === 0));
    assert.equal(auth.data.snapshot.db.customers.length, 0);
    assert(auth.data.snapshot.workspace.notifications.every((n: any) => n.recipientId === 'user-d1'));
    const revision = f.store.snapshot('two').revision;
    assert.equal((await f.request('/api/commands', 'POST', { revision: 1, command: { type: 'commit', db: f.store.snapshot('one').snapshot.db } }, auth)).status, 400);
    assert.equal((await f.request('/api/commands', 'POST', { revision: 1, command: { type: 'driver', command: { type: 'start', tripId: 't2' } } }, auth)).status, 400);
    assert.equal(f.store.snapshot('two').revision, revision);
  } finally { await f.close(); }
});
test('server writes reject stale revisions and preserve completed journey fields', async () => {
  const f = await fixture();
  try {
    const auth = await f.login(), snapshot = auth.data.snapshot;
    snapshot.db.settings.company = 'Changed';
    const command = { type: 'commit', db: snapshot.db };
    assert.equal((await f.request('/api/commands', 'POST', { revision: 1, command }, auth)).status, 200);
    assert.equal((await f.request('/api/commands', 'POST', { revision: 1, command }, auth)).status, 409);
    const completed = snapshot.db.trips.find((t: any) => t.status === 'completed'); assert(completed);
    completed.departure = '2026-01-01T06:00';
    assert.equal((await f.request('/api/commands', 'POST', { revision: 2, command }, auth)).status, 400);
    assert.equal(f.store.snapshot('one').revision, 2);
  } finally { await f.close(); }
});
test('module disabling retains history and blocks finance and photo operations on the server', async () => {
  const f = await fixture();
  try {
    const auth = await f.login();
    f.db.prepare('UPDATE companies SET modules=? WHERE id=?').run('["operations"]', 'one');
    assert.equal((await f.request('/api/commands', 'POST', { revision: 1, command: { type: 'finance', command: { type: 'expense', tripId: 't1', category: 'Degalai', amount: 100, date: '2026-01-01', description: '' } } }, auth)).status, 400);
    assert.equal((await f.request('/api/photos?order=o1', 'GET', undefined, auth)).status, 403);
    assert(f.store.snapshot('one').snapshot.db.expenses.length > 0);
    assert.equal((await f.request('/api/companies', 'GET', undefined, auth)).status, 403);
  } finally { await f.close(); }
});
test('revocation while a request body is arriving prevents the pending write', async () => {
  const f = await fixture();
  try {
    const auth = await f.login();
    const received = new Promise<void>(resolve => f.server.once('request', () => resolve()));
    let pending: ReturnType<typeof httpRequest>;
    const finished = new Promise<number>((resolve, reject) => {
      pending = httpRequest(f.base + '/api/commands', { method: 'POST', headers: { Origin: origin, Cookie: auth.cookie, 'X-CSRF-Token': auth.csrf, 'Content-Type': 'application/json' } }, response => {
        response.resume(); response.on('end', () => resolve(response.statusCode!));
      });
      pending.on('error', reject);
      pending.write('{"revision":1,"command":');
    });
    await received;
    assert.equal((await f.request('/api/logout', 'POST', {}, auth)).status, 200);
    pending!.end('{"type":"read"}}');
    assert.equal(await finished, 401);
    assert.equal(f.store.snapshot('one').revision, 1);
  } finally { await f.close(); }
});
test('owner creates a company with an independent administrator and cannot read its operational data', async () => {
  const f = await fixture();
  try {
    const owner = await f.login('owner@example.test');
    const res = await f.request('/api/companies', 'POST', { name: 'New company', modules: ['operations'], email: 'new@example.test', adminName: 'Administrator', password }, owner);
    assert.equal(res.status, 201, await res.clone().text());
    const admin = await f.login('new@example.test');
    assert.equal(admin.data.snapshot.db.trips.length, 0);
    assert.equal(admin.data.snapshot.db.settings.company, 'New company');
    assert.equal((await f.request('/api/commands', 'POST', { revision: 1, command: { type: 'read' } }, owner)).status, 403);
  } finally { await f.close(); }
});
test('preview is audited and read-only, and stopping preview restores the administrator', async () => {
  const f = await fixture();
  try {
    const auth = await f.login();
    const preview = await f.request('/api/preview', 'POST', { id: 'user-d1' }, auth);
    assert.equal(preview.status, 200); assert.equal((await preview.json()).user.role, 'driver');
    assert.equal((await f.request('/api/commands', 'POST', { revision: 1, command: { type: 'read' } }, auth)).status, 403);
    assert.equal((await f.request('/api/preview', 'POST', { id: null }, auth)).status, 200);
    assert.equal((await (await f.request('/api/session', 'GET', undefined, auth)).json()).user.role, 'admin');
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM audit WHERE action LIKE 'preview.%'").get()!.n, 2);
  } finally { await f.close(); }
});
test('idle expiry and password changes revoke sessions, and login attempts are throttled', async () => {
  const f = await fixture();
  try {
    const auth = await f.login(); f.advance(31 * 60 * 1000);
    assert.equal((await f.request('/api/session', 'GET', undefined, auth)).status, 401);
    const fresh = await f.login();
    assert.equal((await f.request('/api/password', 'POST', { current: password, password: 'A different strong password 42!' }, fresh)).status, 200);
    assert.equal((await f.request('/api/session', 'GET', undefined, fresh)).status, 401);
    f.db.prepare('INSERT OR REPLACE INTO login_limits VALUES(?,?,10)').run('account:' + digest('one-admin@example.test'), Date.now() + 31 * 60 * 1000);
    assert.equal((await f.request('/api/login', 'POST', { email: 'one-admin@example.test', password })).status, 429);
  } finally { await f.close(); }
});
test('photos are decoded and rewritten, remain private to their company and disappear after deletion', async () => {
  const f = await fixture();
  try {
    const auth = await f.login(), other = await f.login('two-admin@example.test');
    const order = f.store.snapshot('one').snapshot.db.orders[0];
    const photo = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#ff0000' } }).png().toBuffer();
    const upload = (raw: Buffer) => fetch(f.base + '/api/photos?order=' + order.id + '&stage=pickup', { method: 'POST', headers: { Origin: origin, Cookie: auth.cookie, 'X-CSRF-Token': auth.csrf, 'Content-Type': 'image/png' }, body: raw });
    assert.equal((await upload(Buffer.from('not an image'))).status, 415);
    assert.equal((await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"></svg>'))).status, 415);
    assert.equal((await upload(Buffer.alloc(8 * 1024 * 1024 + 1))).status, 413);
    const res = await upload(photo); assert.equal(res.status, 201, await res.clone().text()); const { id } = await res.json();
    assert.equal((await f.request('/api/photos/' + id)).status, 401);
    assert.equal((await f.request('/api/photos/' + id, 'GET', undefined, other)).status, 404);
    const image = await f.request('/api/photos/' + id, 'GET', undefined, auth); assert.equal(image.headers.get('content-type'), 'image/jpeg');
    assert.equal((await sharp(Buffer.from(await image.arrayBuffer())).metadata()).format, 'jpeg');
    assert.equal((await f.request('/api/photos/' + id, 'DELETE', undefined, auth)).status, 200);
    assert.equal((await f.request('/api/photos/' + id, 'GET', undefined, auth)).status, 404);
  } finally { await f.close(); }
});
test('optional operational records are tenant scoped and reminders retain completion history', async () => {
  const f = await fixture();
  try {
    const auth = await f.login(), other = await f.login('two-admin@example.test'), driver = await f.login('one-user-d1@example.test');
    const vehicleId = f.store.snapshot('one').snapshot.db.vehicles[0].id;
    const res = await f.request('/api/reminders', 'POST', { title: 'Insurance renewal', vehicleId, dueDate: '2026-11-01' }, auth);
    assert.equal(res.status, 201); const { id } = await res.json();
    assert.equal((await f.request('/api/reminders', 'GET', undefined, driver)).status, 403);
    assert.deepEqual(await (await f.request('/api/reminders', 'GET', undefined, other)).json(), []);
    assert.equal((await f.request('/api/reminders', 'PUT', { id, done: true }, other)).status, 404);
    assert.equal((await f.request('/api/reminders', 'PUT', { id, done: true }, auth)).status, 200);
    assert.equal((await (await f.request('/api/reminders', 'GET', undefined, auth)).json())[0].done, 1);
    assert.equal((await f.request('/api/opportunities', 'POST', { title: 'Manual opportunity', url: 'javascript:alert(1)' }, auth)).status, 400);
    assert.equal((await f.request('/api/opportunities', 'POST', { title: 'Manual opportunity', url: 'https://example.test/offer', notes: 'Manually recorded' }, auth)).status, 201);
    assert.deepEqual(await (await f.request('/api/opportunities', 'GET', undefined, other)).json(), []);
  } finally { await f.close(); }
});
test('restoring data creates a recoverable backup without changing authentication identities', async () => {
  const f = await fixture();
  try {
    const auth = await f.login(), snapshot = structuredClone(auth.data.snapshot);
    snapshot.db.settings.company = 'Restored'; snapshot.workspace.users[0].name = 'Imported identity';
    assert.equal((await f.request('/api/commands', 'POST', { revision: 1, command: { type: 'restore', snapshot } }, auth)).status, 200);
    assert.equal(f.store.snapshot('one').snapshot.workspace.users[0].name, auth.data.user.name);
    const backups = await (await f.request('/api/backups', 'GET', undefined, auth)).json(); assert.equal(backups.length, 1);
    const old = await (await f.request('/api/backups/' + backups[0].id, 'GET', undefined, auth)).json();
    assert.equal(old.db.settings.company, auth.data.snapshot.db.settings.company);
  } finally { await f.close(); }
});
