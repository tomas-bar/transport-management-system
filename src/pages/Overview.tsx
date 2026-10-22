import { useState } from 'react';
import { Plus, ArrowUpRight, ArrowRight, Users, Package, Clock3, ChevronLeft, ChevronRight, Route, Truck, UserRound, CheckCircle2 } from 'lucide-react';
import { useApp } from '../context';
import { PageHeading, Button, Badge, Plate, Empty } from '../components/ui';
import { TripForm } from '../components/TripForm';
import { OrderForm } from '../components/OrderForm';
import { Journey } from '../components/Journey';
import { today, loadInfo } from '../domain/logic';
import { routeVisits } from '../domain/route-plan';
export function Overview() {
  const {
    db,
    navigate
  } = useApp();
  const [tripForm, setTripForm] = useState(false);
  const [orderForm, setOrderForm] = useState(false);
  const [day, setDay] = useState(today());
  const date = new Date(`${day}T12:00:00`);
  const shift = (n: number) => {
    const next = new Date(date);
    next.setDate(next.getDate() + n);
    setDay(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`);
  };
  const trips = db.trips.filter(t => t.departure.slice(0, 10) <= day && t.arrival.slice(0, 10) >= day && t.status !== 'cancelled').sort((a, b) => a.departure.localeCompare(b.departure));
  const orders = db.orders.filter(o => o.date === day && o.status !== 'cancelled');
  const waiting = db.orders.filter(o => !o.tripId && !['completed', 'cancelled'].includes(o.status));
  const active = trips.filter(t => t.status === 'active');
  const missing = db.trips.filter(t => !['completed', 'cancelled'].includes(t.status) && (!t.driverId || !t.vehicleId));
  const upcoming = db.trips.filter(t => t.departure.slice(0, 10) > day && !['completed', 'cancelled'].includes(t.status)).sort((a, b) => a.departure.localeCompare(b.departure)).slice(0, 3);
  return <><PageHeading eyebrow="DARBO ERDVĖ" title="Dienos planas"><Button variant="secondary" onClick={() => setOrderForm(true)}><Plus size={18} />Naujas užsakymas</Button><Button onClick={() => setTripForm(true)}><Plus size={18} />Naujas reisas</Button></PageHeading><div className="day-toolbar"><div><button className="icon-button" aria-label="Ankstesnė diena" onClick={() => shift(-1)}><ChevronLeft size={19} /></button><label><input type="date" aria-label="Plano data" value={day} onChange={e => {
            if (e.target.value) setDay(e.target.value);
          }} /><span>{new Intl.DateTimeFormat('lt-LT', {
              weekday: 'long',
              month: 'long',
              day: 'numeric'
            }).format(date)}</span></label><button className="icon-button" aria-label="Kita diena" onClick={() => shift(1)}><ChevronRight size={19} /></button></div><button className="today-button" onClick={() => setDay(today())}>Šiandien</button><span className="day-toolbar-caption">{day === today() ? 'Šiandienos operacijos' : day}</span></div><div className="operations-metrics"><div><span>Reisai</span><b>{trips.length}<small>{active.length} vykdomi</small></b><Route size={21} /></div><div><span>Keleiviai</span><b>{orders.filter(o => o.type === 'passenger').reduce((s, o) => s + o.quantity, 0)}</b><Users size={21} /></div><div><span>Siuntos</span><b>{orders.filter(o => o.type === 'parcel').reduce((s, o) => s + o.quantity, 0)}</b><Package size={21} /></div><button onClick={() => navigate('orders?assignment=unassigned')}><span>Nepriskirti užsakymai</span><b>{waiting.length}<small>Visos datos</small></b><ArrowUpRight size={21} /></button></div><div className="operations-board"><section className="day-trips"><div className="section-title"><h2>Reisų eiga <span>{trips.length}</span></h2><button className="text-link" onClick={() => navigate('trips')}>Visi reisai<ArrowUpRight size={16} /></button></div>{trips.map(t => {
          const load = loadInfo(db, t);
          const vehicle = db.vehicles.find(v => v.id === t.vehicleId);
          const driver = db.drivers.find(d => d.id === t.driverId);
          const visits = routeVisits(t.stops);
          const next = visits.find(v => !v.completed);
          const complete = visits.filter(v => v.completed).length;
          return <article key={t.id} className={`operation-trip ${t.status === 'active' ? 'running' : ''}`}><header><span className="trip-time">{t.departure.slice(11, 16)}<small>{t.number}</small></span><div><span className="trip-type">{t.type === 'international' ? 'Tarptautinis reisas' : 'Vietinis reisas'}</span><button className="operation-trip-name" onClick={() => navigate(`trips/${t.id}`)}>{t.name}<ArrowUpRight size={19} /></button></div><Badge status={t.status} /></header><Journey trip={t} /><div className="operation-trip-details"><div><span><Truck size={17} />{vehicle ? <Plate value={vehicle.plate} /> : 'Transportas nepriskirtas'}</span><span><UserRound size={16} />{driver ? `${driver.firstName} ${driver.lastName}` : 'Vairuotojas nepriskirtas'}</span></div><div><span><Users size={17} />{load.passengers} / {load.capacity}</span><span><Package size={17} />{load.parcels} siuntos</span></div></div><footer><span>{t.status === 'completed' ? <><CheckCircle2 size={16} />Reisas užbaigtas</> : <><span className={`progress-dot ${t.status === 'active' ? 'active' : ''}`} />{next ? `Kitas sustojimas: ${next.place.name}` : 'Sustojimai aplankyti'}<small>{complete} / {visits.length}</small></>}</span><button onClick={() => navigate(`trips/${t.id}`)}>Atidaryti<ArrowRight size={17} /></button></footer></article>;
        })}{!trips.length && <div className="panel"><Empty title="Šiai dienai reisų nėra" description="Pasirinkite kitą datą arba suplanuokite reisą."><Button onClick={() => setTripForm(true)}><Plus size={18} />Naujas reisas</Button></Empty></div>}</section><aside className="operations-aside"><section className="action-inbox"><div className="section-title"><h2>Laukia sprendimo</h2><span className="inbox-count">{waiting.length + missing.length}</span></div>{waiting.length > 0 ? <button onClick={() => navigate('orders?assignment=unassigned')}><span className="inbox-icon"><Package size={20} /></span><span><b>{waiting.length} nepriskirti užsakymai</b><small>Parinkite reisą</small></span><ArrowUpRight size={17} /></button> : <p className="inbox-clear"><CheckCircle2 size={19} />Visi užsakymai priskirti</p>}{missing.length > 0 && <button onClick={() => navigate(`trips/${missing[0].id}`)}><span className="inbox-icon"><Truck size={20} /></span><span><b>{missing.length} reisai be išteklių</b><small>Trūksta vairuotojo arba transporto</small></span><ArrowUpRight size={17} /></button>}<button onClick={() => navigate('notifications')}><span className="inbox-icon neutral"><Clock3 size={20} /></span><span><b>Pranešimai</b><small>Naujausi pakeitimai</small></span><ArrowUpRight size={17} /></button></section><section className="upcoming-agenda"><div className="section-title"><h2>Toliau suplanuota</h2></div>{upcoming.map(t => <button key={t.id} onClick={() => navigate(`trips/${t.id}`)}><span className="agenda-date"><b>{Number(t.departure.slice(8, 10))}</b><small>{new Intl.DateTimeFormat('lt-LT', {
                  month: 'short'
                }).format(new Date(t.departure))}</small></span><span><b>{t.name}</b><small>{t.departure.slice(11, 16)} · {t.number}</small><Badge status={t.status} /></span><ChevronRight size={17} /></button>)}{!upcoming.length && <p className="muted">Vėlesnių reisų nėra.</p>}</section></aside></div>{tripForm && <TripForm onClose={() => setTripForm(false)} />}{orderForm && <OrderForm onClose={() => setOrderForm(false)} />}</>;
}
