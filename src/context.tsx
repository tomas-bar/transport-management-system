import { applyWorkspaceCommand, type WorkspaceCommand } from './domain/commands';
import { Toast } from './components/Feedback';
import { ServerProvider } from './server-provider';
import { serverRuntime, demoRuntime } from './services/server-api';
import type { ModuleId } from './domain/modules';
import {useAppearance,type Theme} from './services/appearance';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import type { Database } from './domain/models';
import { applyDriverCommand, createWorkspace, managerRole, notificationChanges, type DriverCommand, type ReviewSnapshot, type Workspace, type WorkspaceUser } from './domain/workspace';
import { routeVisits } from './domain/route-plan';
import { driverCommandMessage } from './domain/terminology';
import { markNotificationsRead } from './domain/notifications';
import {applyFinanceCommand,type FinanceCommand} from './domain/trip-finance';
import { reviewRepository } from './services/review-repository';
import { Button } from './components/ui';
import { readOnlySession, type PreviewOptions, type WorkspaceSession as Session } from './domain/access';
export interface Context {
  serverMode: boolean; modules: ModuleId[]; refresh: () => Promise<void>;
  theme:Theme;toggleTheme:()=>void;
  db: Database;
  workspace: Workspace;
  user: WorkspaceUser | null;
  session: Session | null;
  commit: (mutate: (db: Database) => void, message?: string) => Promise<boolean>;
  busy: boolean;
  notify: (message: string, error?: boolean) => void;
  navigate: (path: string) => void;
  path: string;
  login: (username: string, password: string) => boolean | Promise<boolean>;
  quickLogin: (id: string) => void;
  logout: () => void;
  previewUser: (id: string, options?: PreviewOptions) => void;
  returnToAdmin: () => void;
  saveUser: (user: WorkspaceUser, password?: string) => Promise<boolean>;
  readNotifications: (id?: string | string[]) => Promise<boolean>;
  financeCommand:(command:FinanceCommand)=>Promise<boolean>;
  setPrintMode: (mode: 'monochrome'|'color')=>Promise<boolean>;
  setInApp: (enabled: boolean) => Promise<boolean>;
  operationalCommand: (command: Extract<WorkspaceCommand, {type: 'reviewTrip' | 'repeatTrip'}>) => Promise<boolean>;
  driverCommand: (command: DriverCommand) => Promise<boolean>;
  replaceData: (data: Database, workspace?: Workspace) => Promise<boolean>;
}
export const AppContext = createContext<Context | null>(null);
export const useApp = () => {
  const value = useContext(AppContext);
  if (!value) throw new Error('Missing application context');
  return value;
};
function LocalProvider({
  children
}: {
  children: ReactNode;
}) {
  const appearance=useAppearance();
  const [snapshot, setSnapshot] = useState<ReviewSnapshot | null>(null);
  const current = useRef<ReviewSnapshot | null>(null);
  const [session, setSession] = useState<Session | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('krypta-review-session') || 'null');
    } catch {
      return null;
    }
  });
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const [path, setPath] = useState(location.hash.slice(1) || 'overview');
  useEffect(() => {
    reviewRepository.load().then(s => {
      current.current = s;
      setSnapshot(s);
    }).catch(e => setError(String(e)));
    const update = () => setPath(location.hash.slice(1) || 'overview');
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  useEffect(() => {
    if (!toast || toast.error) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  const notify = (message: string, error = false) => setToast({
    message,
    error
  });
  const navigate = (next: string) => {
    location.hash = next;
    window.scrollTo(0, 0);
  };
  const actor = () => current.current?.workspace.users.find(u => u.id === sessionRef.current?.userId && u.active) ?? null;
  const storeSession = (next: Session | null) => {
    sessionRef.current = next;
    setSession(next);
    try {
      if (next) sessionStorage.setItem('krypta-review-session', JSON.stringify(next));else sessionStorage.removeItem('krypta-review-session');
    } catch {}
    setToast(null);
  };
  async function update(mutate: (s: ReviewSnapshot, user: WorkspaceUser) => void, message?: string, emitEvents = true) {
    if (lock.current || !current.current) return false;
    const user = actor();
    if (readOnlySession(sessionRef.current)) {
      notify('Peržiūros režimu pakeitimai neleidžiami. Pasirinkite „Dirbti kaip naudotojas“.', true);
      return false;
    }
    if (!user) {
      notify('Prisijunkite iš naujo.', true);
      return false;
    }
    lock.current = true;
    setBusy(true);
    try {
      const next = structuredClone(current.current);
      mutate(next, user);
      if (emitEvents) next.workspace.notifications.push(...notificationChanges(current.current.db, next.db, next.workspace, user.id));
      await reviewRepository.save(next);
      current.current = next;
      setSnapshot(next);
      if (message) notify(message);
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Nepavyko išsaugoti.', true);
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const commit = (mutate: (db: Database) => void, message = 'Pakeitimai išsaugoti') => update((next, user) => {
    if (!managerRole(user)) throw new Error('Šis veiksmas neleidžiamas.');
    const settings = JSON.stringify(next.db.settings);
    mutate(next.db);
    if (user.role !== 'admin' && settings !== JSON.stringify(next.db.settings)) throw new Error('Nustatymus gali keisti administratorius.');
    for (const c of current.current!.workspace.confirmations) {
      const old = current.current!.db.orders.find(o => o.id === c.orderId);
      const changed = next.db.orders.find(o => o.id === c.orderId);
      if (old && (!changed || old.tripId !== changed.tripId || JSON.stringify(old.pickup) !== JSON.stringify(changed.pickup) || JSON.stringify(old.delivery) !== JSON.stringify(changed.delivery))) throw new Error('Užsakymas jau paimtas. Jo reiso ir adresų pakeisti negalima.');
    }
    // Keep driver links valid when operational registries are cleared.
    next.workspace.confirmations = next.workspace.confirmations.filter(c => next.db.trips.some(t => t.id === c.tripId) && next.db.orders.some(o => o.id === c.orderId));
    for (const u of next.workspace.users) if (u.role === 'driver' && !next.db.drivers.some(d => d.id === u.driverId)) u.active = false;
  }, message);
  const quickLogin = (id: string) => {
    const u = current.current?.workspace.users.find(u => u.id === id && u.active);
    if (!u) return;
    storeSession({
      userId: u.id
    });
    navigate(u.role === 'driver' ? 'my-trips' : 'overview');
  };
  const login = (username: string, password: string) => {
    if (username.trim() === 'admin' && password === 'admin' && current.current?.workspace.users.some(u => u.id === 'admin' && u.active)) {
      quickLogin('admin');
      return true;
    }
    return false;
  };
  const previewUser = (id: string, options: PreviewOptions = {}) => {
    const user = actor();
    if (user?.role !== 'admin') return;
    const next = current.current?.workspace.users.find(u => u.id === id && u.active);
    if (!next) return;
    storeSession({
      userId: id,
      returnTo: user.id, mode: options.mode ?? 'read', returnRole: 'admin', actorName: user.name
    });
    navigate(next.role === 'driver' ? 'my-trips' : 'overview');
  };
  const returnToAdmin = () => {
    const target = current.current?.workspace.users.find(u => u.id === sessionRef.current?.returnTo && u.active && u.role === 'admin');
    if (target) {
      storeSession({
        userId: target.id
      });
      navigate('users');
    } else storeSession(null);
  };
  const saveUser = (record: WorkspaceUser) => update((next, user) => {
    if (user.role !== 'admin') throw new Error('Naudotojus gali keisti administratorius.');
    if ((record.id === user.id || record.id === 'admin') && (!record.active || record.role !== 'admin')) throw new Error('Savo administratoriaus prieigos pakeisti negalima.');
    const i = next.workspace.users.findIndex(u => u.id === record.id);
    const clean = {
      ...record,
      name: record.name.trim(),
      email: record.email.trim(),
      companyId: next.workspace.companyId,
      driverId: record.role === 'driver' ? record.driverId : ''
    };
    if (i < 0) next.workspace.users.push(clean);else next.workspace.users[i] = clean;
  }, 'Naudotojas išsaugotas');
  const financeCommand=(command:FinanceCommand)=>update((next,user)=>applyFinanceCommand(next,user,command),command.type==='expense'?'Išlaidos įregistruotos':command.type==='voidReceipt'?'Mokėjimas atšauktas':'Mokėjimas įregistruotas');
  const readNotifications = (id?: string|string[]) => update((next, user) => {markNotificationsRead(next.workspace,user.id,typeof id==='string'?[id]:id);});
  const setPrintMode=(mode:'monochrome'|'color')=>update((next,user)=>{if(user.role!=='admin')throw new Error('Nustatymus gali keisti administratorius.');next.workspace.printMode=mode;},'Spausdinimo nuostata išsaugota');
  const setInApp = (enabled: boolean) => update((next, user) => {
    next.workspace.preferences[user.id] = {
      inApp: enabled
    };
  }, 'Pranešimų nuostata išsaugota');
  const driverCommand = (command: DriverCommand) => update((next, user) => {
    applyDriverCommand(next, user, command);
    if (command.type !== 'start' && command.type !== 'finish' && !(command.type==='task'&&command.kind==='delivery')) {
      const trip=next.db.trips.find(t=>t.id===command.tripId)!;
      const correction=command.type==='undoTask'||command.type==='undoArrival';
      const activity=correction?'correction':command.type==='arrive'?'arrival':'pickup';
      const detail=command.type==='arrive'?routeVisits(trip.stops)[command.visitIndex]?.place.name:command.type==='task'?next.db.orders.find(o=>o.id===command.orderId)?.name:'';
      for(const recipient of next.workspace.users.filter(u=>u.active&&u.role!=='driver'&&next.workspace.preferences[u.id]?.inApp!==false))next.workspace.notifications.push({id:crypto.randomUUID(),recipientId:recipient.id,type:'task',activity,title:correction?'Patvirtinimas atšauktas':command.type==='arrive'?'Atvykta į sustojimą':'Paėmimas patvirtintas',body:detail??'',actorId:user.id,entity:{type:'trip',id:trip.id},createdAt:new Date().toISOString()});
    }
  }, driverCommandMessage(command));
  const replaceData = (data: Database, workspace?: Workspace) => update((next, user) => {
    if (user.role !== 'admin') throw new Error('Duomenis gali atkurti administratorius.');
    next.db = structuredClone(data);
    next.workspace = workspace ? structuredClone(workspace) : {...createWorkspace(data),printMode:current.current!.workspace.printMode};
    if (!next.workspace.users.some(u => u.id === user.id && u.active && u.role === 'admin')) throw new Error('Kopijoje turi būti aktyvi jūsų administratoriaus paskyra.');
  }, 'Duomenys atkurti', false);
  if (error) return <div className="boot-error"><h1>Nepavyko atidaryti saugyklos</h1><p>{error}</p><Button onClick={() => location.reload()}>Bandyti dar kartą</Button></div>;
  if (!snapshot) return <div className="loading"><div className="brand-symbol">k</div><p>Ruošiama darbo erdvė...</p></div>;
  const user = snapshot.workspace.users.find(u => u.id === session?.userId && u.active) ?? null;
  return <AppContext.Provider value={{
    ...appearance,
    serverMode: false, modules: ['operations', 'finance'], refresh: async () => { location.reload(); },
    db: snapshot.db,
    workspace: snapshot.workspace,
    user,
    session,
    commit,
    busy,
    notify,
    navigate,
    path,
    login,
    quickLogin,
    logout: () => {
      storeSession(null);
      navigate('overview');
    },
    previewUser,
    returnToAdmin,
    saveUser,
    readNotifications,
    setInApp,
    setPrintMode,
    financeCommand,
    operationalCommand: command => update((next, user) => { Object.assign(next, applyWorkspaceCommand(next, user.id, command, ['operations', 'finance', 'photos', 'maintenance', 'freight'])); }, command.type === 'reviewTrip' ? 'Reiso suvestinė išsaugota' : 'Naujas reisas sukurtas', false),
    driverCommand,
    replaceData
  }}>{children}{toast && <Toast message={toast.message} error={toast.error} onClose={() => setToast(null)} />}</AppContext.Provider>;
}

export function Provider({children}: {children: ReactNode}) {
  return serverRuntime || demoRuntime ? <ServerProvider>{children}</ServerProvider> : <LocalProvider>{children}</LocalProvider>;
}
