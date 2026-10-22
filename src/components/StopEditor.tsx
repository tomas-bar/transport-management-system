import { useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  SquarePen,
  Check,
  Package,
  Users,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import type { Stop, Place } from "../domain/models";
import {
  routeVisits,
  moveVisit,
  setVisitCompleted,
} from "../domain/route-plan";
import { PlacePicker } from "./PlacePicker";
import { Button, Field, Modal } from "./ui";
import { uid } from "../domain/logic";
import { useApp } from "../context";

export function StopEditor({
  stops,
  onChange,
  readOnly = false,
}: {
  stops: Stop[];
  onChange: (v: Stop[]) => void;
  readOnly?: boolean;
}) {
  const { db } = useApp();
  const [adding, setAdding] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const [arrival, setArrival] = useState("");
  const [note, setNote] = useState("");
  const [edit, setEdit] = useState<Stop | null>(null);
  const visits = routeVisits(stops);
  function editStop(s: Stop) {
    setEdit(s);
    setPlace(s);
    setArrival(s.arrival ?? "");
    setNote(s.note ?? "");
    setAdding(true);
  }
  return (
    <div className="stop-editor">
      <div className="stop-list">
        {visits.map((visit, i) => {
          const s = visit.place;
          const manual = visit.stops.find((p) => !p.orderId);
          const tasks = visit.stops.filter((p) => p.orderId);
          return (
            <div
              className={`stop-row ${visit.completed ? "done" : ""}`}
              key={s.id}
            >
              <div className="stop-index-wrap">
                <span className="stop-index">{visit.number}</span>
                {visit.completed && (
                  <span className="stop-complete">
                    <Check size={10} />
                  </span>
                )}
              </div>
              <div className="stop-info">
                <b>{s.name}</b>
                <small>{s.address}</small>
                {(manual?.arrival || s.arrival) && (
                  <span className="stop-time">
                    {(manual?.arrival || s.arrival)?.replace("T", " ")}
                  </span>
                )}
                {tasks.length > 0 && (
                  <div className="stop-tasks">
                    {tasks.map((task) => {
                      const order = db.orders.find(
                        (o) => o.id === task.orderId,
                      );
                      return (
                        <div
                          key={task.id}
                          className={`stop-task task-${task.kind}`}
                        >
                          {order?.type === "passenger" ? (
                            <Users size={12} />
                          ) : (
                            <Package size={12} />
                          )}
                          <span>
                            <span className={`task-action ${task.kind}`}>
                              {task.kind === "pickup" ? (
                                <ArrowUpRight size={12} />
                              ) : (
                                <ArrowDownRight size={12} />
                              )}{" "}
                              {task.kind === "pickup"
                                ? "Paėmimas"
                                : "Pristatymas"}
                            </span>{" "}
                            {order?.name ?? "Užsakymas"}
                            {order ? ` (${order.quantity})` : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {(manual?.note || s.note) && (
                  <small>{manual?.note || s.note}</small>
                )}
              </div>
              {!readOnly && (
                <div className="stop-actions">
                  <button
                    type="button"
                    aria-label={`Perkelti ${s.name} aukštyn`}
                    disabled={i === 0}
                    onClick={() => onChange(moveVisit(stops, i, -1))}
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Perkelti ${s.name} žemyn`}
                    disabled={i === visits.length - 1}
                    onClick={() => onChange(moveVisit(stops, i, 1))}
                  >
                    <ArrowDown size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Redaguoti ${s.name}`}
                    onClick={() => editStop(manual ?? s)}
                  >
                    <SquarePen size={15} />
                  </button>
                  {manual && tasks.length === 0 && (
                    <button
                      type="button"
                      aria-label={`Pašalinti ${s.name} maršruto tašką`}
                      onClick={() =>
                        onChange(stops.filter((p) => p.id !== manual.id))
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`${visit.completed ? "Atšaukti atvykimą" : "Pažymėti atvykimą"}: ${s.name}`}
                    aria-pressed={visit.completed}
                    className={visit.completed ? "selected" : ""}
                    onClick={() =>
                      onChange(setVisitCompleted(stops, i, !visit.completed))
                    }
                  >
                    <Check size={15} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!readOnly && (
        <Button
          variant="secondary"
          className="add-stop"
          onClick={() => {
            setEdit(null);
            setPlace(null);
            setNote("");
            setArrival("");
            setAdding(true);
          }}
        >
          <Plus size={16} />
          Pridėti sustojimą
        </Button>
      )}
      {adding && (
        <Modal
          title={edit ? "Redaguoti sustojimą" : "Naujas sustojimas"}
          onClose={() => setAdding(false)}
        >
          <div className="modal-body">
            <PlacePicker
              label="Vieta"
              value={place}
              disabled={!!edit?.orderId}
              onChange={setPlace}
            />
            <div className="form-grid">
              <Field label="Planuojamas atvykimas">
                <input
                  type="datetime-local"
                  value={arrival}
                  onChange={(e) => setArrival(e.target.value)}
                />
              </Field>
              <Field label="Pastabos">
                <input
                  maxLength={1000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
            </div>
            {edit?.orderId && (
              <p className="notice">Adresas keičiamas užsakyme.</p>
            )}
          </div>
          <footer>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Atšaukti
            </Button>
            <Button
              disabled={!place}
              onClick={() => {
                if (!place) return;
                const updated: Stop = {
                  ...edit,
                  ...place,
                  id: edit?.id ?? uid(),
                  arrival,
                  note,
                };
                onChange(
                  edit
                    ? stops.map((s) => (s.id === edit.id ? updated : s))
                    : [...stops, updated],
                );
                setAdding(false);
              }}
            >
              Išsaugoti
            </Button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
