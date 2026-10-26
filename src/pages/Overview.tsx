import { isDraft } from '../domain/record-mode';
import { useState } from 'react';
import {
  Plus, ArrowUpRight, ArrowRight, Users, Package, ChevronLeft, ChevronRight,
  Route, Truck, UserRound, CheckCircle2, ClipboardCheck, Clock3,
} from 'lucide-react';
import { DueReminders } from '../components/DueReminders';
import { useApp } from '../context';
import { PageHeading, Button, Badge, Plate, Empty } from '../components/ui';
import { TripForm } from '../components/TripForm';
import { OrderForm } from '../components/OrderForm';
import { Journey } from '../components/Journey';
import { today, loadInfo } from '../domain/logic';
import { tripProgress } from '../domain/trip-progress';
import { dayPlan } from '../domain/day-plan';

export function Overview() {
  const { db, workspace, navigate } = useApp();
  const [tripForm, setTripForm] = useState(false);
  const [orderForm, setOrderForm] = useState(false);
  const [day, setDay] = useState(today());
  const date = new Date(`${day}T12:00:00`);
  const shift = (amount: number) => {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    setDay(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`);
  };
  const { trips, orders, waiting, overdue, unconfirmed, ready } = dayPlan(db, day);
  const active = trips.filter(trip => trip.status === 'active');
  const passengers = orders.filter(order => order.type === 'passenger');
  const parcels = orders.filter(order => order.type === 'parcel');
  const unlisted = (kind: 'passengers' | 'parcels', completed = false) => trips.filter(trip => !completed || trip.status === 'completed').reduce((sum, trip) => sum + (trip.unlisted?.[kind] ?? 0), 0);
  const quantity = (records: typeof orders) => records.reduce((sum, order) => sum + order.quantity, 0);
  const upcoming = db.trips.filter(trip => !isDraft(trip) && trip.departure.slice(0, 10) > day && !['completed', 'cancelled'].includes(trip.status))
    .sort((a, b) => a.departure.localeCompare(b.departure)).slice(0, 3);
  const waitingPath = `orders?assignment=unassigned&until=${day}`;
  const actions = [
    ...(waiting.length ? [{ key: 'orders', Icon: Package, title: `Nepriskirti užsakymai: ${waiting.length}`, detail: `Iki ${day}`, path: waitingPath }] : []),
    ...ready.map(trip => ({ key: trip.id, Icon: ClipboardCheck, title: `${trip.number} laukia užbaigimo`, detail: trip.name, path: `trips/${trip.id}` })),
    ...overdue.map(trip => ({ key: trip.id, Icon: Clock3, title: `${trip.number} neuždarytas`, detail: `Planuotas atvykimas: ${trip.arrival.replace('T', ' ')}`, path: `trips/${trip.id}` })),
    ...unconfirmed.map(trip => ({ key: trip.id, Icon: Route, title: `${trip.number} nepatvirtintas`, detail: trip.name, path: `trips/${trip.id}` })),
  ];
  return <>
    <PageHeading title="Dienos planas">
      <Button variant="secondary" onClick={() => setOrderForm(true)}><Plus size={18} />Naujas užsakymas</Button>
      <Button onClick={() => setTripForm(true)}><Plus size={18} />Naujas reisas</Button>
    </PageHeading>
    <div className="day-toolbar"><div>
      <button className="icon-button" aria-label="Ankstesnė diena" onClick={() => shift(-1)}><ChevronLeft size={19} /></button>
      <label><input type="date" aria-label="Plano data" value={day} onChange={event => { if (event.target.value) setDay(event.target.value); }} />
        <span>{new Intl.DateTimeFormat('lt-LT', { weekday: 'long', month: 'long', day: 'numeric' }).format(date)}</span></label>
      <button className="icon-button" aria-label="Kita diena" onClick={() => shift(1)}><ChevronRight size={19} /></button>
    </div><button className="today-button" onClick={() => setDay(today())}>Šiandien</button></div>
    <div className="operations-metrics">
      <div><span>Reisai</span><b>{trips.length}<small>Vykdomi: {active.length} · Užbaigti: {trips.filter(trip => trip.status === 'completed').length}</small></b><Route size={21} /></div>
      <div><span>Keleiviai reisuose</span><b>{quantity(passengers) + unlisted('passengers')}<small>Kelionę baigė: {quantity(passengers.filter(order => order.status === 'completed')) + unlisted('passengers', true)}</small></b><Users size={21} /></div>
      <div><span>Siuntos reisuose</span><b>{quantity(parcels) + unlisted('parcels')}<small>Pristatyta: {quantity(parcels.filter(order => order.status === 'completed')) + unlisted('parcels', true)}</small></b><Package size={21} /></div>
      <button onClick={() => navigate(waitingPath)}><span>Laukia reiso</span><b>{waiting.length}<small>Iki pasirinktos dienos</small></b><ArrowUpRight size={21} /></button>
    </div>
    <DueReminders day={day} />
    <div className="operations-board"><section className="day-trips">
      <div className="section-title"><h2>Reisų eiga <span>{trips.length}</span></h2><button className="text-link" onClick={() => navigate('trips')}>Visi reisai<ArrowUpRight size={16} /></button></div>
      {trips.map(trip => {
        const load = loadInfo(db, trip);
        const vehicle = db.vehicles.find(vehicle => vehicle.id === trip.vehicleId);
        const driver = db.drivers.find(driver => driver.id === trip.driverId);
        const progress = tripProgress(trip, orders, workspace.confirmations);
        const current = progress.visits[progress.focusIndex];
        const bookings = orders.filter(order => order.tripId === trip.id);
        return <article key={trip.id} className={`operation-trip ${trip.status === 'active' ? 'running' : ''}`}>
          <header><span className="trip-time">{trip.departure.slice(11, 16)}<small>{trip.number}</small></span>
            <div><span className="trip-type">{trip.type === 'international' ? 'Tarptautinis reisas' : 'Vietinis reisas'}</span>
              <button className="operation-trip-name" onClick={() => navigate(`trips/${trip.id}`)}>{trip.name}<ArrowUpRight size={19} /></button></div><Badge status={trip.status} /></header>
          <Journey trip={trip} />
          <div className="operation-trip-details"><div><span><Truck size={17} />{vehicle ? <Plate value={vehicle.plate} /> : 'Transportas nepriskirtas'}</span>
            <span><UserRound size={16} />{driver ? `${driver.firstName} ${driver.lastName}` : 'Vairuotojas nepriskirtas'}</span></div>
            <div><span><Users size={17} />{load.passengers} / {load.capacity}</span><span><Package size={17} />{load.parcels} siuntos</span></div></div>
          <div className="operation-progress"><span>Atvykta <b>{progress.arrived} / {progress.visits.length}</b></span>
            <span>Pristatyta <b>{bookings.filter(order => order.status === 'completed').length} / {bookings.length}</b></span></div>
          <footer><span>{trip.status === 'completed' ? <><CheckCircle2 size={16} />Reisas užbaigtas</>
            : <><span className={`progress-dot ${trip.status === 'active' ? 'active' : ''}`} />{current
              ? `${current.completed ? 'Liko užduočių' : 'Kitas sustojimas'}: ${current.place.name}` : 'Laukia reiso užbaigimo'}</>}</span>
            <button onClick={() => navigate(`trips/${trip.id}`)}>Atidaryti<ArrowRight size={17} /></button></footer>
        </article>;
      })}
      {!trips.length && <div className="panel"><Empty title="Šiai dienai reisų nėra" description="Pasirinkite kitą datą arba suplanuokite reisą.">
        <Button onClick={() => setTripForm(true)}><Plus size={18} />Naujas reisas</Button></Empty></div>}
    </section><aside className="operations-aside">
      <section className="action-inbox"><div className="section-title"><h2>Reikia dėmesio</h2><span className="inbox-count">{actions.length}</span></div>
        {actions.map(({ key, Icon, title, detail, path }) => <button key={key} onClick={() => navigate(path)}>
          <span className="inbox-icon"><Icon size={20} /></span><span><b>{title}</b><small>{detail}</small></span><ArrowUpRight size={17} /></button>)}
        {!actions.length && <p className="inbox-clear"><CheckCircle2 size={19} />Laukiančių veiksmų nėra</p>}
      </section>
      <section className="upcoming-agenda"><div className="section-title"><h2>Toliau suplanuota</h2></div>
        {upcoming.map(trip => <button key={trip.id} onClick={() => navigate(`trips/${trip.id}`)}>
          <span className="agenda-date"><b>{Number(trip.departure.slice(8, 10))}</b><small>{new Intl.DateTimeFormat('lt-LT', { month: 'short' }).format(new Date(trip.departure))}</small></span>
          <span><b>{trip.name}</b><small>{trip.departure.slice(11, 16)} · {trip.number}</small><Badge status={trip.status} /></span><ChevronRight size={17} /></button>)}
        {!upcoming.length && <p className="muted">Vėlesnių reisų nėra.</p>}
      </section>
    </aside></div>
    {tripForm && <TripForm onClose={() => setTripForm(false)} />}{orderForm && <OrderForm onClose={() => setOrderForm(false)} />}
  </>;
}
