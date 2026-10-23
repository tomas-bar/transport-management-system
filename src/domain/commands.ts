import { reviewTrip, repeatTrip, type TripReviewInput, type RepeatTripInput } from './trip-operations.ts';
import type { Database } from './models.ts';
import { validateDatabase } from './logic.ts';
import { createWorkspace, validateWorkspace, applyDriverCommand, notificationChanges, type DriverCommand, type ReviewSnapshot, type WorkspaceUser } from './workspace.ts';
import { applyFinanceCommand, type FinanceCommand } from './trip-finance.ts';
import { markNotificationsRead } from './notifications.ts';
import { routeVisits } from './route-plan.ts';
import { validateReferenceChanges } from './references.ts';
import type { ModuleId } from './modules.ts';

export type WorkspaceCommand =
  | { type: 'commit'; db: Database }
  | { type: 'reviewTrip'; input: TripReviewInput }
  | { type: 'repeatTrip'; input: RepeatTripInput }
  | { type: 'driver'; command: DriverCommand }
  | { type: 'finance'; command: FinanceCommand }
  | { type: 'read'; ids?: string[] }
  | { type: 'preference'; enabled: boolean }
  | { type: 'print'; mode: 'monochrome' | 'color' }
  | { type: 'user'; user: WorkspaceUser }
  | { type: 'restore'; snapshot: ReviewSnapshot };

