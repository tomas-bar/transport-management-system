import { useEffect, useId, useRef, useState } from 'react';
import { Camera, ChevronDown, Image, ImagePlus, Trash2 } from 'lucide-react';
import { readOnlySession } from '../domain/access';
import { useConfirm } from './Feedback';
import { photoStageLabels as stages } from '../domain/terminology';
import { useApp } from '../context';
import { api } from '../services/server-api';
import { Button, Field, Modal, Panel } from './ui';
import { HandoverIcon } from './HandoverIcon';

type PhotoStage = keyof typeof stages;
interface Photo { id: string; stage: PhotoStage; actor_id: string; created_at: string; url?: string }

export function OrderPhotos({ orderId }: { orderId: string }) {
  const confirm = useConfirm();
  const { notify, user, session, workspace } = useApp();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [stage, setStage] = useState<PhotoStage>('pickup');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Photo | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const stageName = useId();
  const readOnly = readOnlySession(session);
  const endpoint = '/api/photos?order=' + encodeURIComponent(orderId);
  const load = () => api<Photo[]>(endpoint).then(setPhotos);
  useEffect(() => {
    let active = true;
    setLoading(true);
    api<Photo[]>(endpoint).then(result => { if (active) setPhotos(result); })
      .catch(error => { if (active) notify(error.message, true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [endpoint]);
  async function upload(file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
      notify('Pasirinkite JPEG, PNG arba WebP vaizdą iki 8 MB.', true);
      return;
    }
    setBusy(true);
    try {
      await api(endpoint + '&stage=' + stage, 'POST', file, true);
      await load();
      notify('Nuotrauka pridėta');
    } catch (error) { notify((error as Error).message, true); }
    finally {
      setBusy(false);
      if (input.current) input.current.value = '';
      if (camera.current) camera.current.value = '';
    }
  }
  return <div className="order-photos" aria-busy={busy || loading}>
    <fieldset className="photo-stage-picker" disabled={busy || readOnly}>
      <legend>Paskirtis</legend>
      <div>{Object.entries(stages).map(([id, label]) => <label key={id} className={stage === id ? 'selected' : ''}>
        <input type="radio" name={stageName} value={id} checked={stage === id} onChange={() => setStage(id as PhotoStage)} />
        {id === 'other' ? <Image size={16} aria-hidden="true" /> : <HandoverIcon kind={id as 'pickup' | 'delivery'} />}{label}
      </label>)}</div>
    </fieldset>
    <div className="photo-upload-actions">
      <Button variant="secondary" disabled={busy || readOnly} onClick={() => camera.current?.click()}><Camera size={18} />Nufotografuoti</Button>
      <Button variant="secondary" disabled={busy || readOnly} onClick={() => input.current?.click()}><ImagePlus size={18} />Iš galerijos</Button>
      <input hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" ref={camera} aria-label="Fotografuoti užsakymą" onChange={event => void upload(event.target.files?.[0])} />
      <input hidden type="file" accept="image/jpeg,image/png,image/webp" ref={input} aria-label="Įkelti užsakymo nuotrauką" onChange={event => void upload(event.target.files?.[0])} />
    </div>
    {busy && <p className="photo-loading" role="status">Nuotrauka saugoma...</p>}
    <div className="photo-grid">{photos.map(photo => <article key={photo.id}>
      <button type="button" className="photo-open" onClick={() => setSelected(photo)} aria-label={`Atidaryti nuotrauką: ${stages[photo.stage]}`}>
        <img loading="lazy" src={photo.url ?? '/api/photos/' + photo.id} alt={stages[photo.stage]} /></button>
      <div><b className={`photo-stage-label ${photo.stage}`}>
        {photo.stage === 'other' ? <Image size={16} /> : <HandoverIcon kind={photo.stage} />}{stages[photo.stage]}</b>
        <small>{new Intl.DateTimeFormat('lt-LT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(photo.created_at))}</small>
        <small>{workspace.users.find(user => user.id === photo.actor_id)?.name}</small></div>
      {!readOnly && (user?.role !== 'driver' || photo.actor_id === user.id) && <button type="button" className="text-link" disabled={busy} onClick={async () => {
        if (!(await confirm('Ištrinti šią nuotrauką?', { title: 'Ištrinti nuotrauką', confirmLabel: 'Ištrinti', danger: true }))) return;
        try { await api('/api/photos/' + photo.id, 'DELETE'); await load(); }
        catch (error) { notify((error as Error).message, true); }
      }}><Trash2 size={16} />Ištrinti</button>}
    </article>)}</div>
    {!photos.length && <p className="inline-empty">{loading ? 'Nuotraukos įkeliamos...' : 'Šis užsakymas nuotraukų neturi.'}</p>}
    {selected && <Modal title={stages[selected.stage]} onClose={() => setSelected(null)}>
      <div className="modal-body"><img className="photo-expanded" src={selected.url ?? '/api/photos/' + selected.id} alt={stages[selected.stage]} /></div></Modal>}
  </div>;
}

export function TripPhotos({ tripId, collapsible = false }: { tripId: string; collapsible?: boolean }) {
  const { db, serverMode, modules } = useApp();
  const orders = db.orders.filter(order => order.tripId === tripId && order.status !== 'cancelled');
  const [selectedId, setSelectedId] = useState('');
  const orderId = orders.find(order => order.id === selectedId)?.id ?? orders[0]?.id;
  if (!serverMode || !modules.includes('photos')) return null;
  const contents = <div className="trip-photos-body">{orders.length ? <>
    <Field label="Užsakymas"><select value={orderId} onChange={event => setSelectedId(event.target.value)}>
      {orders.map(order => <option key={order.id} value={order.id}>{order.number} · {order.name}</option>)}</select></Field>
    {orderId && <OrderPhotos key={orderId} orderId={orderId} />}
  </> : <p className="inline-empty">Reise nėra užsakymų.</p>}</div>;
  return collapsible ? <details className="panel trip-photos">
    <summary><Camera size={20} /><h2>Užsakymų nuotraukos</h2><ChevronDown size={18} /></summary>{contents}
  </details> : <Panel title="Užsakymų nuotraukos" className="trip-photos">{contents}</Panel>;
}
