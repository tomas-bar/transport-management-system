import { useEffect, useState } from 'react';
import { Building2, Plus, Pencil, UsersRound, ShieldCheck, Truck, UserRound } from 'lucide-react';
import { api } from '../services/server-api';
import { useApp } from '../context';
import { moduleCatalog, type ModuleId } from '../domain/modules';
import { roleLabels, type WorkspaceUser } from '../domain/workspace';
import { Button, Field, Modal, PageHeading, Empty, SearchInput } from '../components/ui';
import { UserPreviewActions } from '../components/UserPreview';

interface Company {
  id: string;
  name: string;
  modules: ModuleId[];
  active: number;
}
interface CompanyUser extends WorkspaceUser {
  hasLogin: boolean;
  driverName: string;
}

export function Platform() {
  const { notify } = useApp();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [edit, setEdit] = useState<Partial<Company> | null>(null);
  const [selected, setSelected] = useState<Company | null>(null);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [query, setQuery] = useState('');
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  async function load() {
    try { setCompanies(await api<Company[]>('/api/companies')); }
    catch (error) { notify((error as Error).message, true); }
  }
  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoadingUsers(true);
    setUsers([]);
    api<CompanyUser[]>('/api/companies/' + encodeURIComponent(selected.id) + '/users')
      .then(result => { if (!cancelled) setUsers(result); })
      .catch(error => { if (!cancelled) notify(error.message, true); })
      .finally(() => { if (!cancelled) setLoadingUsers(false); });
    return () => { cancelled = true; };
  }, [selected?.id]);

  async function save() {
    if (!edit) return;
    setBusy(true);
    try {
      await api(edit.id ? '/api/companies/' + edit.id : '/api/companies', edit.id ? 'PUT' : 'POST', {
        ...edit, active: !!edit.active, adminName, email, password,
      });
      setPassword('');
      setEdit(null);
      await load();
      notify('Įmonė išsaugota');
    } catch (error) { notify((error as Error).message, true); }
    finally { setBusy(false); }
  }

  const filtered = users.filter(member =>
    `${member.name} ${member.email} ${roleLabels[member.role]} ${member.driverName}`.toLocaleLowerCase('lt').includes(query.toLocaleLowerCase('lt')),
  );

  return <>
    <PageHeading title="Įmonės">
      <Button onClick={() => {
        setAdminName(''); setEmail(''); setPassword('');
        setEdit({ name: '', modules: ['operations'], active: 1 });
      }}><Plus size={18} />Pridėti įmonę</Button>
    </PageHeading>
    <div className="user-grid">
      {companies.map(company => <article className="user-card company-card" key={company.id}>
        <div className="user-card-top">
          <span className="role-icon admin"><Building2 /></span>
          <span className={`account-state ${company.active ? 'enabled' : ''}`}>{company.active ? 'Aktyvi' : 'Išjungta'}</span>
        </div>
        <h2>{company.name}</h2>
        <div className="company-modules">{company.modules.map(id => <span key={id}>{moduleCatalog[id].label}</span>)}</div>
        <footer>
          <Button variant="secondary" onClick={() => { setQuery(''); setSelected(company); }}><UsersRound size={16} />Naudotojai</Button>
          <Button variant="ghost" onClick={() => setEdit(structuredClone(company))}><Pencil size={16} />Nustatymai</Button>
        </footer>
      </article>)}
    </div>
    {!companies.length && <Empty title="Įmonių nėra" description="Pridėkite įmonę ir jos administratorių." />}

    {selected && <Modal title="Įmonės naudotojai" subtitle={selected.name} onClose={() => setSelected(null)} wide>
      <div className="modal-body company-users">
        <SearchInput value={query} onChange={setQuery} placeholder="Vardas, el. paštas arba rolė..." />
        {loadingUsers ? <p role="status">Kraunami naudotojai...</p> : <>
          <div className="company-user-list">{filtered.map(member => <article className="company-user" key={member.id}>
            <span className={`role-icon ${member.role}`}>
              {member.role === 'admin' ? <ShieldCheck /> : member.role === 'driver' ? <Truck /> : <UserRound />}
            </span>
            <div className="company-user-details">
              <h3>{member.name}</h3>
              <p>{member.email}</p>
              <small>{roleLabels[member.role]}{member.driverName && member.driverName !== member.name ? ' · ' + member.driverName : ''}</small>
              <span className={`account-state ${member.active && member.hasLogin ? 'enabled' : ''}`}>
                {!member.active ? 'Išjungtas' : member.hasLogin ? 'Prisijungimas paruoštas' : 'Slaptažodis nenustatytas'}
              </span>
            </div>
            {member.active && selected.active === 1 && <UserPreviewActions id={member.id} name={member.name} companyId={selected.id} />}
          </article>)}</div>
          {!filtered.length && <Empty title="Naudotojų nerasta" description="Pakeiskite paiešką." />}
        </>}
      </div>
      <footer><Button variant="secondary" onClick={() => setSelected(null)}>Uždaryti</Button></footer>
    </Modal>}

    {edit && <Modal title={edit.id ? 'Įmonės nustatymai' : 'Nauja įmonė'} onClose={() => { if (!busy) setEdit(null); }}>
      <form onSubmit={event => { event.preventDefault(); void save(); }}>
        <div className="modal-body form-grid">
          <Field label="Įmonės pavadinimas" full>
            <input required maxLength={160} value={edit.name} onChange={event => setEdit({ ...edit, name: event.target.value })} />
          </Field>
          {!edit.id && <>
            <Field label="Įmonės vadovo vardas ir pavardė" full>
              <input required maxLength={100} value={adminName} onChange={event => setAdminName(event.target.value)} />
            </Field>
            <Field label="Įmonės vadovo el. paštas" full>
              <input type="email" required autoComplete="off" value={email} onChange={event => setEmail(event.target.value)} />
            </Field>
            <Field label="Pradinis slaptažodis" full hint="Bent 15 simbolių. Perduokite administratoriui saugiu būdu.">
              <input type="password" required minLength={15} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} />
            </Field>
          </>}
          <fieldset className="driver-permissions"><legend>Moduliai</legend>
            {(Object.keys(moduleCatalog) as ModuleId[]).map(id => <label key={id}>
              <input type="checkbox" disabled={id === 'operations'} checked={edit.modules?.includes(id)} onChange={event => setEdit({
                ...edit,
                modules: event.target.checked
                  ? [...new Set([...(edit.modules ?? []), id, ...moduleCatalog[id].requires])]
                  : edit.modules?.filter(module => module !== id),
              })} />{moduleCatalog[id].label}
            </label>)}
          </fieldset>
          {edit.id && <Field label="Prieiga" full>
            <select value={String(!!edit.active)} onChange={event => setEdit({ ...edit, active: Number(event.target.value === 'true') })}>
              <option value="true">Aktyvi</option><option value="false">Išjungta</option>
            </select>
          </Field>}
        </div>
        <footer>
          <Button variant="secondary" disabled={busy} onClick={() => setEdit(null)}>Atšaukti</Button>
          <Button type="submit" disabled={busy}>Išsaugoti</Button>
        </footer>
      </form>
    </Modal>}
  </>;
}
