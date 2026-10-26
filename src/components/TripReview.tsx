import { useState } from 'react';
import { CheckCheck, CheckCircle2, Package, Users, Save } from 'lucide-react';
import { useApp } from '../context';
import { money, hasAgreedPrice, tripOrders, totals } from '../domain/logic';
import { Button, Field, Modal, Badge } from './ui';

export function TripReview({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const { db, operationalCommand, busy, modules } = useApp();
  const orders = tripOrders(db, tripId);
  const trip = db.trips.find(record => record.id === tripId)!;
  const [selected, setSelected] = useState(() => orders.filter(order => order.status === 'completed').map(order => order.id));
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const all = orders.every(order => selected.includes(order.id));
  const finance = totals(orders, db.expenses.filter(expense => expense.tripId === tripId));
  const unknown = orders.filter(order => !hasAgreedPrice(order)).length;

  async function save(finish: boolean) {
    if (await operationalCommand({ type: 'reviewTrip', input: { tripId, completedOrderIds: selected, finish, note } })) onClose();
  }

  return <Modal title="Reiso suvestinė" subtitle={trip.number + ' · ' + trip.name} onClose={onClose} wide>
    <div className="modal-body">
      {!!((trip.unlisted?.passengers ?? 0) + (trip.unlisted?.parcels ?? 0)) && <p className="record-mode-note">Be sąrašo: {trip.unlisted?.passengers ?? 0} keleivių ir {trip.unlisted?.parcels ?? 0} siuntų. Jų vežimą patvirtinate užbaigdami visą reisą; atskiros pristatymo žymos nekuriamos.</p>}
      {!orders.length && <p className="muted">Vardinių užsakymų nėra. Užbaigdami patvirtinkite, kad visi reiso darbai baigti.</p>}
      <div className="review-selection-heading">
        <h3>Pristatymas <span>{selected.length} / {orders.length}</span></h3>
        {!!orders.length && <Button variant="secondary" onClick={() => setSelected(orders.map(order => order.id))}>
          <CheckCheck size={16} />Pažymėti visus
        </Button>}
      </div>
      <div className="trip-review-orders">{orders.map(order => <label className={`review-order ${selected.includes(order.id) ? 'is-delivered' : ''}`} key={order.id}>
        <input type="checkbox" checked={selected.includes(order.id)} disabled={order.status === 'completed'} onChange={event => setSelected(event.target.checked ? [...selected, order.id] : selected.filter(id => id !== order.id))} />
        {order.type === 'parcel' ? <Package size={19} /> : <Users size={19} />}
        <span><b>{order.name}</b><small>{order.number} · {order.pickup.name} → {order.delivery.name}</small></span>
        <Badge status={selected.includes(order.id) ? 'completed' : 'planned'} label={selected.includes(order.id) ? 'Pristatyta' : 'Laukia'} />
      </label>)}</div>
      {modules.includes('finance') && <div className="review-finance">
        <div><span>Sutarta suma</span><b>{money(finance.revenue)}</b></div>
        <div><span>Gauta</span><b>{money(finance.paid)}</b></div>
        <div><span>Liko gauti</span><b>{money(finance.balance)}</b></div>
        {unknown > 0 && <p>Kaina nenurodyta: {unknown}</p>}
        <p>Reiso užbaigimas mokėjimų nekeičia.</p>
      </div>}
      <Field label="Pastaba" full><textarea maxLength={1000} value={note} onChange={event => setNote(event.target.value)} /></Field>
      <label className="review-finish-check"><input type="checkbox" checked={confirmed} disabled={!all} onChange={event => setConfirmed(event.target.checked)} />Visi reiso darbai baigti</label>
      {!all && <p className="muted">Nepažymėti užsakymai liks vykdomame reise.</p>}
    </div>
    <footer>
      <Button variant="secondary" onClick={onClose}>Atšaukti</Button>
      <Button variant="secondary" disabled={busy} onClick={() => void save(false)}><Save size={16} />Išsaugoti eigą</Button>
      <Button disabled={busy || !all || !confirmed} onClick={() => void save(true)}><CheckCircle2 size={16} />Užbaigti reisą</Button>
    </footer>
  </Modal>;
}
