import { useEffect, useState } from 'react';
import { Plus, Check, Trash2, RotateCcw } from 'lucide-react';
import { useApp } from '../context';
import { api } from '../services/server-api';
import { readOnlySession } from '../domain/access';
import { today } from '../domain/logic';
import { useConfirm } from '../components/Feedback';
import { Button, Empty, Field, Modal, PageHeading, Plate } from '../components/ui';

interface Reminder { id: string; vehicle_id: string; title: string; due_date: string; done: number }

export function OperationalTools() {
  const { db, notify, session } = useApp();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Reminder[]>([]);
  const [form, setForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [date, setDate] = useState(today());
  const [history, setHistory] = useState(false);
  const readOnly = readOnlySession(session);

  async function load() {
    try { setRows(await api<Reminder[]>('/api/reminders')); }
    catch (error) { notify((error as Error).message, true); }
  }
  useEffect(() => { void load(); }, []);

  async function change(action: () => Promise<unknown>) {
    setBusy(true);
    try { await action(); await load(); }
    catch (error) { notify((error as Error).message, true); }
    finally { setBusy(false); }
  }
  const visible = rows.filter(row => !!row.done === history).sort((a, b) => a.due_date.localeCompare(b.due_date));

  return <>
    <PageHeading title="Transporto priminimai"><Button disabled={readOnly || busy} onClick={() => {
      setTitle(''); setDate(today()); setVehicleId(db.vehicles.find(vehicle => vehicle.status === 'active')?.id ?? ''); setForm(true);
    }}><Plus size={18} />Pridėti priminimą</Button></PageHeading>
    <div className="module-tabs"><button className={!history ? 'selected' : ''} onClick={() => setHistory(false)}>Laukia</button><button className={history ? 'selected' : ''} onClick={() => setHistory(true)}>Atlikta</button></div>
    <div className="user-grid">{visible.map(row => {
      const vehicle = db.vehicles.find(vehicle => vehicle.id === row.vehicle_id);
      return <article className="user-card" key={row.id}>
        <h2>{row.title}</h2>
        <p>{vehicle ? <Plate value={vehicle.plate} /> : 'Ankstesnis automobilis'}</p>
        <p className={row.due_date < today() && !row.done ? 'form-error' : ''}>{row.due_date}{row.due_date < today() && !row.done ? ' · Terminas praėjo' : ''}</p>
        <Button variant="secondary" disabled={readOnly || busy} onClick={() => void change(() => api('/api/reminders', 'PUT', { id: row.id, done: !row.done }))}>
          {row.done ? <RotateCcw size={16} /> : <Check size={16} />}{row.done ? 'Grąžinti į laukiančius' : 'Atlikta'}
        </Button>
        <footer><Button variant="ghost" disabled={readOnly || busy} onClick={async () => {
          if (await confirm('Ištrinti šį priminimą?', { confirmLabel: 'Ištrinti', danger: true })) await change(() => api('/api/reminders?id=' + encodeURIComponent(row.id), 'DELETE'));
        }}><Trash2 size={16} />Ištrinti</Button></footer>
      </article>;
    })}</div>
    {!visible.length && <Empty title="Priminimų nėra" description="" />}
    {form && <Modal title="Naujas priminimas" onClose={() => setForm(false)}><form onSubmit={event => {
      event.preventDefault();
      void change(async () => { await api('/api/reminders', 'POST', { title, vehicleId, dueDate: date }); setForm(false); });
    }}><div className="modal-body form-grid">
      <Field label="Pavadinimas" full><input required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} /></Field>
      <Field label="Automobilis" full><select required value={vehicleId} onChange={event => setVehicleId(event.target.value)}><option value="">Pasirinkite</option>{db.vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} · {vehicle.model}</option>)}</select></Field>
      <Field label="Terminas" full><input type="date" required value={date} onChange={event => setDate(event.target.value)} /></Field>
    </div><footer><Button variant="secondary" onClick={() => setForm(false)}>Atšaukti</Button><Button type="submit" disabled={busy}>Išsaugoti</Button></footer></form></Modal>}
  </>;
}