export function applyWorkspaceCommand(before: ReviewSnapshot, actorId: string, command: WorkspaceCommand, modules: ModuleId[]): ReviewSnapshot {
  const next = structuredClone(before);
  const user = before.workspace.users.find(u => u.id === actorId && u.active);
  if (!user || user.companyId !== before.workspace.companyId) throw new Error('Prieiga nesuteikta.');
  const admin = () => { if (user.role !== 'admin') throw new Error('Šį veiksmą gali atlikti administratorius.'); };
  switch (command.type) {
    case 'commit': {
      if (!['admin', 'dispatcher'].includes(user.role)) throw new Error('Šis veiksmas neleidžiamas.');
      next.db = validateDatabase(command.db);
      if (user.role !== 'admin' && JSON.stringify(before.db.settings) !== JSON.stringify(next.db.settings)) admin();
      validateReferenceChanges(before.db, next.db, user.role === 'admin');
      if (!modules.includes('finance') && (JSON.stringify(before.db.expenses) !== JSON.stringify(next.db.expenses) || next.db.orders.some(o => {
        const old = before.db.orders.find(r => r.id === o.id);
        return old ? o.price !== old.price || o.paid !== old.paid || o.priceSet !== old.priceSet : o.paid !== 0 || o.price !== 0;
      }))) throw new Error('Finansų modulis išjungtas.');
      for (const old of before.db.orders) {
        const changed = next.db.orders.find(o => o.id === old.id);
        const confirmed = before.workspace.confirmations.some(c => c.orderId === old.id);
        if ((confirmed || old.status === 'completed') && (!changed || ['tripId', 'pickup', 'delivery', ...(old.status === 'completed' ? ['date', 'quantity', 'weight', 'type', 'customerId', 'status'] : [])].some(key => JSON.stringify(old[key as keyof typeof old]) !== JSON.stringify(changed[key as keyof typeof old])))) throw new Error('Patvirtinto užsakymo maršruto ir krovinio pakeisti negalima.');
      }
      for (const old of before.db.trips.filter(t => t.status === 'completed')) {
        const changed = next.db.trips.find(t => t.id === old.id);
        if (!changed || ['status', 'departure', 'arrival', 'driverId', 'vehicleId', 'stops'].some(key => JSON.stringify(old[key as keyof typeof old]) !== JSON.stringify(changed[key as keyof typeof old]))) throw new Error('Užbaigto reiso pakeisti negalima.');
      }
      break;
    }
    case 'reviewTrip':
      reviewTrip(next, user, command.input);
      break;
    case 'repeatTrip':
      if (command.input.copyPrices && !modules.includes('finance')) throw new Error('Finansų modulis išjungtas.');
      repeatTrip(next, user, command.input);
      break;
    case 'driver': {
      applyDriverCommand(next, user, command.command);
      const action = command.command;
      if (!['start', 'finish'].includes(action.type) && !(action.type === 'task' && action.kind === 'delivery')) {
        const trip = next.db.trips.find(t => t.id === action.tripId)!;
        const correction = action.type === 'undoTask' || action.type === 'undoArrival';
        const detail = action.type === 'arrive' ? routeVisits(trip.stops)[action.visitIndex]?.place.name : action.type === 'task' ? next.db.orders.find(o => o.id === action.orderId)?.name : '';
        for (const recipient of next.workspace.users.filter(u => u.active && u.role !== 'driver' && next.workspace.preferences[u.id]?.inApp !== false)) next.workspace.notifications.push({ id: crypto.randomUUID(), recipientId: recipient.id, actorId: user.id, type: 'task', activity: correction ? 'correction' : action.type === 'arrive' ? 'arrival' : 'pickup', title: correction ? 'Patvirtinimas atšauktas' : action.type === 'arrive' ? 'Atvykta į sustojimą' : 'Paėmimas patvirtintas', body: detail ?? '', entity: { type: 'trip', id: trip.id }, createdAt: new Date().toISOString() });
      }
      break;
    }
    case 'finance':
      if (!modules.includes('finance')) throw new Error('Finansų modulis išjungtas.');
      applyFinanceCommand(next, user, command.command);
      break;
    case 'read':
      if (command.ids !== undefined && (!Array.isArray(command.ids) || command.ids.some(id => typeof id !== 'string'))) throw new Error('Netinkamas pranešimų sąrašas.');
      markNotificationsRead(next.workspace, user.id, command.ids);
      break;
    case 'preference':
      if (typeof command.enabled !== 'boolean') throw new Error('Netinkama nuostata.');
      next.workspace.preferences[user.id] = { inApp: command.enabled };
      break;
    case 'print':
      admin();
      if (!['monochrome', 'color'].includes(command.mode)) throw new Error('Netinkamas spausdinimo būdas.');
      next.workspace.printMode = command.mode;
      break;
    case 'user': {
      admin();
      if (!command.user || command.user.companyId !== next.workspace.companyId) throw new Error('Kitos įmonės naudotojas.');
      if (command.user.id === user.id && (!command.user.active || command.user.role !== 'admin')) throw new Error('Savo administratoriaus prieigos pakeisti negalima.');
      const index = next.workspace.users.findIndex(u => u.id === command.user.id);
      if (index < 0) next.workspace.users.push(command.user); else next.workspace.users[index] = command.user;
      break;
    }
    case 'restore': {
      admin();
      next.db = validateDatabase(command.snapshot.db);
      const imported = command.snapshot.workspace ?? createWorkspace(next.db);
      next.workspace = structuredClone(imported);
      next.workspace.companyId = before.workspace.companyId;
      next.workspace.users = next.workspace.users.map(u => ({ ...u, companyId: before.workspace.companyId }));
      // Authentication is outside backups. Preserve all existing identities and privileges.
      for (const existing of before.workspace.users) {
        const index = next.workspace.users.findIndex(u => u.id === existing.id);
        const retained = { ...existing, active: existing.role === 'driver' && !next.db.drivers.some(d => d.id === existing.driverId) ? false : existing.active };
        if (index < 0) next.workspace.users.push(retained); else next.workspace.users[index] = retained;
      }
      break;
    }
    default: throw new Error('Nežinomas veiksmas.');
  }
  if (!['read', 'preference', 'print', 'restore', 'user'].includes(command.type)) next.workspace.notifications.push(...notificationChanges(before.db, next.db, next.workspace, user.id));
  validateDatabase(next.db);
  for (const trip of next.db.trips) for (const order of next.db.orders.filter(o => o.tripId === trip.id && o.status !== 'cancelled')) {
    const pickup = trip.stops.findIndex(s => s.orderId === order.id && s.kind === 'pickup');
    const delivery = trip.stops.findIndex(s => s.orderId === order.id && s.kind === 'delivery');
    if (pickup < 0 || delivery <= pickup) throw new Error('Paėmimo sustojimas turi būti prieš pristatymą.');
  }
  validateWorkspace(next.workspace, next.db);
  return next;
}
