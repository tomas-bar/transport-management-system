import { nextCompanyReference } from '../domain/references';
import { useConfirm } from './Feedback';
import {OrderPhotos} from './OrderPhotos';
import { Camera } from 'lucide-react';
import { useState } from "react";
import type { Order, Place } from "../domain/models";
import { useApp } from "../context";
import { Button, Field, Modal } from "./ui";
import { PlacePicker } from "./PlacePicker";
import { saveOrder, today, uid, hasAgreedPrice } from "../domain/logic";
import { orderStatuses } from "../domain/models";
const blank: Place = { name: "", address: "", lat: 0, lng: 0 };
export function OrderForm({
  order,
  onClose,
  tripId = "",
}: {
  order?: Order;
  onClose: () => void;
  tripId?: string;
}) {
  const confirm = useConfirm();
  const { db, commit, busy, notify, modules, serverMode, user } = useApp();
  const selected = db.trips.find((t) => t.id === tripId);
  const [form, setForm] = useState<Order>(
    order
      ? structuredClone(order)
      : {
          id: uid(),
          number: nextCompanyReference(db, 'orders'),
          type: "passenger",
          customerId: "",
          name: "",
          phone: "",
          recipient: "",
          recipientPhone: "",
          pickup: blank,
          delivery: blank,
          date: selected?.departure.slice(0, 10) ?? today(),
          quantity: 1,
          luggage: "",
          description: "",
          weight: null,
          dimensions: "",
          price: 0,
          priceSet: false,
          paid: 0,
          status: "new",
          tripId,
          notes: "",
        },
  );
  const set = <K extends keyof Order>(key: K, value: Order[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const [paymentsOpen, setPaymentsOpen] = useState(
    !!order && (order.price > 0 || order.paid > 0),
  );
  const isParcel = form.type === "parcel";
  const locked = order?.status === "completed" && !!order.tripId;
  return (
    <Modal
      title={order ? "Redaguoti užsakymą" : "Naujas užsakymas"}
      subtitle={form.number}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!form.customerId) {
            notify(
              "Pasirinkite klientą. Naują klientą galite sukurti klientų registre.",
              true,
            );
            return;
          }
          if (
            await commit(
              (d) => {
                saveOrder(d, form);
              },
              order ? "Užsakymas atnaujintas" : "Užsakymas sukurtas",
            )
          )
            onClose();
        }}
      >
        <div className="modal-body">
          {locked && (
            <p className="notice">
              Reisas užbaigtas. Galite patikslinti kontaktus, mokėjimą ir
              pastabas. Kelionės duomenys išsaugomi istorijoje.
            </p>
          )}
          <div className="segmented">
            <button
              type="button"
              disabled={locked}
              className={!isParcel ? "selected" : ""}
              onClick={() => set("type", "passenger")}
            >
              Keleivių vežimas
            </button>
            <button
              type="button"
              disabled={locked}
              className={isParcel ? "selected" : ""}
              onClick={() => set("type", "parcel")}
            >
              Siuntos ir kroviniai
            </button>
          </div>
          <div className="form-grid">
            <Field label="Užsakymo numeris" full>
              <input required maxLength={40} readOnly={user?.role !== 'admin'} value={form.number} onChange={event => set('number', event.target.value)} />
            </Field>
            <Field
              label={isParcel ? "Siuntėjas / klientas *" : "Klientas *"}
              full
            >
              <select
                required
                value={form.customerId}
                onChange={(e) => {
                  const c = db.customers.find((c) => c.id === e.target.value);
                  if (c)
                    setForm((f) => ({
                      ...f,
                      customerId: c.id,
                      phone: f.phone || c.phone,
                      name: isParcel ? f.name : c.name,
                    }));
                  else set("customerId", "");
                }}
              >
                <option value="">Pasirinkite klientą</option>
                {db.customers
                  .filter(
                    (c) => c.status !== "archived" || c.id === form.customerId,
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field
              label={
                isParcel
                  ? "Siuntos pavadinimas *"
                  : "Keleivio vardas ir pavardė *"
              }
            >
              <input
                required
                maxLength={160}
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field label="Kontaktinis telefonas">
              <input
                type="tel"
                maxLength={40}
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </Field>
            {isParcel && (
              <>
                <Field label="Gavėjas">
                  <input
                    value={form.recipient}
                    maxLength={160}
                    onChange={(e) => set("recipient", e.target.value)}
                  />
                </Field>
                <Field label="Gavėjo telefonas">
                  <input
                    type="tel"
                    maxLength={40}
                    value={form.recipientPhone}
                    onChange={(e) => set("recipientPhone", e.target.value)}
                  />
                </Field>
              </>
            )}
            <div className="full">
              <PlacePicker
                disabled={locked}
                label="Paėmimo vieta *"
                value={form.pickup.name ? form.pickup : null}
                onChange={(v) => set("pickup", v)}
              />
            </div>
            <div className="full">
              <PlacePicker
                disabled={locked}
                label="Pristatymo vieta *"
                value={form.delivery.name ? form.delivery : null}
                onChange={(v) => set("delivery", v)}
              />
            </div>
            <Field label="Kelionės data *">
              <input
                type="date"
                required
                disabled={locked}
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </Field>
            <Field label={isParcel ? "Siuntų kiekis *" : "Keleivių skaičius *"}>
              <input
                type="number"
                required
                min={1}
                max={1000}
                step={1}
                disabled={locked}
                value={form.quantity}
                onChange={(e) => set("quantity", Number(e.target.value))}
              />
            </Field>
            {isParcel ? (
              <>
                <Field
                  label="Vienos siuntos svoris, kg"
                  hint="Nežinomą svorį palikite tuščią."
                >
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    disabled={locked}
                    value={form.weight ?? ""}
                    onChange={(e) =>
                      set(
                        "weight",
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                  />
                </Field>
                <Field label="Matmenys">
                  <input
                    maxLength={100}
                    placeholder="Ilgis × plotis × aukštis, cm"
                    value={form.dimensions}
                    onChange={(e) => set("dimensions", e.target.value)}
                  />
                </Field>
                <Field label="Siuntos aprašymas" full>
                  <input
                    maxLength={500}
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                  />
                </Field>
              </>
            ) : (
              <Field label="Bagažas" full>
                <input
                  maxLength={300}
                  placeholder="Pvz., 1 lagaminas ir kuprinė"
                  value={form.luggage}
                  onChange={(e) => set("luggage", e.target.value)}
                />
              </Field>
            )}
            {modules.includes("finance")&&<details
              className="order-payment-section full"
              open={paymentsOpen}
              onToggle={(e) => setPaymentsOpen(e.currentTarget.open)}
            >
              <summary>
                Kaina ir mokėjimas <span>Neprivaloma</span>
              </summary>
              <div className="form-grid">
                {" "}
                <Field label="Sutarta kaina, €">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={hasAgreedPrice(form) ? form.price / 100 : ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        price: Math.round(Number(e.target.value) * 100),
                        priceSet: e.target.value !== "",
                      }))
                    }
                  />
                </Field>
                <Field label="Sumokėta, €">
                  <input
                    type="number"
                    min={0}
                    max={form.price / 100}
                    step="0.01"
                    value={form.paid / 100}
                    onChange={(e) =>
                      set("paid", Math.round(Number(e.target.value) * 100))
                    }
                  />
                </Field>
              </div>
            </details>}
            <Field
              label="Priskirti reisui"
              full
              hint="Nauji adresai įterpiami pagal maršruto eigą. Eiliškumą galima pakeisti."
            >
              <select
                disabled={locked}
                value={form.tripId}
                onChange={async (event) => {
                  const tripId = event.target.value;
                  const trip = db.trips.find(record => record.id === tripId);
                  const date = trip?.departure.slice(0, 10);
                  if (date && date !== form.date) {
                    const accepted = await confirm(
                      `Reisas išvyksta ${date}. Pakeisti užsakymo datą iš ${form.date} į ${date} ir priskirti šiam reisui?`,
                      { title: 'Užsakymo ir reiso datos skiriasi', confirmLabel: 'Keisti datą ir priskirti' },
                    );
                    if (!accepted) return;
                  }
                  setForm(value => ({ ...value, tripId, ...(date ? { date } : {}) }));
                }}
              >
                <option value="">Kol kas nepriskirti</option>
                {db.trips
                  .filter(
                    (t) =>
                      !["completed", "cancelled"].includes(t.status) ||
                      t.id === form.tripId,
                  )
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.number} · {t.name} · {t.departure.slice(0, 10)}
                    </option>
                  ))}
              </select>
            </Field>
            {!form.tripId && (
              <Field label="Užsakymo būsena">
                <select
                  value={form.status}
                  onChange={(e) =>
                    set("status", e.target.value as Order["status"])
                  }
                >
                  {Object.entries(orderStatuses)
                    .filter(([k]) => !["assigned", "active"].includes(k))
                    .map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            <Field label="Pastabos" full>
              <textarea
                rows={2}
                maxLength={3000}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
          </div>
        </div>
        {order&&serverMode&&modules.includes("photos")&&<div className="modal-body order-photo-section"><h3><Camera size={18}/>Nuotraukos</h3><OrderPhotos orderId={order.id}/></div>}
        <footer>
          <Button type="button" variant="secondary" onClick={onClose}>
            Atšaukti
          </Button>
          <Button type="submit" disabled={busy}>
            {busy
              ? "Saugoma..."
              : order
                ? "Išsaugoti pakeitimus"
                : "Sukurti užsakymą"}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
