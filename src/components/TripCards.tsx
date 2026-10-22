import {
  ArrowUpRight,
  CalendarDays,
  Users,
  Package,
  UserRound,
  Clock3,
} from "lucide-react";
import type { Trip } from "../domain/models";
import { useApp } from "../context";
import { Badge, Plate } from "./ui";
import { dateLabel, loadInfo, today } from "../domain/logic";
export function TripCards({ trips }: { trips: Trip[] }) {
  const { db, navigate } = useApp();
  return (
    <div className="trip-mobile-cards">
      {trips.map((t) => {
        const v = db.vehicles.find((v) => v.id === t.vehicleId);
        const d = db.drivers.find((d) => d.id === t.driverId);
        const load = loadInfo(db, t);
        const isToday = t.departure.startsWith(today());
        return (
          <article key={t.id} className={`trip-mobile-card status-${t.status}`}>
            <div className="trip-card-top">
              <span className="trip-card-ref">
                {t.number} · {t.type === "local" ? "Vietinis" : "Tarptautinis"}
              </span>
              <Badge status={t.status} />
            </div>
            <button
              className="trip-card-name"
              onClick={() => navigate(`trips/${t.id}`)}
            >
              {t.name}
              <ArrowUpRight size={18} />
            </button>
            <div className="trip-card-time">
              <span className={isToday ? "today-label" : ""}>
                <CalendarDays size={14} />
                {isToday ? "Šiandien" : dateLabel(t.departure)}
              </span>
              <b>
                <Clock3 size={14} />
                {t.departure.slice(11, 16)}
              </b>
            </div>
            <div className="trip-card-resources">
              {v && (
                <span>
                  <Plate value={v.plate} />
                  <small>
                    {v.make} {v.model}
                  </small>
                </span>
              )}
              {d && (
                <span>
                  <UserRound size={14} />
                  {d.firstName} {d.lastName}
                </span>
              )}
            </div>
            <div className="trip-card-load">
              <span>
                <Users size={15} />
                <b>
                  {load.passengers} / {load.capacity}
                </b>{" "}
                vietos
              </span>
              <span>
                <Package size={15} />
                <b>{load.parcels}</b> siuntos
              </span>
            </div>
          </article>
        );
      })}
    </div>
  );
}
