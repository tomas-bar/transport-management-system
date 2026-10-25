import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Route, Save, Plus, Copy, Trash2, RotateCcw, Settings2, MapPin, LoaderCircle, ArrowDown, ArrowUpRight, ChevronDown, PencilLine, UsersRound, Package, Fuel, CarFront, UserRound, Clock3, Receipt, Ship, BedDouble, ParkingCircle, Building2, Ellipsis, AlertCircle, Download } from 'lucide-react';
import { useApp } from '../context';
import type { Database } from '../domain/models';
import { uid, dateLabel, money } from '../domain/logic';
import { readOnlySession } from '../domain/access';
import {
  calculate, emptyCalculationInput, emptyCalculator, extraCostLabels, validateCalculatorInput,
  type CalculatorInput, type CalculatorScenario, type DirectionRevenue, type ExtraCost, type OptionalCost,
} from '../domain/calculator';
import { calculationStops, useRoute, useTrip, useVehicle, tripExpenseAssumptions } from '../domain/calculator-sources';
import { roadRoute } from '../services/maps';
import { useConfirm } from '../components/Feedback';
import { Button, Empty, Field, Modal, PageHeading, Panel } from '../components/ui';
import { NumberField, NumberFieldReset, Toggle } from '../components/calculator/NumberField';
import { CalculationResults } from '../components/calculator/Results';
import { calculationMoney } from '../components/calculator/format';
import { RateSettings } from '../components/calculator/RateSettings';
import { SourceDialog } from '../components/calculator/SourceDialog';
import { MissingCalculationFields, missingFields, visibleMissingGroups } from '../components/calculator/input-guidance';
import { useUnsavedCalculation } from '../components/calculator/use-unsaved-calculation';

interface ScenarioForm {
  id: string; revision: number | null; name: string; tripId: string; primary: boolean; input: CalculatorInput;
}
const formFromScenario = (row: CalculatorScenario): ScenarioForm => ({
  id: row.id, revision: row.revision, name: row.name, tripId: row.tripId, primary: row.primary, input: structuredClone(row.input),
});
function newForm(db: Database): ScenarioForm {
  return { id: uid(), revision: null, name: '', tripId: '', primary: false,
    input: emptyCalculationInput(db.planning?.defaults) };
}
function initialForm(db: Database, path: string): { form: ScenarioForm; saved: CalculatorScenario | null } {
  const [pathname, query] = path.split('?'), id = pathname.split('/')[1];
  const saved = db.planning?.scenarios.find(row => row.id === id);
  if (saved) return { form: formFromScenario(saved), saved: structuredClone(saved) };
  const form = newForm(db), tripId = new URLSearchParams(query).get('trip');
  const trip = db.trips.find(row => row.id === tripId);
  if (trip) { form.input = useTrip(form.input, db, trip, db.planning); form.name = trip.name.slice(0, 160); form.tripId = trip.id; }
  return { form, saved: null };
}

const expenseIcons = { tolls: Receipt, ferries: Ship, accommodation: BedDouble, parking: ParkingCircle, other: Ellipsis, fixedShare: Building2 };

function OptionalAmount({ label, value, onChange, hint, fieldKey }: {
  label: string; value: OptionalCost; onChange: (value: OptionalCost) => void; hint?: string; fieldKey: string;
}) {
  const Icon = expenseIcons[fieldKey as ExtraCost] ?? Receipt;
  return <div className={`calc-optional-row ${value.included ? 'is-included' : ''}`}>
    <Toggle label={label} checked={value.included} icon={<Icon size={16} />} onChange={included => onChange({ ...value, included })} />
    {value.included && <NumberField label="Suma, €" accessibleLabel={`${label}, €`} fieldKey={fieldKey}
      value={value.amount} scale={100} onChange={amount => onChange({ ...value, amount })} />}
    {value.included && hint && <small className="calc-note">{hint}</small>}
  </div>;
}

