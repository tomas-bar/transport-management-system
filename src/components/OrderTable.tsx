import {
  Users,
  Package,
  SquarePen,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { orderStatuses } from "../domain/models";
import type { Order } from "../domain/models";
import { useApp } from "../context";
import { Badge, Empty } from "./ui";
import { dateLabel, money, hasAgreedPrice } from "../domain/logic";
export function OrderTable({
  orders,
  onEdit,
  selected,
  onSelect,
  showPayments = true,
}: {
  orders: Order[];
  onEdit: (o: Order) => void;
  selected?: string[];
  onSelect?: (ids: string[]) => void;
  showPayments?: boolean;
}) {
  const { db, commit, busy, modules } = useApp();
  showPayments = showPayments && modules.includes("finance");
  if (!orders.length) return <Empty title="Užsakymų nerasta" />;
  return (
    <>
    <div className="order-mobile-list">
      {onSelect && <label className="order-select-all"><input type="checkbox" checked={orders.every(o => selected?.includes(o.id))} onChange={e => onSelect(e.target.checked ? orders.map(o => o.id) : [])}/>Pažymėti visus</label>}
      {orders.map(o => <article className="order-mobile-card" key={o.id}>
        <header><span>{onSelect && <input type="checkbox" aria-label={`Pažymėti ${o.number}`} checked={selected?.includes(o.id) ?? false} onChange={e => onSelect(e.target.checked ? [...(selected ?? []), o.id] : (selected ?? []).filter(id => id !== o.id))}/>}<span>{o.number} · {dateLabel(o.date)}</span></span><Badge status={o.status}/></header>
        <button className="order-card-name" onClick={() => onEdit(o)}><span className={`type-icon ${o.type}`}>{o.type === 'passenger' ? <Users size={19}/> : <Package size={19}/>}</span><span><b>{o.name}</b><small>{o.type === 'passenger' ? 'Keleiviai' : 'Siuntos'}: {o.quantity}</small></span><SquarePen size={17}/></button>
        <div className="order-card-places"><div><ArrowUpRight size={17}/><span><small>Paėmimas</small><b>{o.pickup.name}</b><p>{o.pickup.address}</p></span></div><div><ArrowDownRight size={17}/><span><small>Pristatymas</small><b>{o.delivery.name}</b><p>{o.delivery.address}</p></span></div></div>
        <footer><span>{db.trips.find(t => t.id === o.tripId)?.number ?? 'Reisas nepriskirtas'}</span><button onClick={() => onEdit(o)}>Atidaryti <ArrowUpRight size={16}/></button></footer>
        {showPayments && hasAgreedPrice(o) && <div className="order-card-payment"><b>{money(o.price)}</b><Badge status={o.paid >= o.price ? 'paid' : o.paid > 0 ? 'partial' : 'unpaid'}/>{o.paid < o.price && o.status !== 'cancelled' && <button disabled={busy} onClick={() => commit(d => {d.orders.find(x => x.id === o.id)!.paid = o.price;}, 'Mokėjimas užregistruotas')} aria-label={`Pažymėti ${o.number} apmokėtu`}><CheckCircle2 size={18}/></button>}</div>}
      </article>)}
    </div>
    <div className="table-scroll order-desktop-table">
      <table className="data-table order-table">
        <thead>
          <tr>
            {onSelect && (
              <th className="checkbox-cell">
                <input
                  type="checkbox"
                  aria-label="Pažymėti visus matomus užsakymus"
                  checked={
                    orders.length > 0 &&
                    orders.every((o) => selected?.includes(o.id))
                  }
                  onChange={(e) =>
                    onSelect(e.target.checked ? orders.map((o) => o.id) : [])
                  }
                />
              </th>
            )}
            <th>Užsakymas / klientas</th>
            <th>Paėmimas / pristatymas</th>
            <th className="optional-column">Data / reisas</th>
            {showPayments && <th>Kaina / mokėjimas</th>}
            <th className="optional-column">Būsena</th>
            <th>
              <span className="sr-only">Veiksmai</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              {onSelect && (
                <td className="checkbox-cell">
                  <input
                    type="checkbox"
                    aria-label={`Pažymėti ${o.number}`}
                    checked={selected?.includes(o.id) ?? false}
                    onChange={(e) =>
                      onSelect(
                        e.target.checked
                          ? [...(selected ?? []), o.id]
                          : (selected ?? []).filter((id) => id !== o.id),
                      )
                    }
                  />
                </td>
              )}
              <td>
                <div className="order-title">
                  <span className={`type-icon ${o.type}`}>
                    {o.type === "passenger" ? (
                      <Users size={16} />
                    ) : (
                      <Package size={16} />
                    )}
                  </span>
                  <div>
                    <button className="table-title" onClick={() => onEdit(o)}>
                      {o.name}
                    </button>
                    <div className="table-sub">
                      {o.number} · {o.quantity}{" "}
                      {o.type === "passenger" ? "kel." : "vnt."}
                    </div>
                  </div>
                </div>
                <div className="table-sub customer-sub">
                  {db.customers.find((c) => c.id === o.customerId)?.name}
                </div>
              </td>
              <td>
                <div className="order-place pickup">
                  <ArrowUpRight size={13} />
                  <span>
                    <b>{o.pickup.name}</b>
                    <small>{o.pickup.address}</small>
                  </span>
                </div>
                <div className="order-place delivery">
                  <ArrowDownRight size={13} />
                  <span>
                    <b>{o.delivery.name}</b>
                    <small>{o.delivery.address}</small>
                  </span>
                </div>
              </td>
              <td className="optional-column">
                <b>{dateLabel(o.date)}</b>
                <div className="table-sub">
                  {db.trips.find((t) => t.id === o.tripId)?.number ??
                    "Nepriskirta"}
                </div>
              </td>
              {showPayments && (
                <td>
                  <b>{hasAgreedPrice(o) ? money(o.price) : "-"}</b>
                  <div className="payment-line">
                    {hasAgreedPrice(o) ? (
                      <Badge
                        status={
                          o.paid >= o.price
                            ? "paid"
                            : o.paid > 0
                              ? "partial"
                              : "unpaid"
                        }
                      />
                    ) : (
                      <span className="muted">Kaina nenurodyta</span>
                    )}
                    {o.paid < o.price && o.status !== "cancelled" && (
                      <button
                        disabled={busy}
                        aria-label={`Pažymėti ${o.number} apmokėtu`}
                        title="Pažymėti apmokėtu"
                        onClick={() =>
                          commit((d) => {
                            const target = d.orders.find((x) => x.id === o.id)!;
                            target.paid = target.price;
                          }, "Mokėjimas užregistruotas")
                        }
                      >
                        <CheckCircle2 size={15} />
                      </button>
                    )}
                  </div>
                </td>
              )}
              <td className="optional-column">
                <Badge status={o.status} label={orderStatuses[o.status]} />
              </td>
              <td>
                <button
                  className="row-open"
                  aria-label={`Redaguoti ${o.number}`}
                  onClick={() => onEdit(o)}
                >
                  <SquarePen size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
