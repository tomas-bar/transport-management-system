import { useState } from 'react';
import { Copy, Package, Users } from 'lucide-react';
import { useApp } from '../context';
import { today, tripOrders, money, hasAgreedPrice } from '../domain/logic';
import { Button, Field, Modal, SearchInput } from './ui';

function shifted(value: string, days: number) {
  const date = new Date(value + 'Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 16);
}

export function RepeatTrip({ sourceId, onClose }: { sourceId: string; onClose: () => void }) {
  const { db, operationalCommand, navigate, busy, modules } = useApp();
  const source = db.trips.find(trip => trip.id === sourceId)!;
  const start = source.departure.slice(0, 10) < today() ? today() + source.departure.slice(10) : source.departure;
  const duration = Date.parse(source.arrival + 'Z') - Date.parse(source.departure + 'Z');
  const [departure, setDeparture] = useState(() => shifted(start, 7));
  const [arrival, setArrival] = useState(() => new Date(Date.parse(shifted(start, 7) + 'Z') + duration).toISOString().slice(0, 16));
  const [vehicleId, setVehicleId] = useState(db.vehicles.some(vehicle => vehicle.id === source.vehicleId && vehicle.status === 'active') ? source.vehicleId : '');
  const [driverId, setDriverId] = useState(db.drivers.some(driver => driver.id === source.driverId && driver.status === 'active') ? source.driverId : '');
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [copyPrices, setCopyPrices] = useState(false);
  const [asDraft, setAsDraft] = useState(true);
  const orders = tripOrders(db, sourceId);
  const visible = orders.filter(order => `${order.number} ${order.name} ${order.pickup.name} ${order.delivery.name}`.toLocaleLowerCase('lt').includes(query.toLocaleLowerCase('lt')));
  const allVisible = visible.length > 0 && visible.every(order => selected.includes(order.id));

  async function save() {
    const tripId = crypto.randomUUID();
    const ok = await operationalCommand({ type: 'repeatTrip', input: {
      sourceId, tripId, departure, arrival, vehicleId, driverId, orderIds: selected, copyPrices, asDraft,
    } });
    if (ok) { onClose(); navigate('trips/' + tripId); }
  }

  return <Modal title="Kartoti reisą" subtitle={source.number + ' · ' + source.name} onClose={onClose} wide>
    <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <div className="modal-body">
        <div className="form-grid">
          <Field label="Išvykimas"><input type="datetime-local" required value={departure} onChange={event => setDeparture(event.target.value)} /></Field>
          <Field label="Atvykimas"><input type="datetime-local" required min={departure} value={arrival} onChange={event => setArrival(event.target.value)} /></Field>
          <Field label="Automobilis"><select required={!asDraft} value={vehicleId} onChange={event => setVehicleId(event.target.value)}>
            <option value="">Pasirinkite</option>{db.vehicles.filter(vehicle => vehicle.status === 'active').map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} · {vehicle.model}</option>)}
          </select></Field>
          <Field label="Vairuotojas"><select required={!asDraft} value={driverId} onChange={event => setDriverId(event.target.value)}>
            <option value="">Pasirinkite</option>{db.drivers.filter(driver => driver.status === 'active').map(driver => <option key={driver.id} value={driver.id}>{driver.firstName} {driver.lastName}</option>)}
          </select></Field>
        </div>
        <div className="review-selection-heading"><h3>Kopijuojami užsakymai <span>{selected.length}</span></h3></div>
        <SearchInput value={query} onChange={setQuery} placeholder="Užsakymas, kontaktas arba miestas..." />
        {!!visible.length && <label className="review-finish-check">
          <input type="checkbox" checked={allVisible} onChange={event => setSelected(event.target.checked ? [...new Set([...selected, ...visible.map(order => order.id)])] : selected.filter(id => !visible.some(order => order.id === id)))} />Pažymėti matomus
        </label>}
        <div className="trip-review-orders">{visible.map(order => <label className="review-order" key={order.id}>
          <input type="checkbox" checked={selected.includes(order.id)} onChange={event => setSelected(event.target.checked ? [...selected, order.id] : selected.filter(id => id !== order.id))} />
          {order.type === 'parcel' ? <Package size={18} /> : <Users size={18} />}
          <span><b>{order.name}</b><small>{order.pickup.name} → {order.delivery.name}</small></span>
          {modules.includes('finance') && <small>{hasAgreedPrice(order) ? money(order.price) : 'Kaina nenurodyta'}</small>}
        </label>)}</div>
        {modules.includes('finance') && <label className="review-finish-check"><input type="checkbox" checked={copyPrices} onChange={event => setCopyPrices(event.target.checked)} />Kopijuoti sutartas kainas</label>}
        <p className="muted">Mokėjimai, išlaidos ir įvykdymo istorija nekopijuojami.</p>
        <label className="review-finish-check"><input type="checkbox" checked={asDraft} onChange={event => setAsDraft(event.target.checked)} />Išsaugoti kaip juodraštį</label>
        <p className="record-mode-note">{asDraft ? 'Vairuotojui nebus siunčiamas pranešimas iki paskelbimo.' : 'Naujas reisas bus paskelbtas vairuotojui.'}</p>
      </div>
      <footer><Button variant="secondary" onClick={onClose}>Atšaukti</Button><Button type="submit" disabled={busy}><Copy size={17} />Sukurti naują reisą</Button></footer>
    </form>
  </Modal>;
}
