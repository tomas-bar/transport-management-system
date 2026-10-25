import { extendedCost, sumCents } from './cost-math.ts';
import type { Place } from './models.ts';

export const calculationVersion = 1 as const;
export const calculationUnits = {
  currency: 'EUR', money: 'cent', rateUnitsPerEuro: 10000,
  distance: 'km', consumption: 'l/100km', time: 'minute',
} as const;

/** Amounts are cents; fuel and wear rates are integer ten-thousandths of EUR. */
export interface CalculatorRates {
  consumption: number | null;
  fuelPrice: number | null;
  wearPerKm: number | null;
  driverModel: 'trip' | 'day';
  driverPay: number | null;
  waitingPerHour: number | null;
}
export type VehicleRates = Partial<Omit<CalculatorRates, 'consumption'>>;
export interface OptionalCost { included: boolean; amount: number | null }
export const extraCostLabels = {
  tolls: 'Kelių mokesčiai', ferries: 'Keltai', accommodation: 'Nakvynės',
  parking: 'Parkavimas', other: 'Kitos išlaidos', fixedShare: 'Pastoviųjų sąnaudų dalis reisui',
} as const;
export type ExtraCost = keyof typeof extraCostLabels;
export interface DirectionRevenue {
  passengers: number | null;
  ticket: number | null;
  parcels: number | null;
  parcelPrice: number | null;
}
export interface BookingAssumption {
  id: string; name: string; type: 'passenger' | 'parcel';
  quantity: number | null; price: number | null;
  pickup: number; delivery: number;
}
export interface CalculatorInput {
  vehicleId: string;
  vehicleLabel: string;
  seats: number | null;
  routeKm: number | null;
  extraKm: number | null;
  drivingMinutes: number | null;
  includesReturn: boolean;
  rates: CalculatorRates;
  includeFuel: boolean;
  includeWear: boolean;
  includeDriver: boolean;
  driverDays: number | null;
  includeWaiting: boolean;
  waitingMinutes: number | null;
  extras: Record<ExtraCost, OptionalCost>;
  revenueMode: 'detailed' | 'total' | 'bookings';
  outbound: DirectionRevenue;
  returnLeg: DirectionRevenue;
  returnRevenue: boolean;
  otherRevenue: OptionalCost;
  totalRevenue: number | null;
  bookings: BookingAssumption[];
  turnaround: number | null;
  route: { kind: 'manual' | 'route' | 'trip'; id: string; label: string; stops: Place[] };
  monthlyTrips: number | null;
  month: string;
  monthlyFixed: OptionalCost;
  assumptionsAt: string;
}
export interface Calculation {
  modelVersion: 1;
  trip: {
    km: number | null; revenue: number | null; knownRevenue: number;
    costs: Record<string, number | null>; variableCost: number | null;
    totalCost: number | null; knownCost: number; remainder: number | null;
    costPerKm: number | null; coverage: number | null; shortfall: number | null;
    occupancy: { outbound: number | null; returnLeg: number | null; peak: number | null };
    breakEvenOccupancy: number | null;
  };
  month: {
    revenue: number | null; tripCosts: number | null; fixed: number | null;
    totalCost: number | null; remainder: number | null; shortfall: number | null;
  };
  missing: string[];
  warnings: string[];
}
export interface CalculatorScenario {
  id: string; revision: number; name: string;
  tripId: string; primary: boolean;
  createdAt: string; calculatedAt: string;
  modelVersion: number; units: typeof calculationUnits;
  input: CalculatorInput;
  result: Calculation;
}
export interface CalculatorState {
  version: 1;
  defaults: CalculatorRates;
  vehicles: Record<string, VehicleRates>;
  scenarios: CalculatorScenario[];
}

