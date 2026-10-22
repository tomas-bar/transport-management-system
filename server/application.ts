import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { Store } from './store.ts';
import { digest, equalSecret, hashPassword, randomToken, verifyPassword } from './security.ts';
import { createEmptyDatabase, createSeed } from '../src/data/seed.ts';
import { createWorkspace, type WorkspaceUser, type ReviewSnapshot } from '../src/domain/workspace.ts';
import { applyWorkspaceCommand, type WorkspaceCommand } from '../src/domain/commands.ts';
import { validateModules, type ModuleId } from '../src/domain/modules.ts';
import { driverPermissions } from '../src/domain/trip-finance.ts';

interface Account { id: string; company_id: string | null; member_id: string | null; email: string; name: string; role: WorkspaceUser['role']; password_hash: string; active: number }
interface Session { token_hash: string; account_id: string; csrf: string; created_at: number; last_at: number; preview_id: string | null; user_agent: string }
interface Company { id: string; name: string; modules: string; active: number }
class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
function requireThat(condition: unknown, status: number, message: string): asserts condition { if (!condition) throw new HttpError(status, message); }
const emailAddress = (value: unknown) => {
  requireThat(typeof value === 'string' && value.length <= 254 && /^\S+@\S+\.\S+$/.test(value), 400, 'Patikrinkite el. pašto adresą.');
  return value.trim().toLowerCase();
};
const text = (value: unknown, max = 160) => {
  requireThat(typeof value === 'string' && value.trim() && value.length <= max, 400, 'Patikrinkite įvestus duomenis.');
  return value.trim();
};
const json = (res: ServerResponse, status: number, data: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
};
async function bytes(req: IncomingMessage, max: number) {
  requireThat(Number(req.headers['content-length'] ?? 0) <= max, 413, 'Failas arba duomenų rinkinys per didelis.');
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw new HttpError(413, 'Failas arba duomenų rinkinys per didelis.');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
async function body(req: IncomingMessage): Promise<any> {
  requireThat(req.headers['content-type']?.split(';')[0] === 'application/json', 415, 'Reikalingas JSON formatas.');
  try { return JSON.parse((await bytes(req, 15 * 1024 * 1024)).toString('utf8')); }
  catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(400, 'Netinkamas JSON formatas.'); }
}
export function projectSnapshot(snapshot: ReviewSnapshot, user: WorkspaceUser): ReviewSnapshot {
  if (user.role !== 'driver') return snapshot;
  const s = structuredClone(snapshot), own = driverPermissions(user);
  s.db.trips = s.db.trips.filter(t => t.driverId === user.driverId);
  const trips = new Set(s.db.trips.map(t => t.id));
  s.db.orders = s.db.orders.filter(o => trips.has(o.tripId));
  const orders = new Set(s.db.orders.map(o => o.id));
  s.db.routes = [];
  s.db.vehicles = s.db.vehicles.filter(v => s.db.trips.some(t => t.vehicleId === v.id));
  s.db.drivers = s.db.drivers.filter(d => d.id === user.driverId);
  s.db.customers = [];
  s.db.expenses = own.recordExpenses ? s.db.expenses.filter(e => s.workspace.expenseSubmissions?.some(r => r.expenseId === e.id && r.actorId === user.id)) : [];
  if (!own.collectPayments) s.db.orders = s.db.orders.map(o => ({ ...o, price: 0, paid: 0, priceSet: false }));
  s.workspace.users = [user];
  s.workspace.notifications = s.workspace.notifications.filter(n => n.recipientId === user.id);
  s.workspace.confirmations = s.workspace.confirmations.filter(c => trips.has(c.tripId) && orders.has(c.orderId));
  s.workspace.receipts = own.collectPayments ? s.workspace.receipts?.filter(r => r.actorId === user.id && orders.has(r.orderId)) : [];
  s.workspace.expenseSubmissions = s.workspace.expenseSubmissions?.filter(r => r.actorId === user.id && trips.has(r.tripId));
  s.workspace.corrections = s.workspace.corrections?.filter(c => trips.has(c.tripId));
  s.workspace.preferences = { [user.id]: s.workspace.preferences[user.id] ?? { inApp: true } };
  return s;
}

