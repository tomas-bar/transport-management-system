import type { Database } from './models.ts';
export function contactWarnings(db: Database, tripId: string) {
  return db.orders.filter(o => o.tripId === tripId && !['completed', 'cancelled'].includes(o.status)).flatMap(o => [
    ...(!o.phone.trim() ? [{ orderId: o.id, message: `${o.number}: nenurodytas paėmimo kontaktinis telefonas.` }] : []),
    ...(o.type === 'parcel' && !o.recipientPhone.trim() ? [{ orderId: o.id, message: `${o.number}: nenurodytas gavėjo telefonas.` }] : []),
  ]);
}
