import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeed } from '../src/data/seed.ts';
import { applyDriverCommand, createWorkspace } from '../src/domain/workspace.ts';
import { tripProgress } from '../src/domain/trip-progress.ts';
import { dayPlan } from '../src/domain/day-plan.ts';

test('arrived stops with outstanding handovers are not complete and remain the next work', () => {
  const db = createSeed('2026-10-23'), workspace = createWorkspace(db), trip = db.trips[0];
  const progress = tripProgress(trip, db.orders, workspace.confirmations);
  assert.equal(progress.visits[0].state, 'arrived');
  assert.equal(progress.visits[0].done, false);
  assert.equal(progress.focusIndex, 0);
  assert.equal(progress.nextArrival, 1);
  assert.equal(progress.confirmedTasks, 0);
  assert(progress.visits[0].tasks.every(task => task.allowed));
  assert.equal(progress.visits.at(-1)!.tasks[0].allowed, false);
});

test('confirmations and guarded corrections update stop progress without mutating the projection source', () => {
  const db = createSeed('2026-10-23'), workspace = createWorkspace(db), trip = db.trips[0];
  const driver = workspace.users.find(user => user.driverId === trip.driverId)!;
  const before = structuredClone({ db, workspace });
  const tasks = tripProgress(trip, db.orders, workspace.confirmations).visits[0].tasks;
  for (const task of tasks) applyDriverCommand({ db, workspace }, driver, { type: 'task', tripId: trip.id, orderId: task.orderId, kind: task.kind });
  let progress = tripProgress(trip, db.orders, workspace.confirmations);
  assert.equal(progress.visits[0].state, 'done');
  assert.equal(progress.focusIndex, 1);
  const event = workspace.confirmations[0];
  applyDriverCommand({ db, workspace }, driver, { type: 'undoTask', tripId: trip.id, confirmationId: event.id });
  progress = tripProgress(trip, db.orders, workspace.confirmations);
  assert.equal(progress.visits[0].state, 'arrived');
  assert.equal(progress.focusIndex, 0);
  assert.equal(before.workspace.confirmations.length, 0);
  const snapshot = JSON.stringify({ db, workspace });
  tripProgress(trip, db.orders, workspace.confirmations);
  assert.equal(JSON.stringify({ db, workspace }), snapshot);
});

test('completed legacy orders and closed trips retain completion without invented confirmation times', () => {
  const db = createSeed('2026-10-23'), trip = db.trips[0];
  db.orders.filter(order => order.tripId === trip.id).forEach(order => { order.status = 'completed'; });
  const progress = tripProgress(trip, db.orders, []);
  assert(progress.visits.flatMap(visit => visit.tasks).every(task => task.done && !task.confirmation));
  assert.equal(progress.visits[0].state, 'done');
  assert.notEqual(progress.visits.at(-1)!.state, 'done');
  trip.status = 'completed';
  const closed = tripProgress(trip, db.orders, []);
  assert.equal(closed.focusIndex, -1);
  assert.equal(closed.completed, closed.visits.length);
});

test('day plans include multi-day assigned work and exclude future unassigned bookings', () => {
  const db = createSeed('2026-10-23');
  const plan = dayPlan(db, '2026-10-24');
  assert(plan.trips.some(trip => trip.id === 't1'));
  assert(plan.orders.some(order => order.tripId === 't1' && order.date === '2026-10-23'));
  const waiting = db.orders.find(order => !order.tripId && order.status !== 'cancelled')!;
  waiting.date = '2026-10-25';
  assert(!dayPlan(db, '2026-10-24').waiting.some(order => order.id === waiting.id));
});
