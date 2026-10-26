import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeed } from '../src/data/seed.ts';
import { createWorkspace } from '../src/domain/workspace.ts';
import { applyWorkspaceCommand } from '../src/domain/commands.ts';
import { saveTrip, saveOrder, loadInfo, validateDatabase, totals } from '../src/domain/logic.ts';
import { nextCompanyReference } from '../src/domain/references.ts';
import { projectSnapshot } from '../src/domain/projection.ts';
import { useTrip } from '../src/domain/calculator-sources.ts';
import { emptyCalculationInput, validateCalculatorInput } from '../src/domain/calculator.ts';
import type { Database, Trip, Order } from '../src/domain/models.ts';
import type { ReviewSnapshot } from '../src/domain/workspace.ts';

function fixture(passengers = 0, parcels = 0) {
  const db = createSeed('2026-10-22');
  const trip: Trip = { ...structuredClone(db.trips[0]), id: 'quick-trip', number: nextCompanyReference(db, 'trips'),
    stops: [], departure: '2027-02-01T08:00', arrival: '2027-02-01T18:00', recordMode: 'draft', status: 'planned',
    unlisted: { passengers, parcels } };
  saveTrip(db, trip);
  return { db, trip, workspace: createWorkspace(db) };
}
function order(db: Database, trip: Trip, quantity = 1, type: Order['type'] = 'passenger'): Order {
  return { ...structuredClone(db.orders[0]), id: 'new-quick-order', number: nextCompanyReference(db, 'orders'),
    tripId: trip.id, date: trip.departure.slice(0, 10), quantity, type, status: 'new', recordMode: undefined,
    weight: type === 'parcel' ? 12 : null, price: 0, paid: 0, priceSet: false };
}
function write(before: ReviewSnapshot, mutate: (db: Database) => void, actor = 'admin') {
  const db = structuredClone(before.db); mutate(db);
  return applyWorkspaceCommand(before, actor, { type: 'commit', db }, ['operations', 'finance']);
}

test('quick counts preserve legacy stores and reject malformed persisted quantities', () => {
  const legacy = createSeed('2026-10-22');
  const before = JSON.stringify(legacy);
  validateDatabase(legacy);
  assert.equal(JSON.stringify(legacy), before);
  assert.equal(loadInfo(legacy, legacy.trips[0]).passengers, legacy.orders.filter(o => o.tripId === legacy.trips[0].id && o.type === 'passenger' && o.status !== 'cancelled').reduce((n, o) => n + o.quantity, 0));
  for (const counts of [null, [], { passengers: -1, parcels: 0 }, { passengers: 1.5, parcels: 0 }, { passengers: 1, parcels: NaN }, { passengers: 100001, parcels: 0 }, { passengers: 1 }]) {
    const db = structuredClone(legacy); (db.trips[0] as any).unlisted = counts;
    assert.throws(() => validateDatabase(db), /duomenys/);
  }
});

test('a quantity-only draft needs no clients, orders, stops or resources and survives a backup round trip', () => {
  const f = fixture(4, 3), oldOrders = JSON.stringify(f.db.orders), oldCustomers = JSON.stringify(f.db.customers);
  f.trip.vehicleId = ''; f.trip.driverId = '';
  const db = validateDatabase(JSON.parse(JSON.stringify(f.db)));
  assert.deepEqual(db.trips.find(t => t.id === f.trip.id)!.unlisted, { passengers: 4, parcels: 3 });
  assert.equal(JSON.stringify(db.orders), oldOrders); assert.equal(JSON.stringify(db.customers), oldCustomers);
  assert.equal(f.trip.stops.length, 0);
  assert.equal(loadInfo(db, f.trip).unknown, true);
  assert.equal(totals(db.orders.filter(o => o.tripId === f.trip.id)).revenue, 0);
});

test('explicit refinement keeps totals constant, consumes only its type and rejects repeat consumption', () => {
  const f = fixture(4, 3), candidate = order(f.db, f.trip, 2);
  const saved = write(f, db => saveOrder(db, candidate, { fromUnlisted: true }));
  const trip = saved.db.trips.find(t => t.id === f.trip.id)!;
  assert.deepEqual(trip.unlisted, { passengers: 2, parcels: 3 });
  assert.equal(loadInfo(saved.db, trip).passengers, 4);
  assert.equal(saved.db.orders.filter(o => o.tripId === trip.id).length, 1);
  assert.equal(saved.db.trips.find(t => t.id === trip.id)!.stops.length, 2);
  assert.throws(() => write(saved, db => saveOrder(db, { ...candidate, name: 'Correct name' }, { fromUnlisted: true })), /Patikslinti/);
  const corrected = write(saved, db => saveOrder(db, { ...candidate, name: 'Correct name' }));
  assert.deepEqual(corrected.db.trips.find(t => t.id === trip.id)!.unlisted, trip.unlisted);
});

test('new bookings add to counts while cancellation never silently restores anonymous passengers', () => {
  const f = fixture(4), candidate = order(f.db, f.trip, 2);
  saveOrder(f.db, candidate);
  assert.equal(loadInfo(f.db, f.trip).passengers, 6);
  saveOrder(f.db, { ...candidate, status: 'cancelled' });
  assert.equal(loadInfo(f.db, f.trip).passengers, 4);
  const refined = fixture(4), detailed = order(refined.db, refined.trip, 2);
  saveOrder(refined.db, detailed, { fromUnlisted: true });
  saveOrder(refined.db, { ...detailed, status: 'cancelled' });
  assert.equal(loadInfo(refined.db, refined.trip).passengers, 2);
});

