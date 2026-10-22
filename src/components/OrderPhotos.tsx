import {photoStageLabels as stages} from '../domain/terminology';
import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Trash2 } from 'lucide-react';
import { useApp } from '../context';
import { api } from '../services/server-api';
import { Button, Field, Modal, Panel } from './ui';

interface Photo { id: string; stage: keyof typeof stages; actor_id: string; created_at: string; url?: string }
export function OrderPhotos({ orderId }: { orderId: string }) {
  const { notify, user, session, workspace } = useApp();
  const [photos, setPhotos] = useState<Photo[]>([]), [stage, setStage] = useState<keyof typeof stages>('pickup');
  const [busy, setBusy] = useState(false), [selected, setSelected] = useState<Photo | null>(null);
  const input = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null);
  const readOnly = !!session?.returnTo;
  const load = () => api<Photo[]>('/api/photos?order=' + encodeURIComponent(orderId)).then(setPhotos).catch(e => notify(e.message, true));
  useEffect(() => { void load(); }, [orderId]);
  async function upload(file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) { notify('Pasirinkite JPEG, PNG arba WebP vaizdą iki 8 MB.', true); return; }
    setBusy(true);
    try { await api('/api/photos?order=' + encodeURIComponent(orderId) + '&stage=' + stage, 'POST', file, true); await load(); notify('Nuotrauka pridėta'); }
    catch (e) { notify((e as Error).message, true); } finally { setBusy(false); if (input.current) input.current.value = ''; if (camera.current) camera.current.value = ''; }
  }
  return <div className="order-photos"><div className="photo-controls"><Field label="Paskirtis"><select value={stage} onChange={e => setStage(e.target.value as keyof typeof stages)}>{Object.entries(stages).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field>
    <Button variant="secondary" disabled={busy || readOnly} onClick={() => camera.current?.click()}><Camera size={18}/>Nufotografuoti</Button><Button variant="secondary" disabled={busy || readOnly} onClick={() => input.current?.click()}><ImagePlus size={18}/>Pasirinkti nuotrauką</Button>
    <input hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" ref={camera} aria-label="Fotografuoti užsakymą" onChange={e => void upload(e.target.files?.[0])}/><input hidden type="file" accept="image/jpeg,image/png,image/webp" ref={input} aria-label="Įkelti užsakymo nuotrauką" onChange={e => void upload(e.target.files?.[0])}/>
  </div><div className="photo-grid">{photos.map(photo => <article key={photo.id}><button type="button" className="photo-open" onClick={() => setSelected(photo)} aria-label={`Atidaryti nuotrauką: ${stages[photo.stage]}`}><img loading="lazy" src={photo.url ?? '/api/photos/' + photo.id} alt={stages[photo.stage]}/></button><div><b>{stages[photo.stage]}</b><small>{new Intl.DateTimeFormat('lt-LT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(photo.created_at))}</small><small>{workspace.users.find(u => u.id === photo.actor_id)?.name}</small></div>{!readOnly && (user?.role !== 'driver' || photo.actor_id === user.id) && <button type="button" className="text-link" disabled={busy} onClick={async () => { if (!confirm('Ištrinti šią nuotrauką?')) return; try { await api('/api/photos/' + photo.id, 'DELETE'); await load(); } catch (e) { notify((e as Error).message, true); } }}><Trash2 size={16}/>Ištrinti</button>}</article>)}</div>{!photos.length && <p className="inline-empty">Nuotraukų nėra.</p>}
    {selected && <Modal title={stages[selected.stage]} onClose={() => setSelected(null)}><div className="modal-body"><img className="photo-expanded" src={selected.url ?? '/api/photos/' + selected.id} alt={stages[selected.stage]}/></div></Modal>}
  </div>;
}
export function TripPhotos({ tripId }: { tripId: string }) {
  const { db, serverMode, modules } = useApp();
  const orders = db.orders.filter(o => o.tripId === tripId && o.status !== 'cancelled');
  const [orderId, setOrderId] = useState(orders[0]?.id ?? '');
  if (!serverMode || !modules.includes('photos') || !orders.length) return null;
  return <Panel title="Užsakymų nuotraukos"><div className="settings-form"><Field label="Užsakymas"><select value={orderId} onChange={e => setOrderId(e.target.value)}>{orders.map(order => <option key={order.id} value={order.id}>{order.number} · {order.name}</option>)}</select></Field>{orderId && <OrderPhotos key={orderId} orderId={orderId}/>}</div></Panel>;
}
