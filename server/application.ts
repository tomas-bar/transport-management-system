import { driverVisibleTrip } from '../src/domain/record-mode.ts';
import { validateOpportunity, freightDetails } from '../src/domain/freight.ts';
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
import { projectSnapshot } from '../src/domain/projection.ts';
import { companyResetCommand } from '../src/services/company-reset.ts';
export { projectSnapshot } from '../src/domain/projection.ts';

interface Account { id: string; company_id: string | null; member_id: string | null; email: string; name: string; role: WorkspaceUser['role']; password_hash: string; active: number }
interface Session { token_hash: string; account_id: string; csrf: string; created_at: number; last_at: number; preview_id: string | null; user_agent: string; preview_company_id: string | null; preview_mode: 'read' | 'act' }
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
  const scope = (account: Account, session: Session) => session.preview_id
    ? session.preview_company_id ?? account.company_id
    : account.company_id;

  function identity(account: Account, session: Session): WorkspaceUser {
    requireThat(account.active, 401, 'Prisijunkite iš naujo.');
    if (account.role === 'owner' && !session.preview_id) {
      return { id: account.id, companyId: '', name: account.name, email: account.email, role: 'owner', active: true, driverId: '' };
    }
    if (account.role !== 'owner') {
      requireThat(account.company_id && account.member_id, 403, 'Prieiga nesuteikta.');
      company(account.company_id);
      const actual = store.snapshot(account.company_id).snapshot.workspace.users.find(u => u.id === account.member_id && u.active);
      requireThat(actual && actual.role === account.role && actual.companyId === account.company_id, 403, 'Prieiga nesuteikta.');
      if (!session.preview_id) return actual;
      requireThat(actual.role === 'admin' && (!session.preview_company_id || session.preview_company_id === account.company_id), 403, 'Peržiūra neleidžiama.');
    }
    const companyId = scope(account, session);
    requireThat(companyId && session.preview_id, 403, 'Pasirinkite įmonės naudotoją.');
    company(companyId);
    const preview = store.snapshot(companyId).snapshot.workspace.users.find(u => u.id === session.preview_id && u.active);
    requireThat(preview && preview.companyId === companyId, 403, 'Naudotojas nepasiekiamas.');
    return preview;
  }
  function authenticate(req: IncomingMessage) {
    const token = req.headers.cookie?.split(';').map(p => p.trim()).find(p => p.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    requireThat(token && /^[\w-]{43}$/.test(token), 401, 'Prisijunkite iš naujo.');
    const session = db.prepare('SELECT * FROM sessions WHERE token_hash=?').get(digest(token)) as Session | undefined;
    requireThat(session && now() - session.created_at < 8 * 60 * 60 * 1000 && now() - session.last_at < 30 * 60 * 1000, 401, 'Sesija baigėsi. Prisijunkite iš naujo.');
    const account = db.prepare('SELECT * FROM accounts WHERE id=?').get(session.account_id) as Account | undefined;
    requireThat(account?.active, 401, 'Prisijunkite iš naujo.');
    let user: WorkspaceUser;
    try { user = identity(account, session); }
    catch (error) {
      // Recover the original workspace only for reads and explicit session controls.
      // Pending business writes must fail rather than switch actors mid-command.
      const control = /^\/api\/(preview|logout)(?:\?|$)/.test(req.url ?? '');
      if (!session.preview_id || !(req.method === 'GET' || control)) throw error;
      const restored = { ...session, preview_id: null, preview_company_id: null, preview_mode: 'read' as const };
      user = identity(account, restored);
      db.prepare("UPDATE sessions SET preview_id=NULL,preview_company_id=NULL,preview_mode='read' WHERE token_hash=?").run(session.token_hash);
      store.audit(scope(account, session), account.id, 'preview.expired', session.preview_id);
      Object.assign(session, restored);
    }
    db.prepare('UPDATE sessions SET last_at=? WHERE token_hash=?').run(now(), session.token_hash);
    return { session, account, user, companyId: scope(account, session) };
  }
  function payload(account: Account, session: Session) {
    const user = identity(account, session), companyId = scope(account, session);
    const view = {
      userId: user.id,
      ...(session.preview_id ? {
        returnTo: account.member_id ?? account.id,
        returnRole: account.role,
        actorName: account.name,
        mode: session.preview_mode,
      } : {}),
    };
    if (!companyId) return { user, csrf: session.csrf, session: view, modules: [], snapshot: null };
    const row = store.snapshot(companyId);
    const modules = JSON.parse(company(companyId).modules) as ModuleId[];
    return { user, csrf: session.csrf, session: view, modules, revision: row.revision, snapshot: projectSnapshot(row.snapshot, user, modules) };
  }
  function moduleAccess(companyId: string | null, user: WorkspaceUser, id: ModuleId) {
    requireThat(companyId && JSON.parse(company(companyId).modules).includes(id), 403, 'Šis modulis išjungtas.');
    requireThat(user.role !== 'owner', 403, 'Pasirinkite įmonės paskyrą.');
  }
  function orderAccess(companyId: string | null, user: WorkspaceUser, orderId: string) {
    requireThat(companyId, 403, 'Prieiga nesuteikta.');
    const s = store.snapshot(companyId).snapshot;
    const order = s.db.orders.find(o => o.id === orderId);
    requireThat(order && (user.role !== 'driver' || s.db.trips.some(t => t.id === order.tripId && t.driverId === user.driverId && driverVisibleTrip(t))), 404, 'Užsakymas nerastas.');
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
    if (path === '/api/health' && method === 'GET') return json(res, 200, { ok: true, schema: 3 });
    if (path === '/api/login' && method === 'POST') {
      const input = await body(req), email = emailAddress(input.email);
      db.prepare('DELETE FROM login_limits WHERE started_at<?').run(now() - 24 * 60 * 60 * 1000);
      limit('ip:' + digest(req.socket.remoteAddress ?? 'local'), 60); limit('account:' + digest(email), 10);
      const account = db.prepare('SELECT * FROM accounts WHERE email=?').get(email) as Account | undefined;
      dummy ??= hashPassword(randomToken());
      const valid = await verifyPassword(input.password, account?.password_hash ?? await dummy);
      const latest = account ? db.prepare('SELECT password_hash,active FROM accounts WHERE id=?').get(account.id) as {password_hash:string;active:number}|undefined : undefined;
      if (!valid || !account?.active || !latest?.active || latest.password_hash !== account.password_hash) { store.audit(null, null, 'login.failed'); throw new HttpError(401, 'Neteisingas el. paštas arba slaptažodis.'); }
      const token = randomToken(), session: Session = { token_hash: digest(token), account_id: account.id, csrf: randomToken(), created_at: now(), last_at: now(), preview_id: null, user_agent: String(req.headers['user-agent'] ?? '').slice(0, 200), preview_company_id: null, preview_mode: 'read' };
      const response = payload(account, session);
      const previous = req.headers.cookie?.split(';').map(p => p.trim()).find(p => p.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
      store.transaction(() => {
        if (previous) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(previous));
        db.prepare('DELETE FROM sessions WHERE created_at<? OR last_at<?').run(now() - 8 * 3600000, now() - 1800000);
        db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?,?)').run(...Object.values(session));
        db.prepare('DELETE FROM login_limits WHERE key=?').run('account:' + digest(email));
        store.audit(account.company_id, account.id, 'login.succeeded');
      });
      res.setHeader('Set-Cookie', cookie(token)); return json(res, 200, response);
    }
    if (path.startsWith('/api/')) {
      const { account, session, user, companyId } = authenticate(req);
      const audit = (action: string, entityId = '') => store.audit(companyId, account.id, action, entityId, session.preview_id ? user.id : null);
      if (unsafe) {
        requireThat(typeof req.headers['x-csrf-token'] === 'string' && equalSecret(req.headers['x-csrf-token'], session.csrf), 403, 'Atnaujinkite puslapį ir bandykite dar kartą.');
        const previewControl = ['/api/preview', '/api/logout'].includes(path);
        requireThat(!session.preview_id || previewControl || session.preview_mode === 'act', 403, 'Peržiūros režimu pakeitimai neleidžiami. Pasirinkite „Dirbti kaip naudotojas“.');
        requireThat(!session.preview_id || previewControl || ['/api/commands', '/api/company-data/reset', '/api/photos', '/api/reminders', '/api/opportunities'].some(p => path === p || path.startsWith(p + '/')), 403, 'Paskyros nustatymus keiskite grįžę į savo paskyrą.');
      }
      const recheck = () => {
        const fresh = authenticate(req);
        requireThat(fresh.user.id === user.id && fresh.user.role === user.role && fresh.user.driverId === user.driverId && fresh.session.preview_id === session.preview_id && fresh.session.preview_mode === session.preview_mode && fresh.companyId === companyId && fresh.account.id === account.id, 403, 'Prieiga pasikeitė. Atnaujinkite puslapį.');
      };
      const readBody = async () => { const input = await body(req); recheck(); return input; };
      if (path === '/api/session' && method === 'GET') return json(res, 200, payload(account, session));
      if (path === '/api/logout' && method === 'POST') {
        db.prepare('DELETE FROM sessions WHERE token_hash=?').run(session.token_hash); store.audit(account.company_id, account.id, 'logout');
        res.setHeader('Set-Cookie', cookie('', true)); return json(res, 200, { ok: true });
      }
      if (path === '/api/preview' && method === 'POST') {
        requireThat(['owner', 'admin'].includes(account.role), 403, 'Peržiūra neleidžiama.');
        const input = await readBody();
        const id = input.id === null ? null : text(input.id, 100);
        const mode = input.mode ?? 'read';
        requireThat(['read', 'act'].includes(mode), 400, 'Pasirinkite peržiūros režimą.');
        const targetCompany = id ? (input.companyId ?? companyId) : null;
        if (id) {
          requireThat(typeof targetCompany === 'string' && (account.role === 'owner' || targetCompany === account.company_id), 403, 'Kitos įmonės peržiūra neleidžiama.');
          company(targetCompany);
          requireThat(store.snapshot(targetCompany).snapshot.workspace.users.some(u => u.id === id && u.active), 404, 'Naudotojas nerastas.');
        }
        db.prepare('UPDATE sessions SET preview_id=?,preview_company_id=?,preview_mode=? WHERE token_hash=?').run(id, targetCompany, mode, session.token_hash);
        session.preview_id = id; session.preview_company_id = targetCompany; session.preview_mode = mode;
        store.audit(targetCompany ?? account.company_id, account.id, id ? (mode === 'act' ? 'preview.acting' : 'preview.started') : 'preview.stopped', id ?? '', id);
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
          const data = createEmptyDatabase(createSeed('2026-01-01').settings); data.settings.company = name; data.settings.email = ''; data.settings.phone = '';
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
      const companyUsers = /^\/api\/companies\/([^/]+)\/users$/.exec(path);
      if (companyUsers && method === 'GET') {
        requireThat(user.role === 'owner' && !session.preview_id, 403, 'Prieiga nesuteikta.');
        const id = companyUsers[1];
        requireThat(db.prepare('SELECT id FROM companies WHERE id=?').get(id), 404, 'Įmonė nerasta.');
        const snapshot = store.snapshot(id).snapshot;
        const accounts = db.prepare('SELECT member_id,active FROM accounts WHERE company_id=?').all(id);
        return json(res, 200, snapshot.workspace.users.map(member => ({
          ...member,
          hasLogin: accounts.some(a => a.member_id === member.id && !!a.active),
          driverName: snapshot.db.drivers.filter(d => d.id === member.driverId).map(d => d.firstName + ' ' + d.lastName)[0] ?? '',
        })));
      }
      if (path.startsWith('/api/companies/') && method === 'PUT') {
        requireThat(user.role === 'owner', 403, 'Prieiga nesuteikta.');
        const id = path.split('/')[3], input = await readBody(), name = text(input.name), modules = validateModules(input.modules);
        requireThat(typeof input.active === 'boolean' && db.prepare('SELECT id FROM companies WHERE id=?').get(id), 400, 'Patikrinkite įmonės duomenis.');
        store.transaction(() => { db.prepare('UPDATE companies SET name=?,modules=?,active=? WHERE id=?').run(name, JSON.stringify(modules), Number(input.active), id); if (!input.active) db.prepare('DELETE FROM sessions WHERE account_id IN (SELECT id FROM accounts WHERE company_id=?)').run(id); store.audit(id, account.id, 'company.updated', id); });
        return json(res, 200, { ok: true });
      }
      if (['/api/commands', '/api/company-data/reset'].includes(path) && method === 'POST') {
        requireThat(companyId, 403, 'Prieiga nesuteikta.');
        const input = await readBody(), reset = path === '/api/company-data/reset';
        if (reset) requireThat(user.role === 'admin', 403, 'Duomenis gali išvalyti ir atkurti įmonės vadovas.');
        const row = store.snapshot(companyId);
        const command = reset ? companyResetCommand(row.snapshot, input) : input.command as WorkspaceCommand;
        requireThat(command && typeof command.type === 'string', 400, 'Netinkamas veiksmas.');
        requireThat(!session.preview_id || reset || !['user', 'restore'].includes(command.type), 403, 'Naudotojus ir kopijas valdykite grįžę į savo paskyrą.');
        requireThat(input.revision === row.revision, 409, 'Duomenys pakeisti kitame lange. Atnaujinkite puslapį.');
        if (command.type === 'restore' && !reset) requireThat(!db.prepare('SELECT id FROM attachments WHERE company_id=? LIMIT 1').get(companyId), 409, 'Prieš atkurdami JSON kopiją išsaugokite visą serverio duomenų bazę ir pašalinkite užsakymų nuotraukas.');
        const next = applyWorkspaceCommand(row.snapshot, user.id, command, JSON.parse(company(companyId).modules));
        // Account changes are coupled to the validated membership update.
        let credentials: { email: string; password: string | null } | null = null;
        if (command.type === 'user') {
          const existing = db.prepare('SELECT id FROM accounts WHERE company_id=? AND member_id=?').get(companyId, command.user.id);
          credentials = { email: emailAddress(command.user.email), password: input.password ? await hashPassword(input.password) : null };
          requireThat(existing || credentials.password || !command.user.active, 400, 'Naujam naudotojui nustatykite slaptažodį.');
        }
        recheck();
        store.transaction(() => {
          if (reset) {
            for (const table of ['attachments', 'reminders', 'opportunities']) db.prepare(`DELETE FROM ${table} WHERE company_id=?`).run(companyId);
          }
          if (reset && input.mode === 'clear') db.prepare('DELETE FROM snapshot_backups WHERE company_id=?').run(companyId);
          else if (command.type === 'restore') db.prepare('INSERT INTO snapshot_backups VALUES(?,?,?,?,?)').run(randomUUID(), companyId, row.revision, JSON.stringify(row.snapshot), new Date().toISOString());
          const result = db.prepare('UPDATE snapshots SET data=?,revision=revision+1 WHERE company_id=? AND revision=?').run(JSON.stringify(next), companyId, row.revision);
          requireThat(result.changes === 1, 409, 'Duomenys pasikeitė. Atnaujinkite puslapį.');
          if (command.type === 'user' && credentials) {
            const u = command.user;
            const existing = db.prepare('SELECT * FROM accounts WHERE company_id=? AND member_id=?').get(companyId, u.id) as Account | undefined;
            if (existing) {
              db.prepare('UPDATE accounts SET email=?,name=?,role=?,active=?,password_hash=COALESCE(?,password_hash) WHERE id=?').run(credentials.email, u.name, u.role, Number(u.active), credentials.password, existing.id);
              if (credentials.password || !u.active || u.email !== existing.email || u.role !== existing.role) db.prepare('DELETE FROM sessions WHERE account_id=?').run(existing.id);
            } else if (credentials.password) db.prepare('INSERT INTO accounts VALUES(?,?,?,?,?,?,?,1)').run(randomUUID(), companyId, u.id, credentials.email, u.name, u.role, credentials.password);
          }
          // A restore may disable a driver whose operational record was removed.
          db.prepare('DELETE FROM sessions WHERE account_id IN (SELECT id FROM accounts WHERE company_id=? AND member_id NOT IN (SELECT value FROM json_each(?)))').run(companyId, JSON.stringify(next.workspace.users.filter(u => u.active).map(u => u.id)));
          audit(reset ? 'workspace.' + input.mode : 'workspace.' + command.type, command.type==='user'?command.user.id:command.type==='driver'||command.type==='finance'?command.command.tripId:command.type==='reviewTrip'||command.type==='repeatTrip'?command.input.tripId:'');
        });
        return json(res, 200, payload(account, session));
      }
      if (path === '/api/backups' && method === 'GET') {
        requireThat(companyId && user.role === 'admin', 403, 'Prieiga nesuteikta.');
        return json(res, 200, db.prepare('SELECT id,revision,created_at FROM snapshot_backups WHERE company_id=? ORDER BY created_at DESC').all(companyId));
      }
      if (path.startsWith('/api/backups/') && method === 'GET') {
        requireThat(companyId && user.role === 'admin', 403, 'Prieiga nesuteikta.');
        const row = db.prepare('SELECT data FROM snapshot_backups WHERE company_id=? AND id=?').get(companyId, path.split('/')[3]) as { data: string } | undefined;
        requireThat(row, 404, 'Kopija nerasta.'); return json(res, 200, projectSnapshot(JSON.parse(row.data), user, JSON.parse(company(companyId).modules)));
      }
      if (path === '/api/photos') {
        moduleAccess(companyId, user, 'photos');
        const orderId = text(url.searchParams.get('order'), 100); orderAccess(companyId, user, orderId);
        if (method === 'GET') return json(res, 200, db.prepare('SELECT id,stage,actor_id,created_at FROM attachments WHERE company_id=? AND order_id=? ORDER BY created_at DESC').all(companyId!, orderId));
        if (method === 'POST') {
          requireThat(['pickup', 'delivery', 'other'].includes(url.searchParams.get('stage') ?? ''), 400, 'Pasirinkite nuotraukos paskirtį.');
          requireThat(['image/jpeg', 'image/png', 'image/webp'].includes(req.headers['content-type'] ?? ''), 415, 'Galimi JPEG, PNG ir WebP vaizdai.');
          requireThat(imageJobs < 2, 429, 'Nuotraukos apdorojamos. Bandykite dar kartą.');
          const count = db.prepare('SELECT count(*) AS n FROM attachments WHERE company_id=? AND order_id=?').get(companyId!, orderId) as { n: number };
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
          recheck(); orderAccess(companyId, user, orderId);
          const id = randomUUID();
          store.transaction(() => {
            const total = db.prepare('SELECT count(*) AS n FROM attachments WHERE company_id=? AND order_id=?').get(companyId!, orderId) as { n: number };
            requireThat(total.n < 20, 400, 'Pasiekta nuotraukų riba.');
            const storage = db.prepare('SELECT COALESCE(sum(length(bytes)),0) AS size FROM attachments WHERE company_id=?').get(companyId!) as {size:number};
            requireThat(storage.size + image.length <= 512 * 1024 * 1024, 413, 'Pasiekta įmonės nuotraukų saugyklos riba.');
            db.prepare('INSERT INTO attachments VALUES(?,?,?,?,?,?,?,?)').run(id, companyId!, orderId, url.searchParams.get('stage')!, user.id, 'image/jpeg', image, new Date().toISOString());
            audit('photo.created', id);
          });
          return json(res, 201, { id });
        }
      }
      if (path.startsWith('/api/photos/')) {
        moduleAccess(companyId, user, 'photos');
        const row = db.prepare('SELECT * FROM attachments WHERE company_id=? AND id=?').get(companyId!, path.split('/')[3]) as { id: string; order_id: string; actor_id: string; bytes: Uint8Array } | undefined;
        requireThat(row, 404, 'Nuotrauka nerasta.'); orderAccess(companyId, user, row.order_id);
        if (method === 'GET') { res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Disposition': 'inline; filename="photo.jpg"', 'Cache-Control': 'no-store' }); return res.end(row.bytes); }
        if (method === 'DELETE') {
          requireThat(user.role !== 'driver' || row.actor_id === user.id, 403, 'Galite ištrinti tik savo nuotrauką.');
          store.transaction(() => { db.prepare('DELETE FROM attachments WHERE id=? AND company_id=?').run(row.id, companyId!); audit('photo.deleted', row.id); }); return json(res, 200, { ok: true });
        }
      }
      if (path === '/api/reminders' || path === '/api/opportunities') {
        const reminders = path === '/api/reminders', table = reminders ? 'reminders' : 'opportunities';
        moduleAccess(companyId, user, reminders ? 'maintenance' : 'freight');
        requireThat(user.role === 'admin' || user.role === 'dispatcher', 403, 'Prieiga nesuteikta.');
        if (method === 'GET') {
          const rows = db.prepare(`SELECT * FROM ${table} WHERE company_id=?`).all(companyId!);
          return json(res, 200, reminders ? rows : rows.map(row => ({ id: row.id, revision: row.revision, title: row.title, url: row.url, notes: row.notes, created_at: row.created_at, details: freightDetails(JSON.parse(String(row.details))) })));
        }
        if (!reminders && method === 'PUT') {
          const input = await readBody(), id = text(input.id, 100);
          const value = validateOpportunity(input, store.snapshot(companyId!).snapshot.db);
          const previous = db.prepare('SELECT details,revision FROM opportunities WHERE company_id=? AND id=?').get(companyId!, id);
          requireThat(previous, 404, 'Galimybė nerasta.');
          requireThat(input.revision === previous.revision, 409, 'Pasiūlymas pakeistas kitame lange. Atnaujinkite sąrašą.');
          if (!JSON.parse(company(companyId!).modules).includes('finance')) requireThat(value.details.price === freightDetails(JSON.parse(String(previous.details))).price, 403, 'Finansų modulis išjungtas.');
          store.transaction(() => {
            const updated = db.prepare('UPDATE opportunities SET title=?,url=?,notes=?,details=?,revision=revision+1 WHERE company_id=? AND id=? AND revision=?').run(value.title, value.url, value.notes, JSON.stringify(value.details), companyId!, id, input.revision);
            requireThat(updated.changes === 1, 409, 'Pasiūlymas pakeistas kitame lange. Atnaujinkite sąrašą.');
            audit('opportunities.updated', id);
          });
          return json(res, 200, { ok: true });
        }
        if (method === 'POST') {
          const input = await readBody(), id = randomUUID(), title = text(input.title);
          store.transaction(() => {
          if (reminders) {
            requireThat(store.snapshot(companyId!).snapshot.db.vehicles.some(v => v.id === input.vehicleId), 400, 'Automobilis nerastas.');
            requireThat(typeof input.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) && Number.isFinite(Date.parse(input.dueDate+'T12:00:00Z')) && new Date(input.dueDate + 'T12:00:00Z').toISOString().slice(0, 10) === input.dueDate, 400, 'Patikrinkite datą.');
            db.prepare('INSERT INTO reminders VALUES(?,?,?,?,?,0)').run(id, companyId!, input.vehicleId, title, input.dueDate);
          } else {
            const value = validateOpportunity(input, store.snapshot(companyId!).snapshot.db);
            requireThat(value.details.price === null || JSON.parse(company(companyId!).modules).includes('finance'), 403, 'Finansų modulis išjungtas.');
            db.prepare('INSERT INTO opportunities(id,company_id,title,url,notes,created_at,details) VALUES(?,?,?,?,?,?,?)').run(id, companyId!, value.title, value.url, value.notes, new Date().toISOString(), JSON.stringify(value.details));
          }
          audit(table + '.created', id); }); return json(res, 201, { id });
        }
        if (reminders && method === 'PUT') {
          const input = await readBody(); requireThat(typeof input.done === 'boolean', 400, 'Netinkama būsena.');
          const result = db.prepare('UPDATE reminders SET done=? WHERE company_id=? AND id=?').run(Number(input.done), companyId!, text(input.id,100));
          requireThat(result.changes === 1,404,'Priminimas nerastas.'); audit('reminder.updated',input.id); return json(res,200,{ok:true});
        }
        if (method === 'DELETE') {
          const id = text(url.searchParams.get('id'), 100);
          db.prepare(`DELETE FROM ${table} WHERE company_id=? AND id=?`).run(companyId!, id); audit(table + '.deleted', id); return json(res, 200, { ok: true });
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