export function createApplication(options: { dbPath: string; distPath: string; origin: string; secureCookies?: boolean; now?: () => number }) {
  const origin = new URL(options.origin);
  requireThat(['http:', 'https:'].includes(origin.protocol) && origin.origin === options.origin && !origin.username, 500, 'Invalid public origin.');
  const secure = options.secureCookies ?? origin.protocol === 'https:';
  requireThat(secure || ['localhost', '127.0.0.1'].includes(origin.hostname), 500, 'HTTPS is required outside localhost.');
  const store = new Store(options.dbPath), db = store.db, now = options.now ?? Date.now;
  const cookieName = secure ? '__Host-krypta' : 'krypta-local';
  const cookie = (token: string, clear = false) => `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}${clear ? '; Max-Age=0' : ''}`;
  let dummy: Promise<string> | undefined;
  let imageJobs = 0;
  function company(id: string) {
    const row = db.prepare('SELECT * FROM companies WHERE id=?').get(id) as Company | undefined;
    requireThat(row?.active, 403, 'Įmonės prieiga išjungta.'); return row;
  }
  function identity(account: Account, session: Session): WorkspaceUser {
    requireThat(account.active, 401, 'Prisijunkite iš naujo.');
    if (account.role === 'owner') return { id: account.id, companyId: '', name: account.name, email: account.email, role: 'owner', active: true, driverId: '' };
    requireThat(account.company_id && account.member_id, 403, 'Prieiga nesuteikta.');
    company(account.company_id);
    const snapshot = store.snapshot(account.company_id).snapshot;
    const actual = snapshot.workspace.users.find(u => u.id === account.member_id && u.active);
    requireThat(actual && actual.role === account.role && actual.companyId === account.company_id, 403, 'Prieiga nesuteikta.');
    if (session.preview_id) {
      requireThat(actual.role === 'admin', 403, 'Peržiūra neleidžiama.');
      const preview = snapshot.workspace.users.find(u => u.id === session.preview_id && u.active);
      requireThat(preview, 403, 'Naudotojas nepasiekiamas.'); return preview;
    }
    return actual;
  }
  function authenticate(req: IncomingMessage) {
    const token = req.headers.cookie?.split(';').map(p => p.trim()).find(p => p.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    requireThat(token && /^[\w-]{43}$/.test(token), 401, 'Prisijunkite iš naujo.');
    const session = db.prepare('SELECT * FROM sessions WHERE token_hash=?').get(digest(token)) as Session | undefined;
    requireThat(session && now() - session.created_at < 8 * 60 * 60 * 1000 && now() - session.last_at < 30 * 60 * 1000, 401, 'Sesija baigėsi. Prisijunkite iš naujo.');
    const account = db.prepare('SELECT * FROM accounts WHERE id=?').get(session.account_id) as Account | undefined;
    requireThat(account?.active, 401, 'Prisijunkite iš naujo.');
    const user = identity(account, session);
    db.prepare('UPDATE sessions SET last_at=? WHERE token_hash=?').run(now(), session.token_hash);
    return { session, account, user };
  }
  function payload(account: Account, session: Session) {
    const user = identity(account, session);
    if (!account.company_id) return { user, csrf: session.csrf, session: { userId: user.id }, modules: [], snapshot: null };
    const row = store.snapshot(account.company_id);
    return { user, csrf: session.csrf, session: { userId: user.id, ...(session.preview_id ? { returnTo: account.member_id } : {}) }, modules: JSON.parse(company(account.company_id).modules), revision: row.revision, snapshot: projectSnapshot(row.snapshot, user) };
  }
  function moduleAccess(account: Account, user: WorkspaceUser, id: ModuleId) {
    requireThat(account.company_id && JSON.parse(company(account.company_id).modules).includes(id), 403, 'Šis modulis išjungtas.');
    requireThat(user.role !== 'owner', 403, 'Pasirinkite įmonės paskyrą.');
  }
  function orderAccess(account: Account, user: WorkspaceUser, orderId: string) {
    requireThat(account.company_id, 403, 'Prieiga nesuteikta.');
    const s = store.snapshot(account.company_id).snapshot;
    const order = s.db.orders.find(o => o.id === orderId);
    requireThat(order && (user.role !== 'driver' || s.db.trips.some(t => t.id === order.tripId && t.driverId === user.driverId)), 404, 'Užsakymas nerastas.');
  }
  function limit(key: string, maximum: number) {
    const row = db.prepare('SELECT * FROM login_limits WHERE key=?').get(key) as { started_at: number; attempts: number } | undefined;
    requireThat(!row || now() - row.started_at > 15 * 60 * 1000 || row.attempts < maximum, 429, 'Per daug bandymų. Bandykite po 15 minučių.');
    db.prepare('INSERT INTO login_limits VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN excluded.started_at-login_limits.started_at>900000 THEN 1 ELSE login_limits.attempts+1 END, started_at=CASE WHEN excluded.started_at-login_limits.started_at>900000 THEN excluded.started_at ELSE login_limits.started_at END').run(key, now());
  }
  async function route(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.tile.openstreetmap.org https://server.arcgisonline.com; connect-src 'self' https:; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'");
    if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    const url = new URL(req.url ?? '/', origin), path = url.pathname, method = req.method ?? 'GET';
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    if (path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    if (unsafe) requireThat(req.headers.origin === origin.origin && req.headers['sec-fetch-site'] !== 'cross-site', 403, 'Užklausa iš kitos svetainės neleidžiama.');
    if (path === '/api/health' && method === 'GET') return json(res, 200, { ok: true, schema: 1 });
    if (path === '/api/login' && method === 'POST') {
      const input = await body(req), email = emailAddress(input.email);
      db.prepare('DELETE FROM login_limits WHERE started_at<?').run(now() - 24 * 60 * 60 * 1000);
      limit('ip:' + digest(req.socket.remoteAddress ?? 'local'), 60); limit('account:' + digest(email), 10);
      const account = db.prepare('SELECT * FROM accounts WHERE email=?').get(email) as Account | undefined;
      dummy ??= hashPassword(randomToken());
      const valid = await verifyPassword(input.password, account?.password_hash ?? await dummy);
      const latest = account ? db.prepare('SELECT password_hash,active FROM accounts WHERE id=?').get(account.id) as {password_hash:string;active:number}|undefined : undefined;
      if (!valid || !account?.active || !latest?.active || latest.password_hash !== account.password_hash) { store.audit(null, null, 'login.failed'); throw new HttpError(401, 'Neteisingas el. paštas arba slaptažodis.'); }
      const token = randomToken(), session: Session = { token_hash: digest(token), account_id: account.id, csrf: randomToken(), created_at: now(), last_at: now(), preview_id: null, user_agent: String(req.headers['user-agent'] ?? '').slice(0, 200) };
      const response = payload(account, session);
      const previous = req.headers.cookie?.split(';').map(p => p.trim()).find(p => p.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
      store.transaction(() => {
        if (previous) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(previous));
        db.prepare('DELETE FROM sessions WHERE created_at<? OR last_at<?').run(now() - 8 * 3600000, now() - 1800000);
        db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?)').run(...Object.values(session));
        db.prepare('DELETE FROM login_limits WHERE key=?').run('account:' + digest(email));
        store.audit(account.company_id, account.id, 'login.succeeded');
      });
      res.setHeader('Set-Cookie', cookie(token)); return json(res, 200, response);
    }
    if (path.startsWith('/api/')) {
      const { account, session, user } = authenticate(req);
      if (unsafe) {
        requireThat(typeof req.headers['x-csrf-token'] === 'string' && equalSecret(req.headers['x-csrf-token'], session.csrf), 403, 'Atnaujinkite puslapį ir bandykite dar kartą.');
        requireThat(!session.preview_id || ['/api/preview', '/api/logout'].includes(path), 403, 'Peržiūros režimu pakeitimai neleidžiami.');
      }
      const recheck = () => {
        const fresh = authenticate(req);
        requireThat(fresh.user.id === user.id && fresh.user.role === user.role && fresh.user.driverId === user.driverId && fresh.session.preview_id === session.preview_id, 403, 'Prieiga pasikeitė. Atnaujinkite puslapį.');
      };
      const readBody = async () => { const input = await body(req); recheck(); return input; };
      if (path === '/api/session' && method === 'GET') return json(res, 200, payload(account, session));
      if (path === '/api/logout' && method === 'POST') {
        db.prepare('DELETE FROM sessions WHERE token_hash=?').run(session.token_hash); store.audit(account.company_id, account.id, 'logout');
        res.setHeader('Set-Cookie', cookie('', true)); return json(res, 200, { ok: true });
      }
      if (path === '/api/preview' && method === 'POST') {
        requireThat(account.role === 'admin' && account.company_id, 403, 'Peržiūra neleidžiama.');
        const input = await readBody(), id = input.id === null ? null : text(input.id, 100);
        if (id) requireThat(store.snapshot(account.company_id).snapshot.workspace.users.some(u => u.id === id && u.active), 404, 'Naudotojas nerastas.');
        db.prepare('UPDATE sessions SET preview_id=? WHERE token_hash=?').run(id, session.token_hash); session.preview_id = id;
        store.audit(account.company_id, account.id, id ? 'preview.started' : 'preview.stopped', id ?? '');
        return json(res, 200, payload(account, session));
      }
      if (path === '/api/sessions' && method === 'GET') return json(res, 200, db.prepare('SELECT token_hash,created_at,last_at,user_agent FROM sessions WHERE account_id=? AND created_at>? AND last_at>?').all(account.id, now() - 8 * 3600000, now() - 1800000).map(r => ({ id: r.token_hash, createdAt: r.created_at, lastAt: r.last_at, device: r.user_agent, current: r.token_hash === session.token_hash })));
      if (path === '/api/sessions/revoke' && method === 'POST') {
        const input = await readBody(); db.prepare('DELETE FROM sessions WHERE account_id=? AND token_hash=?').run(account.id, text(input.id, 64));
        store.audit(account.company_id, account.id, 'session.revoked'); return json(res, 200, { ok: true });
      }
      if (path === '/api/password' && method === 'POST') {
        const input = await readBody(); limit('password:' + account.id, 10);
        requireThat(await verifyPassword(input.current, account.password_hash), 400, 'Dabartinis slaptažodis neteisingas.');
        const hash = await hashPassword(input.password);
        recheck();
        store.transaction(() => { db.prepare('UPDATE accounts SET password_hash=? WHERE id=?').run(hash, account.id); db.prepare('DELETE FROM sessions WHERE account_id=?').run(account.id); store.audit(account.company_id, account.id, 'password.changed'); });
        res.setHeader('Set-Cookie', cookie('', true)); return json(res, 200, { ok: true });
      }
      if (path === '/api/profile' && method === 'POST') {
        const input = await readBody(), name = text(input.name, 100);
        store.transaction(() => {
          db.prepare('UPDATE accounts SET name=? WHERE id=?').run(name, account.id);
          if (account.company_id) {
            const row = store.snapshot(account.company_id);
            row.snapshot.workspace.users.find(u => u.id === account.member_id)!.name = name;
            db.prepare('UPDATE snapshots SET data=?,revision=revision+1 WHERE company_id=?').run(JSON.stringify(row.snapshot), account.company_id);
          }
          store.audit(account.company_id, account.id, 'profile.updated');
        });
        return json(res, 200, { ok: true });
      }
      if (path === '/api/companies') {
        requireThat(user.role === 'owner', 403, 'Prieiga nesuteikta.');
        if (method === 'GET') return json(res, 200, db.prepare('SELECT id,name,modules,active FROM companies ORDER BY name').all().map(c => ({ ...c, modules: JSON.parse(String(c.modules)) })));
        if (method === 'POST') {
          const input = await readBody(), name = text(input.name), modules = validateModules(input.modules), email = emailAddress(input.email), adminName = text(input.adminName, 100);
          const passwordHash = await hashPassword(input.password), id = randomUUID();
          recheck();
          const data = createEmptyDatabase(createSeed('2026-01-01').settings); data.settings.company = name;
          const workspace = createWorkspace(data); workspace.companyId = id; workspace.notifications = [];
          const admin: WorkspaceUser = { id: 'admin', companyId: id, name: adminName, email, role: 'admin', active: true, driverId: '' };
          workspace.users = [admin];
          store.transaction(() => {
            db.prepare('INSERT INTO companies(id,name,modules) VALUES(?,?,?)').run(id, name, JSON.stringify(modules));
            db.prepare('INSERT INTO snapshots VALUES(?,1,?)').run(id, JSON.stringify({ db: data, workspace }));
            db.prepare('INSERT INTO accounts VALUES(?,?,?,?,?,?,?,1)').run(randomUUID(), id, 'admin', email, adminName, 'admin', passwordHash);
            store.audit(id, account.id, 'company.created', id);
          });
          return json(res, 201, { id });
        }
      }
      if (path.startsWith('/api/companies/') && method === 'PUT') {
        requireThat(user.role === 'owner', 403, 'Prieiga nesuteikta.');
        const id = path.split('/')[3], input = await readBody(), name = text(input.name), modules = validateModules(input.modules);
        requireThat(typeof input.active === 'boolean' && db.prepare('SELECT id FROM companies WHERE id=?').get(id), 400, 'Patikrinkite įmonės duomenis.');
        store.transaction(() => { db.prepare('UPDATE companies SET name=?,modules=?,active=? WHERE id=?').run(name, JSON.stringify(modules), Number(input.active), id); if (!input.active) db.prepare('DELETE FROM sessions WHERE account_id IN (SELECT id FROM accounts WHERE company_id=?)').run(id); store.audit(id, account.id, 'company.updated', id); });
        return json(res, 200, { ok: true });
      }
      if (path === '/api/commands' && method === 'POST') {
        requireThat(account.company_id, 403, 'Prieiga nesuteikta.');
        const input = await readBody(), command = input.command as WorkspaceCommand;
        requireThat(command && typeof command.type === 'string', 400, 'Netinkamas veiksmas.');
        const row = store.snapshot(account.company_id);
        requireThat(input.revision === row.revision, 409, 'Duomenys pakeisti kitame lange. Atnaujinkite puslapį.');
        if (command.type === 'restore') requireThat(!db.prepare('SELECT id FROM attachments WHERE company_id=? LIMIT 1').get(account.company_id), 409, 'Prieš atkurdami JSON kopiją išsaugokite visą serverio duomenų bazę ir pašalinkite užsakymų nuotraukas.');
        const next = applyWorkspaceCommand(row.snapshot, user.id, command, JSON.parse(company(account.company_id).modules));
        // Account changes are coupled to the validated membership update.
        let credentials: { email: string; password: string | null } | null = null;
        if (command.type === 'user') {
          const existing = db.prepare('SELECT id FROM accounts WHERE company_id=? AND member_id=?').get(account.company_id, command.user.id);
          credentials = { email: emailAddress(command.user.email), password: input.password ? await hashPassword(input.password) : null };
          requireThat(existing || credentials.password || !command.user.active, 400, 'Naujam naudotojui nustatykite slaptažodį.');
        }
        recheck();
        store.transaction(() => {
          if (command.type === 'restore') db.prepare('INSERT INTO snapshot_backups VALUES(?,?,?,?,?)').run(randomUUID(), account.company_id, row.revision, JSON.stringify(row.snapshot), new Date().toISOString());
          const result = db.prepare('UPDATE snapshots SET data=?,revision=revision+1 WHERE company_id=? AND revision=?').run(JSON.stringify(next), account.company_id, row.revision);
          requireThat(result.changes === 1, 409, 'Duomenys pasikeitė. Atnaujinkite puslapį.');
          if (command.type === 'user' && credentials) {
            const u = command.user;
            const existing = db.prepare('SELECT * FROM accounts WHERE company_id=? AND member_id=?').get(account.company_id, u.id) as Account | undefined;
            if (existing) {
              db.prepare('UPDATE accounts SET email=?,name=?,role=?,active=?,password_hash=COALESCE(?,password_hash) WHERE id=?').run(credentials.email, u.name, u.role, Number(u.active), credentials.password, existing.id);
              if (credentials.password || !u.active || u.email !== existing.email || u.role !== existing.role) db.prepare('DELETE FROM sessions WHERE account_id=?').run(existing.id);
            } else if (credentials.password) db.prepare('INSERT INTO accounts VALUES(?,?,?,?,?,?,?,1)').run(randomUUID(), account.company_id, u.id, credentials.email, u.name, u.role, credentials.password);
          }
          // A restore may disable a driver whose operational record was removed.
          db.prepare('DELETE FROM sessions WHERE account_id IN (SELECT id FROM accounts WHERE company_id=? AND member_id NOT IN (SELECT value FROM json_each(?)))').run(account.company_id, JSON.stringify(next.workspace.users.filter(u => u.active).map(u => u.id)));
          store.audit(account.company_id, account.id, 'workspace.' + command.type, command.type==='user'?command.user.id:command.type==='driver'||command.type==='finance'?command.command.tripId:'');
        });
        return json(res, 200, payload(account, session));
      }
      if (path === '/api/backups' && method === 'GET') {
        requireThat(account.company_id && user.role === 'admin', 403, 'Prieiga nesuteikta.');
        return json(res, 200, db.prepare('SELECT id,revision,created_at FROM snapshot_backups WHERE company_id=? ORDER BY created_at DESC').all(account.company_id));
      }
      if (path.startsWith('/api/backups/') && method === 'GET') {
        requireThat(account.company_id && user.role === 'admin', 403, 'Prieiga nesuteikta.');
        const row = db.prepare('SELECT data FROM snapshot_backups WHERE company_id=? AND id=?').get(account.company_id, path.split('/')[3]) as { data: string } | undefined;
        requireThat(row, 404, 'Kopija nerasta.'); return json(res, 200, JSON.parse(row.data));
      }
      if (path === '/api/photos') {
        moduleAccess(account, user, 'photos');
        const orderId = text(url.searchParams.get('order'), 100); orderAccess(account, user, orderId);
        if (method === 'GET') return json(res, 200, db.prepare('SELECT id,stage,actor_id,created_at FROM attachments WHERE company_id=? AND order_id=? ORDER BY created_at DESC').all(account.company_id!, orderId));
        if (method === 'POST') {
          requireThat(['pickup', 'delivery', 'other'].includes(url.searchParams.get('stage') ?? ''), 400, 'Pasirinkite nuotraukos paskirtį.');
          requireThat(['image/jpeg', 'image/png', 'image/webp'].includes(req.headers['content-type'] ?? ''), 415, 'Galimi JPEG, PNG ir WebP vaizdai.');
          requireThat(imageJobs < 2, 429, 'Nuotraukos apdorojamos. Bandykite dar kartą.');
          const count = db.prepare('SELECT count(*) AS n FROM attachments WHERE company_id=? AND order_id=?').get(account.company_id!, orderId) as { n: number };
          requireThat(count.n < 20, 400, 'Užsakymui galima pridėti iki 20 nuotraukų.');
          imageJobs++;
          let image: Buffer;
          try {
            const raw = await bytes(req, 8 * 1024 * 1024);
            const mime = req.headers['content-type'];
            const signature = mime === 'image/jpeg' ? raw.subarray(0, 3).equals(Buffer.from([255, 216, 255])) : mime === 'image/png' ? raw.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : raw.subarray(0, 4).toString() === 'RIFF' && raw.subarray(8, 12).toString() === 'WEBP';
            requireThat(signature, 415, 'Vaizdo turinys neatitinka failo tipo.');
            const processor = sharp(raw, { limitInputPixels: 20000000, animated: false });
            const metadata = await processor.metadata();
            const expected = ({ 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' } as Record<string, string>)[req.headers['content-type']!];
            requireThat(metadata.format === expected && (metadata.pages ?? 1) === 1, 415, 'Vaizdo turinys neatitinka failo tipo.');
            image = await processor.rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
          }
          catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, 'Nepavyko perskaityti vaizdo.'); }
          finally { imageJobs--; }
          // Recheck assignment and quota after asynchronous decoding.
          const fresh = authenticate(req); orderAccess(fresh.account, fresh.user, orderId); requireThat(fresh.user.driverId === user.driverId && !fresh.session.preview_id, 403, 'Prieiga pasikeitė. Atnaujinkite puslapį.');
          const id = randomUUID();
          store.transaction(() => {
            const total = db.prepare('SELECT count(*) AS n FROM attachments WHERE company_id=? AND order_id=?').get(account.company_id!, orderId) as { n: number };
            requireThat(total.n < 20, 400, 'Pasiekta nuotraukų riba.');
            const storage = db.prepare('SELECT COALESCE(sum(length(bytes)),0) AS size FROM attachments WHERE company_id=?').get(account.company_id!) as {size:number};
            requireThat(storage.size + image.length <= 512 * 1024 * 1024, 413, 'Pasiekta įmonės nuotraukų saugyklos riba.');
            db.prepare('INSERT INTO attachments VALUES(?,?,?,?,?,?,?,?)').run(id, account.company_id!, orderId, url.searchParams.get('stage')!, user.id, 'image/jpeg', image, new Date().toISOString());
            store.audit(account.company_id, account.id, 'photo.created', id);
          });
          return json(res, 201, { id });
        }
      }
      if (path.startsWith('/api/photos/')) {
        moduleAccess(account, user, 'photos');
        const row = db.prepare('SELECT * FROM attachments WHERE company_id=? AND id=?').get(account.company_id!, path.split('/')[3]) as { id: string; order_id: string; actor_id: string; bytes: Uint8Array } | undefined;
        requireThat(row, 404, 'Nuotrauka nerasta.'); orderAccess(account, user, row.order_id);
        if (method === 'GET') { res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Disposition': 'inline; filename="photo.jpg"', 'Cache-Control': 'no-store' }); return res.end(row.bytes); }
        if (method === 'DELETE') {
          requireThat(user.role !== 'driver' || row.actor_id === user.id, 403, 'Galite ištrinti tik savo nuotrauką.');
          store.transaction(() => { db.prepare('DELETE FROM attachments WHERE id=? AND company_id=?').run(row.id, account.company_id!); store.audit(account.company_id, account.id, 'photo.deleted', row.id); }); return json(res, 200, { ok: true });
        }
      }
      if (path === '/api/reminders' || path === '/api/opportunities') {
        const reminders = path === '/api/reminders', table = reminders ? 'reminders' : 'opportunities';
        moduleAccess(account, user, reminders ? 'maintenance' : 'freight');
        requireThat(user.role === 'admin' || user.role === 'dispatcher', 403, 'Prieiga nesuteikta.');
        if (method === 'GET') return json(res, 200, db.prepare(`SELECT * FROM ${table} WHERE company_id=?`).all(account.company_id!));
        if (method === 'POST') {
          const input = await readBody(), id = randomUUID(), title = text(input.title);
          store.transaction(() => {
          if (reminders) {
            requireThat(store.snapshot(account.company_id!).snapshot.db.vehicles.some(v => v.id === input.vehicleId), 400, 'Automobilis nerastas.');
            requireThat(typeof input.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) && Number.isFinite(Date.parse(input.dueDate+'T12:00:00Z')) && new Date(input.dueDate + 'T12:00:00Z').toISOString().slice(0, 10) === input.dueDate, 400, 'Patikrinkite datą.');
            db.prepare('INSERT INTO reminders VALUES(?,?,?,?,?,0)').run(id, account.company_id!, input.vehicleId, title, input.dueDate);
          } else {
            const link = new URL(text(input.url, 2000)); requireThat(link.protocol === 'https:' && !link.username && !link.password, 400, 'Naudokite HTTPS nuorodą.');
            const notes = typeof input.notes === 'string' && input.notes.length <= 2000 ? input.notes.trim() : '';
            db.prepare('INSERT INTO opportunities VALUES(?,?,?,?,?,?)').run(id, account.company_id!, title, link.href, notes, new Date().toISOString());
          }
          store.audit(account.company_id, account.id, table + '.created', id); }); return json(res, 201, { id });
        }
        if (reminders && method === 'PUT') {
          const input = await readBody(); requireThat(typeof input.done === 'boolean', 400, 'Netinkama būsena.');
          const result = db.prepare('UPDATE reminders SET done=? WHERE company_id=? AND id=?').run(Number(input.done), account.company_id!, text(input.id,100));
          requireThat(result.changes === 1,404,'Priminimas nerastas.'); store.audit(account.company_id,account.id,'reminder.updated',input.id); return json(res,200,{ok:true});
        }
        if (method === 'DELETE') {
          const id = text(url.searchParams.get('id'), 100);
          db.prepare(`DELETE FROM ${table} WHERE company_id=? AND id=?`).run(account.company_id!, id); store.audit(account.company_id, account.id, table + '.deleted', id); return json(res, 200, { ok: true });
        }
      }
      throw new HttpError(404, 'Užklausa nerasta.');
    }
    requireThat(['GET', 'HEAD'].includes(method), 405, 'Veiksmas nepalaikomas.');
    let decoded: string; try { decoded = decodeURIComponent(path); } catch { throw new HttpError(400, 'Netinkamas adresas.'); }
    const root = resolve(options.distPath), target = resolve(root, '.' + (decoded === '/' ? '/index.html' : decoded));
    requireThat(target.startsWith(root + sep) && existsSync(target) && statSync(target).isFile(), 404, 'Puslapis nerastas.');
    const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
    res.writeHead(200, { 'Content-Type': mime[extname(target)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(method === 'HEAD' ? undefined : readFileSync(target));
  }
  const server = createServer((req, res) => { route(req, res).catch(error => {
    if (res.headersSent) { res.end(); return; }
    const status = error instanceof HttpError ? error.status : error?.code === 'ERR_SQLITE_ERROR' && /UNIQUE constraint/.test(error.message) ? 409 : 400;
    json(res, status, { error: error instanceof HttpError || !error?.code ? String(error.message ?? 'Nepavyko apdoroti užklausos.') : status === 409 ? 'Šis el. pašto adresas jau naudojamas.' : 'Nepavyko apdoroti užklausos.' });
  }); });
  server.requestTimeout = 30000; server.headersTimeout = 10000; server.maxHeadersCount = 100;
  return { server, store, close: () => store.close() };
}
