import { Toast } from './components/Feedback';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { AppContext, type Context } from './context';
import { api, ApiError, demoRuntime, setCsrf, type ServerSession } from './services/server-api';
import { createEmptyDatabase, createSeed } from './data/seed';
import { createWorkspace, type ReviewSnapshot } from './domain/workspace';
import type { WorkspaceCommand } from './domain/commands';
import { useAppearance } from './services/appearance';
import { Button } from './components/ui';

function emptySnapshot(): ReviewSnapshot {
  const db = createEmptyDatabase(createSeed('2026-01-01').settings);
  return { db, workspace: { version: 1, companyId: '', users: [], notifications: [], confirmations: [], preferences: {} } };
}
export function ServerProvider({ children }: { children: ReactNode }) {
  const appearance = useAppearance();
  const [state, setState] = useState<ServerSession | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), lock = useRef(false);
  const current = useRef<ServerSession | null>(null);
  const empty = useRef(emptySnapshot());
  const [path, setPath] = useState(location.hash.slice(1) || 'overview');
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const notify = (text: string, error = false) => setToast({ text, error });
  const accept = (next: ServerSession | null) => { current.current = next; setState(next); setCsrf(next?.csrf ?? ''); };
  const navigate = (next: string) => { location.hash = next; window.scrollTo(0, 0); };
  const home = (role?: string) => role === 'owner' ? 'platform' : role === 'driver' ? 'my-trips' : 'overview';
  async function refresh() {
    try { accept(await api<ServerSession>('/api/session')); setError(''); }
    catch (e) { if (e instanceof ApiError && e.status === 401) accept(null); else throw e; }
  }
  useEffect(() => {
    refresh().catch(e => setError(String(e.message))).finally(() => setLoading(false));
    const changed = () => setPath(location.hash.slice(1) || 'overview');
    const ended = () => { accept(null); navigate('overview'); };
    window.addEventListener('hashchange', changed); window.addEventListener('krypta-session-ended', ended);
    return () => { window.removeEventListener('hashchange', changed); window.removeEventListener('krypta-session-ended', ended); };
  }, []);
  useEffect(() => { if (!toast || toast.error) return; const id = setTimeout(() => setToast(null), 6500); return () => clearTimeout(id); }, [toast]);
  async function run(action: () => Promise<void>, message?: string) {
    if (lock.current) return false;
    lock.current = true; setBusy(true);
    try { await action(); if (message) notify(message); return true; }
    catch (e) { notify(e instanceof Error ? e.message : 'Nepavyko išsaugoti.', true); return false; }
    finally { lock.current = false; setBusy(false); }
  }
  const send = (command: WorkspaceCommand, message?: string, password?: string) => run(async () => {
    const response = await api<ServerSession>('/api/commands', 'POST', { command, revision: current.current?.revision, password });
    accept(response);
  }, message);
  const snapshot = state?.snapshot ?? empty.current;
  const value: Context = {
    ...appearance, serverMode: true, modules: state?.modules ?? [], db: snapshot.db, workspace: snapshot.workspace, user: state?.user ?? null, session: state?.session ?? null, busy, path, notify, navigate,
    refresh: async () => { await run(refresh, 'Duomenys atnaujinti'); },
    login: async (email, password) => {
      let result = false;
      await run(async () => { const session = await api<ServerSession>('/api/login', 'POST', { email, password }); accept(session); navigate(home(session.user.role)); result = true; });
      return result;
    },
    quickLogin: () => {},
    logout: () => { void run(async () => { try { await api('/api/logout', 'POST', {}); } catch (e) { if (!(e instanceof ApiError && e.status === 401)) throw e; } accept(null); navigate('overview'); }); },
    previewUser: (id, options = {}) => { void run(async () => { const session = await api<ServerSession>('/api/preview', 'POST', { id, ...options }); accept(session); navigate(home(session.user.role)); }); },
    returnToAdmin: () => { void run(async () => { const session = await api<ServerSession>('/api/preview', 'POST', { id: null }); accept(session); navigate(session.user.role === 'owner' ? 'platform' : 'users'); }); },
    commit: (mutate, message = 'Pakeitimai išsaugoti') => {
      const data = structuredClone(current.current!.snapshot!.db);
      try { mutate(data); } catch (e) { notify(String((e as Error).message), true); return Promise.resolve(false); }
      return send({ type: 'commit', db: data }, message);
    },
    saveUser: (user, password) => send({ type: 'user', user }, 'Naudotojas išsaugotas', password),
    driverCommand: command => send({ type: 'driver', command }, 'Veiksmas patvirtintas'),
    financeCommand: command => send({ type: 'finance', command }, 'Mokėjimų ir išlaidų duomenys atnaujinti'),
    readNotifications: ids => send({ type: 'read', ids: typeof ids === 'string' ? [ids] : ids }),
    setInApp: enabled => send({ type: 'preference', enabled }, 'Pranešimų nuostata išsaugota'),
    setPrintMode: mode => send({ type: 'print', mode }, 'Spausdinimo nuostata išsaugota'),
    replaceData: (db, workspace) => send({ type: 'restore', snapshot: { db, workspace: workspace ?? createWorkspace(db) } }, 'Duomenys atkurti'),
  };
  if (loading) return <div className="loading"><p>Ruošiama darbo erdvė...</p></div>;
  if (error) return <div className="boot-error"><h1>{demoRuntime ? 'Nepavyko atidaryti saugyklos' : 'Nepavyko prisijungti prie serverio'}</h1><p>{error}</p><Button onClick={() => location.reload()}>Bandyti dar kartą</Button></div>;
  return <AppContext.Provider value={value}>{children}{toast && <Toast message={toast.text} error={toast.error} onClose={() => setToast(null)} />}</AppContext.Provider>;
}
