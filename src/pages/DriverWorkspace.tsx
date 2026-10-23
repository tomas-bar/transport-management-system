import { useState } from 'react';
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, MapPin, Package,
  Play, Truck, UserRound, Navigation, ChevronDown, Users, Undo2, LockKeyhole,
} from 'lucide-react';
import { useConfirm } from '../components/Feedback';
import { TripPhotos } from '../components/OrderPhotos';
import { useApp } from '../context';
import { Badge, Button, Empty, PageHeading, Plate } from '../components/ui';
import { TripFinance } from '../components/TripFinance';
import { Journey } from '../components/Journey';
import { MapView } from '../components/MapView';
import { HandoverIcon } from '../components/HandoverIcon';
import { dateLabel, tripOrders } from '../domain/logic';
import { tripProgress } from '../domain/trip-progress';
import { handoverLabels, visitStateLabels } from '../domain/terminology';
import type { Trip } from '../domain/models';

export function DriverWorkspace({ id }: { id?: string }) {
  const confirm = useConfirm();
  const { db, user, navigate, driverCommand, busy, workspace } = useApp();
  const [history, setHistory] = useState(false);
  const [showMap, setShowMap] = useState(false);
  if (!user || user.role !== 'driver') return null;
  const trips = db.trips.filter(trip => trip.driverId === user.driverId)
    .sort((a, b) => a.departure.localeCompare(b.departure));
  const trip = id ? trips.find(trip => trip.id === id) : undefined;
  if (id && !trip) return <Empty title="Reisas nepasiekiamas" description="Galite peržiūrėti tik jums priskirtus reisus.">
    <Button onClick={() => navigate('my-trips')}>Mano reisai</Button></Empty>;
  if (!trip) {
    const visible = trips.filter(trip => history ? ['completed', 'cancelled'].includes(trip.status)
      : !['completed', 'cancelled'].includes(trip.status));
    return <><PageHeading eyebrow={user.name} title="Mano reisai" />
      <div className="review-tabs"><button className={!history ? 'selected' : ''} onClick={() => setHistory(false)}>Artimiausi</button>
        <button className={history ? 'selected' : ''} onClick={() => setHistory(true)}>Istorija</button></div>
      <div className="driver-trip-list">{visible.map(trip => <DriverTripCard key={trip.id} trip={trip} />)}</div>
      {!visible.length && <Empty title={history ? 'Užbaigtų reisų nėra' : 'Priskirtų reisų nėra'} description="Čia rodomi jums priskirti reisai." />}
    </>;
  }
  const vehicle = db.vehicles.find(vehicle => vehicle.id === trip.vehicleId);
  const orders = tripOrders(db, trip.id);
  const progress = tripProgress(trip, orders, workspace.confirmations);
  const { visits, nextArrival } = progress;
  const closed = ['completed', 'cancelled'].includes(trip.status);
  const pendingVisit = visits[progress.focusIndex];
  const unfinished = orders.filter(order => !['completed', 'cancelled'].includes(order.status));
  const scrollToVisit = (number: number) => document.getElementById(`visit-${number}`)?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start',
  });
  return <>
    <button className="back-link" onClick={() => navigate('my-trips')}><ArrowLeft size={17} />Mano reisai</button>
    <PageHeading eyebrow={trip.number} title={trip.name}><Badge status={trip.status} /></PageHeading>
    <div className="driver-meta"><span><Clock3 size={17} />{dateLabel(trip.departure, true)}</span>
      {vehicle && <span><Truck size={17} />{vehicle.model}<Plate value={vehicle.plate} /></span>}</div>
    <Journey trip={trip} onVisitSelect={scrollToVisit} />
    <div className="driver-progress" aria-label="Reiso suvestinė">
      <span><MapPin size={16} />Atvykta <b>{progress.arrived} / {visits.length}</b></span>
      <span><CheckCircle2 size={16} />Užduotys <b>{progress.confirmedTasks} / {progress.taskCount}</b></span>
      <progress max={progress.taskCount || visits.length || 1} value={progress.taskCount ? progress.confirmedTasks : progress.completed} aria-label="Patvirtintų užduočių eiga" />
    </div>
    {!closed && <div className={`driver-next ${pendingVisit?.pending && pendingVisit.completed ? 'needs-tasks' : ''}`}>
      <div><span className="overline">{trip.status !== 'active' ? 'IŠVYKIMAS' : pendingVisit?.completed ? 'LIKUSIOS UŽDUOTYS' : 'TOLIAU'}
      </span><h2>{pendingVisit?.place.name ?? 'Sustojimai aplankyti'}</h2>
        <p>{pendingVisit ? pendingVisit.completed ? `Atvykta. Nepatvirtintos užduotys: ${pendingVisit.pending}.`
          : pendingVisit.place.address : unfinished.length ? 'Liko nepatvirtintų pristatymų.' : 'Visos užduotys atliktos.'}</p>
      </div>
      {trip.status === 'confirmed' ? <Button disabled={busy} onClick={() => driverCommand({ type: 'start', tripId: trip.id })}>
        <Play size={18} />Pradėti reisą</Button>
        : trip.status === 'planned' ? <span className="status-note">Laukiama vadybininko patvirtinimo</span>
        : pendingVisit ? <Button variant="secondary" onClick={() => scrollToVisit(pendingVisit.number)}>
          {pendingVisit.pending ? 'Rodyti užduotis' : 'Rodyti sustojimą'}<ArrowRight size={18} /></Button>
        : <Button disabled={busy || unfinished.length > 0} onClick={async () => {
          if (await confirm('Visi sustojimai ir pristatymai patvirtinti. Užbaigti reisą?', { title: 'Užbaigti reisą', confirmLabel: 'Užbaigti reisą' }))
            driverCommand({ type: 'finish', tripId: trip.id });
        }}><CheckCircle2 size={18} />Užbaigti reisą</Button>}
    </div>}
    <div className="driver-section-heading"><h2>Sustojimai ir užduotys</h2>
      <button className="text-link" aria-expanded={showMap} onClick={() => setShowMap(!showMap)}>
        <MapPin size={17} />{showMap ? 'Slėpti žemėlapį' : 'Rodyti žemėlapį'}<ChevronDown size={15} /></button></div>
    {showMap && <div className="panel driver-map"><MapView stops={trip.stops} /></div>}
    <div className="driver-visits">{visits.map((visit, index) => {
      const canUndoArrival = !closed && visit.completed && index === visits.findLastIndex(visit => visit.completed)
        && !visit.tasks.some(task => task.confirmation);
      return <article id={`visit-${visit.number}`} key={visit.place.id} className={`driver-visit state-${visit.state}`}>
        <header><span className="visit-number">{visit.done ? <Check size={19} /> : visit.number}</span>
          <div><h3>{visit.place.name}</h3><p>{visit.place.address}</p></div>
          <span className="visit-state">{visitStateLabels[visit.state]}</span>
        </header>
        {visit.tasks.length > 0 && <div className="visit-task-count">
          <CheckCircle2 size={14} />Patvirtinta {visit.tasks.length - visit.pending} / {visit.tasks.length}
        </div>}
        <div className="driver-tasks">{visit.tasks.map(task => {
          const { confirmation: event, done } = task;
          const canUndo = event?.actorId === user.id && !closed && (task.kind === 'delivery'
            || !workspace.confirmations.some(event => event.tripId === trip.id && event.orderId === task.orderId && event.kind === 'delivery'));
          const labels = handoverLabels[task.kind];
          return <div className={`driver-task ${done ? 'done' : task.allowed ? 'ready' : 'waiting'}`} key={task.stopId}>
            <span className={`task-symbol ${done ? 'confirmed' : task.kind}`} aria-hidden="true">
              {done ? <CheckCircle2 size={20} /> : task.type === 'passenger' ? <UserRound size={20} /> : <Package size={20} />}</span>
            <div className="driver-task-info"><span className={`task-kind ${task.kind}`}><HandoverIcon kind={task.kind} size={14} />
              {labels.title}<span>· {task.type === 'passenger' ? 'Keleiviai' : 'Siuntos'}: {task.quantity}</span></span>
              <b>{task.name}</b>{task.phone && <a className="task-phone" href={`tel:${task.phone.replace(/\s/g, '')}`}>{task.phone}</a>}
            </div>
            {done ? <div className="task-result"><span className="task-done"><Check size={15} />{labels.done}</span>
              {event && <small title="Patvirtinimo registravimo laikas">{dateLabel(event.createdAt, true)}</small>}
              {canUndo && <button className="undo-action" disabled={busy} onClick={async () => {
                if (await confirm(`Atšaukti ${task.kind === 'pickup' ? 'paėmimo' : 'pristatymo'} patvirtinimą?`, { confirmLabel: 'Atšaukti patvirtinimą' }))
                  driverCommand({ type: 'undoTask', tripId: trip.id, confirmationId: event!.id });
              }}><Undo2 size={14} />Atšaukti {task.kind === 'pickup' ? 'paėmimą' : 'pristatymą'}</button>}</div>
              : !closed && (task.allowed ? <Button disabled={busy} onClick={() => driverCommand({ type: 'task', tripId: trip.id, orderId: task.orderId, kind: task.kind })}>
                <HandoverIcon kind={task.kind} />{labels.action}</Button>
                : <span className="task-blocked"><LockKeyhole size={13} />{trip.status !== 'active' ? 'Reisas nepradėtas'
                  : task.blockedBy === 'pickup' ? 'Pirmiausia paėmimas' : 'Laukia ankstesnių sustojimų'}</span>)}
          </div>;
        })}</div>
        {index === nextArrival && trip.status === 'active' && <div className="visit-action">
          <a target="_blank" rel="noreferrer" className="button secondary" href={`https://www.google.com/maps/dir/?api=1&destination=${visit.place.lat},${visit.place.lng}&travelmode=driving`}>
            <Navigation size={17} />Naviguoti</a>
          <Button variant="secondary" disabled={busy} onClick={() => driverCommand({ type: 'arrive', tripId: trip.id, visitIndex: index })}><MapPin size={17} />Atvykau</Button>
        </div>}
        {canUndoArrival && <button className="undo-action undo-arrival" disabled={busy} onClick={async () => {
          if (await confirm('Atšaukti atvykimo patvirtinimą?', { confirmLabel: 'Atšaukti atvykimą' }))
            driverCommand({ type: 'undoArrival', tripId: trip.id, visitIndex: index });
        }}><Undo2 size={14} />Atšaukti atvykimą</button>}
      </article>;
    })}</div>
    <TripPhotos tripId={trip.id} collapsible /><TripFinance tripId={trip.id} driverMode />
    {trip.notes && <div className="driver-notes"><h2>Reiso pastabos</h2><p>{trip.notes}</p></div>}
  </>;
}

function DriverTripCard({ trip }: { trip: Trip }) {
  const { db, navigate } = useApp();
  const orders = tripOrders(db, trip.id);
  const vehicle = db.vehicles.find(vehicle => vehicle.id === trip.vehicleId);
  return <button className={`driver-trip-card ${trip.status === 'active' ? 'running' : ''}`} onClick={() => navigate(`my-trips/${trip.id}`)}>
    <header><span>{trip.number} · {dateLabel(trip.departure, true)}</span><Badge status={trip.status} /></header><h2>{trip.name}</h2>
    <Journey trip={trip} compact /><footer>{vehicle && <Plate value={vehicle.plate} />}
      <span><Users size={17} />{orders.filter(order => order.type === 'passenger').reduce((sum, order) => sum + order.quantity, 0)}</span>
      <span><Package size={17} />{orders.filter(order => order.type === 'parcel').reduce((sum, order) => sum + order.quantity, 0)}</span>
      <ArrowRight size={21} /></footer>
  </button>;
}
