import { Calculator, ArrowUpRight } from 'lucide-react';
import { useApp } from '../../context';
import { primaryScenario } from '../../domain/calculator-sources';
import { calculationMoney } from './format';
import { Button, Field } from '../ui';
import { readOnlySession } from '../../domain/access';

export function TripScenario({ tripId }: { tripId: string }) {
  const { db, modules, navigate, calculatorCommand, busy, session } = useApp();
  if (!modules.includes('finance')) return null;
  const { linked, selected } = primaryScenario(db.planning, tripId);
  if (!linked.length) return <div className="trip-scenario-start"><Button variant="ghost" onClick={() => navigate(`calculator/new?trip=${encodeURIComponent(tripId)}`)}>
    <Calculator size={16} />Įvertinti reiso ekonomiką</Button></div>;
  return <section className="trip-scenario panel" aria-label="Planuojama reiso ekonomika">
    <header><span><Calculator size={17} />Planuojama ekonomika</span>
      {selected && <Button variant="ghost" onClick={() => navigate(`calculator/${selected.id}`)}>Atidaryti scenarijų<ArrowUpRight size={16} /></Button>}</header>
    {linked.length > 1 && <Field label="Pagrindinis scenarijus">
      <select value={selected?.id ?? ''} disabled={busy || readOnlySession(session)} onChange={event => {
        if (event.target.value) void calculatorCommand({ type: 'primary', tripId, id: event.target.value });
      }}><option value="" disabled>Pasirinkite pagrindinį</option>{linked.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>}
    {selected ? <><p>{selected.name}</p><dl>
      <div><dt>Pajamos</dt><dd>{calculationMoney(selected.result.trip.revenue)}</dd></div>
      <div><dt>Sąnaudos</dt><dd>{calculationMoney(selected.result.trip.totalCost)}</dd></div>
      <div><dt>Preliminarus likutis</dt><dd>{calculationMoney(selected.result.trip.remainder)}</dd></div>
    </dl></> : <p>Su reisu susieti keli scenarijai. Pasirinkite, kurio įvertinimą rodyti.</p>}
  </section>;
}
