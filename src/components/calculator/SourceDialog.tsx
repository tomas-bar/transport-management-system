import { useState } from 'react';
import { Download, Route, Truck } from 'lucide-react';
import { useApp } from '../../context';
import { tripExpenseAssumptions } from '../../domain/calculator-sources';
import { extraCostLabels } from '../../domain/calculator';
import { routeVisits } from '../../domain/route-plan';
import { money, loadInfo } from '../../domain/logic';
import { Button, Field, Modal } from '../ui';
import { Toggle } from './NumberField';

export function SourceDialog({ initialSource, onApply, onClose }: {
  initialSource: string;
  onApply: (source: string, expenses: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const { db } = useApp();
  const [source, setSource] = useState(initialSource);
  const [expenses, setExpenses] = useState(false);
  const [applying, setApplying] = useState(false);
  const separator = source.indexOf(':');
  const kind = source.slice(0, separator), id = source.slice(separator + 1);
  const trip = kind === 'trip' ? db.trips.find(row => row.id === id) : undefined;
  const route = kind === 'route' ? db.routes.find(row => row.id === id) : undefined;
  const vehicle = db.vehicles.find(row => row.id === trip?.vehicleId);
  const copied = tripExpenseAssumptions(db, trip?.id ?? '');
  const selected = trip ?? route;
  return <Modal title="Pradiniai duomenys" onClose={() => { if (!applying) onClose(); }}>
    <form className="calc-source-dialog" onSubmit={async event => {
      event.preventDefault();
      if (applying || !selected) return;
      setApplying(true);
      try { await onApply(source, !!trip && expenses); }
      finally { setApplying(false); }
    }}>
      <div className="modal-body">
        <Field label="Reisas arba maršrutas"><select value={source} required onChange={event => { setSource(event.target.value); setExpenses(false); }}>
          <option value="">Pasirinkite duomenų šaltinį</option>
          <optgroup label="Reisai">{db.trips.map(row => <option key={row.id} value={`trip:${row.id}`}>{row.number} · {row.name}</option>)}</optgroup>
          <optgroup label="Maršrutai">{db.routes.map(row => <option key={row.id} value={`route:${row.id}`}>{row.name}</option>)}</optgroup>
        </select></Field>
        {selected && <div className="calc-source-preview">
          <dl><div><dt><Route size={16} />Sustojimai</dt><dd>{routeVisits(selected.stops).length}</dd></div>
            {vehicle && <div><dt><Truck size={16} />Automobilis</dt><dd>{vehicle.model} · {vehicle.plate}</dd></div>}
            {trip && <div><dt>Keleiviai / siuntos</dt><dd>{loadInfo(db, trip).passengers} / {loadInfo(db, trip).parcels}</dd></div>}
            {trip && <div><dt>Užsakymų kainos</dt><dd>{db.orders.filter(row => row.tripId === trip.id && row.status !== 'cancelled').length} užsak.</dd></div>}
          </dl>
          <p className="calc-note">{selected.stops.length > 1 ? 'Atstumą ir važiavimo laiką gausime pagal pasirinktus sustojimus.' : 'Maršrutas dar neįvestas. Atstumą galėsite įrašyti ranka.'}{trip?.unlisted && (trip.unlisted.passengers + trip.unlisted.parcels > 0) ? ' Kiekiai be sąrašo bus perkelti be kainų.' : ''}</p>
        </div>}
        {trip && Object.keys(copied.extras).length > 0 && <div className="calc-source-expenses">
          <Toggle label={`Paimti papildomas reiso išlaidas (${money(copied.total)})`} checked={expenses} onChange={setExpenses} />
          <dl>{Object.entries(copied.extras).map(([key, value]) => <div key={key}><dt>{extraCostLabels[key as keyof typeof extraCostLabels]}</dt><dd>{money(value.amount!)}</dd></div>)}</dl>
        </div>}
        <p className="calc-note">Į scenarijų kopijuojamos prielaidos. Šaltinio įrašai nesikeis.</p>
      </div>
      <footer><Button variant="secondary" disabled={applying} onClick={onClose}>Atšaukti</Button>
        <Button type="submit" disabled={applying || !selected}><Download size={16} />{applying ? 'Paimama...' : 'Naudoti duomenis'}</Button></footer>
    </form>
  </Modal>;
}
