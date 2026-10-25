import { saveTrip, saveOrder } from '../src/domain/logic.ts';
import { routeVisits } from '../src/domain/route-plan.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DemoApi } from '../src/services/demo/api.ts';
import { createDemoState, type DemoState, type DemoStorage } from '../src/services/demo/model.ts';
import { createSeed } from '../src/data/seed.ts';
import { createWorkspace, type ReviewSnapshot } from '../src/domain/workspace.ts';
import type { ServerSession } from '../src/services/server-api.ts';

class MemoryStorage implements DemoStorage {
  state: DemoState;
  photos = new Map<string, Blob>();
  constructor(state: DemoState) { this.state = structuredClone(state); }
  async read() { return structuredClone(this.state); }
  async save(state: DemoState, generation: number, photo?: { id: string; blob: Blob | null }) {
    assert.equal(this.state.generation, generation, 'stale storage writes must fail');
    this.state = structuredClone(state);
    if (photo?.blob) this.photos.set(photo.id, photo.blob);
    else if (photo) this.photos.delete(photo.id);
  }
  async photo(id: string) { return this.photos.get(id); }
}
function client(storage: MemoryStorage, initial: string | null = null) {
  let sessionId = initial;
  const api = new DemoApi(storage, { get: () => sessionId, set: id => { sessionId = id; }, device: () => 'Test phone' }, async blob => blob);
  return { api, session: () => sessionId };
}
async function fixture() {
  const db = createSeed('2026-10-22'), snapshot = { db, workspace: createWorkspace(db) };
  const storage = new MemoryStorage(await createDemoState(snapshot));
  return { storage, ...client(storage) };
}
const login = (api: DemoApi, email = 'admin', password = 'admin') => api.request<ServerSession>('/api/login', 'POST', { email, password });

test('demo keeps edited operations, enables existing modules, and persists a command across a new client', async () => {
  const db = createSeed('2026-10-22'); db.settings.company = 'Edited company';
  const snapshot = { db, workspace: createWorkspace(db) };
  const state = await createDemoState(snapshot);
  assert.deepEqual(state.companies[0].snapshot, snapshot);
  const storage = new MemoryStorage(state), first = client(storage);
  const session = await login(first.api);
  assert.deepEqual(session.modules, ['operations', 'finance', 'photos', 'maintenance', 'freight']);
  const changed = structuredClone(session.snapshot!.db); changed.settings.phone = '+370 600 12345';
  await first.api.request('/api/commands', 'POST', { revision: session.revision, command: { type: 'commit', db: changed } });
  const reloaded = client(storage, first.session());
  const after = await reloaded.api.request<ServerSession>('/api/session');
  assert.equal(after.snapshot!.db.settings.phone, '+370 600 12345');
  await assert.rejects(first.api.request('/api/commands', 'POST', { revision: session.revision, command: { type: 'commit', db: changed } }), /kitame lange/);
  await reloaded.api.request('/api/logout', 'POST');
  await assert.rejects(reloaded.api.request('/api/session'), /Prisijunkite/);
});

test('owner can create a separate company and toggle modules without losing their records', async () => {
  const { storage, api } = await fixture();
  await login(api, 'owner', 'owner');
  const company = await api.request('/api/companies', 'POST', { name: 'Second company', modules: ['operations', 'maintenance'], email: 'second@example.test', adminName: 'Second admin', password: 'A long test password' });
  const second = client(storage);
  const session = await login(second.api, 'second@example.test', 'A long test password');
  assert.equal(session.snapshot!.db.trips.length, 0);
  assert.equal(session.snapshot!.workspace.users.length, 1);
  await second.api.request('/api/commands', 'POST', { revision: session.revision, command: { type: 'restore', snapshot: { db: createSeed('2026-10-22'), workspace: createWorkspace(createSeed('2026-10-22')) } } });
  const after = await second.api.request<ServerSession>('/api/session');
  const vehicleId = after.snapshot!.db.vehicles[0].id;
  const { id } = await second.api.request('/api/reminders', 'POST', { title: 'Inspection', vehicleId, dueDate: '2026-11-01' });
  await api.request('/api/companies/' + company.id, 'PUT', { name: 'Second company', modules: ['operations'], active: true });
  await assert.rejects(second.api.request('/api/reminders'), /išjungtas/);
  await api.request('/api/companies/' + company.id, 'PUT', { name: 'Second company', modules: ['operations', 'maintenance'], active: true });
  assert.equal((await second.api.request<any[]>('/api/reminders'))[0].id, id);
  await assert.rejects(second.api.request('/api/companies'), /nesuteikta/);
  const original = client(storage); await login(original.api);
  assert.deepEqual(await original.api.request('/api/reminders'), []);
});

