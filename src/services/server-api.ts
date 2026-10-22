import type { ModuleId } from '../domain/modules';
import type { ReviewSnapshot, WorkspaceUser } from '../domain/workspace';
export const serverRuntime = import.meta.env.VITE_RUNTIME === 'server';
export interface ServerSession {
  user: WorkspaceUser;
  session: { userId: string; returnTo?: string };
  csrf: string;
  modules: ModuleId[];
  revision?: number;
  snapshot: ReviewSnapshot | null;
}
let csrf = '';
export const setCsrf = (value: string) => { csrf = value; };
export class ApiError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
export async function api<T = any>(path: string, method = 'GET', input?: unknown, raw = false): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { ...(method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}), ...(input !== undefined ? { 'Content-Type': raw ? (input as File).type : 'application/json' } : {}) },
    body: input === undefined ? undefined : raw ? input as File : JSON.stringify(input),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && !path.endsWith('/login')) window.dispatchEvent(new Event('krypta-session-ended'));
    throw new ApiError(response.status, data.error ?? 'Nepavyko susisiekti su serveriu.');
  }
  return response.json();
}
