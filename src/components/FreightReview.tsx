import { useEffect, useRef, useState } from 'react';
import { Calculator, Copy, Route } from 'lucide-react';
import { useApp } from '../context';
import { additionalCost, contactDraft, freightRoute, opportunityWarnings, parseEuro, type FreightOpportunity } from '../domain/freight';
import { money } from '../domain/logic';
import { roadRoute } from '../services/maps';
import { Button, Field, Modal } from './ui';

export function FreightReview({ opportunity, initialTripId, onClose }: {
  opportunity: FreightOpportunity;
  initialTripId: string;
  onClose: () => void;
}) {
  const { db, notify, modules } = useApp();
  const [tripId, setTripId] = useState(initialTripId || opportunity.details.tripId);
  const [distance, setDistance] = useState<{ km: number; minutes: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [perKm, setPerKm] = useState('');
  const [perHour, setPerHour] = useState('');
  const [handling, setHandling] = useState('');
  const [other, setOther] = useState('');
  const [language, setLanguage] = useState<'lt' | 'de' | 'en'>('lt');
  const pending = useRef<AbortController | null>(null);
  const trip = db.trips.find(record => record.id === tripId);
  const warnings = trip ? opportunityWarnings(db, trip, opportunity.details) : [];
  const draft = contactDraft(opportunity.details, language);
  useEffect(() => {
    setDistance(null); setError(''); setBusy(false);
    return () => pending.current?.abort();
  }, [tripId]);

  async function compare() {
    const { pickup, delivery } = opportunity.details;
    if (!trip || !pickup || !delivery) return;
    const controller = new AbortController();
    pending.current?.abort(); pending.current = controller;
    setBusy(true); setDistance(null); setError('');
    try {
      const proposed = freightRoute(trip, pickup, delivery);
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(18000)]);
      const [original, extended] = await Promise.all([
        roadRoute(trip.stops, db.settings.routingUrl, signal),
        roadRoute(proposed, db.settings.routingUrl, signal),
      ]);
      if (!controller.signal.aborted) setDistance({ km: Math.max(0, extended.distance - original.distance) / 1000, minutes: Math.max(0, extended.duration - original.duration) / 60 });
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof TypeError ? 'Maršrutų paslauga nepasiekiama. Bandykite vėliau.' : (error as Error).name === 'TimeoutError' ? 'Maršrutų paslauga neatsakė. Bandykite vėliau.' : (error as Error).message);
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  let estimate: { cost: number | null; remainder: number | null } | null = null;
  let costError = '';
  if (distance) {
    try {
      const minutes = handling.trim() ? Number(handling.replace(',', '.')) : null;
      if (minutes !== null && (!Number.isFinite(minutes) || minutes < 0)) throw new Error('Patikrinkite pakrovimo ir laukimo laiką.');
      estimate = minutes === null ? { cost: null, remainder: null } : additionalCost(distance.km, distance.minutes + minutes, parseEuro(perKm), parseEuro(perHour), parseEuro(other), opportunity.details.price);
    }
    catch (error) { costError = (error as Error).message; }
  }

  return <Modal title="Įvertinti pasiūlymą" subtitle={opportunity.title} onClose={onClose} wide>
    <div className="modal-body freight-review">
      <Field label="Reisas" full><select value={tripId} onChange={event => setTripId(event.target.value)}>
        <option value="">Pasirinkite reisą</option>{db.trips.filter(record => !['completed', 'cancelled'].includes(record.status)).map(record => <option key={record.id} value={record.id}>{record.number} · {record.name} · {record.departure.slice(0, 10)}</option>)}
      </select></Field>
      {!!warnings.length && <ul className="freight-warnings">{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
      <Button variant="secondary" disabled={busy || !trip || !opportunity.details.pickup || !opportunity.details.delivery} onClick={() => void compare()}>
        <Route size={17} />{busy ? 'Skaičiuojama...' : 'Palyginti kelių maršrutus'}
      </Button>
      {(!opportunity.details.pickup || !opportunity.details.delivery) && <p className="muted">Palyginimui pasiūlyme pasirinkite abu adresus.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {distance && <>
        <div className="freight-route-result"><div><small>Papildomas kelias</small><b>{distance.km.toFixed(1)} km</b></div><div><small>Papildomas važiavimas</small><b>{Math.ceil(distance.minutes)} min.</b></div></div>
        <p className="muted">Sustojimų seka pasiūlyta pagal artumą. Laikas neapima pakrovimo, laukimo ir poilsio.</p>
        {modules.includes('finance') && <section className="freight-estimate">
          <h3><Calculator size={18} />Papildomos sąnaudos</h3>
          <div className="form-grid">
            <Field label="Automobilio savikaina, €/km" hint="Kuras ir automobilio išlaikymas."><input inputMode="decimal" value={perKm} onChange={event => setPerKm(event.target.value)} /></Field>
            <Field label="Laiko sąnaudos, €/val." hint="Vairuotojo darbo laiko įkainis."><input inputMode="decimal" value={perHour} onChange={event => setPerHour(event.target.value)} /></Field>
            <Field label="Pakrovimas ir laukimas, min." hint="Jei nėra, įrašykite 0."><input inputMode="decimal" value={handling} onChange={event => setHandling(event.target.value)} /></Field>
            <Field label="Kitos išlaidos, €" hint="Jei nėra, įrašykite 0."><input inputMode="decimal" value={other} onChange={event => setOther(event.target.value)} /></Field>
          </div>
          {costError && <p className="form-error">{costError}</p>}
          <div className="review-finance">
            <div><span>Siūloma kaina</span><b>{opportunity.details.price === null ? 'Nenurodyta' : money(opportunity.details.price)}</b></div>
            <div><span>Papildomos sąnaudos</span><b>{estimate?.cost == null ? 'Trūksta duomenų' : money(estimate.cost)}</b></div>
            <div><span>Likutis po papildomų sąnaudų</span><b>{estimate?.remainder == null ? 'Trūksta duomenų' : money(estimate.remainder)}</b></div>
          </div>
        </section>}
      </>}
      <section className="freight-draft">
        <h3>Žinutės juodraštis</h3>
        <Field label="Kalba"><select value={language} onChange={event => setLanguage(event.target.value as typeof language)}><option value="lt">Lietuvių</option><option value="de">Vokiečių</option><option value="en">Anglų</option></select></Field>
        <textarea aria-label="Žinutės juodraštis" readOnly value={draft} onFocus={event => event.target.select()} />
        <Button variant="secondary" onClick={async () => {
          try { await navigator.clipboard.writeText(draft); notify('Žinutė nukopijuota'); }
          catch { notify('Pažymėkite ir nukopijuokite žinutės tekstą.', true); }
        }}><Copy size={16} />Kopijuoti žinutę</Button>
      </section>
    </div>
    <footer><Button variant="secondary" onClick={onClose}>Uždaryti</Button></footer>
  </Modal>;
}
