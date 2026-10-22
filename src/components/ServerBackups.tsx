import { useState } from 'react';
import { useApp } from '../context';
import { api } from '../services/server-api';
import { download } from '../services/export';
import { Button, Panel } from './ui';
export function ServerBackups() {
  const { serverMode, notify } = useApp();
  const [rows, setRows] = useState<{ id: string; revision: number; created_at: string }[] | null>(null);
  if (!serverMode) return null;
  return <Panel title="Ankstesnės duomenų kopijos"><div className="settings-form"><Button variant="secondary" onClick={async () => { try { setRows(await api('/api/backups')); } catch (e) { notify((e as Error).message, true); } }}>Rodyti kopijas</Button>{rows?.map(row => <div key={row.id}><p>{new Intl.DateTimeFormat('lt-LT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.created_at))} · {row.revision}</p><Button variant="secondary" onClick={async () => { try { download(JSON.stringify(await api('/api/backups/' + row.id)), 'krypta-kopija-' + row.id + '.json'); } catch (e) { notify((e as Error).message, true); } }}>Atsisiųsti</Button></div>)}{rows?.length === 0 && <p className="muted">Išsaugotų ankstesnių kopijų nėra.</p>}</div></Panel>;
}
