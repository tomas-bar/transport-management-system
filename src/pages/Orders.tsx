import { useState } from "react";
import { Plus, Download, CheckCircle2, X, Link2 } from "lucide-react";
import type { Order } from "../domain/models";
import { orderStatuses } from "../domain/models";
import { saveOrder, syncOrderStops, hasAgreedPrice } from "../domain/logic";
import { useApp } from "../context";
import {
  PageHeading,
  Button,
  Panel,
  SearchInput,
  Select,
  Modal,
  Field,
} from "../components/ui";
import { OrderTable } from "../components/OrderTable";
import { OrderForm } from "../components/OrderForm";
import { csv } from "../services/export";
export function Orders() {
  const { db, commit, busy, path } = useApp();
  const initialOrder = db.orders.find(
    (o) => o.id === new URLSearchParams(path.split("?")[1]).get("order"),
  );
  const [edit, setEdit] = useState<Order | undefined>(initialOrder);
  const [form, setForm] = useState(!!initialOrder);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [payment, setPayment] = useState("");
  const [sort, setSort] = useState("date");
  const [selected, setSelected] = useState<string[]>([]);
  const [assignment, setAssignment] = useState(false);
  const [tripId, setTripId] = useState("");
  const filtered = db.orders
    .filter(
      (o) =>
        (!query ||
          `${o.number} ${o.name} ${o.phone} ${o.pickup.name} ${o.delivery.name}`
            .toLocaleLowerCase("lt")
            .includes(query.toLocaleLowerCase("lt"))) &&
        (!type || o.type === type) &&
        (!status || o.status === status) &&
        (!payment ||
          (payment === "paid"
            ? hasAgreedPrice(o) && o.paid >= o.price
            : payment === "unpriced"
              ? !hasAgreedPrice(o)
              : hasAgreedPrice(o) && o.paid < o.price)),
    )
    .sort((a, b) =>
      sort === "price"
        ? b.price - a.price
        : sort === "name"
          ? a.name.localeCompare(b.name, "lt")
          : b.date.localeCompare(a.date),
    );
  return (
    <>
      <PageHeading title="Užsakymai">
        <Button
          variant="secondary"
          onClick={() =>
            csv(
              [
                "Numeris",
                "Tipas",
                "Pavadinimas",
                "Paėmimas",
                "Pristatymas",
                "Data",
                "Kiekis",
                "Kaina EUR",
                "Sumokėta EUR",
                "Būsena",
              ],
              filtered.map((o) => [
                o.number,
                o.type === "passenger" ? "Keleiviai" : "Siunta",
                o.name,
                o.pickup.address,
                o.delivery.address,
                o.date,
                o.quantity,
                (o.price / 100).toFixed(2),
                (o.paid / 100).toFixed(2),
                orderStatuses[o.status],
              ]),
              "krypta-uzsakymai.csv",
            )
          }
        >
          <Download size={16} />
          CSV eksportas
        </Button>
        <Button
          onClick={() => {
            setEdit(undefined);
            setForm(true);
          }}
        >
          <Plus size={17} />
          Naujas užsakymas
        </Button>
      </PageHeading>
      <div className="module-tabs">
        <button className={!type ? "selected" : ""} onClick={() => setType("")}>
          Visi užsakymai <span>{db.orders.length}</span>
        </button>
        <button
          className={type === "passenger" ? "selected" : ""}
          onClick={() => setType("passenger")}
        >
          Keleivių vežimas
        </button>
        <button
          className={type === "parcel" ? "selected" : ""}
          onClick={() => setType("parcel")}
        >
          Siuntos ir kroviniai
        </button>
      </div>
      <Panel>
        <div className="toolbar">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Vardas, numeris arba miestas..."
          />
          <Select label="Užsakymo būsena" value={status} onChange={setStatus}>
            <option value="">Visos būsenos</option>
            {Object.entries(orderStatuses).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Select label="Mokėjimas" value={payment} onChange={setPayment}>
            <option value="">Visi mokėjimai</option>
            <option value="paid">Apmokėta</option>
            <option value="unpaid">Liko mokėti</option>
            <option value="unpriced">Kaina nenurodyta</option>
          </Select>
          <Select label="Rikiavimas" value={sort} onChange={setSort}>
            <option value="date">Pagal datą</option>
            <option value="name">Pagal pavadinimą</option>
            <option value="price">Pagal kainą</option>
          </Select>
        </div>
        {selected.length > 0 && (
          <div className="bulk-bar">
            <b>Pažymėta: {selected.length}</b>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                commit((d) => {
                  d.orders
                    .filter(
                      (o) =>
                        selected.includes(o.id) && o.status !== "cancelled",
                    )
                    .forEach((o) => (o.paid = o.price));
                }, "Mokėjimai užregistruoti")
              }
            >
              <CheckCircle2 size={15} />
              Apmokėta
            </Button>
            <Button variant="secondary" onClick={() => setAssignment(true)}>
              <Link2 size={15} />
              Priskirti reisui
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                if (
                  confirm(
                    "Atšaukti pažymėtus užsakymus? Jie bus atskirti nuo reisų. Mokėjimų istorija išliks.",
                  )
                ) {
                  if (
                    await commit((d) => {
                      for (const o of d.orders.filter((o) =>
                        selected.includes(o.id),
                      )) {
                        if (o.status === "completed")
                          throw new Error(
                            "Įvykdyto užsakymo atšaukti negalima.",
                          );
                        o.status = "cancelled";
                        o.tripId = "";
                        syncOrderStops(d, o);
                      }
                    }, "Užsakymai atšaukti")
                  )
                    setSelected([]);
                }
              }}
            >
              <X size={15} />
              Atšaukti užsakymus
            </Button>
            <button className="text-link" onClick={() => setSelected([])}>
              Nuimti žymėjimą
            </button>
          </div>
        )}
        <OrderTable
          orders={filtered}
          onEdit={(o) => {
            setEdit(o);
            setForm(true);
          }}
          selected={selected}
          onSelect={setSelected}
        />
        <div className="panel-bottom">
          <span>
            Rodoma užsakymų: {filtered.length} iš {db.orders.length}
          </span>
          <span>Sumos eurais</span>
        </div>
      </Panel>
      {form && <OrderForm order={edit} onClose={() => setForm(false)} />}{" "}
      {assignment && (
        <Modal
          title="Priskirti užsakymus reisui"
          subtitle={`Pasirinkta užsakymų: ${selected.length}`}
          onClose={() => setAssignment(false)}
        >
          <div className="modal-body">
            <Field label="Reisas">
              <select
                value={tripId}
                onChange={(e) => setTripId(e.target.value)}
              >
                <option value="">Pasirinkite reisą</option>
                {db.trips
                  .filter((t) => !["completed", "cancelled"].includes(t.status))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.number} · {t.name} · {t.departure.slice(0, 10)}
                    </option>
                  ))}
              </select>
            </Field>
            <p className="notice">
              Bus patikrintos datos, keleivių vietos ir žinoma siuntų apkrova.
              Užsakymų adresai atsiras reiso sustojimuose.
            </p>
          </div>
          <footer>
            <Button variant="secondary" onClick={() => setAssignment(false)}>
              Atšaukti
            </Button>
            <Button
              disabled={!tripId || busy}
              onClick={async () => {
                if (
                  await commit((d) => {
                    for (const o of d.orders.filter((o) =>
                      selected.includes(o.id),
                    )) {
                      if (["completed", "cancelled"].includes(o.status))
                        throw new Error(
                          "Užbaigtų ir atšauktų užsakymų priskirti negalima.",
                        );
                      saveOrder(d, { ...o, tripId });
                    }
                  }, "Užsakymai priskirti reisui")
                ) {
                  setAssignment(false);
                  setSelected([]);
                }
              }}
            >
              Priskirti
            </Button>
          </footer>
        </Modal>
      )}
    </>
  );
}
