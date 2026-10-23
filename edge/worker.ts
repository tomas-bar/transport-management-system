import { DemoApi } from '../src/services/demo/api.ts';
import { createDemoState, demoPassword, type DemoState, type DemoStorage } from '../src/services/demo/model.ts';
import { ApiError } from '../src/services/api-error.ts';

interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface EdgeDatabase { prepare(sql: string): Statement; withSession?(constraint: string): EdgeDatabase }
interface Bucket {
  put(key: string, value: ArrayBuffer | Blob, options?: unknown): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  delete(key: string | string[]): Promise<void>;
}
export interface Env {
  DB: EdgeDatabase; BUCKET: Bucket; ASSETS: { fetch(request: Request): Promise<Response> };
  KRYPTA_INITIAL_PASSWORD: string; KRYPTA_SETUP_TOKEN: string; KRYPTA_SETUP_EXPIRES: string;
}
type SharedState = DemoState & { claimed?: boolean };
interface WebSession { token_hash: string; core_id: string; csrf: string; created_at: number; last_at: number }
const cookieName = '__Host-krypta';
const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
export async function digest(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}
function requireThat(condition: unknown, status: number, message: string): asserts condition { if (!condition) throw new ApiError(status, message); }
async function sameSecret(a: string, b: string) {
  const x = await digest(a), y = await digest(b); let difference = 0;
  for (let i = 0; i < x.length; i++) difference |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return difference === 0;
}
function cookie(token: string) { return `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${token ? 28800 : 0}`; }

export class SharedStorage implements DemoStorage {
  db: EdgeDatabase; bucket: Bucket; initialPassword: string;
  constructor(db: EdgeDatabase, bucket: Bucket, initialPassword: string) { this.db = db; this.bucket = bucket; this.initialPassword = initialPassword; }
  async read(): Promise<SharedState> {
    let row = await this.db.prepare('SELECT data FROM shared_workspace WHERE id=?').bind('main').first<{ data: string }>();
    if (!row) {
      requireThat(this.initialPassword?.length >= 24, 503, 'Paskyros paruošimas dar nesukonfigūruotas.');
      const state: SharedState = await createDemoState();
      const password = await demoPassword(this.initialPassword);
      for (const account of state.accounts) account.password = password;
      state.claimed = false;
      await this.db.prepare('INSERT OR IGNORE INTO shared_workspace(id,generation,data) VALUES(?,?,?)').bind('main', state.generation, JSON.stringify(state)).run();
      row = await this.db.prepare('SELECT data FROM shared_workspace WHERE id=?').bind('main').first<{ data: string }>();
    }
    requireThat(row, 503, 'Nepavyko atidaryti bendros saugyklos.');
    const state = JSON.parse(row.data) as SharedState;
    requireThat(state.version === 1, 503, 'Saugyklos versija nepalaikoma. Duomenys nepakeisti.');
    return state;
  }
  async save(state: SharedState, generation: number, photo?: { id: string; blob: Blob | null }) {
    const before = await this.read();
    requireThat(before.generation === generation, 409, 'Duomenys pakeisti kitame įrenginyje. Atnaujinkite puslapį.');
    state.sessions = state.sessions.filter(s => Date.now() - s.createdAt < 8 * 3600000);
    state.backups = state.backups.filter((b, index, rows) => rows.filter((other, i) => i > index && other.companyId === b.companyId).length < 10);
    const data = JSON.stringify(state);
    requireThat(new TextEncoder().encode(data).length <= 1800000, 413, 'Bandomoji saugykla užpildyta. Eksportuokite kopiją ir pašalinkite nereikalingus įrašus.');
    if (photo?.blob) await this.bucket.put('photos/' + photo.id, await photo.blob.arrayBuffer(), { httpMetadata: { contentType: 'image/jpeg' } });
    try {
      const result = await this.db.prepare('UPDATE shared_workspace SET generation=?,data=? WHERE id=? AND generation=?').bind(state.generation, data, 'main', generation).run();
      requireThat(result.meta.changes === 1, 409, 'Duomenys pakeisti kitame įrenginyje. Atnaujinkite puslapį.');
    } catch (error) { if (photo?.blob) await this.bucket.delete('photos/' + photo.id); throw error; }
    const removed = before.photos.filter(p => !state.photos.some(next => next.id === p.id)).map(p => 'photos/' + p.id);
    if (removed.length) await this.bucket.delete(removed);
  }
  async photo(id: string) {
    const object = await this.bucket.get('photos/' + id);
    return object ? new Blob([await object.arrayBuffer()], { type: 'image/jpeg' }) : undefined;
  }
}

