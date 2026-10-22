import { TripCards } from "./TripCards";
import {
  ArrowRight,
  Users,
  Package,
  Globe2,
  MapPin,
  UserRound,
} from "lucide-react";
import type { Trip } from "../domain/models";
import { useApp } from "../context";
import { Badge, Plate, Avatar, Empty } from "./ui";
import { dateLabel, loadInfo, today } from "../domain/logic";
export function TripTable({
  trips,
  compact = false,
}: {
  trips: Trip[];
  compact?: boolean;
}) {
  const { db, navigate } = useApp();
  if (!trips.length) return <Empty title="Reisų nerasta" />;
  return (
    <div className={`trip-list ${compact ? "is-compact" : ""}`}>
      <TripCards trips={trips} />
      <div className="table-scroll trip-desktop-table">
        <table
          className={`data-table trip-table ${compact ? "compact-table" : ""}`}
        >
          <thead>
            <tr>
              <th>Reisas / kryptis</th>
              <th>Išvykimas</th>
              <th className="optional-column">Transportas / vairuotojas</th>
              <th className="optional-column">Užimtumas</th>
              <th>Būsena</th>
              <th>
                <span className="sr-only">Veiksmai</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {trips.map((t) => {
              const v = db.vehicles.find((v) => v.id === t.vehicleId);
              const d = db.drivers.find((d) => d.id === t.driverId);
              const l = loadInfo(db, t);
              return (
                <tr
                  key={t.id}
                  className={`${t.status === "active" ? "trip-row-active" : ""} ${t.departure.startsWith(today()) ? "trip-row-today" : ""}`}
                >
                  <td>
                    <button
                      className="table-title"
                      onClick={() => navigate(`trips/${t.id}`)}
                    >
                      {t.name}
                    </button>
                    <div className="table-sub">
                      <span>{t.number}</span>
                      <span>·</span>
                      {t.type === "international" ? (
                        <>
                          <Globe2 size={12} />
                          Tarptautinis
                        </>
                      ) : (
                        <>
                          <MapPin size={12} />
                          Vietinis
                        </>
                      )}
                    </div>
                  </td>
                  <td>
                    <b>
                      {t.departure.startsWith(today()) ? (
                        <span className="today-label">Šiandien</span>
                      ) : (
                        dateLabel(t.departure)
                      )}
                    </b>
                    <div className="table-sub">{t.departure.slice(11, 16)}</div>
                  </td>
                  <td className="optional-column">
                    <span className="vehicle-mini">
                      {v && <Plate value={v.plate} />}
                    </span>
                    <div className="table-sub driver-inline">
                      {d && (
                        <>
                          <span className="driver-icon">
                            <UserRound size={13} />
                          </span>
                          {d.firstName} {d.lastName}
                        </>
                      )}
                    </div>
                  </td>
                  <td className="optional-column">
                    <div className="load-mini">
                      <Users size={14} />
                      <b>{l.passengers}</b>
                      <span>/ {l.capacity}</span>
                      <Package size={14} />
                      <b>{l.parcels}</b>
                    </div>
                    <div className="capacity-bar">
                      <span
                        style={{
                          width: `${Math.min(100, l.capacity ? (l.passengers / l.capacity) * 100 : 0)}%`,
                        }}
                      />
                    </div>
                  </td>
                  <td>
                    <Badge status={t.status} />
                  </td>
                  <td>
                    <button
                      className="row-open"
                      aria-label={`Atidaryti reisą ${t.number}`}
                      onClick={() => navigate(`trips/${t.id}`)}
                    >
                      <ArrowRight size={17} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