function DirectionInputs({ direction, value, seats, onChange }: {
  direction: 'outbound' | 'return'; value: DirectionRevenue; seats: number | null; onChange: (value: DirectionRevenue) => void;
}) {
  const name = direction === 'outbound' ? 'pirmyn' : 'atgal';
  const prefix = direction === 'outbound' ? 'outbound' : 'returnLeg';
  const set = (key: keyof DirectionRevenue, next: number | null) => onChange({ ...value, [key]: next });
  return <fieldset className="calc-direction"><legend>{direction === 'outbound' ? 'Pirmyn' : 'Atgal'}</legend>
    <div className="calc-revenue-lane passengers">
      <h3><UsersRound size={17} aria-hidden="true" />Keleiviai</h3>
      <div className="calc-grid">
        <NumberField label="Kiekis" accessibleLabel={`Keleiviai ${name}`} fieldKey={`${prefix}-passengers`}
          value={value.passengers} decimals={0} max={100000} onChange={next => set('passengers', next)} />
        <NumberField label="Bilietas, €" accessibleLabel={`Bilieto kaina ${name}, €`} fieldKey={`${prefix}-ticket`}
          value={value.ticket} scale={100} onChange={next => set('ticket', next)} />
      </div>
      <input className="calc-slider" type="range" min={0} max={Math.max(1, seats ?? 20, value.passengers ?? 0)} step={1}
        aria-label={`Keleivių skaičius ${name}, keisti slankikliu`} value={value.passengers ?? 0}
        onChange={event => set('passengers', Number(event.target.value))} />
    </div>
    <div className="calc-revenue-lane parcels">
      <h3><Package size={17} aria-hidden="true" />Siuntos</h3>
      <div className="calc-grid">
        <NumberField label="Kiekis" accessibleLabel={`Siuntos ${name}`} fieldKey={`${prefix}-parcels`}
          value={value.parcels} decimals={0} max={100000} onChange={next => set('parcels', next)} />
        <NumberField label="Vidutinė kaina, €" accessibleLabel={`Vidutinė siuntos kaina ${name}, €`} fieldKey={`${prefix}-parcelPrice`}
          value={value.parcelPrice} scale={100} onChange={next => set('parcelPrice', next)} />
      </div>
      <input className="calc-slider" type="range" min={0} max={Math.max(20, value.parcels ?? 0)} step={1}
        aria-label={`Siuntų skaičius ${name}, keisti slankikliu`} value={value.parcels ?? 0}
        onChange={event => set('parcels', Number(event.target.value))} />
    </div>
  </fieldset>;
}