export const emptyRates = (): CalculatorRates => ({
  consumption: null, fuelPrice: null, wearPerKm: null, driverModel: 'trip',
  driverPay: null, waitingPerHour: null,
});
export const emptyCalculator = (): CalculatorState => ({ version: 1, defaults: emptyRates(), vehicles: {}, scenarios: [] });
const optional = (): OptionalCost => ({ included: false, amount: null });
const direction = (): DirectionRevenue => ({ passengers: 0, ticket: null, parcels: 0, parcelPrice: null });
export function emptyCalculationInput(rates = emptyRates(), now = new Date().toISOString()): CalculatorInput {
  return {
    vehicleId: '', vehicleLabel: '', seats: null, routeKm: null, extraKm: 0,
    drivingMinutes: null, includesReturn: false, rates: structuredClone(rates),
    includeFuel: true, includeWear: true, includeDriver: true, driverDays: 1,
    includeWaiting: false, waitingMinutes: null,
    extras: Object.fromEntries(Object.keys(extraCostLabels).map(key => [key, optional()])) as CalculatorInput['extras'],
    revenueMode: 'detailed', outbound: direction(), returnLeg: direction(), returnRevenue: false,
    otherRevenue: optional(), totalRevenue: null, bookings: [], turnaround: null,
    route: { kind: 'manual', id: '', label: '', stops: [] },
    monthlyTrips: 1, month: now.slice(0, 7), monthlyFixed: optional(), assumptionsAt: now,
  };
}

/** Peak load on actual route segments, so successive bookings do not consume seats together. */
export function bookingPeak(bookings: BookingAssumption[], from = 0, until = Infinity): number | null {
  if (from >= until) return 0;
  const events = new Map<number, number>();
  let aboard = 0;
  for (const row of bookings.filter(row => row.type === 'passenger' && row.pickup < until && row.delivery > from)) {
    if (row.quantity === null) return null;
    if (row.pickup <= from && row.delivery > from) aboard += row.quantity;
    events.set(row.pickup, (events.get(row.pickup) ?? 0) + row.quantity);
    events.set(row.delivery, (events.get(row.delivery) ?? 0) - row.quantity);
  }
  let peak = aboard;
  for (const [point, change] of [...events].sort(([a], [b]) => a - b)) {
    if (point <= from || point >= until) continue;
    aboard += change; peak = Math.max(peak, aboard);
  }
  return peak;
}

