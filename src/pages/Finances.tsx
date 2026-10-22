import { PdfMenu } from "../components/PdfMenu";
import { useState } from "react";
import {
  Plus,
  Download,
  Printer,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Clock3,
  SquarePen,
  Trash2,
} from "lucide-react";
import type { Expense, Order } from "../domain/models";
import { expenseCategories } from "../domain/models";
import { useApp } from "../context";
import {
  PageHeading,
  Button,
  Panel,
  Stat,
  SearchInput,
  Select,
  Modal,
  Field,
  Empty,
} from "../components/ui";
import { OrderTable } from "../components/OrderTable";
import { OrderForm } from "../components/OrderForm";
import { today, totals, money, dateLabel, uid } from "../domain/logic";
import { csv } from "../services/export";
export function Finances() {
  const { db, commit, busy } = useApp();
  const [from, setFrom] = useState(today().slice(0, 7) + "-01");
  const [to, setTo] = useState(() => {
    const d = new Date(today() + "T12:00:00");
    d.setMonth(d.getMonth() + 1, 0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [tab, setTab] = useState("expenses");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("date");
  const [edit, setEdit] = useState<Expense | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const orders = db.orders.filter(
    (o) => o.date >= from && o.date <= to && o.status !== "cancelled",
  );
  const expenses = db.expenses.filter((e) => e.date >= from && e.date <= to);
  const finances = totals(orders, expenses);
  const filtered = expenses
    .filter(
      (e) =>
        (!query ||
          `${e.description} ${e.category} ${db.trips.find((t) => t.id === e.tripId)?.number ?? ""}`
            .toLocaleLowerCase("lt")
            .includes(query.toLocaleLowerCase("lt"))) &&
        (!category || e.category === category),
    )
    .sort((a, b) =>
      sort === "amount" ? b.amount - a.amount : b.date.localeCompare(a.date),
    );
  const unpaid = orders.filter((o) => o.paid < o.price);
  function exportCsv() {
    csv(
      [
        "Įrašo tipas",
        "Numeris / kategorija",
        "Data",
        "Aprašymas",
        "Užsakymų vertė EUR",
        "Gauta EUR",
        "Išlaidos EUR",
        "Liko mokėti EUR",
      ],
      [
        ...orders.map((o) => [
          "Užsakymas",
          o.number,
          o.date,
          o.name,
          (o.price / 100).toFixed(2),
          (o.paid / 100).toFixed(2),
          "",
          ((o.price - o.paid) / 100).toFixed(2),
        ]),
        ...expenses.map((e) => [
          "Išlaidos",
          e.category,
          e.date,
          e.description,
          "",
          "",
          (e.amount / 100).toFixed(2),
          "",
        ]),
      ],
      `krypta-finansai-${from}.csv`,
    );
  }
  return (
    <>
      <PageHeading title="Finansai">
        <PdfMenu period={{ from, to }} />
        <Button variant="secondary" onClick={exportCsv}>
          <Download size={16} />
          CSV eksportas
        </Button>
        <Button
          onClick={() =>
            setEdit({
              id: uid(),
              date: today(),
              category: "Degalai",
              amount: 0,
              tripId: "",
              vehicleId: "",
              description: "",
            })
          }
        >
          <Plus size={16} />
          Pridėti išlaidas
        </Button>
      </PageHeading>
      <div className="period-filter">
        <span>Laikotarpis</span>
        <label>
          Nuo
          <input
            type="date"
            aria-label="Laikotarpio pradžia"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <span>→</span>
        <label>
          Iki
          <input
            type="date"
            aria-label="Laikotarpio pabaiga"
            min={from}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button
          onClick={() => {
            setFrom(today().slice(0, 7) + "-01");
            const d = new Date(today() + "T12:00:00");
            d.setMonth(d.getMonth() + 1, 0);
            setTo(
              `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
            );
          }}
        >
          Šis mėnuo
        </button>
        <button
          onClick={() => {
            setFrom("2000-01-01");
            setTo("2099-12-31");
          }}
        >
          Visas laikotarpis
        </button>
      </div>
      <div className="stats-grid finance-stats">
        <Stat
          label="Užsakymų vertė"
          value={money(finances.revenue)}
          detail={`${orders.length} užsakymai pagal kelionės datą`}
          icon={<Wallet size={19} />}
          accent
        />
        <Stat
          label="Gauti mokėjimai"
          value={money(finances.paid)}
          detail="Pasirinkto laikotarpio užsakymams"
          icon={<ArrowDownLeft size={19} />}
        />
        <Stat
          label="Registruotos išlaidos"
          value={money(finances.spent)}
          detail={`${expenses.length} išlaidų įrašai`}
          icon={<ArrowUpRight size={19} />}
        />
        <Stat
          label="Liko mokėti"
          value={money(finances.balance)}
          detail={`${unpaid.length} nevisiškai apmokėti užsakymai`}
          icon={<Clock3 size={19} />}
        />
      </div>
      <div className="result-strip">
        <div>
          <h3>Preliminarus rezultatas</h3>
        </div>
        <b className={finances.result < 0 ? "negative" : ""}>
          {money(finances.result)}
        </b>
      </div>
      <div className="module-tabs">
        <button
          className={tab === "expenses" ? "selected" : ""}
          onClick={() => setTab("expenses")}
        >
          Išlaidos <span>{expenses.length}</span>
        </button>
        <button
          className={tab === "unpaid" ? "selected" : ""}
          onClick={() => setTab("unpaid")}
        >
          Neapmokėti užsakymai <span>{unpaid.length}</span>
        </button>
        <button
          className={tab === "orders" ? "selected" : ""}
          onClick={() => setTab("orders")}
        >
          Visi mokėjimai
        </button>
      </div>
      <Panel>
        {tab === "expenses" ? (
          <>
            <div className="toolbar">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Ieškoti išlaidų arba reiso..."
              />
              <Select
                label="Išlaidų kategorija"
                value={category}
                onChange={setCategory}
              >
                <option value="">Visos kategorijos</option>
                {expenseCategories.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </Select>
              <Select
                label="Išlaidų rikiavimas"
                value={sort}
                onChange={setSort}
              >
                <option value="date">Naujausios pirmiau</option>
                <option value="amount">Didžiausios pirmiau</option>
              </Select>
            </div>
            {filtered.length ? (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Kategorija / aprašymas</th>
                      <th>Data</th>
                      <th>Priskyrimas</th>
                      <th>Suma</th>
                      <th>Veiksmai</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <b>{e.category}</b>
                          <div className="table-sub">
                            {e.description || "Be aprašymo"}
                          </div>
                        </td>
                        <td>{dateLabel(e.date)}</td>
                        <td>
                          <b>
                            {db.trips.find((t) => t.id === e.tripId)?.number ??
                              "Bendros išlaidos"}
                          </b>
                          <div className="table-sub">
                            {db.vehicles.find((v) => v.id === e.vehicleId)
                              ?.plate ?? "Automobilis nenurodytas"}
                          </div>
                        </td>
                        <td>
                          <b>{money(e.amount)}</b>
                        </td>
                        <td>
                          <div className="inline-actions">
                            <button
                              className="icon-button"
                              aria-label={`Redaguoti išlaidas ${e.description}`}
                              onClick={() => setEdit(structuredClone(e))}
                            >
                              <SquarePen size={16} />
                            </button>
                            <button
                              className="icon-button danger-icon"
                              aria-label={`Ištrinti išlaidas ${e.description}`}
                              onClick={async () => {
                                if (
                                  confirm(
                                    "Ištrinti šį išlaidų įrašą? Veiksmą galėsite atšaukti pranešime.",
                                  )
                                )
                                  await commit((d) => {
                                    d.expenses = d.expenses.filter(
                                      (x) => x.id !== e.id,
                                    );
                                  }, "Išlaidos ištrintos");
                              }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="Išlaidų nerasta" />
            )}
          </>
        ) : (
          <OrderTable
            orders={tab === "unpaid" ? unpaid : orders}
            onEdit={setOrder}
          />
        )}
        <div className="panel-bottom">
          <span>
            {from} - {to}
          </span>
          <span>Valiuta: EUR</span>
        </div>
      </Panel>
      {order && <OrderForm order={order} onClose={() => setOrder(null)} />}{" "}
      {edit && (
        <Modal
          title={
            db.expenses.some((e) => e.id === edit.id)
              ? "Redaguoti išlaidas"
              : "Naujos išlaidos"
          }
          onClose={() => setEdit(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await commit((d) => {
                  if (edit.amount <= 0)
                    throw new Error("Išlaidų suma turi būti didesnė už nulį.");
                  const index = d.expenses.findIndex((x) => x.id === edit.id);
                  if (index >= 0) d.expenses[index] = edit;
                  else d.expenses.push(edit);
                }, "Išlaidos išsaugotos")
              )
                setEdit(null);
            }}
          >
            <div className="modal-body">
              <div className="form-grid">
                <Field label="Kategorija">
                  <select
                    value={edit.category}
                    onChange={(e) =>
                      setEdit({ ...edit, category: e.target.value })
                    }
                  >
                    {expenseCategories.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Data *">
                  <input
                    type="date"
                    required
                    value={edit.date}
                    onChange={(e) => setEdit({ ...edit, date: e.target.value })}
                  />
                </Field>
                <Field label="Suma, € *">
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={edit.amount / 100}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        amount: Math.round(Number(e.target.value) * 100),
                      })
                    }
                  />
                </Field>
                <Field label="Reisas">
                  <select
                    value={edit.tripId}
                    onChange={(e) => {
                      const t = db.trips.find((t) => t.id === e.target.value);
                      setEdit({
                        ...edit,
                        tripId: e.target.value,
                        vehicleId: t?.vehicleId ?? edit.vehicleId,
                      });
                    }}
                  >
                    <option value="">Nepriskirta reisui</option>
                    {db.trips.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.number} · {t.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Transporto priemonė" full>
                  <select
                    value={edit.vehicleId}
                    onChange={(e) =>
                      setEdit({ ...edit, vehicleId: e.target.value })
                    }
                  >
                    <option value="">Nepriskirta automobiliui</option>
                    {db.vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.make} {v.model} · {v.plate}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Aprašymas" full>
                  <textarea
                    maxLength={1000}
                    rows={2}
                    value={edit.description}
                    onChange={(e) =>
                      setEdit({ ...edit, description: e.target.value })
                    }
                  />
                </Field>
              </div>
            </div>
            <footer>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEdit(null)}
              >
                Atšaukti
              </Button>
              <Button type="submit" disabled={busy}>
                Išsaugoti išlaidas
              </Button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}
