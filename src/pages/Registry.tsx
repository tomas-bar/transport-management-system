import { useState } from "react";
import {
  Plus,
  Truck,
  UserRound,
  Building2,
  ArrowUpRight,
  SquarePen,
  Archive,
  Mail,
  Phone,
  MapPin,
} from "lucide-react";
import { entityStatuses } from "../domain/models";
import type { Vehicle, Driver, Customer } from "../domain/models";
import { useApp } from "../context";
import {
  PageHeading,
  Button,
  Panel,
  SearchInput,
  Select,
  Empty,
  Badge,
  Plate,
  Avatar,
  Modal,
} from "../components/ui";
import { RegistryForm } from "../components/RegistryForm";
import type { RegistryKind, RegistryRecord } from "../components/RegistryForm";
import { TripTable } from "../components/TripTable";
import { OrderTable } from "../components/OrderTable";
import { OrderForm } from "../components/OrderForm";
import type { Order } from "../domain/models";
import { money, totals } from "../domain/logic";
const pageInfo = {
  vehicles: {
    title: "Transportas",

    button: "Pridėti automobilį",
  },
  drivers: {
    title: "Vairuotojai",

    button: "Pridėti vairuotoją",
  },
  customers: {
    title: "Klientai",

    button: "Pridėti klientą",
  },
};
export function Registry({ kind }: { kind: RegistryKind }) {
  const { db, commit, path } = useApp();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("active");
  const [sort, setSort] = useState("asc");
  const [edit, setEdit] = useState<RegistryRecord | undefined>();
  const [form, setForm] = useState(false);
  const [detail, setDetail] = useState(
    new URLSearchParams(path.split("?")[1]).get("record") ?? "",
  );
  const [order, setOrder] = useState<Order | null>(null);
  const info = pageInfo[kind];
  const name = (r: RegistryRecord) =>
    "make" in r
      ? `${r.make} ${r.model}`
      : "firstName" in r
        ? `${r.firstName} ${r.lastName}`
        : r.name;
  const records = (db[kind] as RegistryRecord[])
    .filter(
      (r) =>
        (!status || r.status === status) &&
        (!query ||
          `${name(r)} ${"plate" in r ? r.plate : r.phone}`
            .toLocaleLowerCase("lt")
            .includes(query.toLocaleLowerCase("lt"))),
    )
    .sort(
      (a, b) =>
        (sort === "asc" ? 1 : -1) * name(a).localeCompare(name(b), "lt"),
    );
  const current = (db[kind] as RegistryRecord[]).find((r) => r.id === detail);
  const trips = current
    ? db.trips
        .filter((t) =>
          kind === "vehicles"
            ? t.vehicleId === current.id
            : kind === "drivers"
              ? t.driverId === current.id
              : false,
        )
        .sort((a, b) => b.departure.localeCompare(a.departure))
    : [];
  const customerOrders =
    current && kind === "customers"
      ? db.orders.filter((o) => o.customerId === current.id)
      : [];
  return (
    <>
      <PageHeading title={info.title}>
        <Button
          onClick={() => {
            setEdit(undefined);
            setForm(true);
          }}
        >
          <Plus size={17} />
          {info.button}
        </Button>
      </PageHeading>
      <div className="toolbar registry-toolbar">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={
            kind === "vehicles"
              ? "Markė, modelis arba numeris..."
              : "Vardas, pavadinimas arba telefonas..."
          }
        />
        <Select label="Įrašo būsena" value={status} onChange={setStatus}>
          <option value="">Visos būsenos</option>
          <option value="active">Aktyvūs</option>
          <option value="unavailable">Nepasiekiami</option>
          <option value="archived">Archyvuoti</option>
        </Select>
        <Select label="Rikiavimas" value={sort} onChange={setSort}>
          <option value="asc">Pavadinimas A-Ž</option>
          <option value="desc">Pavadinimas Ž-A</option>
        </Select>
      </div>
      {records.length ? (
        <div className="registry-grid">
          {records.map((r) => (
            <Panel key={r.id} className={`registry-card ${kind}`}>
              <div className="registry-card-top">
                {"make" in r ? (
                  <span className="vehicle-emblem">
                    <Truck size={30} />
                  </span>
                ) : (
                  <span className="registry-person-icon">
                    {kind === "customers" &&
                    (r as Customer).type === "company" ? (
                      <Building2 size={26} />
                    ) : (
                      <UserRound size={26} />
                    )}
                  </span>
                )}
                <Badge status={r.status} label={entityStatuses[r.status]} />
              </div>
              <div className="registry-card-name">
                <h2>{name(r)}</h2>
                {"make" in r ? (
                  <p>
                    {r.year} m. · {r.type}
                  </p>
                ) : "firstName" in r ? (
                  <p>Vairuotojo kategorijos: {r.categories || "nenurodyta"}</p>
                ) : (
                  <p>{r.type === "company" ? "Įmonė" : "Fizinis asmuo"}</p>
                )}
              </div>
              {"make" in r ? (
                <>
                  <Plate value={r.plate} />
                  <div className="vehicle-specs">
                    <div>
                      <small>Keleivių vietos</small>
                      <b>{r.seats}</b>
                    </div>
                    <div>
                      <small>Naudingoji apkrova</small>
                      <b>
                        {r.payload !== null ? `${r.payload} kg` : "Nežinoma"}
                      </b>
                    </div>
                    <div>
                      <small>Rida</small>
                      <b>{r.mileage.toLocaleString("lt-LT")} km</b>
                    </div>
                  </div>
                </>
              ) : (
                <div className="contact-lines">
                  <span>
                    <Phone size={14} />
                    {r.phone || "Telefonas nenurodytas"}
                  </span>
                  <span>
                    <Mail size={14} />
                    {r.email || "El. paštas nenurodytas"}
                  </span>
                </div>
              )}
              <div className="registry-card-bottom">
                <span>
                  {kind === "customers"
                    ? `Užsakymų: ${db.orders.filter((o) => o.customerId === r.id).length}`
                    : `${db.trips.filter((t) => t[kind === "vehicles" ? "vehicleId" : "driverId"] === r.id && !["completed", "cancelled"].includes(t.status)).length} suplanuoti / vykdomi reisai`}
                </span>
                <button
                  aria-label={`Atidaryti ${name(r)}`}
                  onClick={() => setDetail(r.id)}
                >
                  Informacija
                  <ArrowUpRight size={16} />
                </button>
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <Empty />
      )}
      {form && (
        <RegistryForm
          kind={kind}
          record={edit}
          onClose={() => setForm(false)}
        />
      )}{" "}
      {current && (
        <Modal
          title={name(current)}
          subtitle={
            kind === "vehicles"
              ? (current as Vehicle).plate
              : kind === "drivers"
                ? "Vairuotojo informacija"
                : "Kliento informacija"
          }
          onClose={() => setDetail("")}
          wide
        >
          <div className="modal-body">
            <div className="detail-actions">
              <Badge
                status={current.status}
                label={entityStatuses[current.status]}
              />
              <Button
                variant="secondary"
                onClick={() => {
                  setEdit(current);
                  setDetail("");
                  setForm(true);
                }}
              >
                <SquarePen size={15} />
                Redaguoti
              </Button>
              {current.status !== "archived" && (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    if (
                      confirm(
                        "Archyvuoti įrašą? Istorija išliks, naujiems reisams jo pasirinkti negalėsite.",
                      )
                    ) {
                      await commit((d) => {
                        if (
                          kind !== "customers" &&
                          d.trips.some(
                            (t) =>
                              t[
                                kind === "vehicles" ? "vehicleId" : "driverId"
                              ] === current.id &&
                              !["completed", "cancelled"].includes(t.status),
                          )
                        )
                          throw new Error(
                            "Pirmiausia perskirkite planuojamus ir vykdomus reisus.",
                          );
                        (d[kind] as RegistryRecord[]).find(
                          (r) => r.id === current.id,
                        )!.status = "archived";
                      }, "Įrašas archyvuotas");
                    }
                  }}
                >
                  <Archive size={15} />
                  Archyvuoti
                </Button>
              )}
            </div>
            {"make" in current ? (
              <div className="detail-facts">
                <div>
                  <small>Tipas</small>
                  <b>{current.type}</b>
                </div>
                <div>
                  <small>Pagaminimo metai</small>
                  <b>{current.year}</b>
                </div>
                <div>
                  <small>Didžiausioji masė</small>
                  <b>{current.maxMass} kg</b>
                </div>
                <div>
                  <small>Kuras / sąnaudos</small>
                  <b>
                    {current.fuel} · {current.consumption}{" "}
                    {current.fuel === "Elektra" ? "kWh" : "l"}/100 km
                  </b>
                </div>
                <div>
                  <small>Registruotos išlaidos</small>
                  <b>
                    {money(
                      db.expenses
                        .filter(
                          (e) =>
                            e.vehicleId === current.id ||
                            (!e.vehicleId &&
                              trips.some((t) => t.id === e.tripId)),
                        )
                        .reduce((s, e) => s + e.amount, 0),
                    )}
                  </b>
                </div>
                <div>
                  <small>Rida</small>
                  <b>{current.mileage.toLocaleString("lt-LT")} km</b>
                </div>
              </div>
            ) : (
              <div className="contact-lines">
                <span>
                  <Phone size={15} />
                  {current.phone || "Telefonas nenurodytas"}
                </span>
                <span>
                  <Mail size={15} />
                  {current.email || "El. paštas nenurodytas"}
                </span>
                {"address" in current && (
                  <span>
                    <MapPin size={15} />
                    {current.address || "Adresas nenurodytas"}
                  </span>
                )}
              </div>
            )}
            {current.notes && <p className="notice">{current.notes}</p>}
            <h3 className="section-title">
              {kind === "customers"
                ? "Užsakymų istorija"
                : "Priskirti reisai ir istorija"}
            </h3>
            {kind === "customers" ? (
              <>
                <p className="muted">
                  Užsakymų vertė: {money(totals(customerOrders).revenue)} · Liko
                  mokėti: {money(totals(customerOrders).balance)}
                </p>
                <OrderTable
                  orders={customerOrders}
                  onEdit={(o) => {
                    setDetail("");
                    setOrder(o);
                  }}
                />
              </>
            ) : (
              <TripTable trips={trips} />
            )}
          </div>
          <footer>
            <Button onClick={() => setDetail("")}>Uždaryti</Button>
          </footer>
        </Modal>
      )}
      {order && <OrderForm order={order} onClose={() => setOrder(null)} />}
    </>
  );
}
