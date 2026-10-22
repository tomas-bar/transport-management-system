import { useEffect, useState } from 'react';
import { LayoutDashboard, Route, ClipboardList, Map, Truck, UsersRound, ContactRound, Wallet, Settings as SettingsIcon, Menu, X, ChevronRight, Search, Bell, UserRound, ArrowUpRight, LogOut, ShieldCheck, ArrowLeft, ChevronDown, Package, Moon, Sun } from 'lucide-react';
import { Provider, useApp } from './context';
import { Overview } from './pages/Overview';
import { Trips } from './pages/Trips';
import { TripDetail } from './pages/TripDetail';
import { Orders } from './pages/Orders';
import { Routes } from './pages/Routes';
import { Registry } from './pages/Registry';
import { Finances } from './pages/Finances';
import { Settings } from './pages/Settings';
import { Login } from './pages/Login';
import { WorkspaceUsers } from './pages/WorkspaceUsers';
import { NotificationBell } from './components/NotificationInbox';
import { Notifications } from './pages/Notifications';
import { DriverWorkspace } from './pages/DriverWorkspace';
import { Avatar, Modal, SearchInput, Empty, Button } from './components/ui';
import { canOpen, roleLabels } from './domain/workspace';
const navigation = [{
  id: 'overview',
  label: 'Apžvalga',
  icon: LayoutDashboard,
  group: 'DARBO ERDVĖ'
}, {
  id: 'trips',
  label: 'Reisai',
  icon: Route
}, {
  id: 'orders',
  label: 'Užsakymai',
  icon: ClipboardList
}, {
  id: 'routes',
  label: 'Maršrutai',
  icon: Map
}, {
  id: 'vehicles',
  label: 'Transportas',
  icon: Truck,
  group: 'REGISTRAI'
}, {
  id: 'drivers',
  label: 'Vairuotojai',
  icon: UsersRound
}, {
  id: 'customers',
  label: 'Klientai',
  icon: ContactRound
}, {
  id: 'finances',
  label: 'Finansai',
  icon: Wallet
}, {
  id: 'my-trips',
  label: 'Mano reisai',
  icon: Route,
  group: 'DARBO ERDVĖ'
}, {
  id: 'notifications',
  label: 'Pranešimai',
  icon: Bell,
  group: 'PASKYRA'
}, {
  id: 'users',
  label: 'Naudotojai',
  icon: ShieldCheck
}, {
  id: 'settings',
  label: 'Nustatymai',
  icon: SettingsIcon
}];
function Shell() {
  const {
    db,
    theme,
    toggleTheme,
    workspace,
    user,
    session,
    path,
    navigate,
    previewUser,
    returnToAdmin,
    logout
  } = useApp();
  const [mobile, setMobile] = useState(false);
  const [search, setSearch] = useState(false);
  const [account, setAccount] = useState(false);
  const [query, setQuery] = useState('');
  const section = path.split(/[/?]/)[0];
  useEffect(() => {
    document.title = 'Krypta | Transporto valdymas';
    setMobile(false);
    setSearch(false);
    setAccount(false);
  }, [path, user?.id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k' && user?.role !== 'driver') {
        e.preventDefault();
        setSearch(s => !s);
      }
      if (e.key === 'Escape') {
        setAccount(false);
        setMobile(false);
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [user]);
  if (!user) return <Login />;
  const allowed = navigation.filter(n => canOpen(user, n.id));
  const unread = workspace.notifications.filter(n => n.recipientId === user.id && !n.readAt).length;
  const current = navigation.find(n => n.id === section)?.label ?? 'Darbo erdvė';
  const q = query.trim().toLocaleLowerCase('lt');
  const results = q.length > 1 && user.role !== 'driver' ? [...db.trips.filter(t => `${t.number} ${t.name}`.toLocaleLowerCase('lt').includes(q)).map(t => ({
    name: t.name,
    sub: `Reisas · ${t.number}`,
    path: `trips/${t.id}`,
    icon: Route
  })), ...db.orders.filter(o => `${o.number} ${o.name} ${o.phone}`.toLocaleLowerCase('lt').includes(q)).map(o => ({
    name: o.name,
    sub: o.number,
    path: `orders?order=${o.id}`,
    icon: Package
  })), ...db.vehicles.filter(v => `${v.make} ${v.model} ${v.plate}`.toLocaleLowerCase('lt').includes(q)).map(v => ({
    name: `${v.make} ${v.model}`,
    sub: v.plate,
    path: `vehicles?record=${v.id}`,
    icon: Truck
  })), ...db.customers.filter(c => c.name.toLocaleLowerCase('lt').includes(q)).map(c => ({
    name: c.name,
    sub: 'Klientas',
    path: `customers?record=${c.id}`,
    icon: UserRound
  })), ...db.drivers.filter(d => `${d.firstName} ${d.lastName}`.toLocaleLowerCase('lt').includes(q)).map(d => ({
    name: `${d.firstName} ${d.lastName}`,
    sub: 'Vairuotojas',
    path: `drivers?record=${d.id}`,
    icon: UserRound
  }))].slice(0, 12) : [];
  return <div className={`review-shell ${user.role === 'driver' ? 'driver-shell' : ''}`}>
 {mobile && <div className="review-scrim" onClick={() => setMobile(false)} />}
 <aside className={`review-sidebar ${mobile ? 'open' : ''}`}><button className="review-brand" onClick={() => navigate(user.role === 'driver' ? 'my-trips' : 'overview')}><span className="review-mark"><Route size={22} /></span>krypta<span className="brand-period">.</span></button><button className="review-sidebar-close icon-button" aria-label="Uždaryti meniu" onClick={() => setMobile(false)}><X /></button><div className="company-label"><span className="company-icon"><Truck size={18} /></span><span><b>{db.settings.company}</b><small>Įmonės darbo erdvė</small></span></div><nav aria-label="Pagrindinė navigacija">{allowed.map(({
          id,
          label,
          icon: Icon,
          group
        }) => <div key={id}>{group && <span className="review-nav-group">{group}</span>}<button aria-current={section === id ? 'page' : undefined} className={section === id ? 'active' : ''} onClick={() => navigate(id)}><Icon size={19} /><span>{label}</span>{id === 'notifications' && unread > 0 && <b>{unread}</b>}{id === 'orders' && db.orders.filter(o => !o.tripId && !['completed', 'cancelled'].includes(o.status)).length > 0 && <i />}</button></div>)}</nav><div className="review-sidebar-bottom"><button className="review-profile" onClick={() => setAccount(true)}><Avatar name={user.name} /><span><b>{user.name}</b><small>{roleLabels[user.role]}</small></span><ChevronDown size={15} /></button></div></aside>
 <div className="review-main"><header className="review-topbar"><div><button className="review-mobile-menu icon-button" aria-label="Atidaryti meniu" onClick={() => setMobile(true)}><Menu /></button><span className="review-breadcrumb-company">{db.settings.company}<ChevronRight size={14} /></span><b>{current}</b></div><div>{user.role !== 'driver' && <button className="review-search-button" onClick={() => setSearch(true)}><Search size={18} /><span>Paieška</span><kbd>⌘ K</kbd></button>}<button className="theme-toggle icon-button" title={theme==='light'?'Tamsus režimas':'Šviesus režimas'} aria-label={theme==='light'?'Įjungti tamsų režimą':'Įjungti šviesų režimą'} onClick={toggleTheme}>{theme==='light'?<Moon size={20}/>:<Sun size={20}/>}</button><NotificationBell/><button className="topbar-profile" aria-label="Naudotojo meniu" onClick={() => setAccount(true)}><Avatar name={user.name} small /><ChevronDown size={15} /></button></div></header>
 {session?.returnTo && <div className="impersonation-banner"><span><ShieldCheck size={17} />Peržiūrite kaip <b>{user.name}</b><small>{roleLabels[user.role]}</small></span><button disabled={false} onClick={returnToAdmin}><ArrowLeft size={17} />Grįžti į administratorių</button></div>}
 <main id="main-content" className="main-content" key={`${user.id}-${path}`}>
 {!canOpen(user, section) ? <Empty title="Puslapis nepasiekiamas" description="Jūsų rolei ši prieiga nesuteikta."><Button onClick={() => navigate(user.role === 'driver' ? 'my-trips' : 'overview')}>Į darbo erdvę</Button></Empty> : section === 'overview' ? <Overview /> : section === 'my-trips' ? <DriverWorkspace id={path.startsWith('my-trips/') ? path.split('/')[1] : undefined} /> : section === 'trips' && path.startsWith('trips/') ? <TripDetail id={path.split('/')[1]} /> : section === 'trips' ? <Trips /> : section === 'orders' ? <Orders /> : section === 'routes' ? <Routes /> : ['vehicles', 'drivers', 'customers'].includes(section) ? <Registry kind={section as 'vehicles' | 'drivers' | 'customers'} /> : section === 'finances' ? <Finances /> : section === 'settings' ? <Settings /> : section === 'users' ? <WorkspaceUsers /> : section === 'notifications' ? <Notifications /> : <Empty title="Puslapis nerastas" />}
 <footer className="review-footer"><span>krypta.</span></footer></main></div>
 <nav className="review-bottom-nav" aria-label="Greitoji navigacija">{(user.role === 'driver' ? [{
        id: 'my-trips',
        label: 'Mano reisai',
        icon: Route
      }, {
        id: 'notifications',
        label: 'Pranešimai',
        icon: Bell
      }] : navigation.slice(0, 3)).map(({
        id,
        label,
        icon: Icon
      }) => <button key={id} className={section === id ? 'active' : ''} onClick={() => navigate(id)}><Icon size={22} /><span>{label}</span></button>)}<button onClick={() => setMobile(true)}><Menu size={22} /><span>Meniu</span></button></nav>
 {search && <Modal title="Paieška" onClose={() => setSearch(false)}><div className="modal-body"><SearchInput value={query} onChange={setQuery} placeholder="Reisas, užsakymas, vardas arba numeris..." /><div className="global-results">{results.map((r, i) => <button key={i} onClick={() => navigate(r.path)}><r.icon size={20} /><span><b>{r.name}</b><small>{r.sub}</small></span><ArrowUpRight size={17} /></button>)}{q.length > 1 && !results.length && <Empty title="Įrašų nerasta" description="Pabandykite kitą paiešką." />}</div></div></Modal>}
 {account && <Modal title="Naudotojo paskyra" onClose={() => setAccount(false)}><div className="modal-body account-menu"><div className="account-current"><Avatar name={user.name} /><div><h3>{user.name}</h3><p>{roleLabels[user.role]}</p><small>{user.email}</small></div></div>{user.role === 'admin' && <><h3>Peržiūrėti kaip naudotojas</h3>{workspace.users.filter(u => u.active && u.id !== user.id).map(u => <button key={u.id} onClick={() => {
            previewUser(u.id);
            setAccount(false);
          }}><UserRound size={20} /><span><b>{u.name}</b><small>{roleLabels[u.role]}</small></span><ArrowRightIcon /></button>)}</>}{session?.returnTo && <Button onClick={() => {
          returnToAdmin();
          setAccount(false);
        }}><ArrowLeft size={18} />Grįžti į administratorių</Button>}<Button variant="secondary" onClick={() => {
          logout();
          setAccount(false);
        }}><LogOut size={18} />Atsijungti</Button></div></Modal>}
 </div>;
}
function ArrowRightIcon() {
  return <ArrowUpRight size={18} />;
}
export default function App() {
  return <Provider><Shell /></Provider>;
}