// JPEG-only storage. The client decodes and re-encodes camera/PNG/WebP inputs.
// The server independently checks structure and dimensions and strips metadata.
export async function privateJpeg(file: Blob): Promise<Blob> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  requireThat(file.type === 'image/jpeg' && bytes.length <= 8 * 1024 * 1024 && bytes[0] === 255 && bytes[1] === 216, 415, 'Nepalaikomas nuotraukos formatas.');
  const chunks: Uint8Array[] = [bytes.slice(0, 2)]; let offset = 2, dimensions = false, image = false;
  while (offset < bytes.length - 1) {
    requireThat(bytes[offset] === 255, 415, 'Netinkamas JPEG vaizdas.');
    const start = offset++; while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 0xDA) {
      requireThat(bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217, 415, 'Nepilna nuotrauka.');
      chunks.push(bytes.slice(start)); image = true; break;
    }
    requireThat(offset + 2 <= bytes.length, 415, 'Netinkama nuotrauka.');
    const length = bytes[offset] * 256 + bytes[offset + 1];
    requireThat(length >= 2 && offset + length <= bytes.length, 415, 'Netinkama nuotrauka.');
    if ([0xC0, 0xC1, 0xC2].includes(marker)) {
      requireThat(length >= 8, 415, 'Netinkama nuotrauka.');
      const height = bytes[offset + 3] * 256 + bytes[offset + 4], width = bytes[offset + 5] * 256 + bytes[offset + 6];
      requireThat(width > 0 && height > 0 && width <= 2400 && height <= 2400, 413, 'Nuotrauka per didelė.'); dimensions = true;
    }
    if (!(marker >= 0xE1 && marker <= 0xEF) && marker !== 0xFE) chunks.push(bytes.slice(start, offset + length));
    offset += length;
  }
  requireThat(dimensions && image, 415, 'Nepavyko perskaityti nuotraukos.');
  return new Blob(chunks, { type: 'image/jpeg' });
}
async function limit(db: EdgeDatabase, key: string, maximum: number) {
  const now = Date.now();
  await db.prepare('INSERT INTO login_limits(key,started_at,attempts) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN excluded.started_at-login_limits.started_at>900000 THEN 1 ELSE login_limits.attempts+1 END,started_at=CASE WHEN excluded.started_at-login_limits.started_at>900000 THEN excluded.started_at ELSE login_limits.started_at END').bind(key, now).run();
  const row = await db.prepare('SELECT attempts FROM login_limits WHERE key=?').bind(key).first<{ attempts: number }>();
  requireThat(row && row.attempts <= maximum, 429, 'Per daug bandymų. Bandykite po 15 minučių.');
}
async function readBody(request: Request, raw: boolean) {
  const maximum = raw ? 8 * 1024 * 1024 : 2 * 1024 * 1024;
  requireThat(Number(request.headers.get('Content-Length') ?? 0) <= maximum, 413, 'Duomenys per dideli.');
  if (!raw) requireThat(request.headers.get('Content-Type')?.split(';')[0] === 'application/json', 415, 'Reikalingas JSON formatas.');
  const reader = request.body?.getReader(), chunks: Uint8Array[] = []; let length = 0;
  if (reader) while (true) {
    const part = await reader.read(); if (part.done) break;
    length += part.value.length; if (length > maximum) { await reader.cancel(); throw new ApiError(413, 'Duomenys per dideli.'); } chunks.push(part.value);
  }
  const blob = new Blob(chunks, { type: raw ? request.headers.get('Content-Type') ?? '' : 'application/json' });
  if (raw) return blob;
  try { return JSON.parse(await blob.text()); } catch { throw new ApiError(400, 'Netinkami duomenys.'); }
}
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  const db = env.DB.withSession?.('first-primary') ?? env.DB;
  const storage = new SharedStorage(db, env.BUCKET, env.KRYPTA_INITIAL_PASSWORD);
  if (path === '/api/health' && method === 'GET') { await db.prepare('SELECT generation FROM shared_workspace WHERE id=?').bind('main').first(); return json({ ok: true, storage: 'shared' }); }
  const unsafe = !['GET', 'HEAD'].includes(method);
  if (unsafe) requireThat(request.headers.get('Origin') === url.origin && request.headers.get('Sec-Fetch-Site') !== 'cross-site', 403, 'Užklausa iš kitos svetainės neleidžiama.');
  const ip = request.headers.get('CF-Connecting-IP') ?? 'shared';
  const oldToken = request.headers.get('Cookie')?.split(';').map(p => p.trim()).find(p => p.startsWith(cookieName + '='))?.slice(cookieName.length + 1) ?? '';
  const tokenHash = oldToken ? await digest(oldToken) : '';
  let web = tokenHash ? await db.prepare('SELECT * FROM web_sessions WHERE token_hash=?').bind(tokenHash).first<WebSession>() : null;
  if (web && (Date.now() - web.created_at > 8 * 3600000 || Date.now() - web.last_at > 1800000)) web = null;
  const login = path === '/api/login' && method === 'POST', setup = path === '/api/setup' && method === 'POST';
  if (login || setup) await limit(db, 'ip:' + await digest(ip), 60);
  if (!login && !setup) {
    requireThat(web, 401, 'Prisijunkite iš naujo.');
    if (unsafe) requireThat(await sameSecret(request.headers.get('X-CSRF-Token') ?? '', web.csrf), 403, 'Atnaujinkite puslapį ir bandykite dar kartą.');
    await db.prepare('UPDATE web_sessions SET last_at=? WHERE token_hash=?').bind(Date.now(), tokenHash).run();
  }
  const input = unsafe ? await readBody(request, path === '/api/photos') : undefined;
  if (setup) {
    requireThat(typeof input.token === 'string' && env.KRYPTA_SETUP_TOKEN && await sameSecret(input.token, env.KRYPTA_SETUP_TOKEN) && Date.now() < Number(env.KRYPTA_SETUP_EXPIRES), 403, 'Paskyros paruošimo nuoroda negalioja.');
    const state = await storage.read(); requireThat(!state.claimed, 409, 'Paskyra jau paruošta. Prisijunkite savo slaptažodžiu.');
    requireThat(typeof input.password === 'string' && input.password.length >= 15 && input.password.length <= 1024, 400, 'Slaptažodis turi būti bent 15 simbolių.');
    requireThat(typeof input.email === 'string' && /^\S+@\S+\.\S+$/.test(input.email) && input.email.length <= 254 && typeof input.name === 'string' && input.name.trim() && input.name.length <= 100, 400, 'Patikrinkite paskyros duomenis.');
    const owner = state.accounts.find(a => !a.companyId)!;
    requireThat(!state.accounts.some(a => a.id !== owner.id && a.email === input.email.toLowerCase()), 409, 'Šis el. pašto adresas jau naudojamas.');
    owner.email = input.email.trim().toLowerCase(); owner.name = input.name.trim();
    const password = await demoPassword(input.password);
    for (const account of state.accounts) account.password = password;
    state.sessions = []; state.claimed = true; const previous = state.generation++;
    await storage.save(state, previous);
    await db.prepare('DELETE FROM web_sessions').run();
    return json({ ok: true });
  }
  if (login) {
    requireThat(typeof input.email === 'string' && input.email.length <= 254 && typeof input.password === 'string' && input.password.length <= 1024, 400, 'Patikrinkite prisijungimo duomenis.');
    await limit(db, 'account:' + await digest(input.email.trim().toLowerCase()), 10);
  }
  let coreId: string | null = web?.core_id ?? null;
  const engine = new DemoApi(storage, { get: () => coreId, set: id => { coreId = id; }, device: () => (request.headers.get('User-Agent') ?? 'Naršyklė').slice(0, 200) }, privateJpeg);
  const result = await engine.request(path + url.search, method, input);
  let newToken: string | undefined;
  if (login) {
    requireThat(coreId, 500, 'Nepavyko sukurti sesijos.');
    newToken = random(); const now = Date.now();
    web = { token_hash: await digest(newToken), core_id: coreId, csrf: random(), created_at: now, last_at: now };
    await db.prepare('INSERT INTO web_sessions(token_hash,core_id,csrf,created_at,last_at) VALUES(?,?,?,?,?)').bind(web.token_hash, web.core_id, web.csrf, now, now).run();
    if (tokenHash) await db.prepare('DELETE FROM web_sessions WHERE token_hash=?').bind(tokenHash).run();
    await db.prepare('DELETE FROM web_sessions WHERE created_at<? OR last_at<?').bind(now - 8 * 3600000, now - 1800000).run();
    await db.prepare('DELETE FROM login_limits WHERE started_at<?').bind(now - 86400000).run();
  }
  if (result && !(result instanceof Blob) && result.user && result.session) result.csrf = web?.csrf ?? '';
  if (unsafe) await db.prepare('INSERT INTO edge_audit(id,actor_id,action,created_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(), web?.core_id ?? null, path + (input?.command?.type ? ':' + input.command.type : ''), new Date().toISOString()).run();
  const response = result instanceof Blob ? new Response(result, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline; filename="photo.jpg"' } }) : json(result);
  if (login) response.headers.set('Set-Cookie', cookie(newToken!));
  if (path === '/api/logout' || path === '/api/password') { if (tokenHash) await db.prepare('DELETE FROM web_sessions WHERE token_hash=?').bind(tokenHash).run(); response.headers.set('Set-Cookie', cookie('')); }
  return response;
}

export default {
  async fetch(request: Request, env: Env) {
    let response: Response;
    try {
      const path = new URL(request.url).pathname;
      if (path.startsWith('/api/')) response = await handleApi(request, env);
      else { requireThat(['GET', 'HEAD'].includes(request.method), 405, 'Veiksmas nepalaikomas.'); response = await env.ASSETS.fetch(request); }
    } catch (error) {
      response = json({ error: error instanceof ApiError ? error.message : 'Nepavyko atlikti veiksmo. Pabandykite atnaujinti puslapį.' }, error instanceof ApiError ? error.status : 500);
      // Log only the error type; never request bodies, passwords, cookies or tokens.
      if (!(error instanceof ApiError)) console.error('Krypta runtime error', error instanceof Error ? error.message.slice(0, 180) : 'unknown');
    }
    response = new Response(response.body, response);
    response.headers.set('X-Content-Type-Options', 'nosniff'); response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    response.headers.set('Strict-Transport-Security', 'max-age=31536000');
    response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https:; connect-src 'self' https:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'");
    if (new URL(request.url).pathname.startsWith('/api/')) response.headers.set('Cache-Control', 'private, no-store');
    return response;
  },
};
