import { Check, ChevronRight } from 'lucide-react';
import type { Trip } from '../domain/models';
import { routeVisits } from '../domain/route-plan';
export function Journey({
  trip,
  compact = false
}: {
  trip: Trip;
  compact?: boolean;
}) {
  const visits = routeVisits(trip.stops);
  const current = visits.findIndex(v => !v.completed);
  return <div className={`journey ${compact ? 'compact' : ''}`} aria-label="Reiso eiga">{visits.map((v, i) => <div key={v.place.id} className={`journey-step ${v.completed || trip.status === 'completed' ? 'done' : i === current ? 'next' : ''}`}><span className="journey-node">{v.completed || trip.status === 'completed' ? <Check size={13} /> : i + 1}</span><span>{v.place.name}</span>{i < visits.length - 1 && <ChevronRight className="journey-arrow" size={14} />}</div>)}</div>;
}