test('driver gets assigned trips and photo access; administrator preview is read-only', async () => {
  const { storage, api } = await fixture();
  const admin = await login(api);
  const driverUser = admin.snapshot!.workspace.users.find(u => u.role === 'driver')!;
  const driver = client(storage); const assigned = await login(driver.api, 'driver');
  assert.equal(assigned.user.id, driverUser.id);
  assert.ok(assigned.snapshot!.db.trips.every(t => t.driverId === driverUser.driverId));
  await assert.rejects(driver.api.request('/api/reminders'), /nesuteikta/);
  const ownOrder = assigned.snapshot!.db.orders[0]; assert.ok(ownOrder);
  const { id } = await driver.api.request('/api/photos?order=' + ownOrder.id + '&stage=pickup', 'POST', new Blob(['test image'], { type: 'image/jpeg' }));
  assert.equal((await driver.api.request<Blob>('/api/photos/' + id)).size, 10);
  assert.equal((await api.request<any[]>('/api/photos?order=' + ownOrder.id))[0].id, id);
  const other = admin.snapshot!.db.orders.find(o => !assigned.snapshot!.db.orders.some(a => a.id === o.id))!;
  assert.ok(other); await assert.rejects(driver.api.request('/api/photos?order=' + other.id), /nerastas/);
  await api.request('/api/preview', 'POST', { id: driverUser.id });
  await assert.rejects(api.request('/api/photos/' + id, 'DELETE'), /Peržiūros/);
  await api.request('/api/preview', 'POST', { id: null });
  await api.request('/api/photos/' + id, 'DELETE');
  await assert.rejects(driver.api.request('/api/photos/' + id), /nerasta/);
});

test('new demo identities can sign in and change passwords without reviving revoked sessions', async () => {
  const { storage, api } = await fixture();
  const session = await login(api);
  const user = { id: 'new-user', companyId: session.user.companyId, name: 'New manager', email: 'new@example.test', role: 'dispatcher', driverId: '', active: true };
  await api.request('/api/commands', 'POST', { revision: session.revision, command: { type: 'user', user }, password: 'Test1234' });
  const fresh = client(storage), other = client(storage);
  await login(fresh.api, user.email, 'Test1234');
  await login(other.api, user.email, 'Test1234');
  await fresh.api.request('/api/password', 'POST', { current: 'Test1234', password: 'Next1234' });
  await assert.rejects(other.api.request('/api/session'), /Prisijunkite/);
  await assert.rejects(login(fresh.api, user.email, 'Test1234'), /Neteisingas/);
  assert.equal((await login(fresh.api, user.email, 'Next1234')).user.id, user.id);
});

test('restoring samples retains account access and saves the previous edited snapshot', async () => {
  const { api } = await fixture(); const session = await login(api);
  const replacement: ReviewSnapshot = { db: createSeed('2026-11-03'), workspace: createWorkspace(createSeed('2026-11-03')) };
  replacement.workspace.users = replacement.workspace.users.filter(u => u.id !== 'dispatcher');
  await api.request('/api/commands', 'POST', { revision: session.revision, command: { type: 'restore', snapshot: replacement } });
  const backups = await api.request<any[]>('/api/backups'); assert.equal(backups.length, 1);
  const before = await api.request<ReviewSnapshot>('/api/backups/' + backups[0].id);
  assert.deepEqual(before, session.snapshot);
  const restored = await api.request<ServerSession>('/api/session');
  assert.ok(restored.snapshot!.workspace.users.some(u => u.id === 'dispatcher'));
});

test('demo owner can inspect company users and act as a driver without losing the owner return path', async () => {
  const { storage, api } = await fixture();
  await login(api, 'owner', 'owner');
  const id = storage.state.companies[0].id;
  const users = await api.request<any[]>('/api/companies/' + id + '/users');
  assert(users.some(user => user.role === 'admin' && user.hasLogin));
  assert(!JSON.stringify(users).includes('password'));
  const view = await api.request<ServerSession>('/api/preview', 'POST', { companyId: id, id: 'user-d1' });
  assert.equal(view.session.mode, 'read');
  await assert.rejects(api.request('/api/commands', 'POST', { revision: view.revision, command: { type: 'read' } }), /Peržiūros/);
  const acting = await api.request<ServerSession>('/api/preview', 'POST', { companyId: id, id: 'user-d1', mode: 'act' });
  assert.equal(acting.session.returnRole, 'owner');
  const changed = await api.request<ServerSession>('/api/commands', 'POST', { revision: acting.revision, command: { type: 'driver', command: { type: 'arrive', tripId: 't1', visitIndex: routeVisits(acting.snapshot!.db.trips.find(t => t.id === 't1')!.stops).findIndex(v => !v.completed) } } });
  assert(changed.snapshot!.db.trips.find(t => t.id === 't1')!.stops[0].completed);
  await assert.rejects(api.request('/api/password', 'POST', { current: 'owner', password: 'A replacement password' }), /Paskyros/);
  const returned = await api.request<ServerSession>('/api/preview', 'POST', { id: null });
  assert.equal(returned.user.role, 'owner');
  const original = client(storage); await login(original.api);
  await assert.rejects(original.api.request('/api/preview', 'POST', { companyId: 'unrelated', id: 'admin', mode: 'act' }), /Kitos įmonės/);
});

