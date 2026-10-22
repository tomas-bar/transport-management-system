import type { Stop } from "./models.ts";

export interface RouteVisit {
  number: number;
  place: Stop;
  stops: Stop[];
  completed: boolean;
}

/** Adjacent records at the same coordinates are one physical visit.
 * Non-adjacent returns to the same location remain separate visits. */
export function routeVisits(stops: Stop[]): RouteVisit[] {
  const visits: RouteVisit[] = [];
  for (const stop of stops) {
    const previous = visits.at(-1);
    if (previous && sameLocation(previous.place, stop)) {
      previous.stops.push(stop);
      previous.completed = previous.stops.some((s) => !!s.completed);
    } else {
      visits.push({
        number: visits.length + 1,
        place: stop,
        stops: [stop],
        completed: !!stop.completed,
      });
    }
  }
  return visits;
}

export function sameLocation(a: Stop, b: Stop) {
  return (
    Math.abs(a.lat - b.lat) < 0.000001 && Math.abs(a.lng - b.lng) < 0.000001
  );
}

export function moveVisit(stops: Stop[], index: number, delta: -1 | 1): Stop[] {
  const visits = routeVisits(stops);
  if (index + delta < 0 || index + delta >= visits.length) return stops;
  [visits[index], visits[index + delta]] = [
    visits[index + delta],
    visits[index],
  ];
  return visits.flatMap((v) => v.stops);
}

export function setVisitCompleted(
  stops: Stop[],
  index: number,
  completed: boolean,
): Stop[] {
  const ids = new Set(routeVisits(stops)[index]?.stops.map((s) => s.id));
  return stops.map((s) => (ids.has(s.id) ? { ...s, completed } : s));
}

export interface VisitTask {
  stopId: string;
  orderId: string;
  kind: "pickup" | "delivery";
  type: "passenger" | "parcel";
  name: string;
  quantity: number;
  phone: string;
}

/** Optional booking details projected onto physical route visits. */
export function visitTasks(
  visit: RouteVisit,
  orders: import("./models.ts").Order[],
): VisitTask[] {
  return visit.stops.flatMap((stop) => {
    const order = orders.find(
      (o) => o.id === stop.orderId && o.status !== "cancelled",
    );
    if (!order || !stop.kind) return [];
    return [
      {
        stopId: stop.id,
        orderId: order.id,
        kind: stop.kind,
        type: order.type,
        name:
          stop.kind === "delivery" && order.type === "parcel"
            ? order.recipient || order.name
            : order.name,
        quantity: order.quantity,
        phone:
          stop.kind === "delivery" && order.type === "parcel"
            ? order.recipientPhone
            : order.phone,
      },
    ];
  });
}

function distance(
  a: import("./models.ts").Place,
  b: import("./models.ts").Place,
) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad,
    dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
function insertionCost(stops: Stop[], stop: Stop, index: number) {
  const before = stops[index - 1],
    after = stops[index];
  return (
    (before ? distance(before, stop) : 0) +
    (after ? distance(stop, after) : 0) -
    (before && after ? distance(before, after) : 0)
  );
}

/** A geographic insertion suggestion, not road routing or route optimization.
 * Keeps the driver's existing sequence and confirmed prefix, and puts pickup before delivery. */
export function insertOrderStops(
  stops: Stop[],
  pickup: Stop,
  delivery: Stop,
): Stop[] {
  const first = stops.findLastIndex((s) => s.completed) + 1;
  let best = Number.POSITIVE_INFINITY;
  let result: Stop[] = [];
  for (let i = first; i <= stops.length; i++) {
    const pickupCost = insertionCost(stops, pickup, i);
    const withPickup = [...stops.slice(0, i), pickup, ...stops.slice(i)];
    for (let j = i + 1; j <= withPickup.length; j++) {
      const cost = pickupCost + insertionCost(withPickup, delivery, j);
      if (cost < best - 0.01) {
        best = cost;
        result = [...withPickup.slice(0, j), delivery, ...withPickup.slice(j)];
      }
    }
  }
  return result;
}
