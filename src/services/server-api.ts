import type { ModuleId } from '../domain/modules';
import type { ReviewSnapshot, WorkspaceUser } from '../domain/workspace';
import type { WorkspaceSession } from '../domain/access';
import { apiRequestOptions } from './api-request';
export const serverRuntime = import.meta.env?.VITE_RUNTIME === 'server';
export const sitesRuntime = import.meta.env?.VITE_RUNTIME === 'sites';
export const demoRuntime = import.meta.env?.VITE_RUNTIME === 'demo';
import { ApiError } from './api-error';
export { ApiError } from './api-error';
export interface ServerSession {
  user: WorkspaceUser;
  session: WorkspaceSession;
  csrf: string;
  modules: ModuleId[];
  revision?: number;
  snapshot: ReviewSnapshot | null;
}
let csrf = '';
export const setCsrf = (value: string) => { csrf = value; };
export async function api<T = any>(path: string, method = 'GET', input?: unknown, raw = false): Promise<T> {
  if (demoRuntime) {
    const { demoApi } = await import('./demo/browser');
    return demoApi<T>(path, method, input);
  }
  if (sitesRuntime && raw && input instanceof Blob) {
    input = await (await import('./image')).normalizeImage(input);
  }
  const response = await fetch(path, apiRequestOptions(method, input, csrf, raw));
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && !path.endsWith('/login')) window.dispatchEvent(new Event('krypta-session-ended'));
    throw new ApiError(response.status, data.error ?? 'Nepavyko susisiekti su serveriu.');
  }
  return response.json();
}
