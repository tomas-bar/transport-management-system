import { draftOrder } from '../src/domain/record-mode.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeed } from '../src/data/seed.ts';
import { createWorkspace } from '../src/domain/workspace.ts';
import { applyWorkspaceCommand } from '../src/domain/commands.ts';
import { saveOrder, saveTrip, validateDatabase } from '../src/domain/logic.ts';
import { nextCompanyReference } from '../src/domain/references.ts';
import { projectSnapshot } from '../src/domain/projection.ts';
import { dayPlan } from '../src/domain/day-plan.ts';
import type { ReviewSnapshot } from '../src/domain/workspace.ts';
import type { Trip } from '../src/domain/models.ts';

const modules = ['operations', 'finance'] as const;
function fixture() {
  const db = createSeed('2026-10-22');
  return { db, workspace: createWorkspace(db) };
}
function write(before: ReviewSnapshot, mutate: (db: ReviewSnapshot['db']) => void) {
  const db = structuredClone(before.db); mutate(db);
  return applyWorkspaceCommand(before, 'admin', { type: 'commit', db }, [...modules]);
}
function newTrip(snapshot: ReviewSnapshot, mode: 'draft' | 'historical'): Trip {
  return { ...snapshot.db.trips[0], id: 'new-trip', number: nextCompanyReference(snapshot.db, 'trips'),
    stops: [], recordMode: mode, status: mode === 'draft' ? 'planned' : 'completed',
    departure: '2026-10-01T08:00', arrival: '2026-10-01T18:00' };
}

test('drafts allow missing resources, reserve no vehicle, and produce no driver work or notifications', () => {
  const before = fixture(), draft = newTrip(before, 'draft'); draft.driverId = ''; draft.vehicleId = '';
  const next = write(before, db => saveTrip(db, draft));
  assert.equal(next.workspace.notifications.length, before.workspace.notifications.length);
  const driver = before.workspace.users.find(user => user.role === 'driver')!;
  assert(!projectSnapshot(next, driver).db.trips.some(trip => trip.id === draft.id));
  assert(!dayPlan(next.db, '2026-10-01').trips.some(trip => trip.id === draft.id));
  const attempted = structuredClone(next.db); attempted.trips.find(trip => trip.id === draft.id)!.recordMode = undefined;
  assert.throws(() => write(next, db => saveTrip(db, attempted.trips.find(trip => trip.id === draft.id)!)), /vairuotoją/);
});

test('publication validates resource conflicts, notifies once, and cannot be silently withdrawn', () => {
  const before = fixture(), draft = newTrip(before, 'draft');
  draft.departure = before.db.trips[0].departure; draft.arrival = before.db.trips[0].arrival;
  const staged = write(before, db => saveTrip(db, draft));
  assert.throws(() => write(staged, db => saveTrip(db, { ...draft, recordMode: undefined })), /jau priskirtas/);
  const moved = write(staged, db => saveTrip(db, { ...draft, departure: '2026-11-20T08:00', arrival: '2026-11-20T18:00' }));
  const published = write(moved, db => saveTrip(db, { ...db.trips.find(trip => trip.id === draft.id)!, recordMode: undefined }));
  const driver = before.workspace.users.find(user => user.driverId === draft.driverId)!;
  assert.equal(published.workspace.notifications.filter(event => event.entity.id === draft.id && event.recipientId === driver.id).length, 1);
  assert(projectSnapshot(published, driver).db.trips.some(trip => trip.id === draft.id));
  assert.throws(() => write(published, db => saveTrip(db, { ...db.trips.find(trip => trip.id === draft.id)!, recordMode: 'draft' })), /juodraštį/);
});

