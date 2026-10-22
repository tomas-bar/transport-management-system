import { useState } from "react";
import { Plus, SlidersHorizontal, Download } from "lucide-react";
import { useApp } from "../context";
import {
  PageHeading,
  Button,
  Panel,
  SearchInput,
  Select,
} from "../components/ui";
import { TripTable } from "../components/TripTable";
import { TripForm } from "../components/TripForm";
import { tripStatuses } from "../domain/models";
import { csv } from "../services/export";
export function Trips() {
  const { db, path } = useApp();
  const [form, setForm] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [driver, setDriver] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [date, setDate] = useState(
    new URLSearchParams(path.split("?")[1]).get("date") ?? "",
  );
  const [sort, setSort] = useState("asc");
  const [more, setMore] = useState(false);
  const filtered = db.trips
    .filter(
      (t) =>
        (!query ||
          `${t.name} ${t.number}`
            .toLocaleLowerCase("lt")
            .includes(query.toLocaleLowerCase("lt"))) &&
        (!status || t.status === status) &&
        (!type || t.type === type) &&
        (!driver || t.driverId === driver) &&
        (!vehicle || t.vehicleId === vehicle) &&
        (!date || t.departure.startsWith(date)),
    )
    .sort((a, b) =>
      sort === "asc"
        ? a.departure.localeCompare(b.departure)
        : b.departure.localeCompare(a.departure),
    );
  return (
    <>
      <PageHeading title="Reisai">
        <Button
          variant="secondary"
          onClick={() =>
            csv(
              [
                "Numeris",
                "Kryptis",
                "Tipas",
                "Išvykimas",
                "Atvykimas",
                "Būsena",
              ],
              filtered.map((t) => [
                t.number,
                t.name,
                t.type === "local" ? "Vietinis" : "Tarptautinis",
                t.departure,
                t.arrival,
                tripStatuses[t.status],
              ]),
              "krypta-reisai.csv",
            )
          }
        >
          <Download size={16} />
          Eksportuoti
        </Button>
        <Button onClick={() => setForm(true)}>
          <Plus size={17} />
          Naujas reisas
        </Button>
      </PageHeading>
      <div className="module-tabs">
        <button
          className={!status ? "selected" : ""}
          onClick={() => setStatus("")}
        >
          Visi reisai <span>{db.trips.length}</span>
        </button>
        <button
          className={status === "active" ? "selected" : ""}
          onClick={() => setStatus("active")}
        >
          Vykdomi{" "}
          <span>{db.trips.filter((t) => t.status === "active").length}</span>
        </button>
        <button
          className={status === "planned" ? "selected" : ""}
          onClick={() => setStatus("planned")}
        >
          Planuojami
        </button>
        <button
          className={status === "completed" ? "selected" : ""}
          onClick={() => setStatus("completed")}
        >
          Užbaigti
        </button>
      </div>
      <Panel>
        <div
          className={`toolbar trip-filter-toolbar ${more ? "filters-open" : ""}`}
        >
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Ieškoti reiso ar krypties..."
          />
          <Select label="Reiso tipas" value={type} onChange={setType}>
            <option value="">Visi tipai</option>
            <option value="international">Tarptautiniai</option>
            <option value="local">Vietiniai</option>
          </Select>
          <Select label="Reiso būsena" value={status} onChange={setStatus}>
            <option value="">Visos būsenos</option>
            {Object.entries(tripStatuses).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Button variant="secondary" onClick={() => setMore((x) => !x)}>
            <SlidersHorizontal size={15} />
            Filtrai
          </Button>
          <Select label="Reisų rikiavimas" value={sort} onChange={setSort}>
            <option value="asc">Artimiausi pirmiau</option>
            <option value="desc">Vėliausi pirmiau</option>
          </Select>
        </div>
        {(more || date) && (
          <div className="extra-filters">
            <input
              aria-label="Išvykimo data"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <Select label="Vairuotojas" value={driver} onChange={setDriver}>
              <option value="">Visi vairuotojai</option>
              {db.drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.firstName} {d.lastName}
                </option>
              ))}
            </Select>
            <Select
              label="Transporto priemonė"
              value={vehicle}
              onChange={setVehicle}
            >
              <option value="">Visi automobiliai</option>
              {db.vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.make} {v.model} · {v.plate}
                </option>
              ))}
            </Select>
            <button
              className="text-link"
              onClick={() => {
                setDate("");
                setDriver("");
                setVehicle("");
                setType("");
                setStatus("");
                setQuery("");
              }}
            >
              Išvalyti filtrus
            </button>
          </div>
        )}
        <TripTable trips={filtered} />
        <div className="panel-bottom">
          <span>
            Rodoma reisų: {filtered.length} iš {db.trips.length}
          </span>
          <span>Laikai Lietuvos laiku</span>
        </div>
      </Panel>
      {form && <TripForm onClose={() => setForm(false)} />}
    </>
  );
}
