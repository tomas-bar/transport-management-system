import type { Database, Order, Trip } from './models.ts';

export const isDraft = (trip: Trip) => trip.recordMode === 'draft';
export const isHistorical = (trip: Trip) => trip.recordMode === 'historical';
export const driverVisibleTrip = (trip: Trip) => !trip.recordMode;
export const draftOrder = (db: Database, order: Order) => db.trips.some(trip => trip.id === order.tripId && isDraft(trip));
export const historicalOrder = (db: Database, order: Order) => order.recordMode === 'historical'
  || db.trips.some(trip => trip.id === order.tripId && isHistorical(trip));

/** A published assignment cannot be silently withdrawn or relabelled as historical. */
export function validateRecordModeChanges(before: Database, after: Database) {
  for (const trip of after.trips) {
    const old = before.trips.find(record => record.id === trip.id);
    if (!old || old.recordMode === trip.recordMode) continue;
    if (!isDraft(old) || trip.recordMode || !['planned', 'confirmed'].includes(trip.status)) {
      throw new Error('Paskelbto ar istorinio reiso į juodraštį perkelti negalima.');
    }
  }
  for (const order of after.orders) {
    const old = before.orders.find(record => record.id === order.id);
    if (old && old.recordMode !== order.recordMode) throw new Error('Išsaugoto užsakymo įrašo tipo keisti negalima.');
  }
}

/** Backfill may add linked historical orders, never rewrite existing route records. */
export function historicalStopsAppendOnly(before: Database, after: Database, old: Trip, changed: Trip) {
  if (!isHistorical(old) || !isHistorical(changed)) return false;
  const ids = new Set(old.stops.map(stop => stop.id));
  if (JSON.stringify(changed.stops.filter(stop => ids.has(stop.id))) !== JSON.stringify(old.stops)) return false;
  return changed.stops.filter(stop => !ids.has(stop.id)).every(stop => stop.completed && stop.orderId
    && !before.orders.some(order => order.id === stop.orderId && order.tripId)
    && after.orders.some(order => order.id === stop.orderId && order.tripId === old.id && historicalOrder(after, order)));
}
