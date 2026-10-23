import { nextCompanyReference } from '../domain/references';
import { isDraft, isHistorical } from '../domain/record-mode';
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
  const { db, commit, busy, user, navigate } = useApp();
  const [form, setForm] = useState<Trip>(
    trip
      ? structuredClone(trip)
      : {
          id: uid(),
          number: nextCompanyReference(db, 'trips'),
          name: "",
          type: "international",
          departure: today() + "T08:00",
          arrival: today() + "T18:00",
          vehicleId: "",
          driverId: "",
          routeId: "",
          status: "planned",
          recordMode: 'draft',
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
  const mode = form.recordMode ?? 'operational';
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
          if (trip && isDraft(trip) && !form.recordMode && !await confirm('Paskelbti reisą priskirtam vairuotojui?', { title: 'Paskelbti reisą', confirmLabel: 'Paskelbti reisą' })) return;
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
              trip ? 'Reisas atnaujintas' : isDraft(form) ? 'Juodraštis išsaugotas' : isHistorical(form) ? 'Istorinis reisas įrašytas' : 'Reisas paskelbtas',
            )
          )
            { onClose(); if (!trip) navigate(`trips/${form.id}`); }
        }}
      >
        <div className="modal-body">
          <div className="form-grid">
            {(!trip || isDraft(trip)) && <Field label="Įrašo tipas" full>
              <select value={mode} onChange={event => {
                const selected = event.target.value;
                setForm(previous => ({ ...previous, recordMode: selected === 'operational' ? undefined : selected as 'draft' | 'historical',
                  status: selected === 'historical' ? 'completed' : 'planned' }));
              }}>
                <option value="draft">Juodraštis</option>
                <option value="operational">Paskelbtas reisas</option>
                {!trip && <option value="historical">Istorinis reisas</option>}
              </select>
            </Field>}
            <p className="record-mode-note">{isDraft(form) ? 'Matomas tik vadovui ir vadybininkams. Pranešimai nesiunčiami, transportas ir vairuotojas nerezervuojami.'
              : isHistorical(form) ? 'Užbaigtas ankstesnis reisas. Galėsite pridėti istorinius užsakymus ir išlaidas. Pranešimai nesiunčiami.'
              : 'Reisas bus matomas priskirtam vairuotojui. Pranešimai siunčiami pagal jo nuostatas.'}</p>
            <Field label="Reiso numeris" full>
              <input required maxLength={40} readOnly={user?.role !== 'admin'} value={form.number} onChange={event => set('number', event.target.value)} />
            </Field>
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
            {!form.recordMode && <Field label="Būsena" hint={trip?.status !== "completed" ? "Pristatymus patvirtinkite reiso suvestinėje." : undefined}>
              <select
                value={form.status}
                onChange={(e) =>
                  set("status", e.target.value as Trip["status"])
                }
              >
                {Object.entries(tripStatuses).map(([k, v]) => (
                  <option key={k} value={k} disabled={k === "completed" && trip?.status !== "completed"}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>}
            <Field label="Išvykimas *">
              <input
                type="datetime-local"
                required
                value={form.departure}
                onChange={(e) => set("departure", e.target.value)}
              />
            </Field>
            <Field label={isHistorical(form) ? 'Atvykimas *' : 'Planuojamas atvykimas *'}>
              <input
                type="datetime-local"
                required
                min={form.departure}
                max={isHistorical(form) ? today() + 'T23:59' : undefined}
                value={form.arrival}
                onChange={(e) => set("arrival", e.target.value)}
              />
            </Field>
            <Field label={isDraft(form) ? 'Transporto priemonė' : 'Transporto priemonė *'}>
              <select
                required={!isDraft(form)}
                value={form.vehicleId}
                onChange={(e) => set("vehicleId", e.target.value)}
              >
                <option value="">Pasirinkite automobilį</option>
                {db.vehicles
                  .filter(
                    (v) =>
                      isHistorical(form) || v.status === "active" || v.id === archivedVehicle?.id,
                  )
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.make} {v.model} · {v.plate}
                      {v.status !== "active" ? " (neaktyvus)" : ""}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label={isDraft(form) ? 'Vairuotojas' : 'Vairuotojas *'}>
              <select
                required={!isDraft(form)}
                value={form.driverId}
                onChange={(e) => set("driverId", e.target.value)}
              >
                <option value="">Pasirinkite vairuotoją</option>
                {db.drivers
                  .filter(
                    (d) => isHistorical(form) || d.status === "active" || d.id === archivedDriver?.id,
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
            {isDraft(form) ? '* Privalomi laukai. Išteklių užimtumas bus patikrintas paskelbiant.' : '* Privalomi laukai.'}
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
                : isDraft(form) ? 'Išsaugoti juodraštį' : isHistorical(form) ? 'Įrašyti į istoriją' : 'Paskelbti reisą'}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
