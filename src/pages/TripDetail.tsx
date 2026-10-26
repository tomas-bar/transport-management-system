import { TripReview } from '../components/TripReview';
import { TripCounts } from '../components/TripCounts';
import { TripScenario } from '../components/calculator/TripScenario';
import { RepeatTrip } from '../components/RepeatTrip';
import { useConfirm } from '../components/Feedback';
import {contactWarnings} from '../domain/planning';
import {TripPhotos} from '../components/OrderPhotos';
import { TripFinance } from "../components/TripFinance";
import { TripActivity } from "../components/TripActivity";
import { Journey } from "../components/Journey";
import { PdfMenu } from "../components/PdfMenu";
import { routeVisits } from "../domain/route-plan";
import { isDraft, isHistorical } from '../domain/record-mode';
import { useState } from "react";
import {
  ArrowLeft,
  Copy,
  SquarePen,
  CheckCircle2,
  X,
  Play,
  Users,
  Package,
  Wallet,
  Truck,
  CalendarDays,
  MapPin,
  Plus,
  ExternalLink,
  Printer,
  AlertTriangle,
  UserRound,
  Camera,
} from "lucide-react";
import { useApp } from "../context";
import {
  PageHeading,
  Button,
  Panel,
  Badge,
  TripBadge,
  Plate,
  Avatar,
  Empty,
} from "../components/ui";
import { MapView } from "../components/MapView";
import { StopEditor } from "../components/StopEditor";
import { TripForm } from "../components/TripForm";
import { OrderForm } from "../components/OrderForm";
import { OrderTable } from "../components/OrderTable";
import {
  saveTrip,
  tripOrders,
  loadInfo,
  totals,
  money,
  dateLabel,
} from "../domain/logic";
import { googleMapsParts } from "../services/maps";
import type { Order, TripStatus } from "../domain/models";
export function TripDetail({ id }: { id: string }) {
  const confirm = useConfirm();
  const { db, commit, navigate, busy, modules } = useApp();
  const trip = db.trips.find((t) => t.id === id);
  const [edit, setEdit] = useState(false);
  const [review, setReview] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [orderEdit, setOrderEdit] = useState<Order | undefined>();
  const [orderForm, setOrderForm] = useState(false);
  const [fromUnlisted, setFromUnlisted] = useState<Order['type']>();
  const [tab, setTab] = useState("route");
  const [assign, setAssign] = useState(false);
  const [candidate, setCandidate] = useState("");
  if (!trip)
    return (
      <Empty title="Reisas nerastas">
        <Button onClick={() => navigate("trips")}>Grįžti į reisus</Button>
      </Empty>
    );
  const t = trip;
  const vehicle = db.vehicles.find((v) => v.id === t.vehicleId);
  const driver = db.drivers.find((d) => d.id === t.driverId);
  const draft = isDraft(t);
  const historical = isHistorical(t);
  const orders = tripOrders(db, t.id);
  const load = loadInfo(db, t);
  const finance = totals(
    orders,
    db.expenses.filter((e) => e.tripId === t.id),
  );
  const closed = ["completed", "cancelled"].includes(t.status);
  const parts = googleMapsParts(t.stops);
  const displayedStops =
    t.status === "completed"
      ? t.stops.map((s) => ({ ...s, completed: true }))
      : t.stops;
  async function status(next: TripStatus) {
    if (
      (next === "completed" || next === "cancelled") &&
      !await confirm(
        next === "completed"
          ? "Užbaigti reisą ir pažymėti jo užsakymus įvykdytais?"
          : "Atšaukti reisą? Jo užsakymai bus grąžinti į nepriskirtų užsakymų sąrašą.",
      )
    )
      return;
    await commit((d) => {
      saveTrip(d, { ...t, status: next });
    }, "Reiso būsena atnaujinta");
  }
  return (
    <>
      <button className="back-link" onClick={() => navigate("trips")}>
        <ArrowLeft size={15} />
        Visi reisai
      </button>
      <PageHeading
        eyebrow={`${t.number} · ${t.type === "international" ? "TARPTAUTINIS REISAS" : "VIETINIS REISAS"}`}
        title={t.name}
        description={`${dateLabel(t.departure, true)} → ${dateLabel(t.arrival, true)} · Lietuvos laiku`}
      >
        <PdfMenu trip={t} />
        <Button variant="secondary" onClick={() => setRepeat(true)}><Copy size={16} />Kartoti</Button>
        <Button variant="secondary" onClick={() => setEdit(true)}>
          <SquarePen size={16} />
          Redaguoti
        </Button>
        {!closed &&
          (draft ? <Button disabled={busy} onClick={async () => {
            if (await confirm('Patikrinti išteklius ir paskelbti reisą priskirtam vairuotojui?', { title: 'Paskelbti reisą', confirmLabel: 'Paskelbti reisą' })) {
              await commit(db => saveTrip(db, { ...t, recordMode: undefined }), 'Reisas paskelbtas');
            }
          }}>Paskelbti reisą</Button> : t.status === "active" ? (
            <Button disabled={busy} onClick={() => setReview(true)}>
              <CheckCircle2 size={16} />
              Užbaigti reisą
            </Button>
          ) : (
            <Button disabled={busy} onClick={() => status("active")}>
              <Play size={16} />
              Pradėti reisą
            </Button>
          ))}
      </PageHeading>
      <div className="trip-summary-strip">
        <TripBadge trip={t} />
        <span>
          <CalendarDays size={16} />
          {t.departure.slice(0, 10)} · {t.departure.slice(11)}
        </span>
        <span>
          <Truck size={16} />
          {vehicle ? <>{vehicle.make} {vehicle.model} <Plate value={vehicle.plate} /></> : 'Transportas nepriskirtas'}
        </span>
        <span>
          <UserRound size={16} />
          {driver ? `${driver.firstName} ${driver.lastName}` : 'Vairuotojas nepriskirtas'}
        </span>
      </div>
      <Journey trip={t} />
      {draft && <p className="record-mode-banner">Juodraštis. Vairuotojui nematomas, pranešimai nesiunčiami.</p>}
      {historical && <p className="record-mode-banner">Istorinis įrašas. Užsakymai ir išlaidos pridedami be pranešimų.</p>}
      {!closed && !draft && <div className="trip-delivery-progress">
        <span><CheckCircle2 size={18} /><b>{orders.length ? `Pristatyta užsakymų: ${orders.filter(order => order.status === 'completed').length} / ${orders.length}` : 'Reisas be vardinių užsakymų'}</b></span>
        <Button variant="secondary" disabled={busy} onClick={() => setReview(true)}>Reiso suvestinė</Button>
      </div>}
      <TripActivity tripId={t.id}/>
      <TripScenario tripId={t.id} />
      <div className="operational-warnings">{contactWarnings(db,t.id).map(w=><p key={w.orderId+w.message}>{w.message}</p>)}</div>
      <div className="trip-kpis">
        <div>
          <Users size={20} />
          <span>
            <small>Keleivių vietos</small>
            <b>
              {load.passengers} <span>/ {vehicle ? load.capacity : '?'}</span>
            </b>
          </span>
          <div className="capacity-bar">
            <span
              style={{
                width: `${load.capacity ? (load.passengers / load.capacity) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
        <div>
          <Package size={20} />
          <span>
            <small>Siuntos / svoris</small>
            <b>
              {load.parcels}{" "}
              <span>
                vnt. · {load.weight} kg
                {load.unknown ? " + nežinomas svoris" : ""}
              </span>
            </b>
          </span>
        </div>
        {modules.includes("finance")&&<div>
          <Wallet size={20} />
          <span>
            <small>Užsakymų vertė</small>
            <b>{money(finance.revenue)}</b>
          </span>
        </div>}
        <div>
          <MapPin size={20} />
          <span>
            <small>Maršruto sustojimai</small>
            <b>
              {routeVisits(t.stops).length} <span>sustojimai</span>
            </b>
          </span>
        </div>
      </div>
      {(load.unknown || load.payload === null) && load.parcels > 0 && (
        <p className="warning">
          <AlertTriangle size={17} />{" "}
          {load.unknown ? "Dalis siuntų neturi nurodyto svorio. " : ""}
          {load.payload === null
            ? "Automobilio naudingoji apkrova nežinoma. "
            : ""}
          Krovinio tinkamumą būtina patikrinti prieš išvykstant.
        </p>
      )}
      <div className="module-tabs">
        <button
          className={tab === "route" ? "selected" : ""}
          onClick={() => setTab("route")}
        >
          Maršrutas ir sustojimai
        </button>
        <button
          className={tab === "orders" ? "selected" : ""}
          onClick={() => setTab("orders")}
        >
          Keleiviai ir siuntos <span>{load.passengers + load.parcels}</span>
        </button>
        <button
          className={tab === "finance" ? "selected" : ""}
          onClick={() => setTab("finance")}
        >
          {modules.includes("finance")?"Finansai ir pastabos":"Komanda ir pastabos"}
        </button>
        {modules.includes('photos') && <button className={tab === 'photos' ? 'selected' : ''} onClick={() => setTab('photos')}>
          <Camera size={16} />Nuotraukos
        </button>}
      </div>
      {tab === "route" && (
        <div className="trip-route-layout">
          <Panel title="Kelionės maršrutas">
            <MapView
              stops={displayedStops}
              onStopsChange={
                closed || draft
                  ? undefined
                  : (stops) =>
                      commit((d) => {
                        d.trips.find((x) => x.id === t.id)!.stops = stops;
                      }, "Sustojimo būsena atnaujinta")
              }
            />
            <div className="navigation-links">
              {parts.map((part, i) => (
                <a
                  key={i}
                  href={part.url}
                  title={part.detail}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={15} />
                  {part.label}
                </a>
              ))}
              {parts.length > 1 && (
                <small>„Google Maps“ · {parts.length} maršruto dalys</small>
              )}
            </div>
            <div className="trip-notes">
              <h3>Reiso pastabos</h3>
              <p>{t.notes || "Pastabų nėra."}</p>
            </div>
          </Panel>
          <Panel title="Sustojimų seka" className="stops-panel">
            <StopEditor
              tripId={t.id}
              canConfirmArrival={!draft}
              stops={displayedStops}
              readOnly={closed}
              onChange={(stops) =>
                commit((d) => {
                  d.trips.find((x) => x.id === t.id)!.stops = stops;
                }, "Sustojimai išsaugoti")
              }
            />
          </Panel>
        </div>
      )}
      {tab === "orders" && (
        <Panel
          title="Keleiviai ir siuntos"
          subtitle={`${load.passengers} keleiviai · ${load.parcels} siuntos`}
          action={
            (!closed || historical) && (
              <div className="inline-actions">
                {!historical && <Button variant="secondary" onClick={() => setAssign((x) => !x)}>Priskirti esamą</Button>}
                <Button
                  onClick={() => {
                    setOrderEdit(undefined);
                    setFromUnlisted(undefined);
                    setOrderForm(true);
                  }}
                >
                  <Plus size={16} />
                  {historical ? 'Istorinis užsakymas' : 'Naujas užsakymas'}
                </Button>
              </div>
            )
          }
        >
          <TripCounts trip={t} onDetail={kind => { setOrderEdit(undefined); setFromUnlisted(kind); setOrderForm(true); }}/>
          {assign && (
            <div className="extra-filters">
              <select
                aria-label="Pasirinkite nepriskirtą užsakymą"
                value={candidate}
                onChange={(e) => setCandidate(e.target.value)}
              >
                <option value="">Pasirinkite nepriskirtą užsakymą</option>
                {db.orders
                  .filter(
                    (o) =>
                      !o.tripId &&
                      !["completed", "cancelled"].includes(o.status),
                  )
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.number} · {o.name} · {o.date}
                    </option>
                  ))}
              </select>
              <Button
                disabled={!candidate}
                onClick={() => {
                  setOrderEdit({
                    ...db.orders.find((o) => o.id === candidate)!,
                    tripId: t.id,
                  });
                  setFromUnlisted(undefined);
                  setOrderForm(true);
                }}
              >
                Peržiūrėti ir priskirti
              </Button>
            </div>
          )}
          <OrderTable
            orders={orders}
            showPayments={false}
            onEdit={(o) => {
              setOrderEdit(o);
              setFromUnlisted(undefined);
              setOrderForm(true);
            }}
          />
        </Panel>
      )}
      {tab === "finance" && (<>
        <div className="detail-two-col">
          {modules.includes("finance")&&!draft&&<Panel title="Finansinė suvestinė">
            <div className="finance-lines">
              {((t.unlisted?.passengers ?? 0) + (t.unlisted?.parcels ?? 0)) > 0 && <p className="muted">Kiekiai be sąrašo į pajamas neįtraukti. Čia rodomos tik užsakymuose įrašytos sumos.</p>}
              <div>
                <span>Užsakymų vertė</span>
                <b>{money(finance.revenue)}</b>
              </div>
              <div>
                <span>Gauti mokėjimai</span>
                <b className="teal-text">{money(finance.paid)}</b>
              </div>
              <div>
                <span>Liko mokėti</span>
                <b>{money(finance.balance)}</b>
              </div>
              <div>
                <span>Registruotos išlaidos</span>
                <b>{money(finance.spent)}</b>
              </div>
              <div className="total">
                <span>Preliminarus rezultatas</span>
                <b>{money(finance.result)}</b>
              </div>
            </div>
            <Button variant="secondary" onClick={() => navigate("finances")}>
              Atidaryti finansus
            </Button>
          </Panel>}
          <Panel title="Komanda ir pastabos">
            <div className="detail-person">
              <UserRound size={20} />
              <div>
                <b>
                  {driver ? `${driver.firstName} ${driver.lastName}` : 'Vairuotojas nepriskirtas'}
                </b>
                <p>{driver?.phone || "Telefonas nenurodytas"}</p>
              </div>
            </div>
            <div className="trip-notes">
              <h3>Pastabos</h3>
              <p>{t.notes || "Pastabų nėra."}</p>
            </div>
            {!closed && (
              <Button variant="danger" onClick={() => status("cancelled")}>
                <X size={16} />
                Atšaukti reisą
              </Button>
            )}
          </Panel>
        </div><TripFinance tripId={t.id}/></>
      )}
      {tab === 'photos' && <TripPhotos tripId={t.id}/>}
      {review && <TripReview tripId={t.id} onClose={() => setReview(false)} />}{repeat && <RepeatTrip sourceId={t.id} onClose={() => setRepeat(false)} />}{edit && <TripForm trip={t} onClose={() => setEdit(false)} />}{" "}
      {orderForm && (
        <OrderForm
          order={orderEdit}
          tripId={t.id}
          fromUnlisted={fromUnlisted}
          onClose={() => setOrderForm(false)}
        />
      )}
    </>
  );
}
