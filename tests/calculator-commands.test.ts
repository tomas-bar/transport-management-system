import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeed } from '../src/data/seed.ts';
import { createWorkspace } from '../src/domain/workspace.ts';
import { applyWorkspaceCommand } from '../src/domain/commands.ts';
import { emptyCalculationInput, emptyRates, validateCalculatorState } from '../src/domain/calculator.ts';
import { projectSnapshot } from '../src/domain/projection.ts';
import { primaryScenario } from '../src/domain/calculator-sources.ts';
import { companyResetCommand } from '../src/services/company-reset.ts';
import type { CalculatorCommand } from '../src/domain/calculator-commands.ts';

const modules = ['operations', 'finance'] as const;
function fixture() {
  const db = createSeed('2026-10-24');
  return { db, workspace: createWorkspace(db) };
}
function save(id = 'plan'): CalculatorCommand {
  return { type: 'save', id, name: 'Test scenario', revision: null, tripId: 't1', primary: false,
    input: emptyCalculationInput(undefined, '2026-10-24T12:00:00.000Z') };
}
test('lazy calculator storage preserves old snapshots and saving never changes actual operations or alerts', () => {
  const before = fixture(), next = applyWorkspaceCommand(before, 'dispatcher', { type: 'calculator', command: save() }, [...modules]);
  assert.equal(before.db.planning, undefined);
  const { planning, ...operations } = next.db;
  assert.deepEqual(operations, before.db); assert.deepEqual(next.workspace, before.workspace);
  assert.equal(planning!.scenarios.length, 1); validateCalculatorState(planning);
});
test('driver and disabled finance access are rejected and projections omit every calculator setting and result', () => {
  const snapshot = applyWorkspaceCommand(fixture(), 'admin', { type: 'calculator', command: save() }, [...modules]);
  const driver = snapshot.workspace.users.find(row => row.role === 'driver')!;
  assert.throws(() => applyWorkspaceCommand(snapshot, driver.id, { type: 'calculator', command: save('driver') }, [...modules]), /teisių/);
  assert.throws(() => applyWorkspaceCommand(snapshot, 'admin', { type: 'calculator', command: save('off') }, ['operations']), /finansų/);
  assert.equal(projectSnapshot(snapshot, driver, [...modules]).db.planning, undefined);
  assert.equal(projectSnapshot(snapshot, snapshot.workspace.users[0], ['operations']).db.planning, undefined);
  assert.equal(snapshot.db.planning!.scenarios.length, 1);
});
test('operational commits cannot edit calculator records or silently erase them through an old client', () => {
  const snapshot = applyWorkspaceCommand(fixture(), 'admin', { type: 'calculator', command: save() }, [...modules]);
  const oldClient = structuredClone(snapshot.db); delete oldClient.planning;
  oldClient.trips[0].notes = 'Updated note';
  const next = applyWorkspaceCommand(snapshot, 'dispatcher', { type: 'commit', db: oldClient }, ['operations']);
  assert.deepEqual(next.db.planning, snapshot.db.planning);
  const forged = structuredClone(snapshot.db); forged.planning!.defaults.fuelPrice = 1;
  assert.throws(() => applyWorkspaceCommand(snapshot, 'admin', { type: 'commit', db: forged }, [...modules]), /išsaugojimo/);
});
test('scenario revisions reject stale saves and deletes while explicit copies have independent assumptions', () => {
  let snapshot = applyWorkspaceCommand(fixture(), 'admin', { type: 'calculator', command: save() }, [...modules]);
  assert.throws(() => applyWorkspaceCommand(snapshot, 'admin', { type: 'calculator', command: save() }, [...modules]), /pakeistas/);
  const copy = save('copy'); copy.input.routeKm = 100;
  snapshot = applyWorkspaceCommand(snapshot, 'dispatcher', { type: 'calculator', command: copy }, [...modules]);
  assert.equal(snapshot.db.planning!.scenarios[0].input.routeKm, null);
  assert.equal(snapshot.db.planning!.scenarios[1].input.routeKm, 100);
  assert.throws(() => applyWorkspaceCommand(snapshot, 'admin', { type: 'calculator', command: { type: 'delete', id: 'plan', revision: 0 } }, [...modules]), /pakeistas/);
});
test('multiple linked scenarios require an explicit primary and changing it never recalculates saved results', () => {
  let snapshot = applyWorkspaceCommand(fixture(), 'admin', { type: 'calculator', command: save('one') }, [...modules]);
  snapshot = applyWorkspaceCommand(snapshot, 'admin', { type: 'calculator', command: save('two') }, [...modules]);
  assert.equal(primaryScenario(snapshot.db.planning, 't1').selected, undefined);
  const results = snapshot.db.planning!.scenarios.map(row => structuredClone(row.result));
  snapshot = applyWorkspaceCommand(snapshot, 'admin', { type: 'calculator', command: { type: 'primary', id: 'two', tripId: 't1' } }, [...modules]);
  assert.equal(primaryScenario(snapshot.db.planning, 't1').selected!.id, 'two');
  assert.deepEqual(snapshot.db.planning!.scenarios.map(row => row.result), results);
});
test('only company administrators can change defaults and saved scenarios retain their copied assumptions', () => {
  const snapshot = applyWorkspaceCommand(fixture(), 'admin', { type: 'calculator', command: save() }, [...modules]);
  const command: CalculatorCommand = { type: 'defaults', defaults: { ...emptyRates(), fuelPrice: 18000 }, vehicles: { v1: { wearPerKm: 1500 } } };
  assert.throws(() => applyWorkspaceCommand(snapshot, 'dispatcher', { type: 'calculator', command }, [...modules]), /vadovas/);
  const next = applyWorkspaceCommand(snapshot, 'admin', { type: 'calculator', command }, [...modules]);
  assert.deepEqual(next.db.planning!.scenarios, snapshot.db.planning!.scenarios);
  assert.throws(() => applyWorkspaceCommand(snapshot, 'admin', { type: 'calculator', command: { ...command, vehicles: { foreign: {} } } }, [...modules]), /nerastas/);
});
test('backup restoration includes calculator history and explicit clear removes calculator data', () => {
  const saved = applyWorkspaceCommand(fixture(), 'admin', { type: 'calculator', command: save() }, [...modules]);
  const restored = applyWorkspaceCommand(fixture(), 'admin', { type: 'restore', snapshot: JSON.parse(JSON.stringify(saved)) }, [...modules]);
  assert.deepEqual(restored.db.planning, saved.db.planning);
  const cleared = applyWorkspaceCommand(saved, 'admin', companyResetCommand(saved, { mode: 'clear', confirmed: true }), ['operations']);
  assert.equal(cleared.db.planning, undefined);
  assert.equal(cleared.db.orders.length, 0);
});