test('publication reserves anonymous seats and refinement frees them before assignment validation', () => {
  const f = fixture();
  const seats = f.db.vehicles.find(v => v.id === f.trip.vehicleId)!.seats;
  f.trip.unlisted = { passengers: seats + 1, parcels: 0 };
  assert.throws(() => saveTrip(f.db, { ...f.trip, recordMode: undefined }), /nepakanka vietų/);
  saveTrip(f.db, { ...f.trip, unlisted: { passengers: seats, parcels: 0 }, recordMode: undefined });
  const trip = f.db.trips.find(t => t.id === f.trip.id)!;
  const candidate = order(f.db, trip);
  assert.throws(() => saveOrder(f.db, candidate), /Nepakanka/);
  saveOrder(f.db, candidate, { fromUnlisted: true });
  assert.equal(loadInfo(f.db, trip).passengers, seats);
  validateDatabase(f.db);
  const tooLarge = { ...candidate, id: 'too-large', number: nextCompanyReference(f.db, 'orders'), quantity: seats + 1 };
  const counts = structuredClone(trip.unlisted);
  assert.throws(() => saveOrder(f.db, tooLarge, { fromUnlisted: true }), /per mažas/);
  assert.deepEqual(trip.unlisted, counts);
});

test('parcel refinement replaces unknown quantities with actual order weights without duplicating them', () => {
  const f = fixture(2, 3);
  saveOrder(f.db, order(f.db, f.trip, 3, 'parcel'), { fromUnlisted: true });
  assert.deepEqual(f.trip.unlisted, { passengers: 2, parcels: 0 });
  const load = loadInfo(f.db, f.trip);
  assert.equal(load.parcels, 3); assert.equal(load.weight, 36); assert.equal(load.unknown, false);
});

test('quantity-only work is visible to its driver, blocks manager writes by drivers and completes without invented tasks', () => {
  const f = fixture(2, 3);
  const published = write(f, db => saveTrip(db, { ...f.trip, recordMode: undefined, status: 'confirmed' }));
  const driver = published.workspace.users.find(u => u.role === 'driver' && u.driverId === f.trip.driverId)!;
  assert.deepEqual(projectSnapshot(published, driver).db.trips.find(t => t.id === f.trip.id)!.unlisted, f.trip.unlisted);
  assert.throws(() => write(published, db => { db.trips.find(t => t.id === f.trip.id)!.unlisted!.passengers = 1; }, driver.id), /neleidžiamas/);
  const started = applyWorkspaceCommand(published, driver.id, { type: 'driver', command: { type: 'start', tripId: f.trip.id } }, ['operations']);
  const completed = applyWorkspaceCommand(started, driver.id, { type: 'driver', command: { type: 'finish', tripId: f.trip.id } }, ['operations']);
  assert.equal(completed.db.trips.find(t => t.id === f.trip.id)!.status, 'completed');
  assert.equal(completed.workspace.confirmations.filter(c => c.tripId === f.trip.id).length, 0);
  const corrected = write(completed, db => saveTrip(db, { ...db.trips.find(t => t.id === f.trip.id)!, unlisted: { passengers: 1, parcels: 2 } }));
  assert.deepEqual(corrected.db.trips.find(t => t.id === f.trip.id)!.unlisted, { passengers: 1, parcels: 2 });
  assert.equal(corrected.workspace.confirmations.filter(c => c.tripId === f.trip.id).length, 0);
});

test('repeat leaves unlisted counts behind unless explicitly requested', () => {
  const f = fixture(3, 4);
  const input = { sourceId: f.trip.id, tripId: 'repeat-one', departure: '2027-03-01T08:00', arrival: '2027-03-01T18:00', driverId: '', vehicleId: '', orderIds: [], copyPrices: false, asDraft: true };
  const noCounts = applyWorkspaceCommand(f, 'admin', { type: 'repeatTrip', input }, ['operations']);
  assert.equal(noCounts.db.trips.find(t => t.id === input.tripId)!.unlisted, undefined);
  const copied = applyWorkspaceCommand(f, 'admin', { type: 'repeatTrip', input: { ...input, copyUnlisted: true } }, ['operations']);
  assert.deepEqual(copied.db.trips.find(t => t.id === input.tripId)!.unlisted, f.trip.unlisted);
});

test('calculator imports the unlisted quantities with unknown prices instead of inventing income', () => {
  const f = fixture(3, 2), before = JSON.stringify(f.db);
  const input = useTrip(emptyCalculationInput(), f.db, f.trip);
  assert.equal(input.revenueMode, 'detailed');
  assert.deepEqual(input.outbound, { passengers: 3, ticket: null, parcels: 2, parcelPrice: null });
  validateCalculatorInput(input);
  assert.equal(JSON.stringify(f.db), before);
  f.trip.stops = structuredClone(f.db.routes[0].stops);
  const routed = useTrip(emptyCalculationInput(), f.db, f.trip);
  assert.equal(routed.revenueMode, 'bookings');
  assert.deepEqual(routed.bookings.map(r => [r.type, r.quantity, r.price]), [['passenger', 3, null], ['parcel', 2, null]]);
  validateCalculatorInput(routed);
});
