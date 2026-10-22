import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Stop } from "../domain/models";
import {
  routeVisits,
  setVisitCompleted,
  visitTasks,
} from "../domain/route-plan";
import { roadRoute } from "../services/maps";
import type { RoadRoute } from "../services/maps";
import { markerContent } from "../services/map-markers";
import { useApp } from "../context";
import {
  Route,
  Clock3,
  RefreshCw,
  Maximize2,
  MapPin,
  Users,
  Package,
  ArrowUpRight,
  ArrowDownRight,
  Check,
  X,
  ExternalLink,
  Layers,
  LockKeyhole,
  Hand,
} from "lucide-react";
import { Button } from "./ui";

type TaskFilter = "all" | "passenger" | "parcel";
export function MapView({
  stops,
  compact = false,
  onStopsChange,
}: {
  stops: Stop[];
  compact?: boolean;
  onStopsChange?: (stops: Stop[]) => unknown;
}) {
  const { db, busy } = useApp();
  const ref = useRef<HTMLDivElement>(null),
    shell = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null),
    fitRef = useRef<() => void>(() => {}),
    interacted = useRef(false);
  const [route, setRoute] = useState<RoadRoute | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [loading, setLoading] = useState(false),
    [tileError, setTileError] = useState(false);
  const [expanded, setExpanded] = useState(false),
    [interactive, setInteractive] = useState(false),
    [filter, setFilter] = useState<TaskFilter>("all"),
    [selected, setSelected] = useState<string | null>(null),
    [layersOpen, setLayersOpen] = useState(false),
    [satellite, setSatellite] = useState(false);
  const visits = routeVisits(stops);
  const coordinates = visits
    .map((v) => `${v.place.lat},${v.place.lng}`)
    .join(";");
  const taskData = useMemo(
    () => visits.map((v) => visitTasks(v, db.orders)),
    [JSON.stringify(stops), db.orders],
  );
  const markerSignature = JSON.stringify(
    visits.map((v, i) => [v.number, v.place.name, v.completed, taskData[i]]),
  );
  const selectedVisit = visits.find((v) =>
    v.stops.some((s) => s.id === selected),
  );
  const selectedTasks = selectedVisit
    ? visitTasks(selectedVisit, db.orders).filter(
        (t) => filter === "all" || t.type === filter,
      )
    : [];
  const canInteract = interactive || expanded;
  const nextVisit = visits.find((v) => !v.completed);
  useEffect(() => {
    if (!ref.current) return;
    const element = ref.current;
    const map = L.map(element, {
      scrollWheelZoom: false,
      zoomControl: false,
      dragging: !window.matchMedia("(pointer: coarse)").matches,
      touchZoom: false,
      keyboard: false,
      doubleClickZoom: false,
      zoomSnap: 0.5,
    }).setView([53, 18], 5);
    mapRef.current = map;
    L.control
      .zoom({
        position: "bottomright",
        zoomInTitle: "Priartinti",
        zoomOutTitle: "Atitolinti",
      })
      .addTo(map);
    const onPointer = () => {
      interacted.current = true;
    };
    element.addEventListener("pointerdown", onPointer);
    const resize = new ResizeObserver(() => {
      map.invalidateSize({ pan: false });
      if (!interacted.current) fitRef.current();
    });
    resize.observe(element);
    return () => {
      resize.disconnect();
      element.removeEventListener("pointerdown", onPointer);
      map.remove();
      mapRef.current = null;
    };
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setTileError(false);
    const layer = satellite
      ? L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          {
            maxZoom: 19,
            attribution:
              "Imagery &copy; Esri, Maxar, Earthstar Geographics, GIS User Community",
          },
        )
      : L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        });
    layer.on("tileerror", () => setTileError(true)).addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [satellite]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (canInteract || !coarse) map.dragging.enable();
    else map.dragging.disable();
    if (canInteract) {
      map.touchZoom.enable();
      map.keyboard.enable();
      map.doubleClickZoom.enable();
    } else {
      map.touchZoom.disable();
      map.keyboard.disable();
      map.doubleClickZoom.disable();
    }
    map.invalidateSize({ pan: false });
    if (expanded) fitRef.current();
  }, [canInteract, expanded]);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.activeElement as HTMLElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeButton =
      shell.current?.querySelector<HTMLButtonElement>("[data-close-map]");
    closeButton?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
      if (e.key === "Tab") {
        const list = Array.from(
          shell.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),a[href],[tabindex="0"]',
          ) ?? [],
        ).filter((el) => el.offsetParent !== null);
        if (e.shiftKey && document.activeElement === list[0]) {
          e.preventDefault();
          list.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === list.at(-1)) {
          e.preventDefault();
          list[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [expanded]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    interacted.current = false;
    fitRef.current = () => {
      if (visits.length) {
        map.invalidateSize({ pan: false });
        map.fitBounds(
          L.latLngBounds(visits.map((v) => [v.place.lat, v.place.lng])),
          {
            paddingTopLeft: [55, 40],
            paddingBottomRight: [65, 55],
            maxZoom: 13,
            animate: false,
          },
        );
      }
    };
    fitRef.current();
  }, [coordinates]);
  useEffect(() => {
    setRoute(null);
    setError("");
    if (visits.length < 2) return;
    const controller = new AbortController();
    let disposed = false;
    setLoading(true);
    const timeout = setTimeout(() => controller.abort(), 20000);
    roadRoute(stops, db.settings.routingUrl, controller.signal)
      .then((r) => {
        if (!disposed) setRoute(r);
      })
      .catch((e) => {
        if (!disposed)
          setError(
            controller.signal.aborted
              ? "Maršruto skaičiavimas užtruko."
              : e.message,
          );
      })
      .finally(() => {
        clearTimeout(timeout);
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [coordinates, db.settings.routingUrl, retry]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layer = L.featureGroup().addTo(map);
    if (route) {
      L.polyline(route.coordinates, {
        color: "#fff",
        weight: 7,
        opacity: 0.75,
        interactive: false,
      }).addTo(layer);
      L.polyline(route.coordinates, {
        color: "#196eb2",
        weight: 4,
        opacity: 0.94,
        interactive: false,
      }).addTo(layer);
    }
    return () => {
      map.removeLayer(layer);
    };
  }, [route]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layer = L.featureGroup().addTo(map);
    const render = () => {
      layer.clearLayers();
      const grouped = new Map<string, number[]>();
      visits.forEach((v, i) => {
        const key = `${v.place.lat.toFixed(6)},${v.place.lng.toFixed(6)}`;
        grouped.set(key, [...(grouped.get(key) ?? []), i]);
      });
      const occupied: { x: number; y: number; width: number }[] = [];
      for (const indexes of grouped.values()) {
        const group = indexes.map((i) => visits[i]),
          place = group[0].place;
        const tasks = indexes
          .flatMap((i) => taskData[i])
          .filter((t) => filter === "all" || t.type === filter);
        const allTasks = indexes.flatMap((i) => taskData[i]);
        if (filter !== "all" && allTasks.length && !tasks.length) continue;
        const done = group.every((v) => v.completed);
        const content = markerContent(
          group.map((v) => v.number),
          tasks,
          done,
          compact && !expanded,
        );
        const anchor = map.latLngToLayerPoint([place.lat, place.lng]);
        let offset = L.point(0, 0);
        for (const [x, y] of [
          [0, 0],
          [0, -42],
          [0, 42],
          [72, 0],
          [-72, 0],
          [72, -42],
          [-72, 42],
          [0, -84],
          [0, 84],
        ]) {
          const p = anchor.add(L.point(x, y));
          if (
            !occupied.some(
              (o) =>
                Math.abs(o.x - p.x) < (o.width + content.width) / 2 + 5 &&
                Math.abs(o.y - p.y) < 36,
            )
          ) {
            offset = L.point(x, y);
            occupied.push({ x: p.x, y: p.y, width: content.width });
            break;
          }
        }
        if (offset.x || offset.y) {
          L.polyline(
            [
              [place.lat, place.lng],
              map.layerPointToLatLng(anchor.add(offset)),
            ],
            { color: "#617f98", weight: 1.1, interactive: false },
          ).addTo(layer);
          L.circleMarker([place.lat, place.lng], {
            radius: 3,
            color: done ? "#378263" : "#277ab3",
            fillOpacity: 1,
            weight: 1,
          }).addTo(layer);
        }
        const icon = L.divIcon({
          className: "map-stop-marker operational-marker",
          html: content.html,
          iconSize: [content.width, 30],
          iconAnchor: [content.width / 2 - offset.x, 15 - offset.y],
        });
        const marker = L.marker([place.lat, place.lng], {
          icon,
          title: `${group.map((v) => v.number).join(", ")}. ${place.name}${done ? " · Atvykta" : ""}`,
          zIndexOffset: 1000,
        }).addTo(layer);
        marker.on("click", () => {
          setSelected(group.find((v) => !v.completed)?.place.id ?? place.id);
        });
      }
    };
    render();
    map.on("zoomend", render);
    return () => {
      map.off("zoomend", render);
      map.removeLayer(layer);
    };
  }, [coordinates, markerSignature, filter, compact, expanded]);
  const mapSummary = loading ? (
    <span>Skaičiuojamas maršrutas...</span>
  ) : error ? (
    <>
      <span className="map-error">{error}</span>
      <button
        type="button"
        aria-label="Pakartoti skaičiavimą"
        onClick={() => setRetry((x) => x + 1)}
      >
        <RefreshCw size={15} />
      </button>
    </>
  ) : route ? (
    <>
      <span>
        <Route size={15} />
        {Math.round(route.distance / 1000).toLocaleString("lt-LT")} km
      </span>
      <span>
        <Clock3 size={15} />
        {Math.floor(route.duration / 3600)} val.{" "}
        {Math.floor((route.duration % 3600) / 60)} min.
      </span>
    </>
  ) : null;
  return (
    <div
      ref={shell}
      className={`map-module ${expanded ? "is-expanded" : ""} ${satellite ? "is-satellite" : ""}`}
      role={expanded ? "dialog" : undefined}
      aria-modal={expanded || undefined}
      aria-label="Reiso žemėlapis"
    >
      <div className="map-toolbar">
        <div className="map-task-filters" aria-label="Žemėlapio užsakymai">
          {(["all", "passenger", "parcel"] as TaskFilter[]).map((value) => (
            <button
              type="button"
              className={filter === value ? "selected" : ""}
              aria-pressed={filter === value}
              key={value}
              onClick={() => setFilter(value)}
            >
              {value === "passenger" ? (
                <Users size={14} />
              ) : value === "parcel" ? (
                <Package size={14} />
              ) : null}
              {value === "all"
                ? "Visi"
                : value === "passenger"
                  ? "Keleiviai"
                  : "Siuntos"}
            </button>
          ))}
        </div>
        <div className="map-tools">
          <button
            type="button"
            aria-label="Rodyti visą maršrutą"
            title="Visas maršrutas"
            onClick={() => {
              interacted.current = false;
              fitRef.current();
            }}
          >
            <MapPin size={17} />
          </button>
          <button
            type="button"
            aria-label="Žemėlapio sluoksniai"
            aria-expanded={layersOpen}
            onClick={() => setLayersOpen((v) => !v)}
          >
            <Layers size={17} />
          </button>
          <button
            type="button"
            data-close-map={expanded || undefined}
            aria-label={
              expanded ? "Uždaryti išplėstą žemėlapį" : "Išplėsti žemėlapį"
            }
            title={expanded ? "Uždaryti" : "Išplėsti"}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <X size={19} /> : <Maximize2 size={17} />}
          </button>
        </div>
      </div>
      {layersOpen && (
        <div className="map-layer-options">
          <button
            type="button"
            className={!satellite ? "selected" : ""}
            onClick={() => {
              setSatellite(false);
              setLayersOpen(false);
            }}
          >
            Žemėlapis
          </button>
          <button
            type="button"
            className={satellite ? "selected" : ""}
            onClick={() => {
              setSatellite(true);
              setLayersOpen(false);
            }}
          >
            Palydovas
          </button>
        </div>
      )}
      <div
        className={`map-wrap ${compact && !expanded ? "compact" : ""} ${canInteract ? "can-interact" : ""}`}
      >
        <div ref={ref} className="map" aria-label="Interaktyvus maršrutas" />
        {!visits.length && <div className="map-message">Sustojimų nėra.</div>}
        {tileError && (
          <div className="tile-warning">Dalis žemėlapio neįkelta.</div>
        )}
        {!expanded && (
          <button
            type="button"
            className={`map-touch-control ${canInteract ? "unlocked" : ""}`}
            onClick={() => setInteractive((v) => !v)}
          >
            {canInteract ? <LockKeyhole size={13} /> : <Hand size={13} />}{" "}
            {canInteract ? "Baigti valdyti" : "Valdyti žemėlapį"}
          </button>
        )}
      </div>
      <div className="map-meta">
        <div className="map-metrics">{mapSummary}</div>
        <div className="map-legend">
          <span className="pickup">
            <ArrowUpRight size={13} />
            Paėmimas
          </span>
          <span className="delivery">
            <ArrowDownRight size={13} />
            Pristatymas
          </span>
          <span className="arrived">
            <Check size={13} />
            Atvykta {visits.filter((v) => v.completed).length}/{visits.length}
          </span>
        </div>
      </div>
      {selectedVisit && (
        <section className="map-selection" aria-label="Pasirinktas sustojimas">
          <div className="map-selection-heading">
            <span
              className={`stop-index ${selectedVisit.completed ? "arrived" : ""}`}
            >
              {selectedVisit.number}
            </span>
            <div>
              <b>{selectedVisit.place.name}</b>
              <small>{selectedVisit.place.address}</small>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Uždaryti sustojimo informaciją"
              onClick={() => setSelected(null)}
            >
              <X size={17} />
            </button>
          </div>
          <div className="map-selected-tasks">
            {selectedTasks.map((task) => (
              <div
                key={task.stopId}
                className={`map-selected-task ${task.kind}`}
              >
                {task.type === "passenger" ? (
                  <Users size={16} />
                ) : (
                  <Package size={16} />
                )}
                <div>
                  <span className={`task-action ${task.kind}`}>
                    {task.kind === "pickup" ? "Paėmimas" : "Pristatymas"} ·{" "}
                    {task.quantity}{" "}
                    {task.type === "passenger" ? "kel." : "vnt."}
                  </span>
                  <b>{task.name}</b>
                  {task.phone && <small>{task.phone}</small>}
                </div>
              </div>
            ))}
          </div>
          <div className="map-selection-actions">
            {selectedVisit.completed && nextVisit && (
              <Button
                onClick={() => {
                  setSelected(nextVisit.place.id);
                  mapRef.current?.setView(
                    [nextVisit.place.lat, nextVisit.place.lng],
                    Math.max(mapRef.current.getZoom(), 10),
                    { animate: false },
                  );
                }}
              >
                Kitas sustojimas
              </Button>
            )}
            {onStopsChange && (
              <Button
                variant={selectedVisit.completed ? "secondary" : "primary"}
                disabled={busy}
                onClick={() =>
                  onStopsChange(
                    setVisitCompleted(
                      stops,
                      selectedVisit.number - 1,
                      !selectedVisit.completed,
                    ),
                  )
                }
              >
                <Check size={15} />
                {selectedVisit.completed
                  ? "Atšaukti atvykimą"
                  : "Pažymėti atvykimą"}
              </Button>
            )}
            <a
              href={`https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", destination: `${selectedVisit.place.lat},${selectedVisit.place.lng}`, travelmode: "driving" })}`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={14} />
              Navigacija į sustojimą
            </a>
          </div>
        </section>
      )}
    </div>
  );
}
