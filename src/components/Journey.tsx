import { useEffect, useRef } from 'react';
import { Check, CircleDot } from 'lucide-react';
import { useApp } from '../context';
import type { Trip } from '../domain/models';
import { tripProgress } from '../domain/trip-progress';
import { visitStateLabels } from '../domain/terminology';

export function Journey({ trip, compact = false, onVisitSelect }: {
  trip: Trip;
  compact?: boolean;
  onVisitSelect?: (number: number) => void;
}) {
  const { db, workspace } = useApp();
  const progress = tripProgress(trip, db.orders, workspace.confirmations);
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = strip.current;
    const node = container?.children[progress.focusIndex] as HTMLElement | undefined;
    if (!container || !node || container.scrollWidth <= container.clientWidth) return;
    container.scrollTo({ left: node.offsetLeft - container.offsetLeft - (container.clientWidth - node.clientWidth) / 2,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, [trip.id, progress.focusIndex]);
  return <div ref={strip} className={`journey ${compact ? 'compact' : ''}`} role="list" aria-label="Reiso eiga"
    tabIndex={onVisitSelect || compact ? undefined : 0}>
    {progress.visits.map(visit => {
      const label = `${visit.number}. ${visit.place.name}: ${visitStateLabels[visit.state]}`;
      const node = <><span className="journey-node">
        {visit.done ? <Check size={13} /> : visit.state === 'arrived' ? <CircleDot size={13} /> : visit.number}
      </span><span>{visit.place.name}</span></>;
      return <div key={visit.place.id} role="listitem" className={`journey-step ${visit.state === 'done' ? 'done' : visit.state === 'arrived' ? 'arrived' : visit.state === 'next' ? 'next' : ''}`}
        aria-label={onVisitSelect ? undefined : label} title={label}>
        {onVisitSelect ? <button type="button" className="journey-jump" aria-label={label}
          onClick={() => onVisitSelect(visit.number)}>{node}</button> : node}
      </div>;
    })}
  </div>;
}