/** Version 1 formulas are frozen. Future formula changes must introduce a new version. */
export function calculate(input: CalculatorInput): Calculation {
  const missing = new Set<string>(), warnings: string[] = [];
  const need = (value: number | null, key: string) => { if (value === null) missing.add(key); return value; };
  const multiply = (quantity: number | null, rate: number | null, key: string, scale = 100): number | null => {
    // A deliberate zero quantity needs no price; an unknown quantity still needs an input.
    if (quantity === 0) return 0;
    if (quantity === null || rate === null) { missing.add(key); return null; }
    return extendedCost(quantity, rate, scale);
  };
  const sum = (values: (number | null)[]) => values.some(value => value === null) ? null : sumCents(values as number[]);
  const chosen = (value: OptionalCost, key: string) => value.included ? need(value.amount, key) : 0;
  const km = input.routeKm === null || input.extraKm === null ? null : input.routeKm + input.extraKm;
  need(input.routeKm, 'routeKm'); need(input.extraKm, 'extraKm');
  let passengerRevenue: number | null = 0, nonPassengerRevenue: number | null = 0;
  let revenue: number | null;
  const revenueParts: (number | null)[] = [];
  if (input.revenueMode === 'total') {
    revenue = need(input.totalRevenue, 'totalRevenue'); revenueParts.push(revenue);
  } else if (input.revenueMode === 'bookings') {
    if (!input.bookings.length) missing.add('bookings');
    if (input.bookings.some(row => row.quantity === null)) missing.add('bookingQuantity');
    for (const row of input.bookings) revenueParts.push(need(row.price, 'bookingPrices'));
    revenue = input.bookings.length ? sum(revenueParts) : null;
  } else {
    const directions = [input.outbound, ...(input.returnRevenue ? [input.returnLeg] : [])];
    const passengerParts = directions.map((row, index) => multiply(row.passengers, row.ticket, index ? 'returnPassengers' : 'outboundPassengers'));
    const otherParts = [
      ...directions.map((row, index) => multiply(row.parcels, row.parcelPrice, index ? 'returnParcels' : 'outboundParcels')),
      chosen(input.otherRevenue, 'otherRevenue'),
    ];
    passengerRevenue = sum(passengerParts); nonPassengerRevenue = sum(otherParts);
    revenueParts.push(...passengerParts, ...otherParts);
    revenue = sum(revenueParts);
  }
  const litres = km === 0 ? 0 : km === null || input.rates.consumption === null ? null : km * input.rates.consumption / 100;
  const costs: Record<string, number | null> = {
    fuel: input.includeFuel ? multiply(litres, input.rates.fuelPrice, 'fuel', 10000) : 0,
    wear: input.includeWear ? multiply(km, input.rates.wearPerKm, 'wear', 10000) : 0,
    driver: !input.includeDriver ? 0 : input.rates.driverModel === 'day'
      ? multiply(input.driverDays, input.rates.driverPay, 'driver') : need(input.rates.driverPay, 'driver'),
    waiting: input.includeWaiting ? multiply(input.waitingMinutes === null ? null : input.waitingMinutes / 60, input.rates.waitingPerHour, 'waiting') : 0,
    ...Object.fromEntries(Object.entries(input.extras).map(([key, value]) => [key, chosen(value, key)])),
  };
  const variableCost = sum(Object.entries(costs).filter(([key]) => key !== 'fixedShare').map(([, value]) => value));
  const totalCost = sum(Object.values(costs));
  const occupancy = { outbound: null, returnLeg: null, peak: null } as Calculation['trip']['occupancy'];
  if (input.revenueMode === 'bookings') {
    const peak = bookingPeak(input.bookings);
    occupancy.peak = peak;
    if (input.seats !== null && input.seats > 0) {
      const outboundPeak = bookingPeak(input.bookings, 0, input.turnaround ?? Infinity);
      occupancy.outbound = outboundPeak === null ? null : outboundPeak / input.seats;
      if (input.turnaround !== null) {
        const returnPeak = bookingPeak(input.bookings, input.turnaround);
        occupancy.returnLeg = returnPeak === null ? null : returnPeak / input.seats;
      }
    }
    if (input.seats !== null && peak !== null && peak > input.seats) warnings.push('capacity');
  } else if (input.revenueMode === 'detailed') {
    if (input.seats !== null && input.seats > 0) {
      occupancy.outbound = input.outbound.passengers === null ? null : input.outbound.passengers / input.seats;
      occupancy.returnLeg = input.returnRevenue && input.returnLeg.passengers !== null ? input.returnLeg.passengers / input.seats : null;
    }
    if (input.seats !== null && (input.outbound.passengers !== null && input.outbound.passengers > input.seats
      || input.returnRevenue && input.returnLeg.passengers !== null && input.returnLeg.passengers > input.seats)) warnings.push('capacity');
  }
  if ((input.revenueMode === 'detailed' && input.returnRevenue || input.revenueMode === 'bookings' && input.turnaround !== null)
    && !input.includesReturn) warnings.push('returnDistance');
  let breakEvenOccupancy: number | null = null;
  if (input.revenueMode === 'detailed' && input.seats !== null && input.seats > 0 && totalCost !== null
    && nonPassengerRevenue !== null && input.outbound.ticket !== null && (!input.returnRevenue || input.returnLeg.ticket !== null)) {
    const fullPassengerRevenue = extendedCost(input.seats, input.outbound.ticket)
      + (input.returnRevenue ? extendedCost(input.seats, input.returnLeg.ticket!) : 0);
    if (fullPassengerRevenue > 0) breakEvenOccupancy = Math.max(0, totalCost - nonPassengerRevenue) / fullPassengerRevenue;
  }
  const monthlyCount = need(input.monthlyTrips, 'monthlyTrips');
  const monthlyRevenue = monthlyCount === 0 ? 0 : revenue === null || monthlyCount === null ? null : extendedCost(monthlyCount, revenue);
  const tripCosts = monthlyCount === 0 ? 0 : variableCost === null || monthlyCount === null ? null : extendedCost(monthlyCount, variableCost);
  const fixed = chosen(input.monthlyFixed, 'monthlyFixed');
  const monthlyCost = sum([tripCosts, fixed]);
  const difference = (income: number | null, cost: number | null) => income === null || cost === null ? null : income - cost;
  return {
    modelVersion: calculationVersion,
    trip: {
      km, revenue, knownRevenue: sumCents(revenueParts.filter(value => value !== null)), costs, variableCost, totalCost,
      knownCost: sumCents(Object.values(costs).filter(value => value !== null)), remainder: difference(revenue, totalCost),
      costPerKm: km !== null && km > 0 && totalCost !== null ? totalCost / km : null,
      coverage: totalCost !== null && totalCost > 0 && revenue !== null ? revenue / totalCost : null,
      shortfall: revenue === null || totalCost === null ? null : Math.max(0, totalCost - revenue),
      occupancy, breakEvenOccupancy,
    },
    month: { revenue: monthlyRevenue, tripCosts, fixed, totalCost: monthlyCost,
      remainder: difference(monthlyRevenue, monthlyCost),
      shortfall: monthlyRevenue === null || monthlyCost === null ? null : Math.max(0, monthlyCost - monthlyRevenue) },
    missing: [...missing], warnings,
  };
}