test('demo upgrades old link-only opportunities without resetting records and rejects stale edits', async () => {
  const { storage, api } = await fixture();
  const companyId = storage.state.companies[0].id;
  storage.state.opportunities.push({ id: 'legacy', companyId, title: 'Existing note', url: 'https://example.test/offer', notes: 'Retain this contact', created_at: '2026-10-22T10:00:00Z' });
  await login(api);
  const rows = await api.request<any[]>('/api/opportunities');
  assert.equal(rows[0].details.price, null);
  assert.equal(rows[0].details.weight, null);
  assert.equal(rows[0].notes, 'Retain this contact');
  await api.request('/api/opportunities', 'PUT', { ...rows[0], details: { ...rows[0].details, status: 'contacted', contact: '+370 600 00000' } });
  await assert.rejects(api.request('/api/opportunities', 'PUT', rows[0]), /kitame lange/);
  const updated = (await api.request<any[]>('/api/opportunities'))[0];
  assert.equal(updated.details.status, 'contacted');
  assert.equal(updated.notes, 'Retain this contact');
});


test('demo drafts and historical records retain private driver and photo boundaries', async () => {
  const { storage, api } = await fixture();
  const admin = await login(api);
  const db = structuredClone(admin.snapshot!.db);
  for (const [id, number, recordMode, status] of [
    ['draft-trip', 'DRAFT-1', 'draft', 'planned'],
    ['history-trip', 'HISTORY-1', 'historical', 'completed'],
  ] as const) {
    saveTrip(db, { ...db.trips[0], id, number, recordMode, status, departure: '2026-09-01T08:00', arrival: '2026-09-01T18:00', stops: [] });
    saveOrder(db, { ...db.orders[0], id: id + '-order', number: number + '-ORDER', tripId: id, date: '2026-09-01', paid: 0 });
  }
  await api.request('/api/commands', 'POST', { revision: admin.revision, command: { type: 'commit', db } });
  const driver = client(storage), session = await login(driver.api, 'driver');
  assert(!session.snapshot!.db.trips.some(trip => ['draft-trip', 'history-trip'].includes(trip.id)));
  for (const id of ['draft-trip', 'history-trip']) {
    await assert.rejects(driver.api.request('/api/photos?order=' + id + '-order'), /nerastas/);
    await assert.rejects(driver.api.request('/api/commands', 'POST', { revision: session.revision, command: { type: 'driver', command: { type: 'start', tripId: id } } }), /nepaskelbtas|uždarytas/);
  }
});

test('demo calculator scenarios persist across clients, keep finance access separate and clear explicitly', async () => {
  const f = await fixture();
  const { emptyCalculationInput } = await import('../src/domain/calculator.ts');
  let session = await f.api.request<ServerSession>('/api/login', 'POST', { email: 'admin', password: 'admin' });
  const command = { type: 'calculator', command: { type: 'save', id: 'scenario', revision: null, name: 'Plan', tripId: '', primary: false, input: emptyCalculationInput() } };
  session = await f.api.request('/api/commands', 'POST', { revision: session.revision, command });
  const reopened = client(f.storage, f.session());
  const current = await reopened.api.request<ServerSession>('/api/session');
  assert.equal(current.snapshot!.db.planning!.scenarios.length, 1);
  await assert.rejects(reopened.api.request('/api/commands', 'POST', { revision: 1, command }), /pakeisti/);
  const driver = client(f.storage);
  const restricted = await driver.api.request<ServerSession>('/api/login', 'POST', { email: 'driver', password: 'admin' });
  assert.equal(restricted.snapshot!.db.planning, undefined);
  await assert.rejects(driver.api.request('/api/commands', 'POST', { revision: session.revision, command }), /teisių/);
  await f.api.request('/api/company-data/reset', 'POST', { revision: session.revision, mode: 'clear', confirmed: true });
  assert.equal((await f.api.request<ServerSession>('/api/session')).snapshot!.db.planning, undefined);
});
