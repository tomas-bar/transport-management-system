import { UserPreviewActions } from '../components/UserPreview';
import { useState } from 'react';
import { Plus, ArrowUpRight, ShieldCheck, Truck, UserRound, Pencil } from 'lucide-react';
import { useApp } from '../context';
import { Button, Empty, Field, Modal, PageHeading, SearchInput } from '../components/ui';
import {driverPermissions} from '../domain/trip-finance';
import { roleLabels, type Role, type WorkspaceUser } from '../domain/workspace';
export function WorkspaceUsers() {
  const {
    workspace,
    user,
    db,
    saveUser,
    previewUser,
    busy, serverMode, session
  } = useApp();
  const [password,setPassword]=useState('');
  const [query, setQuery] = useState('');
  const [edit, setEdit] = useState<WorkspaceUser | null>(null);
  const users = workspace.users.filter(u => `${u.name} ${u.email} ${roleLabels[u.role]}`.toLocaleLowerCase('lt').includes(query.toLocaleLowerCase('lt')));
  if (user?.role !== 'admin') return <Empty title="Prieiga nesuteikta" description="Šį puslapį gali atidaryti administratorius." />;
  return <><PageHeading eyebrow="ĮMONĖ" title="Naudotojai"><Button disabled={!!session?.returnTo} onClick={() => setEdit({
        id: crypto.randomUUID(),
        companyId: workspace.companyId,
        name: '',
        email: '',
        role: 'dispatcher',
        driverId: '',
        active: true
      })}><Plus size={18} />Pridėti naudotoją</Button></PageHeading><div className="team-summary"><div><b>{workspace.users.filter(u => u.active).length}</b><span>Aktyvūs naudotojai</span></div><p>Rolė nustato, kuriuos puslapius ir veiksmus naudotojas gali pasiekti.</p></div><div className="team-search"><SearchInput value={query} onChange={setQuery} placeholder="Ieškoti naudotojo..." /></div><div className="user-grid">{users.map(u => <article className={`user-card ${!u.active ? 'inactive' : ''}`} key={u.id}><div className="user-card-top"><span className={`role-icon ${u.role}`}>{u.role === 'admin' ? <ShieldCheck /> : u.role === 'driver' ? <Truck /> : <UserRound />}</span><span className={`account-state ${u.active ? 'enabled' : ''}`}>{u.active ? 'Aktyvus' : 'Išjungtas'}</span></div><h2>{u.name}</h2><p>{u.email}</p><span className="role-label">{roleLabels[u.role]}</span><div className="user-access">{u.role === 'admin' ? 'Visi įmonės moduliai ir naudotojų valdymas' : u.role === 'dispatcher' ? 'Reisai, užsakymai, ištekliai ir finansai' : 'Tik priskirti reisai ir jų užduotys'}</div><footer><Button variant="secondary" disabled={!!session?.returnTo} onClick={() => {setPassword('');setEdit(structuredClone(u));}}><Pencil size={16} />Redaguoti</Button>{u.active && u.id !== user.id && <UserPreviewActions id={u.id} name={u.name} />}{u.id === user.id && <span className="muted">Jūsų paskyra</span>}</footer></article>)}</div>{!users.length && <Empty title="Naudotojų nerasta" description="Pakeiskite paiešką." />}{edit && <Modal title={workspace.users.some(u => u.id === edit.id) ? 'Redaguoti naudotoją' : 'Naujas naudotojas'} onClose={() => setEdit(null)}><form onSubmit={async e => {
        e.preventDefault();
        if (await saveUser(edit,password || undefined)) {setEdit(null);setPassword('');}
      }}><div className="modal-body form-grid"><Field label="Vardas ir pavardė" full><input required maxLength={100} value={edit.name} onChange={e => setEdit({
              ...edit,
              name: e.target.value
            })} /></Field><Field label="El. paštas" full><input type="email" required value={edit.email} onChange={e => setEdit({
              ...edit,
              email: e.target.value
            })} /></Field>{serverMode&&<Field label="Naujas slaptažodis" full hint="Bent 8 simbolių. Privalomas naujam naudotojui."><input type="password" minLength={8} required={!workspace.users.some(u=>u.id===edit.id)} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></Field>}<Field label="Rolė" full><select disabled={edit.id === user.id} value={edit.role} onChange={e => setEdit({
              ...edit,
              role: e.target.value as Role,
              driverId: ''
            })}>{Object.entries(roleLabels).filter(([role])=>role!=='owner').map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></Field>{edit.role === 'driver' && <Field label="Vairuotojas" full><select required value={edit.driverId} onChange={e => setEdit({
              ...edit,
              driverId: e.target.value
            })}><option value="">Pasirinkite vairuotoją</option>{db.drivers.map(d => <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>)}</select></Field>}{edit.role==='driver'&&<fieldset className="driver-permissions"><legend>Vairuotojo teisės</legend><label><input type="checkbox" checked={driverPermissions(edit).recordExpenses} onChange={e=>setEdit({...edit,permissions:{...driverPermissions(edit),recordExpenses:e.target.checked}})}/>Registruoti reiso išlaidas</label><label><input type="checkbox" checked={driverPermissions(edit).collectPayments} onChange={e=>setEdit({...edit,permissions:{...driverPermissions(edit),collectPayments:e.target.checked}})}/>Registruoti gautus mokėjimus</label></fieldset>}<Field label="Prieiga" full><select disabled={edit.id === user.id} value={String(edit.active)} onChange={e => setEdit({
              ...edit,
              active: e.target.value === 'true'
            })}><option value="true">Aktyvus</option><option value="false">Išjungtas</option></select></Field></div><footer><Button variant="secondary" onClick={() => setEdit(null)}>Atšaukti</Button><Button type="submit" disabled={busy}>Išsaugoti</Button></footer></form></Modal>}</>;
}
