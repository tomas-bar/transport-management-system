import { useId, useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  SquarePen,
  Check,
  Package,
  Users,
  MoreHorizontal,
  ChevronDown,
} from "lucide-react";
import type { Stop, Place } from "../domain/models";
import {
  routeVisits,
  moveVisit,
  setVisitCompleted,
  visitTasks,
} from "../domain/route-plan";
import { PlacePicker } from "./PlacePicker";
import { Button, Field, Modal } from "./ui";
import { uid } from "../domain/logic";
import { useApp } from "../context";
import { tripProgress } from '../domain/trip-progress';
import { handoverLabels, visitStateLabels } from '../domain/terminology';
import { TaskDetails } from './TaskDetails';

export function StopEditor({
  stops,
  onChange,
  readOnly = false,
  tripId,
  canConfirmArrival = true,
}: {
  stops: Stop[];
  onChange: (v: Stop[]) => void;
  readOnly?: boolean;
  tripId?: string;
  canConfirmArrival?: boolean;
}) {
  const { db, workspace, busy } = useApp();
  const controlsId = useId();
  const [openActions, setOpenActions] = useState<string | null>(null);
  const trip = db.trips.find(trip => trip.id === tripId);
  const progress = trip ? tripProgress(trip, db.orders, workspace.confirmations) : undefined;
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
    <div className={`stop-editor stop-timeline ${progress ? 'is-progress' : ''}`}>
      <div className="stop-list">
        {visits.map((visit, i) => {
          const s = visit.place;
          const manual = visit.stops.find((p) => !p.orderId);
          const tasks = visitTasks(visit, db.orders);
          const execution = progress?.visits[i];
          const done = execution ? execution.done : visit.completed;
          const expanded = openActions === s.id;
          return (
            <div
              className={`stop-row ${execution ? `state-${execution.state}` : visit.completed ? 'done' : ''}`}
              key={s.id}
            >
              <div className="stop-index-wrap">
                <span className="stop-index" aria-label={`Sustojimas ${visit.number}${done ? ', atlikta' : ''}`}>
                  {done ? <Check size={16} /> : visit.number}
                </span>
              </div>
              <div className="stop-info">
                <div className="stop-title"><b>{s.name}</b>{execution && <span className={`stop-state state-${execution.state}`}>
                  {visitStateLabels[execution.state]}</span>}</div>
                <small>{s.address}</small>
                {(manual?.arrival || s.arrival) && (
                  <span className="stop-time">
                    {(manual?.arrival || s.arrival)?.replace("T", " ")}
                  </span>
                )}
                {tasks.length > 0 && (
                  <div className="stop-tasks">
                    {tasks.map((task) => {
                      const order = db.orders.find(order => order.id === task.orderId);
                      const done = execution?.tasks.find(item => item.stopId === task.stopId)?.done;
                      return (
                        <div
                          key={task.stopId}
                          className={`stop-task task-${task.kind} ${done ? 'is-done' : ''}`}
                        >
                          <span className="stop-task-symbol" aria-hidden="true">{task.type === 'passenger' ? <Users size={18} /> : <Package size={18} />}</span>
                          <TaskDetails task={task} order={order} className="stop-task-info" />
                          {done && <span className="stop-task-done"><Check size={12} />{handoverLabels[task.kind].done}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
                {(manual?.note || s.note) && (
                  <small>{manual?.note || s.note}</small>
                )}
              </div>
              {!readOnly && <>
                <button type="button" className="stop-actions-toggle" aria-expanded={expanded} aria-controls={`${controlsId}-${s.id}`}
                  onClick={() => setOpenActions(expanded ? null : s.id)}>
                  <MoreHorizontal size={18} />Veiksmai<ChevronDown size={14} />
                </button>
                <div id={`${controlsId}-${s.id}`} className={`stop-actions ${expanded ? 'is-open' : ''}`}>
                  <button
                    type="button"
                    aria-label={`Perkelti ${s.name} aukštyn`}
                    title="Perkelti aukštyn"
                    disabled={busy || i === 0}
                    onClick={() => onChange(moveVisit(stops, i, -1))}
                  >
                    <ArrowUp size={16} /><span>Aukštyn</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Perkelti ${s.name} žemyn`}
                    title="Perkelti žemyn"
                    disabled={busy || i === visits.length - 1}
                    onClick={() => onChange(moveVisit(stops, i, 1))}
                  >
                    <ArrowDown size={16} /><span>Žemyn</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Redaguoti ${s.name}`}
                    title="Redaguoti sustojimą"
                    disabled={busy}
                    onClick={() => editStop(manual ?? s)}
                  >
                    <SquarePen size={16} /><span>Redaguoti</span>
                  </button>
                  {manual && tasks.length === 0 && (
                    <button
                      type="button"
                      aria-label={`Pašalinti ${s.name} maršruto tašką`}
                      title="Pašalinti sustojimą"
                      disabled={busy}
                      onClick={() =>
                        onChange(stops.filter((p) => p.id !== manual.id))
                      }
                    >
                      <Trash2 size={16} /><span>Pašalinti</span>
                    </button>
                  )}
                  {canConfirmArrival && <button
                    type="button"
                    aria-label={`${visit.completed ? "Atšaukti atvykimą" : "Pažymėti atvykimą"}: ${s.name}`}
                    aria-pressed={visit.completed}
                    title={visit.completed ? 'Atšaukti atvykimą' : 'Pažymėti atvykimą'}
                    disabled={busy}
                    className={visit.completed ? "selected" : ""}
                    onClick={() =>
                      onChange(setVisitCompleted(stops, i, !visit.completed))
                    }
                  >
                    <Check size={16} /><span>{visit.completed ? 'Atšaukti atvykimą' : 'Atvykta'}</span>
                  </button>}
                </div>
              </>}
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
