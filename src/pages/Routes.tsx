import { useState } from "react";
import {
  Plus,
  Globe2,
  MapPin,
  SquarePen,
  Archive,
  Copy,
  ExternalLink,
} from "lucide-react";
import { useApp } from "../context";
import type { Route } from "../domain/models";
import {
  PageHeading,
  Button,
  Panel,
  SearchInput,
  Select,
  Empty,
  Modal,
  Field,
} from "../components/ui";
import { MapView } from "../components/MapView";
import { StopEditor } from "../components/StopEditor";
import { googleMapsParts } from "../services/maps";
import { uid } from "../domain/logic";
export function Routes() {
  const { db, commit, busy } = useApp();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [sort, setSort] = useState("name");
  const [selected, setSelected] = useState(
    db.routes.find((r) => !r.archived)?.id ?? "",
  );
  const [form, setForm] = useState<Route | null>(null);
  const routes = db.routes
    .filter(
      (r) =>
        !r.archived &&
        (!query ||
          `${r.name} ${r.stops.map((s) => s.name).join(" ")}`
            .toLocaleLowerCase("lt")
            .includes(query.toLocaleLowerCase("lt"))) &&
        (!type || r.type === type),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, "lt")
        : b.stops.length - a.stops.length,
    );
  const route = routes.find((r) => r.id === selected) ?? routes[0];
  return (
    <>
      <PageHeading title="Maršrutai">
        <Button
          onClick={() =>
            setForm({
              id: uid(),
              name: "",
              type: "international",
              stops: [],
              notes: "",
            })
          }
        >
          <Plus size={17} />
          Naujas maršrutas
        </Button>
      </PageHeading>
      <div className="toolbar route-toolbar">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Ieškoti maršruto arba miesto..."
        />
        <Select label="Maršruto tipas" value={type} onChange={setType}>
          <option value="">Visi tipai</option>
          <option value="local">Vietiniai</option>
          <option value="international">Tarptautiniai</option>
        </Select>
        <Select label="Maršrutų rikiavimas" value={sort} onChange={setSort}>
          <option value="name">Pagal pavadinimą</option>
          <option value="stops">Pagal sustojimų skaičių</option>
        </Select>
      </div>
      {routes.length ? (
        <div className="routes-layout">
          <div className="route-catalog">
            {routes.map((r) => (
              <button
                key={r.id}
                className={`route-card ${r.id === route?.id ? "selected" : ""}`}
                onClick={() => setSelected(r.id)}
              >
                <span className="route-card-icon">
                  {r.type === "international" ? (
                    <Globe2 size={21} />
                  ) : (
                    <MapPin size={21} />
                  )}
                </span>
                <b>{r.name}</b>
                <p>
                  {r.stops.length} sustojimai ·{" "}
                  {r.type === "international" ? "Tarptautinis" : "Vietinis"}
                </p>
                <div className="route-card-cities">
                  {r.stops.map((s) => s.name).join(" → ")}
                </div>
              </button>
            ))}
          </div>
          {route && (
            <Panel
              title={route.name}
              subtitle={`Susiję reisai: ${db.trips.filter((t) => t.routeId === route.id).length}`}
              action={
                <Button
                  variant="secondary"
                  onClick={() => setForm(structuredClone(route))}
                >
                  <SquarePen size={15} />
                  Redaguoti
                </Button>
              }
            >
              <MapView stops={route.stops} />
              <div className="route-template-stops">
                <StopEditor stops={route.stops} onChange={() => {}} readOnly />
              </div>
              <div className="navigation-links">
                {googleMapsParts(route.stops).map((p, i) => (
                  <a href={p.url} target="_blank" rel="noreferrer" key={i}>
                    <ExternalLink size={14} />
                    {p.label}
                  </a>
                ))}
              </div>
              <div className="panel-bottom">
                <Button
                  variant="ghost"
                  onClick={() =>
                    setForm({
                      ...structuredClone(route),
                      id: uid(),
                      name: route.name + " (kopija)",
                      stops: structuredClone(route.stops).map((s) => ({
                        ...s,
                        completed: false,
                      })),
                    })
                  }
                >
                  <Copy size={15} />
                  Sukurti kopiją
                </Button>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    if (
                      confirm(
                        "Archyvuoti maršruto šabloną? Esamų reisų sustojimai išliks.",
                      )
                    )
                      await commit((d) => {
                        d.routes.find((r) => r.id === route.id)!.archived =
                          true;
                      }, "Maršrutas archyvuotas");
                  }}
                >
                  <Archive size={15} />
                  Archyvuoti
                </Button>
              </div>
            </Panel>
          )}
        </div>
      ) : (
        <Empty title="Maršrutų nerasta" />
      )}
      {form && (
        <Modal
          title={
            db.routes.some((r) => r.id === form.id)
              ? "Redaguoti maršrutą"
              : "Naujas maršrutas"
          }
          onClose={() => setForm(null)}
          wide
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await commit((d) => {
                  if (form.stops.length < 2)
                    throw new Error("Pridėkite bent du sustojimus.");
                  const index = d.routes.findIndex((r) => r.id === form.id);
                  if (index >= 0) d.routes[index] = form;
                  else d.routes.push(form);
                }, "Maršrutas išsaugotas")
              ) {
                setSelected(form.id);
                setForm(null);
              }
            }}
          >
            <div className="modal-body">
              <div className="form-grid">
                <Field label="Pavadinimas *">
                  <input
                    required
                    maxLength={160}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Field>
                <Field label="Tipas">
                  <select
                    value={form.type}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        type: e.target.value as Route["type"],
                      })
                    }
                  >
                    <option value="international">Tarptautinis</option>
                    <option value="local">Vietinis</option>
                  </select>
                </Field>
              </div>
              <StopEditor
                stops={form.stops}
                onChange={(stops) => setForm({ ...form, stops })}
              />
              <Field label="Pastabos">
                <textarea
                  rows={2}
                  maxLength={3000}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </Field>
            </div>
            <footer>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setForm(null)}
              >
                Atšaukti
              </Button>
              <Button type="submit" disabled={busy}>
                Išsaugoti maršrutą
              </Button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}