export function Calculator() {
  const { db, user, session, path, navigate, calculatorCommand, busy, notify } = useApp();
  const confirm = useConfirm();
  const [initial] = useState(() => initialForm(db, path));
  const [form, setForm] = useState(initial.form);
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial.form));
  const [opened, setOpened] = useState(initial.saved);
  const [view, setView] = useState<'trip' | 'month'>(() => new URLSearchParams(path.split('?')[1]).get('view') === 'month' ? 'month' : 'trip');
  const [ratesOpen, setRatesOpen] = useState(false), [ratesDirty, setRatesDirty] = useState(false);
  const [source, setSource] = useState('');
  const [sourceOpen, setSourceOpen] = useState(false), [detailsOpen, setDetailsOpen] = useState(false);
  const [nameMissing, setNameMissing] = useState(false), [focusField, setFocusField] = useState<string | null>(null);
  const [routing, setRouting] = useState(false), [routeError, setRouteError] = useState(''), [routeSuccess, setRouteSuccess] = useState('');
  const [epoch, setEpoch] = useState(0), [savingId, setSavingId] = useState<string | null>(null);
  const routeRequest = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const changed = JSON.stringify(form) !== baseline;
  const dirty = changed || form.revision === null && (!!form.name.trim() || form.input.route.stops.length > 0 || form.input.routeKm !== null);
  const guard = useUnsavedCalculation(dirty || ratesDirty);
  const state = db.planning ?? emptyCalculator();
  const readOnly = readOnlySession(session);
  const currentSaved = state.scenarios.find(row => row.id === form.id);
  const stale = opened && currentSaved?.revision !== opened.revision;
  const [pathname] = path.split('?'), requestedId = pathname.split('/')[1];
  const missingScenario = requestedId && requestedId !== 'new' && !initial.saved;

  useEffect(() => () => { mounted.current = false; routeRequest.current?.abort(); }, []);
  useEffect(() => {
    if (!savingId) return;
    const record = db.planning?.scenarios.find(row => row.id === savingId);
    if (!record) return;
    const savedForm = formFromScenario(record);
    setForm(savedForm); setBaseline(JSON.stringify(savedForm)); setOpened(structuredClone(record)); setSavingId(null); setEpoch(value => value + 1);
    if (pathname !== `calculator/${record.id}`) {
      const target = `calculator/${record.id}${view === 'month' ? '?view=month' : ''}`;
      guard.discard(target); navigate(target);
    }
  }, [savingId, db.planning]);

  useEffect(() => {
    if (!detailsOpen) return;
    const frame = requestAnimationFrame(() => document.getElementById('calculator-scenario-name')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [detailsOpen]);

  const setInput = <K extends keyof CalculatorInput>(key: K, value: CalculatorInput[K]) => setForm(before => ({ ...before, input: { ...before.input, [key]: value } }));
  const setRate = <K extends keyof CalculatorInput['rates']>(key: K, value: CalculatorInput['rates'][K]) => setForm(before => ({
    ...before, input: { ...before.input, rates: { ...before.input.rates, [key]: value } },
  }));
  const replaceInput = (input: CalculatorInput) => { setForm(before => ({ ...before, input })); setEpoch(value => value + 1); setRouteError(''); setRouteSuccess(''); };
  const extra = (key: ExtraCost, value: OptionalCost) => setInput('extras', { ...form.input.extras, [key]: value });
  const input = form.input;
  let result;
  try { result = !changed && opened ? opened.result : calculate(input); }
  catch { result = null; }

  async function fetchRoute(plan = input) {
    if (routing) return;
    const controller = new AbortController(); routeRequest.current?.abort(); routeRequest.current = controller;
    setRouting(true); setRouteError(''); setRouteSuccess('');
    const timeout = setTimeout(() => controller.abort(), 18000);
    try {
      const road = await roadRoute(calculationStops(plan), db.settings.routingUrl, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      setForm(before => ({ ...before, input: { ...before.input, routeKm: Math.round(road.distance) / 1000, drivingMinutes: Math.round(road.duration / 60) } }));
      setEpoch(value => value + 1); setRouteSuccess('Kelių atstumas ir važiavimo laikas atnaujinti.');
    } catch (error) {
      if (mounted.current) setRouteError(controller.signal.aborted ? 'Maršruto gavimas užtruko. Bandykite dar kartą arba įrašykite kilometrus.'
        : error instanceof TypeError ? 'Nepavyko gauti atstumo. Įrašykite kilometrus ranka arba bandykite dar kartą.' : (error as Error).message);
    } finally { clearTimeout(timeout); if (mounted.current) setRouting(false); }
  }
  async function importSource(selectedSource: string, includeExpenses: boolean) {
    if (!selectedSource || routing) return;
    if (dirty && !await confirm('Pakeisti scenarijaus maršruto duomenis? Iš reiso taip pat bus paimti automobilis, įkainiai ir užsakymų kainos.', { confirmLabel: 'Naudoti duomenis' })) return;
    const separator = selectedSource.indexOf(':');
    const kind = selectedSource.slice(0, separator), id = selectedSource.slice(separator + 1);
    let next: CalculatorInput;
    let name: string;
    if (kind === 'trip') {
      const trip = db.trips.find(row => row.id === id);
      if (!trip) return;
      next = useTrip(input, db, trip, state); name = trip.name;
      if (includeExpenses) next.extras = { ...next.extras, ...tripExpenseAssumptions(db, trip.id).extras };
    } else {
      const route = db.routes.find(row => row.id === id);
      if (!route) return;
      next = useRoute(input, route.id, route.name, route.stops, 'route'); name = route.name;
    }
    replaceInput(next); setSource(selectedSource); setSourceOpen(false);
    setForm(before => ({ ...before, name: before.name || name.slice(0, 160) }));
    if (next.route.stops.length >= 2) void fetchRoute(next);
  }
  async function save() {
    if (busy || savingId || readOnly || routing) return;
    const invalid = document.querySelector<HTMLInputElement>('#calculator-form input[aria-invalid="true"]');
    if (invalid) { setDetailsOpen(false); setFocusField(invalid.dataset.calculationField ?? 'routeKm'); return; }
    if (!form.name.trim()) { setNameMissing(true); setDetailsOpen(true); return; }
    try { validateCalculatorInput(input); }
    catch (error) { notify((error as Error).message, true); return; }
    if (await calculatorCommand({ type: 'save', ...form })) { setDetailsOpen(false); setSavingId(form.id); }
  }
  async function startNew() {
    if (dirty && !await confirm('Pradėti naują scenarijų neišsaugojus pakeitimų?', { confirmLabel: 'Pradėti naują' })) return;
    const next = newForm(db); setForm(next); setBaseline(JSON.stringify(next)); setOpened(null); setSource(''); setNameMissing(false); setEpoch(value => value + 1);
    if (path !== 'calculator/new') { guard.discard('calculator/new'); navigate('calculator/new'); }
  }
  function copy() {
    const next = { ...structuredClone(form), id: uid(), revision: null, name: `${form.name || 'Scenarijus'} (kopija)`.slice(0, 160), primary: false };
    setForm(next); setOpened(null); setBaseline(JSON.stringify(next)); setEpoch(value => value + 1);
  }
  async function remove() {
    if (!opened || busy) return;
    if (!await confirm(`Pašalinti scenarijų „${opened.name}“? Faktinis reisas ir jo finansai nesikeis.`, { title: 'Pašalinti scenarijų', confirmLabel: 'Pašalinti', danger: true })) return;
    if (await calculatorCommand({ type: 'delete', id: opened.id, revision: opened.revision })) {
      guard.discard('calculator/new'); navigate('calculator/new');
    }
  }
  async function reset() {
    if (!await confirm('Atkurti atidarytas šios formos reikšmes? Įmonės duomenys ir išsaugoti scenarijai nebus keičiami.', { confirmLabel: 'Atkurti formą' })) return;
    setForm(JSON.parse(baseline || JSON.stringify(initial.form))); setNameMissing(false); setEpoch(value => value + 1); setRouteError(''); setRouteSuccess('');
  }
  function copyExpenses() {
    const copied = tripExpenseAssumptions(db, input.route.id);
    setInput('extras', { ...input.extras, ...copied.extras }); setEpoch(value => value + 1);
    notify(`Iš reiso paimta papildomų išlaidų: ${money(copied.total)}.`);
  }
  const guidance = missingFields(input, result);
  const missing = result ? visibleMissingGroups(input, result, view) : [];
  const sourceExpenses = input.route.kind === 'trip' ? tripExpenseAssumptions(db, input.route.id) : null;
  function goToMissing(group: string) {
    if (group === 'bookings') { setSourceOpen(true); return; }
    const target = guidance.groups.get(group)?.[0] ?? 'routeKm';
    setView(target.startsWith('monthly') ? 'month' : 'trip');
    setFocusField(target);
  }
  useEffect(() => {
    if (!focusField) return;
    const frame = requestAnimationFrame(() => {
      const field = document.querySelector<HTMLElement>(`[data-calculation-field="${CSS.escape(focusField)}"]`);
      if (field) {
        for (let parent = field.parentElement; parent; parent = parent.parentElement) {
          if (parent instanceof HTMLDetailsElement) parent.open = true;
        }
        field.focus({ preventScroll: true });
        field.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      }
      setFocusField(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusField, view]);

  if (missingScenario) return <Empty title="Scenarijus nerastas" description="Jis galėjo būti pašalintas arba priklauso kitai įmonei."><Button onClick={() => navigate('calculator/new')}>Naujas scenarijus</Button></Empty>;
  return <MissingCalculationFields.Provider value={guidance.fields}><div className="calculator-page">
    <PageHeading title="Skaičiuoklė">
      <Button variant="secondary" onClick={() => void startNew()} disabled={busy || routing}><Plus size={16} />Naujas</Button>
      <Button form="calculator-form" type="submit" disabled={busy || !!savingId || routing || readOnly || !!stale || !!opened && !dirty}><Save size={16} />{busy || savingId ? 'Saugoma...' : 'Išsaugoti'}</Button>
    </PageHeading>
    <div className="calc-library panel">
      <div className="calc-library-main">
        <Field label="Scenarijus"><select value={form.revision === null ? '' : form.id} disabled={busy || routing} onChange={event => { if (event.target.value) navigate(`calculator/${event.target.value}`); else void startNew(); }}>
          <option value="">{form.revision === null && form.name ? form.name : 'Naujas scenarijus'}</option>
          {state.scenarios.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select></Field>
        {user?.role === 'admin' && <Button variant="ghost" onClick={() => setRatesOpen(true)} disabled={busy}><Settings2 size={17} />Nustatymai</Button>}
      </div>
      <div className="calc-library-footer">
        <small className={`calc-save-state ${dirty ? 'is-dirty' : ''}`}>{dirty ? 'Neišsaugoti pakeitimai' : opened ? `Išsaugota ${dateLabel(opened.calculatedAt, true)}` : 'Naujas scenarijus'}</small>
        <details className="calc-options"><summary><Ellipsis size={17} />Scenarijaus veiksmai<ChevronDown size={13} /></summary>
          <div className="calc-library-actions">
            <Button variant="ghost" onClick={() => setDetailsOpen(true)} disabled={busy}><PencilLine size={16} />Pavadinimas ir reisas</Button>
            <Button variant="ghost" onClick={copy} disabled={busy || routing}><Copy size={16} />Kopijuoti</Button>
            <Button variant="ghost" onClick={() => void reset()} disabled={busy || routing}><RotateCcw size={16} />Atkurti formą</Button>
            <Button variant="ghost" disabled={routing} onClick={async () => {
              if (await confirm('Pritaikyti dabartinius įmonės ir automobilio įkainius? Scenarijaus pakeisti įkainiai bus pakeisti.', { confirmLabel: 'Pritaikyti įkainius' })) replaceInput(useVehicle(input, db, input.vehicleId, state));
            }}><RotateCcw size={16} />Pritaikyti dabartinius įkainius</Button>
            {opened && <Button variant="ghost" onClick={() => void remove()} disabled={busy || readOnly}><Trash2 size={16} />Pašalinti</Button>}
          </div>
        </details>
      </div>
    </div>
    {!!stale && <div className="calc-warning" role="alert"><p>Scenarijus pakeistas arba pašalintas kitame lange. Atidarykite naujausią arba išsaugokite dabartines prielaidas kaip kopiją.</p>
      {currentSaved && <Button variant="ghost" onClick={async () => {
        if (dirty && !await confirm('Atidaryti naujausią scenarijų neišsaugojus dabartinių pakeitimų?', { confirmLabel: 'Atidaryti naujausią' })) return;
        const next = formFromScenario(currentSaved); setForm(next); setBaseline(JSON.stringify(next)); setOpened(structuredClone(currentSaved)); setEpoch(value => value + 1);
      }}>Atidaryti naujausią</Button>}</div>}
    {readOnly && <p className="calc-note">Peržiūros režimu galite keisti prielaidas, tačiau jų išsaugoti negalite.</p>}
    {!!missing.length && <button className="calc-completeness" onClick={() => goToMissing(missing[0])}>
      <AlertCircle size={16} />Trūksta prielaidų: {missing.length}<ArrowUpRight size={14} />
    </button>}
    <div className="calc-view-tabs" role="tablist" aria-label="Skaičiavimo laikotarpis">
      <button id="calculation-trip-tab" role="tab" aria-selected={view === 'trip'} aria-controls="calculation-trip" tabIndex={view === 'trip' ? 0 : -1}
        onClick={() => setView('trip')} onKeyDown={event => { if (event.key === 'ArrowRight') { setView('month'); document.getElementById('calculation-month-tab')?.focus(); } }}><Route size={17} />Reisas</button>
      <button id="calculation-month-tab" role="tab" aria-selected={view === 'month'} aria-controls="calculation-month" tabIndex={view === 'month' ? 0 : -1}
        onClick={() => setView('month')} onKeyDown={event => { if (event.key === 'ArrowLeft') { setView('trip'); document.getElementById('calculation-trip-tab')?.focus(); } }}><CalendarDays size={17} />Mėnuo</button>
    </div>
    <button className="calc-mobile-result" onClick={() => { document.getElementById('calculation-results')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); document.getElementById('calculation-results')?.focus({ preventScroll: true }); }}>
      <span>Preliminarus likutis<b>{!result ? '—' : calculationMoney(view === 'trip' ? result.trip.remainder : result.month.remainder)}</b></span><span>Rezultatai<ArrowDown size={16} /></span>
    </button>
    <div className="calc-layout">
      <NumberFieldReset.Provider value={epoch}><form id="calculator-form" className="calc-form" onSubmit={event => { event.preventDefault(); void save(); }}>
        {view === 'trip' ? <div id="calculation-trip" role="tabpanel" aria-labelledby="calculation-trip-tab">
          <Panel title="Kelias ir automobilis" className="calc-panel">
            <div className="calc-panel-body">
              <Field label="Automobilis"><select value={input.vehicleId} onChange={event => replaceInput(useVehicle(input, db, event.target.value, state))}>
                <option value="">Be automobilio, įvesti ranka</option>
                {input.vehicleId && !db.vehicles.some(row => row.id === input.vehicleId) && <option value={input.vehicleId}>{input.vehicleLabel} (archyvinė prielaida)</option>}
                {db.vehicles.map(row => <option key={row.id} value={row.id}>{row.plate} · {row.make} {row.model}</option>)}
              </select></Field>
              <div className="calc-source-bar">
                <span><MapPin size={17} aria-hidden="true" />{input.route.label || 'Duomenys įvedami ranka'}</span>
                {(db.routes.length > 0 || db.trips.length > 0) && <Button variant="secondary" disabled={routing}
                  onClick={() => setSourceOpen(true)}>{input.route.label ? 'Pakeisti šaltinį' : 'Pasirinkti reisą ar maršrutą'}</Button>}
              </div>
              <div className="calc-grid">
                <NumberField label="Maršruto kilometrai" fieldKey="routeKm" value={input.routeKm} decimals={3} onChange={value => setInput('routeKm', value)} disabled={routing} />
                <NumberField label="Papildomi kilometrai" fieldKey="extraKm" hint="Tik dar neįtraukti į maršruto atstumą." value={input.extraKm} decimals={3} onChange={value => setInput('extraKm', value)} />
              </div>
              <Toggle label="Maršruto kilometrai apima ir grįžimą" checked={input.includesReturn} disabled={routing} onChange={value => { setInput('includesReturn', value); setRouteSuccess(''); }} />
              <p className="calc-note">{input.includesReturn ? 'Grįžimo kilometrai papildomai nepridedami.' : 'Atstumas pirmyn. Grįžimo ar tušti kilometrai turi būti įtraukti aiškiai.'}</p>
              <div className="calc-grid">
                <NumberField label="Važiavimo laikas, min." fieldKey="drivingMinutes" value={input.drivingMinutes} decimals={1} onChange={value => setInput('drivingMinutes', value)} disabled={routing} />
                <NumberField label="Keleivių vietos scenarijuje" fieldKey="seats" value={input.seats} decimals={0} max={200} onChange={value => setInput('seats', value)} hint="Automobilio keleivių vietos, be papildomų priskyrimų." />
              </div>
              {input.route.stops.length >= 2 && <Button variant="ghost" disabled={routing} onClick={() => void fetchRoute()}>
                {routing ? <LoaderCircle size={16} className="calc-spinner" /> : <Route size={16} />}{routing ? 'Gaunamas atstumas...' : 'Atnaujinti kelių atstumą'}
              </Button>}
              {routeError && <p className="calc-warning" role="alert">{routeError}</p>}{routeSuccess && <p className="calc-success" role="status">{routeSuccess}</p>}
            </div>
          </Panel>
          <Panel title="Planuojamos pajamos" className="calc-panel"><div className="calc-panel-body">
            <div className="calc-segmented" aria-label="Pajamų įvedimo būdas">
              {([{ value: 'detailed', label: 'Keleiviai ir siuntos' }, { value: 'total', label: 'Bendra suma' }, ...(input.bookings.length ? [{ value: 'bookings', label: 'Užsakymų kainos' }] : [])] as const).map(mode =>
                <button key={mode.value} type="button" aria-pressed={input.revenueMode === mode.value} onClick={() => setInput('revenueMode', mode.value as CalculatorInput['revenueMode'])}>{mode.label}</button>)}
            </div>
            {input.revenueMode === 'total' ? <NumberField label="Visos planuojamos pajamos, €" fieldKey="totalRevenue" value={input.totalRevenue} scale={100} onChange={value => setInput('totalRevenue', value)} hint="Pakeičia detalizuotas keleivių ir siuntų pajamas." />
              : input.revenueMode === 'bookings' ? <>
                <p className="calc-note">Sutartos bendros užsakymų kainos, ne gauti mokėjimai. Kainos ir kiekiai keičiami tik šiame scenarijuje.</p>
                {input.includesReturn && <Field label="Grįžimo pradžia" controlLabel="Sustojimas, nuo kurio prasideda grįžimas"><select value={input.turnaround ?? ''} onChange={event => setInput('turnaround', event.target.value === '' ? null : Number(event.target.value))}>
                  <option value="">Neskirstyti pagal kryptį</option>
                  {input.route.stops.slice(1, -1).map((stop, index) => <option key={index} value={index + 1}>{index + 2}. {stop.name}</option>)}
                </select></Field>}
                <div className="calc-bookings">{input.bookings.map((row, index) => <div className="calc-booking" key={row.id}>
                  <header><span className={`calc-booking-icon ${row.type}`} aria-hidden="true">{row.type === 'passenger' ? <UsersRound size={18} /> : <Package size={18} />}</span><b>{row.name}</b><button type="button" aria-label={`Pašalinti ${row.name} iš scenarijaus`} onClick={() => setInput('bookings', input.bookings.filter((_, i) => i !== index))}><Trash2 size={15} /></button></header>
                  <small>{input.route.stops[row.pickup]?.name} → {input.route.stops[row.delivery]?.name}</small>
                  <div className="calc-grid"><NumberField label="Kiekis" accessibleLabel={`${row.type === 'passenger' ? 'Keleivių' : 'Siuntų'} skaičius: ${row.name}`} fieldKey={`booking-${row.id}-quantity`} value={row.quantity} decimals={0} max={100000}
                    onChange={value => setInput('bookings', input.bookings.map((item, i) => i === index ? { ...item, quantity: value } : item))} />
                    <NumberField label="Užsakymo kaina, €" accessibleLabel={`Bendra kaina: ${row.name}, €`} fieldKey={`booking-${row.id}-price`} value={row.price} scale={100}
                      onChange={value => setInput('bookings', input.bookings.map((item, i) => i === index ? { ...item, price: value } : item))} /></div>
                </div>)}</div>
              </> : <>
                <DirectionInputs direction="outbound" value={input.outbound} seats={input.seats} onChange={value => setInput('outbound', value)} />
                <Toggle label="Skaičiuoti ir grįžimo pajamas" checked={input.returnRevenue} onChange={value => setInput('returnRevenue', value)} />
                {input.returnRevenue && <DirectionInputs direction="return" value={input.returnLeg} seats={input.seats} onChange={value => setInput('returnLeg', value)} />}
                <OptionalAmount fieldKey="otherRevenue" label="Kitos transportavimo pajamos" value={input.otherRevenue} onChange={value => setInput('otherRevenue', value)} />
              </>}
          </div></Panel>
          <Panel title="Reiso sąnaudos" className="calc-panel"><div className="calc-panel-body">
            <p className="calc-note">Tuščia reikšmė reiškia, kad duomenų trūksta.</p>
            <div className="calc-cost-group"><Toggle icon={<Fuel size={17} />} label="Kuras" checked={input.includeFuel} onChange={value => setInput('includeFuel', value)} />
              {input.includeFuel && <div className="calc-grid"><NumberField label="Kuro sąnaudos, l/100 km" fieldKey="consumption" placeholder="Pvz. 9,5" value={input.rates.consumption} decimals={3} max={1000} onChange={value => setRate('consumption', value)} />
                <NumberField label="Kuro kaina, €/l" fieldKey="fuelPrice" placeholder="Pvz. 1,80" value={input.rates.fuelPrice} scale={10000} decimals={4} onChange={value => setRate('fuelPrice', value)} /></div>}</div>
            <div className="calc-cost-group"><Toggle icon={<CarFront size={17} />} label="Eksploatacija ir dėvėjimasis" checked={input.includeWear} onChange={value => setInput('includeWear', value)} />
              {input.includeWear && <NumberField label="Eksploatacija be kuro, €/km" fieldKey="wearPerKm" placeholder="Pvz. 0,12" hint="Priežiūra, padangos ir dėvėjimasis. Be kuro." value={input.rates.wearPerKm} scale={10000} decimals={4} onChange={value => setRate('wearPerKm', value)} />}</div>
            <div className="calc-cost-group"><Toggle icon={<UserRound size={17} />} label="Vairuotojo atlygis" checked={input.includeDriver} onChange={value => setInput('includeDriver', value)} />
              {input.includeDriver && <><Field label="Vairuotojo atlygio modelis"><select value={input.rates.driverModel} onChange={event => setRate('driverModel', event.target.value as 'trip' | 'day')}>
                <option value="trip">Už reisą</option><option value="day">Už dieną</option></select></Field>
                <div className="calc-grid"><NumberField label={input.rates.driverModel === 'day' ? 'Atlygis už dieną, €' : 'Atlygis už reisą, €'} fieldKey="driverPay" value={input.rates.driverPay} scale={100} onChange={value => setRate('driverPay', value)} />
                  {input.rates.driverModel === 'day' && <NumberField label="Apmokamos dienos" fieldKey="driverDays" value={input.driverDays} max={366} onChange={value => setInput('driverDays', value)} />}</div></>}</div>
            <div className="calc-cost-group calc-waiting">
              <Toggle label="Papildomai apmokamas laukimas" icon={<Clock3 size={17} />} checked={input.includeWaiting} onChange={value => setInput('includeWaiting', value)} />
              {input.includeWaiting && <div className="calc-grid">
                <NumberField label="Laukimas, min." accessibleLabel="Papildomas laukimas, min." fieldKey="waitingMinutes" value={input.waitingMinutes} onChange={value => setInput('waitingMinutes', value)} />
                <NumberField label="Įkainis, €/val." accessibleLabel="Laukimo įkainis, €/val." fieldKey="waitingPerHour" value={input.rates.waitingPerHour} scale={100} onChange={value => setRate('waitingPerHour', value)} />
              </div>}
              {input.includeWaiting && <small className="calc-note">Tik laikas, dar neįtrauktas į vairuotojo atlygį.</small>}
            </div>
            <details className="calc-details"><summary><Receipt size={16} />Papildomos sąnaudos</summary><div>
              {sourceExpenses && Object.keys(sourceExpenses.extras).length > 0 && <div className="calc-expense-source">
                <span>Reise užregistruota papildomų išlaidų: <b>{money(sourceExpenses.total)}</b></span>
                <Button variant="ghost" onClick={copyExpenses}><Download size={16} />Paimti iš reiso</Button>
              </div>}
              {(Object.entries(extraCostLabels) as [ExtraCost, string][]).map(([key, label]) => <OptionalAmount key={key} fieldKey={key} label={label} value={input.extras[key]} onChange={value => extra(key, value)}
                hint={key === 'fixedShare' ? 'Mėnesio modelyje ši dalis nekartojama.' : undefined} />)}
            </div></details>
          </div></Panel>
        </div> : <div id="calculation-month" role="tabpanel" aria-labelledby="calculation-month-tab">
          <Panel title="Mėnesio scenarijus" className="calc-panel"><div className="calc-panel-body">
            <Field label="Mėnuo"><input type="month" value={input.month} onChange={event => setInput('month', event.target.value)} required /></Field>
            <NumberField label="Reisų skaičius per mėnesį" fieldKey="monthlyTrips" value={input.monthlyTrips} decimals={0} max={10000} onChange={value => setInput('monthlyTrips', value)} />
            <input className="calc-slider" type="range" min={0} max={Math.max(30, input.monthlyTrips ?? 0)} step={1} value={input.monthlyTrips ?? 0} aria-label="Reisų skaičius per mėnesį, keisti slankikliu" onChange={event => setInput('monthlyTrips', Number(event.target.value))} />
            <div className="calc-trip-basis"><b>Vieno reiso prielaidos</b><dl><div><dt>Pajamos</dt><dd>{calculationMoney(result?.trip.revenue ?? null)}</dd></div>
              <div><dt>Sąnaudos be paskirstytos pastoviųjų dalies</dt><dd>{calculationMoney(result?.trip.variableCost ?? null)}</dd></div></dl>
              <Button variant="ghost" onClick={() => setView('trip')}>Keisti reiso prielaidas<ArrowUpRight size={15} /></Button></div>
            <OptionalAmount fieldKey="monthlyFixed" label="Pastoviosios mėnesio sąnaudos" value={input.monthlyFixed} onChange={value => setInput('monthlyFixed', value)} />
            <p className="calc-note">Vieno reiso pajamos ir sąnaudos kartojamos. Mėnesio pastoviosios sąnaudos atimamos vieną kartą. Reisui paskirstyta pastoviųjų sąnaudų dalis čia neįtraukiama.</p>
          </div></Panel>
        </div>}
        <div className="calc-form-actions">
          <Button type="submit" disabled={busy || !!savingId || routing || readOnly || !!stale || !!opened && !dirty}><Save size={16} />{busy || savingId ? 'Saugoma...' : 'Išsaugoti scenarijų'}</Button>
          <Button variant="ghost" disabled={busy} onClick={() => setDetailsOpen(true)}><PencilLine size={15} />Pavadinimas ir reisas</Button>
        </div>
      </form></NumberFieldReset.Provider>
      {result ? <CalculationResults result={result} input={input} view={view} dirty={dirty} savedAt={opened?.calculatedAt} onMissing={goToMissing} />
        : <aside className="calc-results panel"><p className="calc-warning" role="alert">Įvestos reikšmės per didelės skaičiavimui. Sumažinkite kiekius arba įkainius.</p></aside>}
    </div>
    {sourceOpen && <SourceDialog initialSource={source || (input.route.kind !== 'manual' ? `${input.route.kind}:${input.route.id}` : '')}
      onApply={importSource} onClose={() => setSourceOpen(false)} />}
    {detailsOpen && <Modal title="Scenarijus" onClose={() => { if (!busy) setDetailsOpen(false); }}>
      <form className="calc-scenario-dialog" noValidate onSubmit={event => { event.preventDefault(); void save(); }}>
        <div className="modal-body">
          <Field label="Scenarijaus pavadinimas" hint={nameMissing && !form.name.trim() ? 'Įrašykite pavadinimą, kad išsaugotumėte.' : undefined}>
            <input id="calculator-scenario-name" maxLength={160} value={form.name} aria-invalid={nameMissing && !form.name.trim() || undefined}
              placeholder="Pvz. Kaunas - Hamburgas" onChange={event => { setNameMissing(false); setForm(before => ({ ...before, name: event.target.value })); }} />
          </Field>
          <Field label="Susietas reisas"><select value={form.tripId} onChange={event => setForm(before => ({ ...before, tripId: event.target.value, primary: false }))}>
            <option value="">Nesusietas</option>{db.trips.map(row => <option key={row.id} value={row.id}>{row.number} · {row.name}</option>)}
          </select></Field>
          {form.tripId && <Toggle label="Pagrindinis šio reiso scenarijus" checked={form.primary} onChange={primary => setForm(before => ({ ...before, primary }))} />}
        </div>
        <footer><Button variant="secondary" disabled={busy} onClick={() => setDetailsOpen(false)}>Uždaryti</Button>
          <Button type="submit" disabled={busy || !!savingId || routing || readOnly || !!stale}><Save size={16} />{busy || savingId ? 'Saugoma...' : 'Išsaugoti scenarijų'}</Button></footer>
      </form>
    </Modal>}
    {ratesOpen && <RateSettings onClose={() => { setRatesOpen(false); setRatesDirty(false); }} onDirty={setRatesDirty} />}
  </div></MissingCalculationFields.Provider>;
}
