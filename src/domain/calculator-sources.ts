import type { Database, Place, Stop, Trip } from './models.ts';
import { routeVisits, sameLocation } from './route-plan.ts';
import { emptyCalculator, type CalculatorInput, type CalculatorRates, type CalculatorState, type ExtraCost, type OptionalCost } from './calculator.ts';
import { sumCents } from './cost-math.ts';

/** Recorded supplemental expenses only. Fuel and maintenance stay outside this copy. */
export function tripExpenseAssumptions(db: Database, tripId: string) {
  if (!tripId) return { extras: {} as Partial<Record<ExtraCost, OptionalCost>>, total: 0 };
  const categories: Partial<Record<ExtraCost, string>> = {
    tolls: 'Kelių mokesčiai', accommodation: 'Nakvynė', parking: 'Parkavimas', other: 'Kitos išlaidos',
  };
  const extras: Partial<Record<ExtraCost, OptionalCost>> = {};
  for (const [key, category] of Object.entries(categories)) {
    const rows = db.expenses.filter(row => row.tripId === tripId && row.category === category);
    if (rows.length) extras[key as ExtraCost] = { included: true, amount: sumCents(rows.map(row => row.amount)) };
  }
  return { extras, total: sumCents(Object.values(extras).map(row => row.amount!)) };
}

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
  // Copied assumptions, not invented operational bookings or revenue.
  for (const type of ['passenger', 'parcel'] as const) {
    const quantity = trip.unlisted?.[type === 'passenger' ? 'passengers' : 'parcels'] ?? 0;
    if (quantity > 0 && visits.length > 1) next.bookings.push({ id: crypto.randomUUID(), name: type === 'passenger' ? 'Keleiviai be sąrašo' : 'Siuntos be sąrašo', type, quantity, price: null, pickup: 0, delivery: visits.length - 1 });
  }
  next.revenueMode = next.bookings.length ? 'bookings' : 'detailed';
  if (visits.length < 2 && trip.unlisted) {
    // A quick trip may have no route yet. Do not invent segment indices just to import quantities.
    next.outbound = { passengers: trip.unlisted.passengers, ticket: null, parcels: trip.unlisted.parcels, parcelPrice: null };
  }
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

