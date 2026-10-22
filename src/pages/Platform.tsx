import { useEffect, useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { api } from '../services/server-api';
import { useApp } from '../context';
import { moduleCatalog, type ModuleId } from '../domain/modules';
import { Button, Field, Modal, PageHeading, Empty } from '../components/ui';
interface Company { id: string; name: string; modules: ModuleId[]; active: number }
export function Platform() {
  const { notify } = useApp();
  const [companies, setCompanies] = useState<Company[]>([]), [edit, setEdit] = useState<Partial<Company> | null>(null);
  const [adminName, setAdminName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false);
  const load = () => api<Company[]>('/api/companies').then(setCompanies).catch(e => notify(e.message, true));
  useEffect(() => { void load(); }, []);
  return <><PageHeading title="Įmonės"><Button onClick={() => { setAdminName(''); setEmail(''); setPassword(''); setEdit({ name: '', modules: ['operations'], active: 1 }); }}><Plus size={18}/>Pridėti įmonę</Button></PageHeading>
    <div className="user-grid">{companies.map(company => <article className="user-card" key={company.id}><h2>{company.name}</h2><span className={`account-state ${company.active ? 'enabled' : ''}`}>{company.active ? 'Aktyvi' : 'Išjungta'}</span><p>{company.modules.map(id => moduleCatalog[id].label).join(' · ')}</p><footer><Button variant="secondary" onClick={() => setEdit(structuredClone(company))}><Pencil size={16}/>Redaguoti</Button></footer></article>)}</div>
    {!companies.length && <Empty title="Įmonių nėra"/>}
    {edit && <Modal title={edit.id ? 'Įmonės nustatymai' : 'Nauja įmonė'} onClose={() => setEdit(null)}><form onSubmit={async e => {
      e.preventDefault(); setBusy(true);
      try { await api(edit.id ? '/api/companies/' + edit.id : '/api/companies', edit.id ? 'PUT' : 'POST', { ...edit, active: !!edit.active, adminName, email, password }); setPassword(''); setEdit(null); await load(); notify('Įmonė išsaugota'); }
      catch (error) { notify((error as Error).message, true); } finally { setBusy(false); }
    }}><div className="modal-body form-grid"><Field label="Įmonės pavadinimas" full><input required maxLength={160} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })}/></Field>
      {!edit.id && <><Field label="Administratoriaus vardas ir pavardė" full><input required maxLength={100} value={adminName} onChange={e => setAdminName(e.target.value)}/></Field><Field label="Administratoriaus el. paštas" full><input type="email" required autoComplete="off" value={email} onChange={e => setEmail(e.target.value)}/></Field><Field label="Pradinis slaptažodis" full hint="Bent 15 simbolių. Perduokite administratoriui saugiu būdu."><input type="password" required minLength={15} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}/></Field></>}
      <fieldset className="driver-permissions"><legend>Moduliai</legend>{(Object.keys(moduleCatalog) as ModuleId[]).map(id => <label key={id}><input type="checkbox" disabled={id === 'operations'} checked={edit.modules?.includes(id)} onChange={e => setEdit({ ...edit, modules: e.target.checked ? [...new Set([...(edit.modules ?? []), id, ...moduleCatalog[id].requires])] : edit.modules?.filter(m => m !== id) })}/>{moduleCatalog[id].label}</label>)}</fieldset>
      {edit.id && <Field label="Prieiga" full><select value={String(!!edit.active)} onChange={e => setEdit({ ...edit, active: Number(e.target.value === 'true') })}><option value="true">Aktyvi</option><option value="false">Išjungta</option></select></Field>}
    </div><footer><Button variant="secondary" onClick={() => setEdit(null)}>Atšaukti</Button><Button type="submit" disabled={busy}>Išsaugoti</Button></footer></form></Modal>}
  </>;
}
