import { useState } from "react";
import type { Vehicle, Driver, Customer, Collection } from "../domain/models";
import { useApp } from "../context";
import { Button, Field, Modal } from "./ui";
import { uid, loadInfo } from "../domain/logic";
import { entityStatuses } from "../domain/models";
export type RegistryKind = "vehicles" | "drivers" | "customers";
export type RegistryRecord = Vehicle | Driver | Customer;
const titles = {
  vehicles: "transporto priemonę",
  drivers: "vairuotoją",
  customers: "klientą",
};
export function RegistryForm({
  kind,
  record,
  onClose,
}: {
  kind: RegistryKind;
  record?: RegistryRecord;
  onClose: () => void;
}) {
  const { commit, busy } = useApp();
  const initial =
    record ??
    (kind === "vehicles"
      ? {
          id: uid(),
          make: "",
          model: "",
          year: new Date().getFullYear(),
          plate: "",
          type: "Keleivinis mikroautobusas",
          seats: 8,
          maxMass: 3500,
          payload: null,
          fuel: "Dyzelinas",
          consumption: 0,
          mileage: 0,
          status: "active",
          notes: "",
        }
      : kind === "drivers"
        ? {
            id: uid(),
            firstName: "",
            lastName: "",
            phone: "",
            email: "",
            categories: "B",
            status: "active",
            notes: "",
          }
        : {
            id: uid(),
            name: "",
            type: "person",
            phone: "",
            email: "",
            address: "",
            notes: "",
            status: "active",
          });
  const [form, setForm] = useState<Record<string, string | number | null>>(
    initial as unknown as Record<string, string | number | null>,
  );
  const set = (k: string, v: string | number | null) =>
    setForm((f) => ({ ...f, [k]: v }));
  function input(
    key: string,
    label: string,
    type = "text",
    required = false,
    min?: number,
  ) {
    return (
      <Field label={label}>
        <input
          type={type}
          required={required}
          min={min}
          max={key === "year" ? new Date().getFullYear() + 1 : undefined}
          step={
            type === "number"
              ? key === "consumption"
                ? "0.1"
                : "1"
              : undefined
          }
          maxLength={200}
          value={form[key] ?? ""}
          onChange={(e) =>
            set(
              key,
              type === "number"
                ? e.target.value === ""
                  ? null
                  : Number(e.target.value)
                : e.target.value,
            )
          }
        />
      </Field>
    );
  }
  return (
    <Modal
      title={`${record ? "Redaguoti" : "Pridėti"} ${titles[kind]}`}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await commit((db) => {
              if (kind === "vehicles") {
                const v = form as unknown as Vehicle;
                if (!v.make.trim() || !v.model.trim() || !v.plate.trim())
                  throw new Error(
                    "Įrašykite gamintoją, modelį ir valstybinį numerį.",
                  );
                if (
                  db.vehicles.some(
                    (x) =>
                      x.id !== v.id &&
                      x.plate.trim().toUpperCase() ===
                        v.plate.trim().toUpperCase(),
                  )
                )
                  throw new Error("Toks valstybinis numeris jau yra.");
                for (const t of db.trips.filter(
                  (t) =>
                    t.vehicleId === v.id &&
                    !["completed", "cancelled"].includes(t.status),
                )) {
                  const l = loadInfo(db, t, undefined, v);
                  if (
                    l.passengers > v.seats ||
                    (v.payload !== null && l.weight > v.payload)
                  )
                    throw new Error(
                      "Nauji talpos duomenys neatitinka priskirtų reisų apkrovos. Pirmiausia pakeiskite reisus.",
                    );
                }
                v.plate = v.plate.trim().toUpperCase();
              }
              if (
                ["vehicles", "drivers"].includes(kind) &&
                form.status !== "active" &&
                db.trips.some(
                  (t) =>
                    t[kind === "vehicles" ? "vehicleId" : "driverId"] ===
                      form.id && !["completed", "cancelled"].includes(t.status),
                )
              )
                throw new Error(
                  "Pirmiausia perskirkite būsimus ir vykdomus reisus kitam automobiliui arba vairuotojui.",
                );
              const records = db[kind as Collection] as unknown as Record<
                string,
                unknown
              >[];
              const index = records.findIndex((x) => x.id === form.id);
              if (index >= 0) records[index] = form;
              else records.push(form);
            }, "Įrašas išsaugotas")
          )
            onClose();
        }}
      >
        <div className="modal-body">
          <div className="form-grid">
            {kind === "vehicles" ? (
              <>
                {input("make", "Gamintojas *", "text", true)}
                {input("model", "Modelis *", "text", true)}
                {input("year", "Pagaminimo metai *", "number", true, 1950)}
                {input("plate", "Valstybinis numeris *", "text", true)}
                <Field label="Transporto priemonės tipas">
                  <select
                    value={String(form.type)}
                    onChange={(e) => set("type", e.target.value)}
                  >
                    {[
                      "Keleivinis mikroautobusas",
                      "Krovininis mikroautobusas",
                      "Lengvasis komercinis automobilis",
                      "Kita",
                    ].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
                {input("seats", "Keleivių vietų skaičius *", "number", true, 0)}
                {input(
                  "maxMass",
                  "Didžiausioji leidžiamoji masė, kg",
                  "number",
                  true,
                  1,
                )}
                {input("payload", "Naudingoji apkrova, kg", "number", false, 1)}
                <Field label="Kuro tipas">
                  <select
                    value={String(form.fuel)}
                    onChange={(e) => set("fuel", e.target.value)}
                  >
                    {[
                      "Dyzelinas",
                      "Benzinas",
                      "Elektra",
                      "Hibridas",
                      "Kita",
                    ].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
                {input(
                  "consumption",
                  "Sąnaudos, l/100 km (elektrai kWh/100 km)",
                  "number",
                  true,
                  0,
                )}
                {input("mileage", "Rida, km", "number", true, 0)}
              </>
            ) : kind === "drivers" ? (
              <>
                {input("firstName", "Vardas *", "text", true)}
                {input("lastName", "Pavardė *", "text", true)}
                {input("phone", "Telefono numeris", "tel")}
                {input("email", "El. paštas", "email")}
                {input("categories", "Vairuotojo pažymėjimo kategorijos")}
              </>
            ) : (
              <>
                <Field label="Kliento tipas">
                  <select
                    value={String(form.type)}
                    onChange={(e) => set("type", e.target.value)}
                  >
                    <option value="person">Fizinis asmuo</option>
                    <option value="company">Įmonė</option>
                  </select>
                </Field>
                {input(
                  "name",
                  "Vardas ir pavardė / įmonės pavadinimas *",
                  "text",
                  true,
                )}
                {input("phone", "Telefono numeris", "tel")}
                {input("email", "El. paštas", "email")}
                {input("address", "Adresas")}
              </>
            )}
            <Field label="Būsena">
              <select
                value={String(form.status)}
                onChange={(e) => set("status", e.target.value)}
              >
                {Object.entries(entityStatuses).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Pastabos" full>
              <textarea
                maxLength={3000}
                rows={3}
                value={String(form.notes)}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
          </div>
        </div>
        <footer>
          <Button type="button" variant="secondary" onClick={onClose}>
            Atšaukti
          </Button>
          <Button disabled={busy} type="submit">
            Išsaugoti
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
