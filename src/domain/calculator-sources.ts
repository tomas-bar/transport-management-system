import type { Database, Place, Stop, Trip } from './models.ts';
import { routeVisits, sameLocation } from './route-plan.ts';
import { emptyCalculator, type CalculatorInput, type CalculatorRates, type CalculatorState } from './calculator.ts';

export function resolvedRates(db: Database, state: CalculatorState, vehicleId: string): CalculatorRates {
  const vehicle = db.vehicles.find(row => row.id === vehicleId);
  return {
    ...structuredClone(state.defaults), ...structuredClone(Object.hasOwn(state.vehicles, vehicleId) ? state.vehicles[vehicleId] : {}),
    consumption: vehicle ? vehicle.consumption : state.defaults.consumption,
  };
}

/** An explicit copy. No live references to company/vehicle rates survive in the form. */
export function useVehicle(input: CalculatorInput, db: Database, vehicleId: string, state = emptyCalculator(), now = new Date().toISOString()): CalculatorInput {
  const vehicle = db.vehicles.find(row => row.id === vehicleId);
  return {
    ...structuredClone(input), vehicleId: vehicle?.id ?? '',
    vehicleLabel: vehicle ? `${vehicle.make} ${vehicle.model} · ${vehicle.plate}` : '',
    seats: vehicle ? vehicle.seats : input.seats,
    rates: resolvedRates(db, state, vehicleId), assumptionsAt: now,
  };
}

const place = (value: Place): Place => ({ name: value.name, address: value.address, lat: value.lat, lng: value.lng });
export function useRoute(input: CalculatorInput, id: string, label: string, stops: Stop[], kind: 'route' | 'trip'): CalculatorInput {
  const visits = routeVisits(stops);
  return {
    ...structuredClone(input), routeKm: null, drivingMinutes: null, turnaround: null,
    includesReturn: visits.length > 2 && sameLocation(visits[0].place, visits.at(-1)!.place),
    bookings: [], revenueMode: input.revenueMode === 'bookings' ? 'detailed' : input.revenueMode,
    route: { kind, id, label, stops: visits.map(visit => place(visit.place)) },
  };
}

/** Copies quoted order totals, not paid balances. Segment positions remain reproducible. */
export function useTrip(input: CalculatorInput, db: Database, trip: Trip, state = emptyCalculator(), now = new Date().toISOString()): CalculatorInput {
  const next = useRoute(useVehicle(input, db, trip.vehicleId, state, now), trip.id, `${trip.number} · ${trip.name}`, trip.stops, 'trip');
  const visits = routeVisits(trip.stops);
  next.bookings = db.orders.filter(row => row.tripId === trip.id && row.status !== 'cancelled').map(row => ({
    id: row.id, name: row.name, type: row.type, quantity: row.quantity,
    price: row.priceSet === false ? null : row.price,
    pickup: visits.findIndex(visit => visit.stops.some(stop => stop.orderId === row.id && stop.kind === 'pickup')),
    delivery: visits.findIndex(visit => visit.stops.some(stop => stop.orderId === row.id && stop.kind === 'delivery')),
  }));
  next.revenueMode = next.bookings.length ? 'bookings' : 'detailed';
  next.returnRevenue = false;
  next.driverDays = Math.max(1, Math.ceil((Date.parse(trip.arrival) - Date.parse(trip.departure)) / 86400000));
  return next;
}

/** Only add a return traversal when explicitly requested and the copied route is not closed. */
export function calculationStops(input: CalculatorInput): Stop[] {
  const points = structuredClone(input.route.stops);
  if (input.includesReturn && points.length >= 2 && !sameLocation(points[0] as Stop, points.at(-1) as Stop)) {
    points.push(...points.slice(0, -1).reverse());
  }
  return points.map((point, index) => ({ ...point, id: `calculation-${index}` }));
}

export function primaryScenario(state: CalculatorState | undefined, tripId: string) {
  const linked = state?.scenarios.filter(row => row.tripId === tripId) ?? [];
  return { linked, selected: linked.find(row => row.primary) ?? (linked.length === 1 ? linked[0] : undefined) };
}

