import type { ReviewSnapshot, WorkspaceUser } from './workspace.ts';
import { driverPermissions } from './trip-finance.ts';
import { driverVisibleTrip } from './record-mode.ts';

export function projectSnapshot(snapshot: ReviewSnapshot, user: WorkspaceUser): ReviewSnapshot {
  if (user.role !== 'driver') return snapshot;
  const s = structuredClone(snapshot), own = driverPermissions(user);
  s.db.trips = s.db.trips.filter(t => t.driverId === user.driverId && driverVisibleTrip(t));
  const trips = new Set(s.db.trips.map(t => t.id));
  s.db.orders = s.db.orders.filter(o => trips.has(o.tripId));
  const orders = new Set(s.db.orders.map(o => o.id));
  s.db.routes = [];
  s.db.vehicles = s.db.vehicles.filter(v => s.db.trips.some(t => t.vehicleId === v.id));
  s.db.drivers = s.db.drivers.filter(d => d.id === user.driverId);
  s.db.customers = [];
  s.db.expenses = own.recordExpenses ? s.db.expenses.filter(e => trips.has(e.tripId) && s.workspace.expenseSubmissions?.some(r => r.expenseId === e.id && r.actorId === user.id)) : [];
  if (!own.collectPayments) s.db.orders = s.db.orders.map(o => ({ ...o, price: 0, paid: 0, priceSet: false }));
  s.workspace.users = [user];
  s.workspace.tripReviews = s.workspace.tripReviews?.filter(review => trips.has(review.tripId));
  s.workspace.notifications = s.workspace.notifications.filter(n => n.recipientId === user.id
    && (n.entity.type === 'trip' ? trips.has(n.entity.id) : n.entity.type === 'order' && orders.has(n.entity.id)));
  s.workspace.confirmations = s.workspace.confirmations.filter(c => trips.has(c.tripId) && orders.has(c.orderId));
  s.workspace.receipts = own.collectPayments ? s.workspace.receipts?.filter(r => r.actorId === user.id && orders.has(r.orderId)) : [];
  s.workspace.expenseSubmissions = s.workspace.expenseSubmissions?.filter(r => r.actorId === user.id && trips.has(r.tripId));
  s.workspace.corrections = s.workspace.corrections?.filter(c => trips.has(c.tripId));
  s.workspace.preferences = { [user.id]: s.workspace.preferences[user.id] ?? { inApp: true } };
  return s;
}

