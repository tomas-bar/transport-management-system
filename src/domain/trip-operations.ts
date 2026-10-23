import type { Order, Trip } from './models.ts';
import type { ReviewSnapshot, WorkspaceUser } from './workspace.ts';
import { saveTrip } from './logic.ts';
import { nextCompanyReference } from './references.ts';

export interface TripReviewInput {
  tripId: string;
  completedOrderIds: string[];
  finish: boolean;
  note: string;
}
export interface TripReview extends TripReviewInput {
  id: string;
  actorId: string;
  createdAt: string;
}
export interface RepeatTripInput {
  sourceId: string;
  tripId: string;
  departure: string;
  arrival: string;
  vehicleId: string;
  driverId: string;
  orderIds: string[];
  copyPrices: boolean;
}

function manager(snapshot: ReviewSnapshot, user: WorkspaceUser) {
  if (!user.active || !['admin', 'dispatcher'].includes(user.role) || user.companyId !== snapshot.workspace.companyId) {
    throw new Error('Šį veiksmą gali atlikti įmonės administratorius arba vadybininkas.');
  }
}

/** Register the manager's retrospective summary without inventing driver arrival times. */
export function reviewTrip(snapshot: ReviewSnapshot, user: WorkspaceUser, input: TripReviewInput) {
  manager(snapshot, user);
  if (!input || typeof input !== 'object') throw new Error('Patikrinkite reiso suvestinę.');
  const trip = snapshot.db.trips.find(record => record.id === input.tripId);
  if (!trip || ['completed', 'cancelled'].includes(trip.status)) throw new Error('Reisas nepasiekiamas arba jau uždarytas.');
  if (!Array.isArray(input.completedOrderIds) || new Set(input.completedOrderIds).size !== input.completedOrderIds.length || typeof input.finish !== 'boolean' || typeof input.note !== 'string' || input.note.length > 1000) {
    throw new Error('Patikrinkite reiso suvestinę.');
  }
  const orders = snapshot.db.orders.filter(order => order.tripId === trip.id && order.status !== 'cancelled');
  const selected = new Set(input.completedOrderIds);
  if (input.completedOrderIds.some(id => !orders.some(order => order.id === id))) throw new Error('Pasirinktas užsakymas šiam reisui nepriklauso.');
  if (orders.some(order => order.status === 'completed' && !selected.has(order.id))) throw new Error('Ankstesnio pristatymo patvirtinimo atšaukti negalima.');
  if (input.finish && orders.some(order => !selected.has(order.id))) throw new Error('Prieš užbaigdami reisą patvirtinkite visus pristatymus. Dalinę eigą galite išsaugoti.');

  const createdAt = new Date().toISOString();
  for (const order of orders.filter(record => selected.has(record.id))) {
    for (const kind of ['pickup', 'delivery'] as const) {
      if (!snapshot.workspace.confirmations.some(event => event.tripId === trip.id && event.orderId === order.id && event.kind === kind)) {
        snapshot.workspace.confirmations.push({ id: crypto.randomUUID(), tripId: trip.id, orderId: order.id, kind, actorId: user.id, createdAt, source: 'manager' });
      }
    }
    order.status = 'completed';
  }
  if (input.finish) saveTrip(snapshot.db, { ...trip, status: 'completed' });
  else trip.status = 'active';
  (snapshot.workspace.tripReviews ??= []).push({ ...input, note: input.note.trim(), id: crypto.randomUUID(), actorId: user.id, createdAt });
}

/** Copy explicit bookings, route and resources; financial and execution history stay on the source. */
export function repeatTrip(snapshot: ReviewSnapshot, user: WorkspaceUser, input: RepeatTripInput) {
  manager(snapshot, user);
  if (!input || typeof input !== 'object' || typeof input.departure !== 'string' || typeof input.arrival !== 'string') throw new Error('Patikrinkite naujo reiso duomenis.');
  const db = snapshot.db;
  const source = db.trips.find(trip => trip.id === input.sourceId);
  if (!source) throw new Error('Pradinis reisas nerastas.');
  if (typeof input.tripId !== 'string' || !input.tripId.trim() || input.tripId.length > 100 || db.trips.some(trip => trip.id === input.tripId)) throw new Error('Naujo reiso identifikatorius netinkamas.');
  if (!Array.isArray(input.orderIds) || new Set(input.orderIds).size !== input.orderIds.length || typeof input.copyPrices !== 'boolean') throw new Error('Patikrinkite pasirinktus užsakymus.');
  const selected = db.orders.filter(order => input.orderIds.includes(order.id));
  if (selected.length !== input.orderIds.length || selected.some(order => order.tripId !== source.id || order.status === 'cancelled')) throw new Error('Pasirinkite tik šio reiso neatšauktus užsakymus.');

  const copies = new Map<string, Order>();
  for (const order of selected) {
    copies.set(order.id, {
      ...structuredClone(order), id: crypto.randomUUID(),
      number: nextCompanyReference({ ...db, orders: [...db.orders, ...copies.values()] }, 'orders'),
      date: input.departure.slice(0, 10), tripId: input.tripId, status: 'assigned',
      price: input.copyPrices ? order.price : 0,
      priceSet: input.copyPrices ? (order.priceSet ?? order.price > 0) : false,
      paid: 0,
    });
  }
  const trip: Trip = {
    ...structuredClone(source), id: input.tripId,
    number: nextCompanyReference(db, 'trips'),
    departure: input.departure, arrival: input.arrival,
    vehicleId: input.vehicleId, driverId: input.driverId,
    routeId: db.routes.some(route => route.id === source.routeId && !route.archived) ? source.routeId : '',
    status: 'planned',
    stops: source.stops.filter(stop => !stop.orderId || copies.has(stop.orderId)).map(stop => ({
      ...structuredClone(stop), id: crypto.randomUUID(),
      orderId: stop.orderId ? copies.get(stop.orderId)!.id : undefined,
      kind: stop.orderId ? stop.kind : undefined,
      arrival: undefined, completed: false,
    })),
  };
  db.orders.push(...copies.values());
  saveTrip(db, trip);
}
