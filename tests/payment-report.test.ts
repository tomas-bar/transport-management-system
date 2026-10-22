import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeed } from '../src/data/seed.ts';
import { createWorkspace } from '../src/domain/workspace.ts';
import { paymentReport } from '../src/domain/payment-report.ts';
test('transaction reporting retains receipt and later reversal as separate dated movements', () => {
  const db = createSeed('2026-10-22'), workspace = createWorkspace(db);
  workspace.receipts = [{ id: 'receipt', tripId: 't1', orderId: db.orders[0].id, actorId: 'admin', amount: 1500, method: 'cash', date: '2026-10-31', createdAt: '2026-10-31T10:00:00Z', voidedAt: '2026-10-31T23:30:00Z', voidedBy: 'admin' }];
  const october = paymentReport({ db, workspace }, '2026-10-01', '2026-10-31');
  assert.equal(october.received, 1500); assert.equal(october.reversed, 0); assert.equal(october.net, 1500);
  const november = paymentReport({ db, workspace }, '2026-11-01', '2026-11-30');
  assert.equal(november.received, 0); assert.equal(november.reversed, 1500); assert.equal(november.net, -1500);
  assert.equal(paymentReport({ db, workspace }, '2026-01-01', '2026-12-31').net, 0);
});
test('legacy cumulative paid values are never invented as dated transactions', () => {
  const db = createSeed('2026-10-22'), workspace = createWorkspace(db), before = structuredClone(db);
  assert(db.orders.some(o => o.paid > 0));
  assert.equal(paymentReport({ db, workspace }, '2000-01-01', '2099-12-31').movements.length, 0);
  assert.deepEqual(db, before);
});