test('historical trips accept new completed orders and dated expenses without alerts or invented receipts', () => {
  const before = fixture(), trip = newTrip(before, 'historical');
  const staged = write(before, db => saveTrip(db, trip));
  const order = { ...before.db.orders[0], id: 'historical-order', number: nextCompanyReference(staged.db, 'orders'),
    tripId: trip.id, date: '2026-10-01', status: 'completed' as const, recordMode: 'historical' as const, paid: 1000 };
  const filled = write(staged, db => saveOrder(db, order));
  const saved = filled.db.orders.find(item => item.id === order.id)!;
  assert.equal(saved.status, 'completed'); assert.equal(saved.paid, 1000);
  assert(filled.db.trips.find(item => item.id === trip.id)!.stops.every(stop => stop.completed));
  assert.equal(filled.workspace.receipts?.length ?? 0, 0);
  assert.equal(filled.workspace.confirmations.length, 0);
  const spent = applyWorkspaceCommand(filled, 'admin', { type: 'finance', command: { type: 'expense', tripId: trip.id, amount: 1234, category: 'Degalai', date: '2026-10-01', description: 'Historical expense' } }, [...modules]);
  assert.equal(spent.workspace.notifications.length, before.workspace.notifications.length);
  assert.equal(spent.db.expenses.at(-1)!.amount, 1234);
  const driver = before.workspace.users.find(user => user.driverId === trip.driverId)!;
  assert(!projectSnapshot(spent, driver).db.trips.some(item => item.id === trip.id));
  validateDatabase(spent.db);
});

test('historical backfill preserves existing route records and completed order links', () => {
  const before = fixture(), trip = newTrip(before, 'historical');
  trip.stops = [{ ...before.db.trips[0].stops[0], id: 'historical-base', orderId: undefined, kind: undefined, completed: true }];
  const staged = write(before, db => saveTrip(db, trip));
  const order = { ...before.db.orders[0], id: 'historical-order', number: nextCompanyReference(staged.db, 'orders'), tripId: trip.id, date: '2026-10-01', status: 'completed' as const, recordMode: 'historical' as const };
  const filled = write(staged, db => saveOrder(db, order));
  assert.deepEqual(filled.db.trips.find(item => item.id === trip.id)!.stops.find(stop => stop.id === 'historical-base'), staged.db.trips.find(item => item.id === trip.id)!.stops[0]);
  assert.throws(() => write(filled, db => { db.trips.find(item => item.id === trip.id)!.stops[0].name = 'Rewrite'; }), /Užbaigto reiso/);
  assert.throws(() => write(filled, db => { db.orders.find(item => item.id === order.id)!.tripId = ''; db.trips.find(item => item.id === trip.id)!.stops = db.trips.find(item => item.id === trip.id)!.stops.filter(stop => stop.orderId !== order.id); }), /Patvirtinto užsakymo/);
});

test('draft and historical work reject driver commands and future history dates', () => {
  const before = fixture(), draft = newTrip(before, 'draft');
  const staged = write(before, db => saveTrip(db, draft));
  const driver = before.workspace.users.find(user => user.driverId === draft.driverId)!;
  assert.throws(() => applyWorkspaceCommand(staged, driver.id, { type: 'driver', command: { type: 'start', tripId: draft.id } }, [...modules]), /nepaskelbtas/);
  assert.throws(() => applyWorkspaceCommand(staged, driver.id, { type: 'finance', command: { type: 'expense', tripId: draft.id, amount: 100, date: '2026-10-01', category: 'Degalai', description: '' } }, [...modules]), /nepasiekiamas/);
  const historical = newTrip(before, 'historical'); historical.arrival = '2099-01-01T18:00';
  assert.throws(() => write(before, db => saveTrip(db, historical)), /istorinio reiso/);
});


test('draft quotations stay outside reports and reject registered payments and expenses', () => {
  const before = fixture(), draft = newTrip(before, 'draft');
  const staged = write(before, db => saveTrip(db, draft));
  const order = { ...before.db.orders[0], id: 'draft-order', number: 'DRAFT-ORDER', tripId: draft.id, date: '2026-10-01', paid: 0 };
  const quoted = write(staged, db => saveOrder(db, order));
  assert(draftOrder(quoted.db, quoted.db.orders.find(record => record.id === order.id)!));
  assert.throws(() => write(quoted, db => { db.orders.find(record => record.id === order.id)!.paid = 100; }), /mokėjimas juodraščio/);
  assert.throws(() => applyWorkspaceCommand(quoted, 'admin', { type: 'finance', command: { type: 'expense', tripId: draft.id, amount: 100, date: '2026-10-01', category: 'Degalai', description: '' } }, [...modules]), /paskelbkite/);
});
