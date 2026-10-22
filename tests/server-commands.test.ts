import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeed } from '../src/data/seed.ts';
import { createWorkspace } from '../src/domain/workspace.ts';
import { applyWorkspaceCommand } from '../src/domain/commands.ts';
import { contactWarnings } from '../src/domain/planning.ts';
test('server commands reject delivery before pickup even for manager snapshot updates', () => {
  const db = createSeed('2026-10-22'), workspace = createWorkspace(db), changed = structuredClone(db);
  const trip = changed.trips[0], order = changed.orders.find(o => o.tripId === trip.id)!;
  const pickup = trip.stops.findIndex(s => s.orderId === order.id && s.kind === 'pickup');
  const delivery = trip.stops.findIndex(s => s.orderId === order.id && s.kind === 'delivery');
  [trip.stops[pickup], trip.stops[delivery]] = [trip.stops[delivery], trip.stops[pickup]];
  assert.throws(() => applyWorkspaceCommand({ db, workspace }, 'admin', { type: 'commit', db: changed }, ['operations', 'finance']), /Paėmimo/);
  assert.deepEqual(db, createSeed('2026-10-22'));
});
test('planning flags missing operational contacts without converting unknown weights or prices', () => {
  const db = createSeed('2026-10-22'), order = db.orders.find(o => o.type === 'parcel' && o.tripId === 't1')!;
  order.phone = ''; order.recipientPhone = ''; order.weight = null;
  assert.equal(contactWarnings(db, 't1').filter(w => w.orderId === order.id).length, 2);
  assert.equal(order.weight, null);
  order.status = 'cancelled'; assert(!contactWarnings(db, 't1').some(w => w.orderId === order.id));
});
