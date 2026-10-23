import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeed, createEmptyDatabase } from '../src/data/seed.ts';
import { nextCompanyReference, nextReference, validateReferenceChanges } from '../src/domain/references.ts';
import { createWorkspace } from '../src/domain/workspace.ts';
import { applyWorkspaceCommand } from '../src/domain/commands.ts';
import { validateDatabase } from '../src/domain/logic.ts';

test('number series preserve legacy defaults and have independent company starting points', () => {
  const db = createSeed('2026-10-23');
  assert.equal(nextCompanyReference(db, 'trips'), 'KR-1006');
  assert.equal(nextCompanyReference(db, 'orders'), 'UZ-2010');
  db.settings.numbering = { trips: { prefix: 'LT/2026-', start: 12 }, orders: { prefix: '', start: 51 } };
  assert.equal(nextCompanyReference(db, 'trips'), 'LT/2026-12');
  assert.equal(nextCompanyReference(db, 'orders'), '51');
  assert.equal(nextCompanyReference(createEmptyDatabase(createSeed().settings), 'trips'), 'KR-1001');
  validateDatabase(db);
});

test('prefix digits and unrelated manual references never inflate another number series', () => {
  assert.equal(nextReference([{ number: 'LT/2026-12' }, { number: 'LT/2026-13' }, { number: 'CUSTOM-999999' }], 'LT/2026-', 1), 'LT/2026-14');
  assert.equal(nextReference([{ number: 'lt/2026-14' }], 'LT/2026-', 1), 'LT/2026-15');
  assert.equal(nextReference([{ number: '123' }], '', 0), '124');
});

test('managers can rename references while keeping internal links and rejecting duplicates', () => {
  const db = createSeed('2026-10-23'), workspace = createWorkspace(db);
  const changed = structuredClone(db); changed.trips[0].number = 'REISAS-12'; changed.orders[0].number = 'SIUNTA/27';
  const snapshot = applyWorkspaceCommand({ db, workspace }, 'admin', { type: 'commit', db: changed }, ['operations', 'finance']);
  assert.equal(snapshot.db.trips[0].id, db.trips[0].id);
  assert.equal(snapshot.db.orders[0].tripId, db.orders[0].tripId);
  assert.deepEqual(snapshot.db.trips[0].stops, db.trips[0].stops);
  changed.trips[0].number = changed.trips[1].number.toLowerCase();
  assert.throws(() => validateReferenceChanges(db, changed, true), /jau naudojamas/);
});

test('dispatchers cannot renumber existing work or edit company numbering', () => {
  const db = createSeed('2026-10-23'), workspace = createWorkspace(db);
  const actor = workspace.users.find(user => user.role === 'dispatcher')!;
  const changed = structuredClone(db); changed.trips[0].number = 'CUSTOM-1';
  assert.throws(() => applyWorkspaceCommand({ db, workspace }, actor.id, { type: 'commit', db: changed }, ['operations', 'finance']), /vadovas/);
  changed.trips[0].number = db.trips[0].number;
  changed.settings.numbering = { trips: { prefix: 'X-', start: 1 }, orders: { prefix: 'Y-', start: 1 } };
  assert.throws(() => applyWorkspaceCommand({ db, workspace }, actor.id, { type: 'commit', db: changed }, ['operations', 'finance']), /administratorius/);
});

test('invalid numbering is rejected and untouched legacy reference formats remain readable', () => {
  const db = createSeed(); db.trips[0].number = 'Legacy trip 1';
  validateReferenceChanges(db, structuredClone(db), true);
  db.settings.numbering = { trips: { prefix: 'BAD PREFIX', start: 0 }, orders: { prefix: 'X-', start: 1 } };
  assert.throws(() => validateDatabase(db), /Prefiksui/);
});
