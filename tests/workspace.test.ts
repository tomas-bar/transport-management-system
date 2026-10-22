import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeed } from '../src/data/seed.ts';
import { createWorkspace, canOpen, applyDriverCommand, notificationChanges, validateWorkspace } from '../src/domain/workspace.ts';
import { routeVisits } from '../src/domain/route-plan.ts';
import { validateDatabase } from '../src/domain/logic.ts';
const fixture = () => {
  const db = createSeed('2026-10-22');
  return {
    db,
    workspace: createWorkspace(db)
  };
};
test('role routes restrict driver and dispatcher account administration', () => {
  const s = fixture(),
    driver = s.workspace.users.find(u => u.id === 'user-d1')!,
    dispatcher = s.workspace.users.find(u => u.role === 'dispatcher')!,
    admin = s.workspace.users[0];
  assert(canOpen(driver, 'my-trips'));
  assert(!canOpen(driver, 'trips'));
  assert(!canOpen(driver, 'finances'));
  assert(!canOpen(dispatcher, 'users'));
  assert(!canOpen(dispatcher, 'settings'));
  assert(canOpen(dispatcher, 'orders'));
  assert(canOpen(admin, 'users'));
  assert(!canOpen({
    ...admin,
    active: false
  }, 'users'));
});
test('driver commands reject other drivers trips and manager accounts', () => {
  const s = fixture(),
    driver = s.workspace.users.find(u => u.id === 'user-d1')!;
  assert.throws(() => applyDriverCommand(s, driver, {
    type: 'start',
    tripId: 't2'
  }), /nepriskirtas/);
  assert.throws(() => applyDriverCommand(s, s.workspace.users[0], {
    type: 'arrive',
    tripId: 't1',
    visitIndex: 1
  }), /neleidžiamas/);
  assert.throws(() => applyDriverCommand(s, driver, {
    type: 'start',
    tripId: 't3'
  }), /patvirtintas/);
});
test('arrival is separate from handover and delivery requires pickup', () => {
  const s = fixture(),
    driver = s.workspace.users.find(u => u.id === 'user-d1')!,
    trip = s.db.trips.find(t => t.id === 't1')!;
  const firstPickup = routeVisits(trip.stops)[0].stops.find(s => s.orderId && s.kind === 'pickup')!;
  const order = s.db.orders.find(o => o.id === firstPickup.orderId)!;
  assert.throws(() => applyDriverCommand(s, driver, {
    type: 'task',
    tripId: trip.id,
    orderId: order.id,
    kind: 'delivery'
  }), /paėmimą/);
  assert.throws(() => applyDriverCommand(s, driver, {
    type: 'arrive',
    tripId: trip.id,
    visitIndex: 4
  }), /artimiausią/);
  applyDriverCommand(s, driver, {
    type: 'task',
    tripId: trip.id,
    orderId: order.id,
    kind: 'pickup'
  });
  assert.equal(s.workspace.confirmations.length, 1);
  assert.equal(order.status, 'active');
  assert.throws(() => applyDriverCommand(s, driver, {
    type: 'task',
    tripId: trip.id,
    orderId: order.id,
    kind: 'pickup'
  }), /jau patvirtintas/);
  while (routeVisits(trip.stops).some(v => !v.completed)) applyDriverCommand(s, driver, {
    type: 'arrive',
    tripId: trip.id,
    visitIndex: routeVisits(trip.stops).findIndex(v => !v.completed)
  });
  const other = s.db.orders.find(o => o.tripId === trip.id && o.id !== order.id)!;
  assert.throws(() => applyDriverCommand(s, driver, {
    type: 'task',
    tripId: trip.id,
    orderId: other.id,
    kind: 'delivery'
  }), /paėmimą/);
  applyDriverCommand(s, driver, {
    type: 'task',
    tripId: trip.id,
    orderId: order.id,
    kind: 'delivery'
  });
  assert.equal(order.status, 'completed');
  assert.equal(trip.status, 'active');
  assert.throws(() => applyDriverCommand(s, driver, {
    type: 'finish',
    tripId: trip.id
  }), /visus/);
  validateDatabase(s.db);
  validateWorkspace(s.workspace, s.db);
});
test('driver completes an entire trip without changing finance values', () => {
  const s = fixture(),
    driver = s.workspace.users.find(u => u.id === 'user-d2')!,
    trip = s.db.trips.find(t => t.id === 't2')!;
  const money = s.db.orders.map(o => [o.id, o.price, o.paid]);
  applyDriverCommand(s, driver, {
    type: 'start',
    tripId: trip.id
  });
  for (const visit of routeVisits(trip.stops)) {
    if (!visit.completed) applyDriverCommand(s, driver, {
      type: 'arrive',
      tripId: trip.id,
      visitIndex: visit.number - 1
    });
    for (const stop of visit.stops) if (stop.orderId && stop.kind) applyDriverCommand(s, driver, {
      type: 'task',
      tripId: trip.id,
      orderId: stop.orderId,
      kind: stop.kind
    });
  }
  applyDriverCommand(s, driver, {
    type: 'finish',
    tripId: trip.id
  });
  assert.equal(trip.status, 'completed');
  assert.deepEqual(s.db.orders.map(o => [o.id, o.price, o.paid]), money);
  validateDatabase(s.db);
});
test('notifications target relevant roles, respect preferences and skip unchanged snapshots', () => {
  const s = fixture(),
    next = structuredClone(s.db);
  next.trips[0].status = 'completed';
  const notes = notificationChanges(s.db, next, s.workspace, 'admin');
  assert(notes.some(n => n.recipientId === 'user-d1'));
  assert(notes.some(n => n.recipientId === 'dispatcher'));
  assert(!notes.some(n => n.recipientId === 'user-d2'));
  assert(!notes.some(n => n.recipientId === 'admin'));
  assert.deepEqual(notificationChanges(s.db, s.db, s.workspace, 'admin'), []);
  s.workspace.preferences['user-d1'] = {
    inApp: false
  };
  assert(!notificationChanges(s.db, next, s.workspace, 'admin').some(n => n.recipientId === 'user-d1'));
});
test('workspace validation retains an administrator and prevents duplicate active driver links', () => {
  const s = fixture();
  s.workspace.users[0].active = false;
  assert.throws(() => validateWorkspace(s.workspace, s.db), /administratorius/);
  s.workspace.users[0].active = true;
  const d = s.workspace.users.find(u => u.role === 'driver')!;
  s.workspace.users.push({
    ...d,
    id: 'duplicate'
  });
  assert.throws(() => validateWorkspace(s.workspace, s.db), /nepriskirtą/);
});
