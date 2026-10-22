import { useState } from "react";
import {
  Plus,
  ArrowUpRight,
  ArrowRight,
  Route,
  Users,
  Package,
  Wallet,
  CalendarDays,
  Clock3,
  Truck,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useApp } from "../context";
import {
  PageHeading,
  Button,
  Stat,
  Panel,
  TextLink,
  Badge,
} from "../components/ui";
import { TripTable } from "../components/TripTable";
import { TripForm } from "../components/TripForm";
import { OrderForm } from "../components/OrderForm";
import { MapView } from "../components/MapView";
import { today, totals, money, dateLabel, loadInfo } from "../domain/logic";
export function Overview() {
  const { db, navigate } = useApp();
  const [tripForm, setTripForm] = useState(false);
  const [orderForm, setOrderForm] = useState(false);
  const [week, setWeek] = useState(0);
  const upcoming = db.trips
    .filter(
      (t) =>
        !["completed", "cancelled"].includes(t.status) &&
        t.arrival.slice(0, 10) >= today(),
    )
    .sort((a, b) => a.departure.localeCompare(b.departure));
  const featured =
    upcoming.find((t) => t.type === "international") ?? upcoming[0];
  const todays = upcoming.filter((t) => t.departure.startsWith(today()));
  const waiting = db.orders.filter(
    (o) => ["new", "confirmed"].includes(o.status) && !o.tripId,
  );
  const activeOrders = db.orders.filter(
    (o) => o.status !== "cancelled" && o.date >= today(),
  );
  const counts = {
    passengers: activeOrders
      .filter((o) => o.type === "passenger")
      .reduce((s, o) => s + o.quantity, 0),
    parcels: activeOrders
      .filter((o) => o.type === "parcel")
      .reduce((s, o) => s + o.quantity, 0),
  };
  const finances = totals(activeOrders);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today() + "T12:00:00");
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7) + i + week * 7);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      name: new Intl.DateTimeFormat("lt-LT", { weekday: "short" }).format(date),
      number: date.getDate(),
    };
  });
  return (
    <>
      <PageHeading title="Apžvalga">
        <Button variant="secondary" onClick={() => setOrderForm(true)}>
          <Plus size={17} />
          Naujas užsakymas
        </Button>
        <Button onClick={() => setTripForm(true)}>
          <Plus size={17} />
          Naujas reisas
        </Button>
      </PageHeading>
      <div className="dashboard-date">
        <span className="live-dot" />
        {new Intl.DateTimeFormat("lt-LT", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: "Europe/Vilnius",
        }).format(new Date())}
        <span className="separator">/</span>
        <span>Šiandienos reisų: {todays.length}</span>
      </div>
      <div className="stats-grid">
        <Stat
          label="Šiandienos reisai"
          value={todays.length.toString().padStart(2, "0")}
          icon={<Route size={19} />}
          detail={
            <>
              <span className="stat-dot" />
              {db.trips.filter((t) => t.status === "active").length} vykdomi
              šiuo metu
            </>
          }
          accent
        />
        <Stat
          label="Laukiantys užsakymai"
          value={waiting.length.toString().padStart(2, "0")}
          icon={<Clock3 size={19} />}
          detail={
            <button onClick={() => navigate("orders")}>
              Peržiūrėti užsakymus <ArrowUpRight size={14} />
            </button>
          }
        />
        <Stat
          label="Keleiviai ir siuntos"
          value={
            <>
              {counts.passengers}
              <span className="stat-divider">/</span>
              {counts.parcels}
            </>
          }
          icon={<Users size={19} />}
          detail="Šiandienos ir būsimų užsakymų kiekiai"
        />
        <Stat
          label="Planuojamos pajamos"
          value={money(finances.revenue)}
          icon={<Wallet size={19} />}
          detail="Šiandienos ir būsimų užsakymų vertė"
        />
      </div>
      <div className="overview-main">
        <Panel
          title="Artimiausi reisai"
          action={
            <TextLink onClick={() => navigate("trips")}>Visi reisai</TextLink>
          }
        >
          <TripTable trips={upcoming.slice(0, 4)} compact />
          <div className="panel-bottom">
            <span>
              <CalendarDays size={14} />
              Artėjantys ir vykdomi: {upcoming.length}
            </span>
            <button onClick={() => setTripForm(true)}>
              <Plus size={14} /> Planuoti reisą
            </button>
          </div>
        </Panel>
        <Panel
          title="Savaitės planas"
          action={
            <div className="week-controls">
              <button
                aria-label="Ankstesnė savaitė"
                onClick={() => setWeek((w) => w - 1)}
              >
                <ChevronLeft size={15} />
              </button>
              <button
                aria-label="Kita savaitė"
                onClick={() => setWeek((w) => w + 1)}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          }
          className="week-panel"
        >
          <div className="week-range">
            {dateLabel(days[0].key)} - {dateLabel(days[6].key)}
          </div>
          <div className="week-grid">
            {days.map((d) => {
              const ts = db.trips.filter(
                (t) =>
                  t.departure.startsWith(d.key) && t.status !== "cancelled",
              );
              return (
                <button
                  key={d.key}
                  className={d.key === today() ? "current" : ""}
                  aria-label={`${d.key}, reisų: ${ts.length}`}
                  onClick={() => navigate(`trips?date=${d.key}`)}
                >
                  <small>{d.name}</small>
                  <b>{d.number}</b>
                  <div>
                    {ts.length > 0 ? (
                      <span className="calendar-dot" />
                    ) : (
                      <span className="calendar-empty" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="week-summary">
            <span>
              <i className="legend-dot teal" />
              Tarptautiniai
            </span>
            <b>
              {
                db.trips.filter(
                  (t) =>
                    t.type === "international" &&
                    t.departure.slice(0, 10) >= days[0].key &&
                    t.departure.slice(0, 10) <= days[6].key &&
                    t.status !== "cancelled",
                ).length
              }
            </b>
          </div>
          <div className="week-summary">
            <span>
              <i className="legend-dot sand" />
              Vietiniai
            </span>
            <b>
              {
                db.trips.filter(
                  (t) =>
                    t.type === "local" &&
                    t.departure.slice(0, 10) >= days[0].key &&
                    t.departure.slice(0, 10) <= days[6].key &&
                    t.status !== "cancelled",
                ).length
              }
            </b>
          </div>
        </Panel>
      </div>
      <div className="overview-lower">
        <Panel
          title="Reiso maršrutas"
          subtitle={
            featured
              ? `${featured.number} · ${featured.name}`
              : "Suplanuokite pirmąjį reisą"
          }
          action={
            featured && (
              <TextLink onClick={() => navigate(`trips/${featured.id}`)}>
                Reiso informacija
              </TextLink>
            )
          }
          className="featured-panel"
        >
          {featured ? (
            <>
              <MapView stops={featured.stops} compact />
              <div className="route-bottom">
                <div className="route-cities">
                  {featured.stops
                    .filter((s) => !s.orderId)
                    .map((s, i) => (
                      <span key={s.id}>
                        {i > 0 && <ArrowRight size={12} />} {s.name}
                      </span>
                    ))}
                </div>
                <Badge status={featured.status} />
              </div>
            </>
          ) : (
            <p className="empty">Pridėkite reisą ir pamatykite jo maršrutą.</p>
          )}
        </Panel>
        <Panel title="Neatlikti veiksmai" className="attention-panel">
          <button className="attention-item" onClick={() => navigate("orders")}>
            <span className="attention-icon amber">
              <Package size={19} />
            </span>
            <span>
              <b>{waiting.length} nepriskirti užsakymai</b>
            </span>
            <ArrowUpRight size={17} />
          </button>
          <button
            className="attention-item"
            onClick={() => navigate("finances")}
          >
            <span className="attention-icon teal">
              <Wallet size={19} />
            </span>
            <span>
              <b>{money(totals(db.orders).balance)} laukiama mokėjimų</b>
            </span>
            <ArrowUpRight size={17} />
          </button>
          <button
            className="attention-item"
            onClick={() => navigate("vehicles")}
          >
            <span className="attention-icon blue">
              <Truck size={19} />
            </span>
            <span>
              <b>
                {db.vehicles.filter((v) => v.status === "active").length}{" "}
                aktyvios transporto priemonės
              </b>
            </span>
            <ArrowUpRight size={17} />
          </button>
        </Panel>
      </div>
      {tripForm && <TripForm onClose={() => setTripForm(false)} />}{" "}
      {orderForm && <OrderForm onClose={() => setOrderForm(false)} />}
    </>
  );
}
