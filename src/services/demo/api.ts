import { validateOpportunity, freightDetails } from '../../domain/freight.ts';
import { createEmptyDatabase, createSeed } from '../../data/seed.ts';
import { applyWorkspaceCommand, type WorkspaceCommand } from '../../domain/commands.ts';
import { validateModules, type ModuleId } from '../../domain/modules.ts';
import { projectSnapshot } from '../../domain/projection.ts';
import { createWorkspace, type WorkspaceUser } from '../../domain/workspace.ts';
import { ApiError } from '../api-error.ts';
import type { ServerSession } from '../server-api.ts';
import { demoPassword, matchesPassword, type DemoStorage, type DemoState, type DemoSession, type DemoAccount, type DemoCompany } from './model.ts';

function requireThat(condition: unknown, status: number, message: string): asserts condition {
  if (!condition) throw new ApiError(status, message);
}
function text(value: unknown, maximum = 160): string {
  requireThat(typeof value === 'string' && value.trim() && value.length <= maximum, 400, 'Patikrinkite įvestus duomenis.');
  return value.trim();
}
function emailAddress(value: unknown) {
  const email = text(value, 254).toLowerCase();
  requireThat(/^\S+@\S+\.\S+$/.test(email), 400, 'Patikrinkite el. pašto adresą.');
  return email;
}
function newPassword(value: unknown) {
  requireThat(typeof value === 'string' && value.length >= 15 && value.length <= 1024, 400, 'Slaptažodis turi būti bent 15 simbolių.');
  return demoPassword(value);
}
interface Identity { account: DemoAccount; session: DemoSession; user: WorkspaceUser; company?: DemoCompany }

