import { useEffect, useState } from "react";
import { product } from "./config";
import {
  LayoutDashboard,
  Route,
  ClipboardList,
  Map,
  Truck,
  UsersRound,
  ContactRound,
  Wallet,
  Settings as SettingsIcon,
  ArrowUpRight,
  Menu,
  X,
  ChevronRight,
  Search,
  Command,
  MapPin,
  Package,
  UserRound,
} from "lucide-react";
import { serverMode } from "./services/repository";
import { Provider, useApp } from "./context";
import { Overview } from "./pages/Overview";
import { Trips } from "./pages/Trips";
import { TripDetail } from "./pages/TripDetail";
import { Orders } from "./pages/Orders";
import { Routes } from "./pages/Routes";
import { Registry } from "./pages/Registry";
import { Finances } from "./pages/Finances";
import { Settings } from "./pages/Settings";
import { Avatar, Modal, SearchInput, Empty } from "./components/ui";
const navigation = [
  { id: "overview", label: "Apžvalga", icon: LayoutDashboard },
  { id: "trips", label: "Reisai", icon: Route },
  { id: "orders", label: "Užsakymai", icon: ClipboardList },
  { id: "routes", label: "Maršrutai", icon: Map },
  { id: "vehicles", label: "Transportas", icon: Truck },
  { id: "drivers", label: "Vairuotojai", icon: UsersRound },
  { id: "customers", label: "Klientai", icon: ContactRound },
  { id: "finances", label: "Finansai", icon: Wallet },
];
function Shell() {
  const { db, path, navigate } = useApp();
  const [mobile, setMobile] = useState(false);
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState("");
  const section = path.split(/[/?]/)[0];
  const current =
    navigation.find((n) => n.id === section)?.label ?? "Nustatymai";
  useEffect(() => {
    document.title = `${product.name} | Transporto valdymas`;
    setMobile(false);
    setSearch(false);
  }, [path]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearch((s) => !s);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  const waiting = db.orders.filter(
    (o) => !o.tripId && !["completed", "cancelled"].includes(o.status),
  ).length;
  const q = query.toLocaleLowerCase("lt");
  const results =
    query.length > 1
      ? [
          ...db.trips
            .filter((t) =>
              `${t.name} ${t.number}`.toLocaleLowerCase("lt").includes(q),
            )
            .map((t) => ({
              name: t.name,
              sub: `Reisas · ${t.number}`,
              path: `trips/${t.id}`,
              icon: MapPin,
            })),
          ...db.orders
            .filter((o) =>
              `${o.name} ${o.number} ${o.phone}`
                .toLocaleLowerCase("lt")
                .includes(q),
            )
            .map((o) => ({
              name: o.name,
              sub: `Užsakymas · ${o.number}`,
              path: `orders?order=${o.id}`,
              icon: Package,
            })),
          ...db.customers
            .filter((c) => c.name.toLocaleLowerCase("lt").includes(q))
            .map((c) => ({
              name: c.name,
              sub: "Klientas",
              path: `customers?record=${c.id}`,
              icon: UserRound,
            })),
          ...db.vehicles
            .filter((v) =>
              `${v.make} ${v.model} ${v.plate}`
                .toLocaleLowerCase("lt")
                .includes(q),
            )
            .map((v) => ({
              name: `${v.make} ${v.model}`,
              sub: v.plate,
              path: `vehicles?record=${v.id}`,
              icon: Truck,
            })),
          ...db.drivers
            .filter((d) =>
              `${d.firstName} ${d.lastName}`
                .toLocaleLowerCase("lt")
                .includes(q),
            )
            .map((d) => ({
              name: `${d.firstName} ${d.lastName}`,
              sub: "Vairuotojas",
              path: `drivers?record=${d.id}`,
              icon: UserRound,
            })),
        ].slice(0, 12)
      : [];
  return (
    <div className="app-shell">
      {mobile && (
        <div className="sidebar-scrim" onClick={() => setMobile(false)} />
      )}
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <button
          className="brand"
          onClick={() => navigate("overview")}
          aria-label={`${product.name}, pagrindinis puslapis`}
        >
          <span className="brand-symbol">
            <span />
            <span />
            <span />
          </span>
          <span>
            {product.wordmark}
            <span className="brand-dot">.</span>
          </span>
        </button>
        <button
          className="mobile-close icon-button"
          aria-label="Uždaryti meniu"
          onClick={() => setMobile(false)}
        >
          <X />
        </button>
        <div className="workspace-label">TRANSPORTO VALDYMAS</div>
        <nav aria-label="Pagrindinė navigacija">
          {navigation.map(({ id, label, icon: Icon }, i) => (
            <div key={id}>
              {i === 4 && (
                <div className="nav-group-label">IŠTEKLIAI IR APSKAITA</div>
              )}
              <button
                className={section === id ? "active" : ""}
                onClick={() => navigate(id)}
              >
                <Icon size={19} />
                <span>{label}</span>
                {id === "orders" && waiting > 0 && (
                  <b className="nav-count">{waiting}</b>
                )}
                {section === id && <span className="nav-active-dot" />}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={`settings-nav ${section === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
          >
            <SettingsIcon size={18} />
            Nustatymai
          </button>
          <button
            className="workspace-user"
            onClick={() => navigate("settings")}
          >
            <Avatar name={db.settings.company} />
            <span>
              <b>{db.settings.company}</b>
              <small>Vietinė darbo erdvė</small>
            </span>
            <ChevronRight size={15} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-menu icon-button"
              aria-label="Atidaryti meniu"
              onClick={() => setMobile(true)}
            >
              <Menu size={22} />
            </button>
            <span>Darbo erdvė</span>
            <ChevronRight size={13} />
            <b>{current}</b>
          </div>
          <div className="topbar-right">
            <button className="global-search" onClick={() => setSearch(true)}>
              <Search size={16} />
              <span>Greita paieška</span>
              <kbd>Ctrl K</kbd>
            </button>
            <span className="demo-pill">
              <i />
              Demonstracinė versija
            </span>
            <span className="topbar-divider" />
            <button
              className="profile-button"
              aria-label="Atidaryti darbo erdvės nustatymus"
              onClick={() => navigate("settings")}
            >
              <Avatar name={db.settings.company} small />
            </button>
          </div>
        </header>
        <main id="main-content" className="main-content" key={path}>
          {section === "overview" ? (
            <Overview />
          ) : section === "trips" && path.startsWith("trips/") ? (
            <TripDetail id={path.split("/")[1]} />
          ) : section === "trips" ? (
            <Trips />
          ) : section === "orders" ? (
            <Orders />
          ) : section === "routes" ? (
            <Routes />
          ) : ["vehicles", "drivers", "customers"].includes(section) ? (
            <Registry kind={section as "vehicles" | "drivers" | "customers"} />
          ) : section === "finances" ? (
            <Finances />
          ) : section === "settings" ? (
            <Settings />
          ) : (
            <Empty title="Puslapis nerastas" />
          )}
          <footer className="app-footer">
            <span>
              {product.wordmark}
              <span className="teal-text">.</span>
            </span>
            <small>v{product.version}</small>
          </footer>
        </main>
      </div>
      {search && (
        <Modal
          title="Greita paieška"
          subtitle="Reisai, užsakymai, klientai ir komanda"
          onClose={() => setSearch(false)}
        >
          <div className="modal-body">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Įrašykite bent 2 simbolius..."
            />
            <div className="global-results">
              {results.map((r, i) => (
                <button
                  key={i}
                  onClick={() => {
                    navigate(r.path);
                    setSearch(false);
                  }}
                >
                  <r.icon size={19} />
                  <span>
                    <b>{r.name}</b>
                    <small>{r.sub}</small>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              ))}
              {query.length > 1 && !results.length && (
                <Empty
                  title="Nieko neradome"
                  description="Pabandykite kitą vardą, miestą arba numerį."
                />
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
export default function App() {
  return (
    <Provider>
      <Shell />
    </Provider>
  );
}
