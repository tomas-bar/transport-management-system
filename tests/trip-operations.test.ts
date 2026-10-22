import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeed } from '../src/data/seed.ts';
import { createWorkspace } from '../src/domain/workspace.ts';
import { applyWorkspaceCommand } from '../src/domain/commands.ts';
import { saveTrip } from '../src/domain/logic.ts';
import type { RepeatTripInput } from '../src/domain/trip-operations.ts';

const modules = ['operations', 'finance'] as const;
function fixture() {
  const db = createSeed('2026-10-22');
  return { db, workspace: createWorkspace(db) };
}
function repeatInput(): RepeatTripInput {
  return { sourceId: 't1', tripId: 'next-trip', departure: '2026-11-05T06:00', arrival: '2026-11-06T02:30', vehicleId: 'v1', driverId: 'd1', orderIds: [], copyPrices: false };
}

test('manager can save partial delivery progress and then close the trip without changing finances', () => {
  const before = fixture();
  const orders = before.db.orders.filter(order => order.tripId === 't1');
  assert(orders.length > 1);
  const partial = applyWorkspaceCommand(before, 'dispatcher', { type: 'reviewTrip', input: { tripId: 't1', completedOrderIds: [orders[0].id], finish: false, note: 'First delivery confirmed by phone' } }, [...modules]);
  assert.equal(partial.db.trips.find(trip => trip.id === 't1')!.status, 'active');
  assert.equal(partial.db.orders.find(order => order.id === orders[0].id)!.status, 'completed');
  assert.equal(partial.db.orders.find(order => order.id === orders[1].id)!.status, 'active');
  assert.deepEqual(partial.db.trips.find(trip => trip.id === 't1')!.stops, before.db.trips.find(trip => trip.id === 't1')!.stops);
  const events = partial.workspace.confirmations.filter(event => event.orderId === orders[0].id);
  assert.deepEqual(events.map(event => event.kind), ['pickup', 'delivery']);
  assert(events.every(event => event.source === 'manager' && event.actorId === 'dispatcher'));
  assert.throws(() => applyWorkspaceCommand(partial, 'dispatcher', { type: 'reviewTrip', input: { tripId: 't1', completedOrderIds: [], finish: false, note: '' } }, [...modules]), /Ankstesnio/);
  const finished = applyWorkspaceCommand(partial, 'admin', { type: 'reviewTrip', input: { tripId: 't1', completedOrderIds: orders.map(order => order.id), finish: true, note: '' } }, [...modules]);
  assert.equal(finished.db.trips.find(trip => trip.id === 't1')!.status, 'completed');
  assert(finished.db.trips.find(trip => trip.id === 't1')!.stops.every(stop => stop.completed));
  assert.deepEqual(finished.db.orders.map(order => [order.id, order.price, order.paid, order.weight]), before.db.orders.map(order => [order.id, order.price, order.paid, order.weight]));
  assert.deepEqual(finished.db.expenses, before.db.expenses);
  assert.equal(finished.workspace.tripReviews!.length, 2);
  assert(finished.workspace.notifications.some(event => event.title === 'Reisas užbaigtas'));
});

test('manager summary rejects missing deliveries, unrelated orders and driver access atomically', () => {
  const before = fixture(), original = structuredClone(before);
  const input = { tripId: 't1', completedOrderIds: [], finish: true, note: '' };
  assert.throws(() => applyWorkspaceCommand(before, 'admin', { type: 'reviewTrip', input }, [...modules]), /visus pristatymus/);
  assert.throws(() => applyWorkspaceCommand(before, 'user-d1', { type: 'reviewTrip', input }, [...modules]), /administratorius arba vadybininkas/);
  assert.throws(() => applyWorkspaceCommand(before, 'admin', { type: 'reviewTrip', input: { ...input, completedOrderIds: ['o8'] } }, [...modules]), /nepriklauso/);
  assert.deepEqual(before, original);
});

test('repeating selected bookings creates new linked stops and excludes financial and execution history', () => {
  const before = fixture(), source = structuredClone(before);
  const orders = before.db.orders.filter(order => order.tripId === 't1');
  const input = { ...repeatInput(), orderIds: [orders[0].id] };
  const next = applyWorkspaceCommand(before, 'dispatcher', { type: 'repeatTrip', input }, [...modules]);
  const copy = next.db.trips.find(trip => trip.id === input.tripId)!;
  assert.equal(copy.status, 'planned');
  assert(copy.stops.every(stop => !stop.completed && stop.arrival === undefined));
  const copied = next.db.orders.filter(order => order.tripId === copy.id);
  assert.equal(copied.length, 1);
  assert.equal(copied[0].paid, 0);
  assert.equal(copied[0].priceSet, false);
  assert.equal(copied[0].price, 0);
  assert.equal(copied[0].date, '2026-11-05');
  assert.notEqual(copied[0].id, orders[0].id);
  assert.deepEqual(copied[0].pickup, orders[0].pickup);
  const pickup = copy.stops.findIndex(stop => stop.orderId === copied[0].id && stop.kind === 'pickup');
  assert(copy.stops.findIndex(stop => stop.orderId === copied[0].id && stop.kind === 'delivery') > pickup);
  assert(!copy.stops.some(stop => stop.orderId === orders[0].id));
  assert.deepEqual(next.db.expenses, source.db.expenses);
  assert.deepEqual(next.workspace.confirmations, source.workspace.confirmations);
  assert.deepEqual(next.workspace.receipts, source.workspace.receipts);
  assert.deepEqual(before, source);
});

test('repeated trips retain unknown loads and optionally copy agreed prices while enforcing conflicts and modules', () => {
  const before = fixture();
  const parcel = before.db.orders.find(order => order.tripId === 't1' && order.type === 'parcel')!;
  parcel.weight = null;
  const input = { ...repeatInput(), orderIds: [parcel.id], copyPrices: true };
  const next = applyWorkspaceCommand(before, 'admin', { type: 'repeatTrip', input }, [...modules]);
  const copy = next.db.orders.find(order => order.tripId === input.tripId)!;
  assert.equal(copy.weight, null);
  assert.equal(copy.price, parcel.price);
  assert.equal(copy.paid, 0);
  assert.throws(() => applyWorkspaceCommand(before, 'admin', { type: 'repeatTrip', input }, ['operations']), /Finansų/);
  const conflict = { ...input, departure: before.db.trips[0].departure, arrival: before.db.trips[0].arrival };
  assert.throws(() => applyWorkspaceCommand(before, 'admin', { type: 'repeatTrip', input: conflict }, [...modules]), /jau priskirtas/);
});

test('editing an active trip preserves previously completed bookings', () => {
  const snapshot = fixture();
  const order = snapshot.db.orders.find(record => record.tripId === 't1')!;
  order.status = 'completed';
  saveTrip(snapshot.db, { ...snapshot.db.trips.find(trip => trip.id === 't1')!, notes: 'Updated note' });
  assert.equal(snapshot.db.orders.find(record => record.id === order.id)!.status, 'completed');
});