// This adapter exercises the existing application flows with device-local data.
// It deliberately does not replace or emulate the security of the Node server.
export class DemoApi {
  private pending: Promise<unknown> = Promise.resolve();
  private store: DemoStorage;
  private session: { get(): string | null; set(id: string | null): void; device(): string };
  private image: (file: Blob) => Promise<Blob>;
  constructor(
    store: DemoStorage,
    session: { get(): string | null; set(id: string | null): void; device(): string },
    image: (file: Blob) => Promise<Blob>,
  ) { this.store = store; this.session = session; this.image = image; }
  request<T = any>(path: string, method = 'GET', input?: any): Promise<T> {
    const result = this.pending.then(() => this.route(path, method, input));
    this.pending = result.catch(() => {});
    return result as Promise<T>;
  }
  private identity(state: DemoState): Identity {
    const session = state.sessions.find(s => s.id === this.session.get());
    requireThat(session, 401, 'Prisijunkite iš naujo.');
    const account = state.accounts.find(a => a.id === session.accountId);
    requireThat(account, 401, 'Prisijunkite iš naujo.');
    if (!account.companyId && !session.previewId) {
      return { account, session, user: { id: account.id, companyId: '', name: account.name, email: account.email, role: 'owner', active: true, driverId: '' } };
    }
    if (account.companyId) {
      const original = state.companies.find(c => c.id === account.companyId);
      const actual = original?.snapshot.workspace.users.find(u => u.id === account.memberId && u.active);
      requireThat(original?.active && actual, 401, 'Prisijunkite iš naujo.');
      requireThat(!session.previewId || actual.role === 'admin' && (!session.previewCompanyId || session.previewCompanyId === account.companyId), 403, 'Naudotojo peržiūra neleidžiama.');
    }
    const company = state.companies.find(c => c.id === (session.previewId ? session.previewCompanyId ?? account.companyId : account.companyId));
    requireThat(company?.active, 403, 'Įmonės prieiga išjungta.');
    const user = company.snapshot.workspace.users.find(u => u.id === (session.previewId ?? account.memberId) && u.active);
    requireThat(user, 401, 'Prisijunkite iš naujo.');
    return { account, session, company, user };
  }
  private payload(state: DemoState): ServerSession {
    const { user, session, account, company } = this.identity(state);
    return {
      user: structuredClone(user), csrf: '', modules: company?.modules ?? [],
      session: { userId: user.id, ...(session.previewId ? { returnTo: account.memberId || account.id, returnRole: account.companyId ? 'admin' as const : 'owner' as const, actorName: account.name, mode: session.previewMode ?? 'read' } : {}) },
      revision: company?.revision, snapshot: company ? projectSnapshot(structuredClone(company.snapshot), user) : null,
    };
  }
  private async route(path: string, method: string, input: any) {
    const state = await this.store.read(), generation = state.generation;
    const url = new URL(path, 'https://krypta.invalid'), endpoint = url.pathname;
    const save = async (photo?: { id: string; blob: Blob | null }) => {
      state.generation = generation + 1;
      await this.store.save(state, generation, photo);
    };
    if (endpoint === '/api/login' && method === 'POST') {
      const login = text(input?.email, 254).toLowerCase();
      const account = state.accounts.find(a => a.email === login || a.alias === login);
      requireThat(account && await matchesPassword(input?.password, account.password), 401, 'Neteisingas prisijungimo vardas arba slaptažodis.');
      const session: DemoSession = { id: crypto.randomUUID(), accountId: account.id, createdAt: Date.now(), lastAt: Date.now(), device: this.session.device() };
      const previous = this.session.get();
      state.sessions = state.sessions.filter(s => s.id !== previous);
      state.sessions.push(session);
      // Validate access before persisting a session for a disabled membership.
      const old = this.session.get();
      this.session.set(session.id);
      try { const result = this.payload(state); await save(); return result; }
      catch (error) { this.session.set(old); throw error; }
    }
    let access: Identity;
    try { access = this.identity(state); }
    catch (error) {
      const expired = state.sessions.find(s => s.id === this.session.get());
      if (!expired?.previewId || !(method === 'GET' || ['/api/preview', '/api/logout'].includes(endpoint))) throw error;
      expired.previewId = undefined;
      expired.previewCompanyId = undefined;
      expired.previewMode = 'read';
      access = this.identity(state);
      if (method === 'GET') await save();
    }
    const { account, session, company, user } = access;
    const unsafe = method !== 'GET';
    if (unsafe && session.previewId && !['/api/preview', '/api/logout'].includes(endpoint)) {
      requireThat(session.previewMode === 'act', 403, 'Peržiūros režimu pakeitimai neleidžiami. Pasirinkite „Dirbti kaip naudotojas“.');
      requireThat(['/api/commands', '/api/photos', '/api/reminders', '/api/opportunities'].some(p => endpoint === p || endpoint.startsWith(p + '/')), 403, 'Paskyros nustatymus keiskite grįžę į savo paskyrą.');
    }
    const moduleAccess = (id: ModuleId) => {
      requireThat(company?.modules.includes(id), 403, 'Šis modulis išjungtas.');
    };
    const companyAccess = () => { requireThat(company, 403, 'Pasirinkite įmonės paskyrą.'); return company; };
    const manager = () => { requireThat(['admin', 'dispatcher'].includes(user.role), 403, 'Prieiga nesuteikta.'); };
    const orderAccess = (id: string) => {
      const current = companyAccess();
      const order = current.snapshot.db.orders.find(o => o.id === id);
      requireThat(order && (user.role !== 'driver' || current.snapshot.db.trips.some(t => t.id === order.tripId && t.driverId === user.driverId)), 404, 'Užsakymas nerastas.');
      return order;
    };
    if (endpoint === '/api/session' && method === 'GET') return this.payload(state);
    if (endpoint === '/api/logout' && method === 'POST') {
      state.sessions = state.sessions.filter(s => s.id !== session.id); await save(); this.session.set(null); return { ok: true };
    }
    if (endpoint === '/api/preview' && method === 'POST') {
      const original = state.companies.find(c => c.id === account.companyId);
      const actual = original?.snapshot.workspace.users.find(u => u.id === account.memberId && u.active);
      requireThat(!account.companyId || actual?.role === 'admin', 403, 'Peržiūra neleidžiama.');
      const mode = input.mode ?? 'read';
      requireThat(['read', 'act'].includes(mode), 400, 'Pasirinkite peržiūros režimą.');
      if (input.id !== null) {
        const targetId = input.companyId ?? company?.id;
        requireThat(typeof targetId === 'string' && (!account.companyId || targetId === account.companyId), 403, 'Kitos įmonės peržiūra neleidžiama.');
        const target = state.companies.find(c => c.id === targetId && c.active);
        requireThat(target?.snapshot.workspace.users.some(u => u.id === input.id && u.active), 404, 'Naudotojas nerastas.');
        session.previewCompanyId = targetId;
      } else session.previewCompanyId = undefined;
      session.previewId = input.id ?? undefined;
      session.previewMode = mode;
      await save(); return this.payload(state);
    }
    if (endpoint === '/api/sessions' && method === 'GET') return state.sessions.filter(s => s.accountId === account.id).map(s => ({ id: s.id, createdAt: s.createdAt, lastAt: s.lastAt, device: s.device, current: s.id === session.id }));
    if (endpoint === '/api/sessions/revoke' && method === 'POST') {
      state.sessions = state.sessions.filter(s => s.accountId !== account.id || s.id !== input.id);
      await save(); if (input.id === session.id) this.session.set(null); return { ok: true };
    }
    if (endpoint === '/api/profile' && method === 'POST') {
      account.name = text(input.name, 100);
      if (company) { company.snapshot.workspace.users.find(u => u.id === account.memberId)!.name = account.name; company.revision++; }
      await save(); return { ok: true };
    }
    if (endpoint === '/api/password' && method === 'POST') {
      requireThat(await matchesPassword(input.current, account.password), 400, 'Dabartinis slaptažodis neteisingas.');
      account.password = await newPassword(input.password);
      state.sessions = state.sessions.filter(s => s.accountId !== account.id);
      await save(); this.session.set(null); return { ok: true };
    }
    if (endpoint === '/api/companies') {
      requireThat(user.role === 'owner', 403, 'Prieiga nesuteikta.');
      if (method === 'GET') return state.companies.map(({ id, name, modules, active }) => ({ id, name, modules, active }));
      if (method === 'POST') {
        const name = text(input.name), modules = validateModules(input.modules), email = emailAddress(input.email), adminName = text(input.adminName, 100);
        requireThat(!state.accounts.some(a => a.email === email), 409, 'Šis el. pašto adresas jau naudojamas.');
        const password = await newPassword(input.password), id = crypto.randomUUID();
        const db = createEmptyDatabase(createSeed('2026-01-01').settings); db.settings.company = name;
        const workspace = createWorkspace(db); workspace.companyId = id; workspace.notifications = [];
        workspace.users = [{ id: 'admin', companyId: id, name: adminName, email, role: 'admin', active: true, driverId: '' }];
        state.companies.push({ id, name, modules, active: 1, revision: 1, snapshot: { db, workspace } });
        state.accounts.push({ id: crypto.randomUUID(), companyId: id, memberId: 'admin', email, name: adminName, password });
        await save(); return { id };
      }
    }
    const companyUsers = /^\/api\/companies\/([^/]+)\/users$/.exec(endpoint);
    if (companyUsers && method === 'GET') {
      requireThat(user.role === 'owner' && !session.previewId, 403, 'Prieiga nesuteikta.');
      const target = state.companies.find(c => c.id === companyUsers[1]);
      requireThat(target, 404, 'Įmonė nerasta.');
      return target.snapshot.workspace.users.map(member => ({
        ...member,
        hasLogin: state.accounts.some(a => a.companyId === target.id && a.memberId === member.id),
        driverName: target.snapshot.db.drivers.filter(d => d.id === member.driverId).map(d => d.firstName + ' ' + d.lastName)[0] ?? '',
      }));
    }
    if (endpoint.startsWith('/api/companies/') && method === 'PUT') {
      requireThat(user.role === 'owner', 403, 'Prieiga nesuteikta.');
      const current = state.companies.find(c => c.id === endpoint.split('/')[3]);
      requireThat(current && typeof input.active === 'boolean', 400, 'Patikrinkite įmonės duomenis.');
      current.name = text(input.name); current.modules = validateModules(input.modules); current.active = Number(input.active);
      if (!current.active) state.sessions = state.sessions.filter(s => !state.accounts.some(a => a.id === s.accountId && a.companyId === current.id));
      await save(); return { ok: true };
    }
    if (endpoint === '/api/commands' && method === 'POST') {
      const current = companyAccess(), command = input.command as WorkspaceCommand;
      requireThat(input.revision === current.revision, 409, 'Duomenys pakeisti kitame lange. Atnaujinkite puslapį.');
      requireThat(command && typeof command.type === 'string', 400, 'Netinkamas veiksmas.');
      requireThat(!session.previewId || !['user', 'restore'].includes(command.type), 403, 'Naudotojus ir kopijas valdykite grįžę į savo paskyrą.');
      if (command.type === 'restore') requireThat(!state.photos.some(p => p.companyId === current.id), 409, 'Prieš atkurdami JSON kopiją pašalinkite užsakymų nuotraukas. JSON kopijoje jų nėra.');
      const next = applyWorkspaceCommand(current.snapshot, user.id, command, current.modules);
      if (command.type === 'user') {
        const record = command.user, email = emailAddress(record.email);
        const existing = state.accounts.find(a => a.companyId === current.id && a.memberId === record.id);
        requireThat(!state.accounts.some(a => a.email === email && a.id !== existing?.id), 409, 'Šis el. pašto adresas jau naudojamas.');
        requireThat(existing || input.password || !record.active, 400, 'Naujam naudotojui nustatykite slaptažodį.');
        const password = input.password ? await newPassword(input.password) : existing?.password;
        if (existing) {
          const previousRole = current.snapshot.workspace.users.find(u => u.id === record.id)?.role;
          if (input.password || !record.active || existing.email !== email || previousRole !== record.role) state.sessions = state.sessions.filter(s => s.accountId !== existing.id);
          Object.assign(existing, { email, name: record.name, password });
        } else if (password) state.accounts.push({ id: crypto.randomUUID(), companyId: current.id, memberId: record.id, email, name: record.name, password });
      }
      if (command.type === 'restore') state.backups.push({ id: crypto.randomUUID(), companyId: current.id, revision: current.revision, created_at: new Date().toISOString(), snapshot: structuredClone(current.snapshot) });
      current.snapshot = next; current.revision++;
      state.sessions = state.sessions.filter(s => {
        const identity = state.accounts.find(a => a.id === s.accountId);
        return identity?.companyId !== current.id || next.workspace.users.some(u => u.id === identity.memberId && u.active);
      });
      await save(); return this.payload(state);
    }
    if (endpoint.startsWith('/api/backups') && method === 'GET') {
      const current = companyAccess(); requireThat(user.role === 'admin', 403, 'Prieiga nesuteikta.');
      const rows = state.backups.filter(b => b.companyId === current.id);
      if (endpoint === '/api/backups') return rows.toReversed().map(({ id, revision, created_at }) => ({ id, revision, created_at }));
      const backup = rows.find(b => b.id === endpoint.split('/')[3]); requireThat(backup, 404, 'Kopija nerasta.'); return structuredClone(backup.snapshot);
    }
    if (endpoint === '/api/photos') {
      moduleAccess('photos'); const current = companyAccess(), orderId = text(url.searchParams.get('order'), 100); orderAccess(orderId);
      const rows = state.photos.filter(p => p.companyId === current.id && p.orderId === orderId);
      if (method === 'GET') return rows.toReversed().map(({ id, stage, actor_id, created_at }) => ({ id, stage, actor_id, created_at }));
      if (method === 'POST') {
        const stage = url.searchParams.get('stage') ?? '';
        requireThat(['pickup', 'delivery', 'other'].includes(stage), 400, 'Pasirinkite nuotraukos paskirtį.');
        requireThat(input instanceof Blob && input.size <= 8 * 1024 * 1024 && ['image/jpeg', 'image/png', 'image/webp'].includes(input.type), 415, 'Pasirinkite JPEG, PNG arba WebP vaizdą iki 8 MB.');
        requireThat(rows.length < 20, 400, 'Užsakymui galima pridėti iki 20 nuotraukų.');
        const blob = await this.image(input), id = crypto.randomUUID();
        requireThat(state.photos.filter(p => p.companyId === current.id).reduce((n, p) => n + p.size, 0) + blob.size <= 512 * 1024 * 1024, 413, 'Pasiekta nuotraukų saugyklos riba.');
        state.photos.push({ id, companyId: current.id, orderId, stage, actor_id: user.id, created_at: new Date().toISOString(), size: blob.size });
        await save({ id, blob }); return { id };
      }
    }
    if (endpoint.startsWith('/api/photos/')) {
      moduleAccess('photos'); const current = companyAccess();
      const row = state.photos.find(p => p.companyId === current.id && p.id === endpoint.split('/')[3]);
      requireThat(row, 404, 'Nuotrauka nerasta.'); orderAccess(row.orderId);
      if (method === 'GET') { const blob = await this.store.photo(row.id); requireThat(blob, 404, 'Nuotrauka nerasta.'); return blob; }
      if (method === 'DELETE') {
        requireThat(user.role !== 'driver' || row.actor_id === user.id, 403, 'Galite ištrinti tik savo nuotrauką.');
        state.photos = state.photos.filter(p => p.id !== row.id); await save({ id: row.id, blob: null }); return { ok: true };
      }
    }
    if (endpoint === '/api/reminders' || endpoint === '/api/opportunities') {
      const reminder = endpoint === '/api/reminders', current = companyAccess();
      moduleAccess(reminder ? 'maintenance' : 'freight'); manager();
      const rows = reminder ? state.reminders : state.opportunities;
      if (method === 'GET') {
        const rows = reminder ? state.reminders : state.opportunities.map(row => ({ ...row, revision: row.revision ?? 1, details: freightDetails(row.details) }));
        return rows.filter(row => row.companyId === current.id);
      }
      if (!reminder && method === 'PUT') {
        const row = state.opportunities.find(row => row.companyId === current.id && row.id === input.id);
        requireThat(row, 404, 'Galimybė nerasta.');
        requireThat(input.revision === (row.revision ?? 1), 409, 'Pasiūlymas pakeistas kitame lange. Atnaujinkite sąrašą.');
        const value = validateOpportunity(input, current.snapshot.db);
        requireThat(current.modules.includes('finance') || value.details.price === freightDetails(row.details).price, 403, 'Finansų modulis išjungtas.');
        Object.assign(row, value, { revision: (row.revision ?? 1) + 1 });
        await save(); return { ok: true };
      }
      if (method === 'POST') {
        const id = crypto.randomUUID(), title = text(input.title);
        if (reminder) {
          requireThat(current.snapshot.db.vehicles.some(v => v.id === input.vehicleId), 400, 'Automobilis nerastas.');
          requireThat(typeof input.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) && Number.isFinite(Date.parse(input.dueDate + 'T12:00:00Z')) && new Date(input.dueDate + 'T12:00:00Z').toISOString().slice(0, 10) === input.dueDate, 400, 'Patikrinkite datą.');
          state.reminders.push({ id, companyId: current.id, title, vehicle_id: input.vehicleId, due_date: input.dueDate, done: 0 });
        } else {
          const value = validateOpportunity(input, current.snapshot.db);
          requireThat(value.details.price === null || current.modules.includes('finance'), 403, 'Finansų modulis išjungtas.');
          state.opportunities.push({ id, companyId: current.id, revision: 1, ...value, created_at: new Date().toISOString() });
        }
        await save(); return { id };
      }
      if (method === 'PUT' && reminder) {
        const row = state.reminders.find(r => r.companyId === current.id && r.id === input.id);
        requireThat(row && typeof input.done === 'boolean', 404, 'Priminimas nerastas.'); row.done = Number(input.done);
        await save(); return { ok: true };
      }
      if (method === 'DELETE') {
        const id = url.searchParams.get('id');
        if (reminder) state.reminders = state.reminders.filter(r => r.companyId !== current.id || r.id !== id);
        else state.opportunities = state.opportunities.filter(r => r.companyId !== current.id || r.id !== id);
        await save(); return { ok: true };
      }
    }
    throw new ApiError(404, 'Užklausa nerasta.');
  }
}
