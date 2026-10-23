import { useEffect, useState } from 'react';
import { useApp } from '../context';
import { api } from '../services/server-api';
import { Button, Field, PageHeading, Panel } from '../components/ui';
import { roleLabels } from '../domain/workspace';
interface ActiveSession { id: string; createdAt: number; lastAt: number; device: string; current: boolean }
export function Profile() {
  const { user, notify, logout, refresh, session } = useApp();
  const [sessions, setSessions] = useState<ActiveSession[]>([]), [name, setName] = useState(user?.name ?? '');
  const [current, setCurrent] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false);
  const load = () => api<ActiveSession[]>('/api/sessions').then(setSessions).catch(e => notify(e.message, true));
  useEffect(() => { if (!session?.returnTo) void load(); }, []);
  if (!user || session?.returnTo) return null;
  return <><PageHeading title="Mano paskyra"/><div className="settings-layout"><div>
    <Panel title="Paskyros duomenys"><form className="settings-form" onSubmit={async e => { e.preventDefault(); setBusy(true); try { await api('/api/profile', 'POST', { name }); await refresh(); } catch (error) { notify((error as Error).message, true); } finally { setBusy(false); } }}><Field label="Vardas ir pavardė"><input required maxLength={100} value={name} onChange={e => setName(e.target.value)}/></Field><p>{user.email}</p><p>{roleLabels[user.role]}</p><Button type="submit" disabled={busy}>Išsaugoti</Button></form></Panel>
    <Panel title="Keisti slaptažodį"><form className="settings-form" onSubmit={async e => { e.preventDefault(); setBusy(true); try { await api('/api/password', 'POST', { current, password }); setCurrent(''); setPassword(''); logout(); notify('Slaptažodis pakeistas. Prisijunkite iš naujo.'); } catch (error) { notify((error as Error).message, true); } finally { setBusy(false); } }}><Field label="Dabartinis slaptažodis"><input type="password" required autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)}/></Field><Field label="Naujas slaptažodis" hint="Bent 8 simbolių. Visos sesijos bus užbaigtos."><input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}/></Field><Button type="submit" disabled={busy}>Keisti slaptažodį</Button></form></Panel>
  </div><Panel title="Prisijungimai"><div className="settings-form">{sessions.map(item => <article className="session-row" key={item.id}><b>{item.current ? 'Šis įrenginys' : 'Kitas prisijungimas'}</b><p>{item.device}</p><small>Paskutinis veiksmas: {new Intl.DateTimeFormat('lt-LT', { dateStyle: 'short', timeStyle: 'short' }).format(item.lastAt)}</small><Button variant="secondary" disabled={busy} onClick={async () => { try { await api('/api/sessions/revoke', 'POST', { id: item.id }); if (item.current) logout(); else await load(); } catch (error) { notify((error as Error).message, true); } }}>Užbaigti</Button></article>)}</div></Panel></div></>;
}
