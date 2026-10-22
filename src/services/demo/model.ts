import { createSeed } from '../../data/seed.ts';
import { createWorkspace, type ReviewSnapshot } from '../../domain/workspace.ts';
import { moduleCatalog, type ModuleId } from '../../domain/modules.ts';

export interface DemoPassword { salt: string; hash: string }
export interface DemoAccount {
  id: string; companyId: string | null; memberId: string; email: string; name: string;
  password: DemoPassword; alias?: string;
}
export interface DemoSession {
  id: string; accountId: string; createdAt: number; lastAt: number; device: string; previewId?: string;
}
export interface DemoCompany {
  id: string; name: string; modules: ModuleId[]; active: number; revision: number; snapshot: ReviewSnapshot;
}
export interface DemoPhoto {
  id: string; companyId: string; orderId: string; stage: string; actor_id: string; created_at: string; size: number;
}
export interface DemoState {
  version: 1; generation: number; companies: DemoCompany[]; accounts: DemoAccount[]; sessions: DemoSession[];
  photos: DemoPhoto[];
  reminders: { id: string; companyId: string; vehicle_id: string; title: string; due_date: string; done: number }[];
  opportunities: { id: string; companyId: string; title: string; url: string; notes: string; created_at: string }[];
  backups: { id: string; companyId: string; revision: number; created_at: string; snapshot: ReviewSnapshot }[];
}
export interface DemoStorage {
  read(): Promise<DemoState>;
  save(state: DemoState, generation: number, photo?: { id: string; blob: Blob | null }): Promise<void>;
  photo(id: string): Promise<Blob | undefined>;
}

// These credentials are for the explicitly selected, browser-only demo runtime.
// They are never imported by the production server or used for its authentication.
export async function demoPassword(value: string, salt: string = crypto.randomUUID()): Promise<DemoPassword> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(value), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 50000 }, key, 256);
  return { salt, hash: Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, '0')).join('') };
}
export async function matchesPassword(value: unknown, saved: DemoPassword) {
  return typeof value === 'string' && (await demoPassword(value, saved.salt)).hash === saved.hash;
}
export async function createDemoState(existing?: ReviewSnapshot): Promise<DemoState> {
  const db = existing?.db ?? createSeed();
  const snapshot = structuredClone(existing ?? { db, workspace: createWorkspace(db) });
  const id = snapshot.workspace.companyId;
  const password = await demoPassword('admin');
  const firstDriver = snapshot.workspace.users.find(user => user.role === 'driver' && user.active)?.id;
  const accounts: DemoAccount[] = snapshot.workspace.users.map(user => ({
    id: crypto.randomUUID(), companyId: id, memberId: user.id, email: user.email.toLowerCase(), name: user.name,
    password, ...(user.id === 'admin' ? { alias: 'admin' } : user.id === 'dispatcher' ? { alias: 'dispatcher' } : user.id === firstDriver ? { alias: 'driver' } : {}),
  }));
  accounts.unshift({ id: crypto.randomUUID(), companyId: null, memberId: '', email: 'owner@example.test', name: 'Platformos savininkas', password: await demoPassword('owner'), alias: 'owner' });
  return {
    version: 1, generation: 1, accounts, sessions: [], photos: [], reminders: [], opportunities: [], backups: [],
    companies: [{ id, name: db.settings.company, active: 1, modules: Object.keys(moduleCatalog) as ModuleId[], revision: 1, snapshot }],
  };
}