function invalid(): never { throw new Error('Patikrinkite skaičiuoklės duomenis.'); }
function object(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
}
function text(value: unknown, limit: number, required = false): asserts value is string {
  if (typeof value !== 'string' || value.length > limit || required && !value.trim()) invalid();
}
function numeric(value: unknown, maximum: number, integer = false, nullable = true) {
  if (value === null && nullable) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum || integer && !Number.isSafeInteger(value)) invalid();
}
function bool(value: unknown) { if (typeof value !== 'boolean') invalid(); }
function timestamp(value: unknown) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) invalid(); }
const rateKeys = ['fuelPrice', 'wearPerKm', 'driverPay', 'waitingPerHour'] as const;
export function validateCalculatorRates(value: unknown, partial = false): asserts value is CalculatorRates {
  object(value);
  if (!partial || value.consumption !== undefined) numeric(value.consumption, 1000);
  if ((!partial || value.driverModel !== undefined) && !['trip', 'day'].includes(String(value.driverModel))) invalid();
  for (const key of rateKeys) if (!partial || value[key] !== undefined) numeric(value[key], 100000000, true);
  if (Object.keys(value).some(key => !['consumption', 'driverModel', ...rateKeys].includes(key))) invalid();
}
function validateOptional(value: unknown) {
  object(value); bool(value.included); numeric(value.amount, 10000000000, true);
}
export function validateCalculatorInput(value: unknown): asserts value is CalculatorInput {
  object(value);
  for (const key of ['vehicleId', 'vehicleLabel']) text(value[key], 200);
  numeric(value.seats, 200, true);
  for (const key of ['routeKm', 'extraKm']) numeric(value[key], 1000000);
  for (const key of ['drivingMinutes', 'waitingMinutes']) numeric(value[key], 1000000);
  numeric(value.driverDays, 366); numeric(value.monthlyTrips, 10000, true);
  if (typeof value.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)) invalid();
  for (const key of ['includesReturn', 'includeFuel', 'includeWear', 'includeDriver', 'includeWaiting', 'returnRevenue']) bool(value[key]);
  validateCalculatorRates(value.rates);
  object(value.extras);
  for (const key of Object.keys(extraCostLabels)) validateOptional(value.extras[key]);
  if (Object.keys(value.extras).some(key => !Object.hasOwn(extraCostLabels, key))) invalid();
  if (!['detailed', 'total', 'bookings'].includes(String(value.revenueMode))) invalid();
  for (const key of ['outbound', 'returnLeg']) {
    object(value[key]); const row = value[key];
    numeric(row.passengers, 100000, true); numeric(row.parcels, 100000, true);
    numeric(row.ticket, 100000000, true); numeric(row.parcelPrice, 100000000, true);
  }
  validateOptional(value.otherRevenue); validateOptional(value.monthlyFixed);
  numeric(value.totalRevenue, 10000000000, true);
  if (!Array.isArray(value.bookings) || value.bookings.length > 1000) invalid();
  const ids = new Set<string>();
  for (const row of value.bookings) {
    object(row); text(row.id, 100, true); text(row.name, 300, true);
    if (ids.has(row.id) || !['passenger', 'parcel'].includes(String(row.type))) invalid();
    ids.add(row.id);
    numeric(row.quantity, 100000, true); numeric(row.price, 10000000000, true);
    numeric(row.pickup, 499, true, false); numeric(row.delivery, 499, true, false);
    if (Number(row.delivery) <= Number(row.pickup)) invalid();
  }
  object(value.route); text(value.route.id, 100); text(value.route.label, 300);
  if (!['manual', 'route', 'trip'].includes(String(value.route.kind)) || !Array.isArray(value.route.stops) || value.route.stops.length > 500) invalid();
  for (const stop of value.route.stops) {
    object(stop); text(stop.name, 300, true); text(stop.address, 500);
    if (typeof stop.lat !== 'number' || !Number.isFinite(stop.lat) || Math.abs(stop.lat) > 90
      || typeof stop.lng !== 'number' || !Number.isFinite(stop.lng) || Math.abs(stop.lng) > 180) invalid();
  }
  if (value.bookings.some(row => Number(row.delivery) >= (value.route as CalculatorInput['route']).stops.length)) invalid();
  numeric(value.turnaround, 499, true);
  if (value.turnaround !== null && (Number(value.turnaround) <= 0 || Number(value.turnaround) >= value.route.stops.length - 1)) invalid();
  timestamp(value.assumptionsAt);
  // Exercise bounds on extended amounts as well as their component inputs.
  calculate(value as unknown as CalculatorInput);
}
export function validateCalculatorState(value: unknown): asserts value is CalculatorState {
  object(value);
  if (value.version !== 1) throw new Error('Nepalaikoma skaičiuoklės saugyklos versija. Duomenys nepakeisti.');
  validateCalculatorRates(value.defaults); object(value.vehicles);
  if (Object.keys(value.vehicles).length > 20000) invalid();
  for (const [id, rates] of Object.entries(value.vehicles)) {
    text(id, 100, true); validateCalculatorRates(rates, true);
    if (Object.hasOwn(rates, 'consumption')) invalid();
  }
  if (!Array.isArray(value.scenarios) || value.scenarios.length > 300) invalid();
  const ids = new Set<string>(), primary = new Set<string>();
  for (const row of value.scenarios) {
    object(row); text(row.id, 100, true); text(row.name, 160, true); text(row.tripId, 100);
    numeric(row.revision, Number.MAX_SAFE_INTEGER, true, false); bool(row.primary);
    if (ids.has(row.id) || row.primary && (!row.tripId || primary.has(String(row.tripId)))) invalid();
    ids.add(row.id); if (row.primary) primary.add(String(row.tripId));
    timestamp(row.createdAt); timestamp(row.calculatedAt);
    if (row.modelVersion !== 1 || canonical(row.units) !== canonical(calculationUnits)) invalid();
    validateCalculatorInput(row.input);
    if (canonical(row.result) !== canonical(calculate(row.input))) throw new Error('Scenarijaus rezultatas neatitinka išsaugotų prielaidų.');
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
  return JSON.stringify(value);
}
