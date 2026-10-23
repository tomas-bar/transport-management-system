import type { Database } from './models.ts';
import { isDraft } from './record-mode.ts';

/** Selected-day work includes trips that started earlier and are still in progress. */
export function dayPlan(db: Database, day: string) {
  const trips = db.trips.filter(trip => !isDraft(trip) && trip.departure.slice(0, 10) <= day
    && trip.arrival.slice(0, 10) >= day && trip.status !== 'cancelled')
    .sort((a, b) => a.departure.localeCompare(b.departure));
  const ids = new Set(trips.map(trip => trip.id));
  const orders = db.orders.filter(order => ids.has(order.tripId) && order.status !== 'cancelled');
  const waiting = db.orders.filter(order => !order.tripId && !['completed', 'cancelled'].includes(order.status) && order.date <= day);
  const overdue = db.trips.filter(trip => !isDraft(trip) && trip.arrival.slice(0, 10) < day && !['completed', 'cancelled'].includes(trip.status));
  const unconfirmed = trips.filter(trip => trip.status === 'planned');
  const ready = trips.filter(trip => trip.status === 'active' && trip.stops.every(stop => stop.completed)
    && orders.filter(order => order.tripId === trip.id).every(order => order.status === 'completed'));
  return { trips, orders, waiting, overdue, unconfirmed, ready };
}
