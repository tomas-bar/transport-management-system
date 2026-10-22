import { useEffect, useState } from 'react';
import { Plus, ExternalLink, Check, Trash2 } from 'lucide-react';
import { useApp } from '../context';
import { api } from '../services/server-api';
import { today } from '../domain/logic';
import { Button, Empty, Field, Modal, PageHeading } from '../components/ui';
interface Reminder { id: string; vehicle_id: string; title: string; due_date: string; done: number }
interface Opportunity { id: string; title: string; url: string; notes: string; created_at: string }
export function OperationalTools({ kind }: { kind: 'maintenance' | 'freight' }) {
  const reminders = kind === 'maintenance', endpoint = reminders ? '/api/reminders' : '/api/opportunities';
  const { db, notify, session } = useApp();
  const [rows, setRows] = useState<(Reminder | Opportunity)[]>([]), [form, setForm] = useState(false), [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(''), [vehicleId, setVehicleId] = useState(''), [date, setDate] = useState(today());
  const [url, setUrl] = useState(''), [notes, setNotes] = useState(''), [history, setHistory] = useState(false);
  const load = () => api<(Reminder | Opportunity)[]>(endpoint).then(setRows).catch(e => notify(e.message, true));
  useEffect(() => { void load(); }, [kind]);
  const visible = reminders ? rows.filter(r => !!(r as Reminder).done === history).sort((a, b) => (a as Reminder).due_date.localeCompare((b as Reminder).due_date)) : rows;
  return <><PageHeading title={reminders ? 'Transporto priminimai' : 'Krovinių paieška'}><Button disabled={!!session?.returnTo} onClick={() => { setTitle(''); setUrl(''); setNotes(''); setVehicleId(db.vehicles[0]?.id ?? ''); setForm(true); }}><Plus size={18}/>{reminders ? 'Pridėti priminimą' : 'Išsaugoti galimybę'}</Button></PageHeading>
    {reminders ? <div className="module-tabs"><button className={!history ? 'selected' : ''} onClick={() => setHistory(false)}>Laukia</button><button className={history ? 'selected' : ''} onClick={() => setHistory(true)}>Atlikta</button></div> : <p className="muted">Rankiniu būdu išsaugotos galimybės ir nuorodos. Tai nėra tiesioginis biržų pasiūlymų srautas.</p>}
    <div className="user-grid">{visible.map(row => <article className="user-card" key={row.id}><h2>{row.title}</h2>{reminders ? <><p>{db.vehicles.find(v => v.id === (row as Reminder).vehicle_id)?.plate ?? 'Ankstesnis automobilis'}</p><p className={(row as Reminder).due_date < today() && !(row as Reminder).done ? 'form-error' : ''}>{(row as Reminder).due_date}{(row as Reminder).due_date < today() && !(row as Reminder).done ? ' · Terminas praėjo' : ''}</p><Button variant="secondary" disabled={!!session?.returnTo} onClick={async () => { try { await api(endpoint, 'PUT', { id: row.id, done: !(row as Reminder).done }); await load(); } catch (e) { notify((e as Error).message, true); } }}><Check size={16}/>{(row as Reminder).done ? 'Grąžinti į laukiančius' : 'Atlikta'}</Button></> : <><p>{(row as Opportunity).notes}</p><a className="text-link" href={(row as Opportunity).url} target="_blank" rel="noopener noreferrer">Atidaryti šaltinį<ExternalLink size={16}/></a></>}
      <footer><Button variant="secondary" disabled={!!session?.returnTo} onClick={async () => { if (!confirm('Ištrinti šį įrašą?')) return; try { await api(endpoint + '?id=' + row.id, 'DELETE'); await load(); } catch (e) { notify((e as Error).message, true); } }}><Trash2 size={16}/>Ištrinti</Button></footer></article>)}</div>
    {!visible.length && <Empty title={reminders ? 'Priminimų nėra' : 'Išsaugotų galimybių nėra'}/>}
    {form && <Modal title={reminders ? 'Naujas priminimas' : 'Išsaugoti galimybę'} onClose={() => setForm(false)}><form onSubmit={async e => { e.preventDefault(); setBusy(true); try { await api(endpoint, 'POST', reminders ? { title, vehicleId, dueDate: date } : { title, url, notes }); setForm(false); await load(); } catch (error) { notify((error as Error).message, true); } finally { setBusy(false); } }}><div className="modal-body form-grid"><Field label="Pavadinimas" full><input required maxLength={160} value={title} onChange={e => setTitle(e.target.value)}/></Field>
      {reminders ? <><Field label="Automobilis" full><select required value={vehicleId} onChange={e => setVehicleId(e.target.value)}><option value="">Pasirinkite</option>{db.vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} · {v.model}</option>)}</select></Field><Field label="Terminas" full><input type="date" required value={date} onChange={e => setDate(e.target.value)}/></Field></> : <><Field label="Šaltinio nuoroda" full><input type="url" required pattern="https://.*" placeholder="https://" maxLength={2000} value={url} onChange={e => setUrl(e.target.value)}/></Field><Field label="Pastabos" full><textarea maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)}/></Field></>}
    </div><footer><Button variant="secondary" onClick={() => setForm(false)}>Atšaukti</Button><Button type="submit" disabled={busy}>Išsaugoti</Button></footer></form></Modal>}
  </>;
}
