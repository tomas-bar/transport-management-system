import { useId, useState } from 'react';
import '../styles/trip-counts.css';
import { Minus, Plus, Users, Package, SquarePen } from 'lucide-react';
import type { Trip } from '../domain/models';
import { useApp } from '../context';
import { saveTrip } from '../domain/logic';
import { Button, Modal } from './ui';

type Counts = NonNullable<Trip['unlisted']>;
export function TripCountFields({ value, onChange }: { value?: Counts; onChange: (value: Counts) => void }) {
  const id = useId();
  const counts = value ?? { passengers: 0, parcels: 0 };
  return <div className="trip-count-fields">
    {(['passengers', 'parcels'] as const).map(key => {
      const label = key === 'passengers' ? 'Keleiviai be sąrašo' : 'Siuntos be sąrašo';
      const Icon = key === 'passengers' ? Users : Package;
      const set = (n: number) => onChange({ ...counts, [key]: n });
      return <div className={`trip-count-field ${key}`} key={key}>
        <label htmlFor={`${id}-${key}`}><Icon size={19}/>{label}</label>
        <div className="trip-count-stepper">
          <button type="button" aria-label={`Sumažinti: ${label.toLowerCase()}`} disabled={counts[key] === 0} onClick={() => set(counts[key] - 1)}><Minus size={17}/></button>
          <input id={`${id}-${key}`} type="number" inputMode="numeric" min={0} max={100000} step={1} value={counts[key] || ''} placeholder="0" onChange={e => set(e.target.value === '' ? 0 : Number(e.target.value))}/>
          <button type="button" aria-label={`Padidinti: ${label.toLowerCase()}`} disabled={counts[key] >= 100000} onClick={() => set(counts[key] + 1)}><Plus size={17}/></button>
        </div>
      </div>;
    })}
  </div>;
}

export function TripCounts({ trip, onDetail }: { trip: Trip; onDetail: (kind: 'passenger' | 'parcel') => void }) {
  const { commit, busy } = useApp();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<Counts>({ passengers: 0, parcels: 0 });
  const counts = trip.unlisted ?? { passengers: 0, parcels: 0 };
  const canDetail = !['completed', 'cancelled'].includes(trip.status) || trip.recordMode === 'historical';
  return <>
    <div className="trip-count-summary">
      <div className="trip-count-summary-heading"><div><h3>Kiekiai be sąrašo</h3><p>Įrašykite kiekį dabar, duomenis galėsite patikslinti vėliau.</p></div>
        {trip.status !== 'cancelled' && <Button variant="secondary" disabled={busy} onClick={() => { setValue({ ...counts }); setEditing(true); }}><SquarePen size={15}/>Keisti kiekius</Button>}
      </div>
      <div className="trip-count-summary-items">
        <div><Users size={19}/><span><b>{counts.passengers}</b> keleivių be sąrašo</span>{counts.passengers > 0 && canDetail && <button className="text-link" onClick={() => onDetail('passenger')}>Pridėti duomenis</button>}</div>
        <div><Package size={19}/><span><b>{counts.parcels}</b> siuntų be sąrašo</span>{counts.parcels > 0 && canDetail && <button className="text-link" onClick={() => onDetail('parcel')}>Pridėti duomenis</button>}</div>
      </div>
      <p className="trip-count-note">Šie kiekiai pridedami prie užsakymų sąrašo. Jie nesukuria klientų, mokėjimų ar paėmimo užduočių.</p>
    </div>
    {editing && <Modal title="Keleiviai ir siuntos be sąrašo" subtitle={trip.number} onClose={() => setEditing(false)}>
      <form onSubmit={async e => { e.preventDefault(); if (await commit(db => { const current = db.trips.find(t => t.id === trip.id)!; saveTrip(db, { ...current, unlisted: value }); }, 'Reiso kiekiai išsaugoti')) setEditing(false); }}>
        <div className="modal-body"><TripCountFields value={value} onChange={setValue}/><p className="form-help">Keičiami tik kiekiai be sąrašo. Vardiniai užsakymai išlieka. Vietų patikrai šie keleiviai laikomi važiuojančiais visą reisą.</p></div>
        <footer><Button type="button" variant="secondary" onClick={() => setEditing(false)}>Atšaukti</Button><Button type="submit" disabled={busy}>{busy ? 'Saugoma...' : 'Išsaugoti'}</Button></footer>
      </form>
    </Modal>}
  </>;
}
