import { useConfirm } from './Feedback';
import { useState } from "react";
import type { Trip } from "../domain/models";
import { useApp } from "../context";
import { Button, Field, Modal } from "./ui";
import { saveTrip, today, uid } from "../domain/logic";
import { tripStatuses } from "../domain/models";
export function TripForm({
  trip,
  onClose,
}: {
  trip?: Trip;
  onClose: () => void;
}) {
  const confirm = useConfirm();
  const { db, commit, busy } = useApp();
  const [form, setForm] = useState<Trip>(
    trip
      ? structuredClone(trip)
      : {
          id: uid(),
          number: `KR-${Math.max(1000, ...db.trips.map((t) => Number(t.number.replace(/\D/g, "")) || 0)) + 1}`,
          name: "",
          type: "international",
          departure: today() + "T08:00",
          arrival: today() + "T18:00",
          vehicleId: "",
          driverId: "",
          routeId: "",
          status: "planned",
          notes: "",
          stops: [],
        },
  );
  const set = <K extends keyof Trip>(key: K, value: Trip[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const archivedVehicle = db.vehicles.find(
    (v) => v.id === form.vehicleId && v.status !== "active",
  );
  const archivedDriver = db.drivers.find(
    (d) => d.id === form.driverId && d.status !== "active",
  );
  return (
    <Modal
      title={trip ? "Redaguoti reisą" : "Naujas reisas"}
      subtitle={`${form.number} · laikai Lietuvos laiku`}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            trip &&
            form.status !== trip.status &&
            ["completed", "cancelled"].includes(form.status) &&
            !await confirm(
              form.status === "completed"
                ? "Užbaigti reisą ir jo užsakymus?"
                : "Atšaukti reisą ir atskirti jo užsakymus?",
            )
          )
            return;
          if (
            await commit(
              (d) => {
                saveTrip(d, form);
              },
              trip ? "Reisas atnaujintas" : "Reisas sukurtas",
            )
          )
            onClose();
        }}
      >
        <div className="modal-body">
          <div className="form-grid">
            <Field
              label="Maršruto šablonas"
              full
              hint="Į reisą perkeliama sustojimų kopija."
            >
              <select
                value={form.routeId}
                onChange={(e) => {
                  const r = db.routes.find((r) => r.id === e.target.value);
                  if (r)
                    setForm((f) => ({
                      ...f,
                      routeId: r.id,
                      name: r.name,
                      type: r.type,
                      stops: [
                        ...structuredClone(r.stops).map((s) => ({
                          ...s,
                          completed: false,
                          id: uid(),
                        })),
                        ...f.stops.filter((s) => s.orderId),
                      ],
                    }));
                  else set("routeId", "");
                }}
              >
                <option value="">Be šablono, sustojimus pridėsiu vėliau</option>
                {db.routes
                  .filter((r) => !r.archived)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Kryptis / pavadinimas *" full>
              <input
                required
                maxLength={160}
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Pvz., Kaunas → Hamburgas"
              />
            </Field>
            <Field label="Reiso tipas">
              <select
                value={form.type}
                onChange={(e) => set("type", e.target.value as Trip["type"])}
              >
                <option value="international">Tarptautinis</option>
                <option value="local">Vietinis</option>
              </select>
            </Field>
            <Field label="Būsena">
              <select
                value={form.status}
                onChange={(e) =>
                  set("status", e.target.value as Trip["status"])
                }
              >
                {Object.entries(tripStatuses).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Išvykimas *">
              <input
                type="datetime-local"
                required
                value={form.departure}
                onChange={(e) => set("departure", e.target.value)}
              />
            </Field>
            <Field label="Planuojamas atvykimas *">
              <input
                type="datetime-local"
                required
                min={form.departure}
                value={form.arrival}
                onChange={(e) => set("arrival", e.target.value)}
              />
            </Field>
            <Field label="Transporto priemonė *">
              <select
                required
                value={form.vehicleId}
                onChange={(e) => set("vehicleId", e.target.value)}
              >
                <option value="">Pasirinkite automobilį</option>
                {db.vehicles
                  .filter(
                    (v) =>
                      v.status === "active" || v.id === archivedVehicle?.id,
                  )
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.make} {v.model} · {v.plate}
                      {v.status !== "active" ? " (neaktyvus)" : ""}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Vairuotojas *">
              <select
                required
                value={form.driverId}
                onChange={(e) => set("driverId", e.target.value)}
              >
                <option value="">Pasirinkite vairuotoją</option>
                {db.drivers
                  .filter(
                    (d) => d.status === "active" || d.id === archivedDriver?.id,
                  )
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.firstName} {d.lastName}
                      {d.status !== "active" ? " (neaktyvus)" : ""}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Pastabos" full>
              <textarea
                rows={3}
                maxLength={3000}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
          </div>
          <p className="form-help">
            * Privalomi laukai. Vairuotojo ir automobilio užimtumas tikrinamas
            išsaugant.
          </p>
        </div>
        <footer>
          <Button type="button" variant="secondary" onClick={onClose}>
            Atšaukti
          </Button>
          <Button disabled={busy} type="submit">
            {busy
              ? "Saugoma..."
              : trip
                ? "Išsaugoti pakeitimus"
                : "Sukurti reisą"}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
