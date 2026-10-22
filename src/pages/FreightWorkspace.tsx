import { useEffect, useState } from 'react';
import { RefreshCw, Plus, ExternalLink, Pencil, Trash2, MapPin, CalendarDays, Weight, Phone, Search, Calculator } from 'lucide-react';
import { useApp } from '../context';
import { api } from '../services/server-api';
import { readOnlySession } from '../domain/access';
import { emptyFreightDetails, freightSearchUrl, freightSources, opportunityStatuses, parseEuro, type FreightOpportunity } from '../domain/freight';
import { money, today } from '../domain/logic';
import { routeVisits } from '../domain/route-plan';
import { useConfirm } from '../components/Feedback';
import { FreightReview } from '../components/FreightReview';
import { PlacePicker } from '../components/PlacePicker';
import { Button, Empty, Field, Modal, PageHeading, Panel, SearchInput } from '../components/ui';

export function FreightWorkspace() {
  const { db, notify, session, modules } = useApp();
  const confirm = useConfirm();
  const [tab, setTab] = useState<'search' | 'saved'>('search');
  const [rows, setRows] = useState<FreightOpportunity[]>([]);
  const [edit, setEdit] = useState<FreightOpportunity | null>(null);
  const [review, setReview] = useState<FreightOpportunity | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tripId, setTripId] = useState('');
  const [source, setSource] = useState('all');
  const [pickup, setPickup] = useState('');
  const [delivery, setDelivery] = useState('');
  const [date, setDate] = useState(today());
  const [terms, setTerms] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [savedDate, setSavedDate] = useState('');
  const [weight, setWeight] = useState('');
  const [price, setPrice] = useState('');
  const readOnly = readOnlySession(session);
  const trip = db.trips.find(record => record.id === tripId);
  const cities = trip ? [...new Set(routeVisits(trip.stops).map(visit => visit.place.name))] : [];

  async function load() {
    try { setRows(await api<FreightOpportunity[]>('/api/opportunities')); }
    catch (error) { notify((error as Error).message, true); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  function openForm(value?: FreightOpportunity) {
    const next = value ? structuredClone(value) : {
      id: '', title: '', url: '', notes: '', created_at: '',
      details: { ...emptyFreightDetails(), tripId, date: date || null },
    };
    setWeight(next.details.weight === null ? '' : String(next.details.weight));
    setPrice(next.details.price === null ? '' : (next.details.price / 100).toFixed(2));
    setEdit(next);
  }
  async function save() {
    if (!edit) return;
    setBusy(true);
    try {
      await api('/api/opportunities', edit.id ? 'PUT' : 'POST', {
        ...edit,
        details: { ...edit.details, weight: weight.trim() ? Number(weight.replace(',', '.')) : null, price: modules.includes('finance') ? parseEuro(price) : edit.details.price },
      });
      setEdit(null); setTab('saved'); await load(); notify('Pasiūlymas išsaugotas');
    } catch (error) { notify((error as Error).message, true); }
    finally { setBusy(false); }
  }
  const visible = rows.filter(row => (!status || row.details.status === status)
    && (!savedDate || row.details.date === savedDate)
    && `${row.title} ${row.notes} ${row.details.contact} ${row.details.pickup?.name ?? ''} ${row.details.delivery?.name ?? ''}`.toLocaleLowerCase('lt').includes(query.toLocaleLowerCase('lt')))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return <>
    <PageHeading title="Krovinių galimybės"><Button variant="secondary" disabled={busy} onClick={() => void load()}><RefreshCw size={17} />Atnaujinti</Button><Button disabled={readOnly} onClick={() => openForm()}><Plus size={18} />Pridėti pasiūlymą</Button></PageHeading>
    <div className="module-tabs">
      <button className={tab === 'search' ? 'selected' : ''} onClick={() => setTab('search')}><Search size={16} />Paieška internete</button>
      <button className={tab === 'saved' ? 'selected' : ''} onClick={() => setTab('saved')}>Išsaugota <span>{rows.length}</span></button>
    </div>
    {tab === 'search' ? <div className="freight-search-layout">
      <Panel title="Paieškos užklausa"><div className="freight-search-form form-grid">
        <Field label="Pagal reisą" full><select value={tripId} onChange={event => {
          const id = event.target.value, record = db.trips.find(trip => trip.id === id);
          setTripId(id);
          if (record) { const visits = routeVisits(record.stops); setPickup(visits[0]?.place.name ?? ''); setDelivery(visits.at(-1)?.place.name ?? ''); setDate(record.departure.slice(0, 10)); }
        }}><option value="">Be pasirinkto reiso</option>{db.trips.filter(record => !['completed', 'cancelled'].includes(record.status)).map(record => <option key={record.id} value={record.id}>{record.number} · {record.name}</option>)}</select></Field>
        <datalist id="freight-trip-cities">{cities.map(city => <option key={city} value={city} />)}</datalist>
        <Field label="Paėmimo miestas"><input list="freight-trip-cities" value={pickup} onChange={event => setPickup(event.target.value)} /></Field>
        <Field label="Pristatymo miestas"><input list="freight-trip-cities" value={delivery} onChange={event => setDelivery(event.target.value)} /></Field>
        <Field label="Data"><input type="date" value={date} onChange={event => setDate(event.target.value)} /></Field>
        <Field label="Šaltinis"><select value={source} onChange={event => setSource(event.target.value)}>{freightSources.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
        <Field label="Paieškos tekstas" full><input placeholder="Pvz., ieško kas parvežtų, siunta, Beiladung" maxLength={300} value={terms} onChange={event => setTerms(event.target.value)} /></Field>
        <div className="freight-search-submit"><a className="button primary" href={freightSearchUrl({ source, pickup, delivery, date, query: terms })} target="_blank" rel="noopener noreferrer"><Search size={18} />Atidaryti paiešką<ExternalLink size={16} /></a></div>
      </div></Panel>
      <aside className="freight-search-help panel">
        <MapPin size={23} /><h2>Papildomas krovinys reisui</h2>
        <p>Ieškokite ir tarpinių sustojimų miestuose. Rastą pasiūlymą išsaugokite, palyginkite su reisu ir susisiekite su siuntėju.</p>
        <p>Paieška atidaroma „Google“. Rezultatų aktualumas ir prieigos sąlygos priklauso nuo šaltinio.</p>
        <Button variant="secondary" disabled={readOnly} onClick={() => openForm()}><Plus size={16} />Išsaugoti rastą pasiūlymą</Button>
      </aside>
    </div> : <>
      <div className="freight-saved-filters">
        <SearchInput value={query} onChange={setQuery} placeholder="Krovinys, miestas arba kontaktas..." />
        <Field label="Būsena"><select value={status} onChange={event => setStatus(event.target.value)}><option value="">Visos</option>{Object.entries(opportunityStatuses).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field>
        <Field label="Paėmimo data"><input type="date" value={savedDate} onChange={event => setSavedDate(event.target.value)} /></Field>
      </div>
      <div className="freight-opportunities">{visible.map(row => <article className={`panel freight-opportunity freight-${row.details.status}`} key={row.id}>
        <header><span className={`freight-status ${row.details.status}`}>{opportunityStatuses[row.details.status]}</span><h2>{row.title}</h2></header>
        <div className="freight-facts">
          {(row.details.pickup || row.details.delivery) && <p><MapPin size={17} />{row.details.pickup?.name ?? '?'} → {row.details.delivery?.name ?? '?'}</p>}
          <p><CalendarDays size={17} />{row.details.date ?? 'Data nenurodyta'}</p>
          <p><Weight size={17} />{row.details.weight === null ? 'Svoris nenurodytas' : row.details.weight + ' kg'}{row.details.dimensions ? ' · ' + row.details.dimensions : ''}</p>
          {row.details.contact && <p><Phone size={17} />{row.details.contact}</p>}
          {modules.includes('finance') && <p className="freight-price">{row.details.price === null ? 'Kaina nenurodyta' : money(row.details.price)}</p>}
        </div>
        {row.notes && <p className="freight-notes">{row.notes}</p>}
        <footer>
          <Button variant="secondary" onClick={() => setReview(row)}><Calculator size={16} />Įvertinti reisui</Button>
          <Button variant="ghost" disabled={readOnly} onClick={() => openForm(row)}><Pencil size={16} />Redaguoti</Button>
          {row.url && <a className="text-link" href={row.url} target="_blank" rel="noopener noreferrer">Šaltinis<ExternalLink size={15} /></a>}
          <button className="icon-button danger-icon" aria-label={'Ištrinti pasiūlymą: ' + row.title} disabled={readOnly} onClick={async () => {
            if (!await confirm('Ištrinti šį pasiūlymą?', { confirmLabel: 'Ištrinti', danger: true })) return;
            try { await api('/api/opportunities?id=' + encodeURIComponent(row.id), 'DELETE'); await load(); }
            catch (error) { notify((error as Error).message, true); }
          }}><Trash2 size={17} /></button>
        </footer>
      </article>)}</div>
      {loading ? <p role="status">Kraunami pasiūlymai...</p> : !visible.length && <Empty title="Išsaugotų pasiūlymų nerasta" description="Pridėkite rastą pasiūlymą arba pakeiskite filtrus." />}
    </>}
    {review && <FreightReview opportunity={review} initialTripId={tripId} onClose={() => setReview(null)} />}
    {edit && <Modal title={edit.id ? 'Redaguoti pasiūlymą' : 'Naujas pasiūlymas'} onClose={() => { if (!busy) setEdit(null); }} wide>
      <form onSubmit={event => { event.preventDefault(); void save(); }}><div className="modal-body form-grid">
        <Field label="Pavadinimas" full><input required maxLength={160} value={edit.title} onChange={event => setEdit({ ...edit, title: event.target.value })} /></Field>
        <Field label="Būsena"><select value={edit.details.status} onChange={event => setEdit({ ...edit, details: { ...edit.details, status: event.target.value as typeof edit.details.status } })}>{Object.entries(opportunityStatuses).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field>
        <Field label="Paėmimo data"><input type="date" value={edit.details.date ?? ''} onChange={event => setEdit({ ...edit, details: { ...edit.details, date: event.target.value || null } })} /></Field>
        <div className="full freight-place-fields">
          {(['pickup', 'delivery'] as const).map(key => <details key={key}><summary><MapPin size={16} />{key === 'pickup' ? 'Paėmimo vieta' : 'Pristatymo vieta'}{edit.details[key] && <b>{edit.details[key]!.name}</b>}</summary>
            <PlacePicker label={key === 'pickup' ? 'Paėmimo adresas' : 'Pristatymo adresas'} value={edit.details[key]} onChange={place => setEdit({ ...edit, details: { ...edit.details, [key]: place } })} />
          </details>)}
        </div>
        <Field label="Bendras krovinio svoris, kg"><input inputMode="decimal" value={weight} onChange={event => setWeight(event.target.value)} placeholder="Nenurodytas" /></Field>
        <Field label="Matmenys"><input maxLength={160} placeholder="Ilgis × plotis × aukštis" value={edit.details.dimensions} onChange={event => setEdit({ ...edit, details: { ...edit.details, dimensions: event.target.value } })} /></Field>
        {modules.includes('finance') && <Field label="Siūloma kaina, €"><input inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} placeholder="Nenurodyta" /></Field>}
        <Field label="Kontaktas" full><input maxLength={300} placeholder="Vardas, telefonas arba el. paštas" value={edit.details.contact} onChange={event => setEdit({ ...edit, details: { ...edit.details, contact: event.target.value } })} /></Field>
        <Field label="Susijęs reisas" full><select value={edit.details.tripId} onChange={event => setEdit({ ...edit, details: { ...edit.details, tripId: event.target.value } })}><option value="">Neparinktas</option>{db.trips.map(record => <option key={record.id} value={record.id}>{record.number} · {record.name}</option>)}</select></Field>
        <Field label="Šaltinio nuoroda" full><input type="url" pattern="https://.*" maxLength={2000} placeholder="https://" value={edit.url} onChange={event => setEdit({ ...edit, url: event.target.value })} /></Field>
        <Field label="Pastabos" full><textarea maxLength={2000} value={edit.notes} onChange={event => setEdit({ ...edit, notes: event.target.value })} /></Field>
      </div><footer><Button variant="secondary" disabled={busy} onClick={() => setEdit(null)}>Atšaukti</Button><Button type="submit" disabled={busy}>Išsaugoti</Button></footer></form>
    </Modal>}
  </>;
}
