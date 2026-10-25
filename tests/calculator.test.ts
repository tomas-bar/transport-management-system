import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, emptyCalculationInput, emptyCalculator, bookingPeak, validateCalculatorInput, validateCalculatorState, calculationUnits } from '../src/domain/calculator.ts';
import { useVehicle, useTrip, useRoute, calculationStops } from '../src/domain/calculator-sources.ts';
import { createSeed } from '../src/data/seed.ts';
import { additionalCost } from '../src/domain/freight.ts';

function complete() {
  const input = emptyCalculationInput(undefined, '2026-10-24T12:00:00.000Z');
  Object.assign(input, { routeKm: 1000, extraKm: 100, seats: 8, includesReturn: true, returnRevenue: true });
  input.rates = { consumption: 10, fuelPrice: 16500, wearPerKm: 1250, driverModel: 'day', driverPay: 10000, waitingPerHour: 2000 };
  input.driverDays = 2;
  input.outbound = { passengers: 6, ticket: 10000, parcels: 2, parcelPrice: 2500 };
  input.returnLeg = { passengers: 4, ticket: 9000, parcels: 0, parcelPrice: null };
  return input;
}
test('trip costs use the supplied total kilometres once, excluding fuel from wear', () => {
  const input = complete(), result = calculate(input);
  assert.equal(result.trip.km, 1100);
  assert.equal(result.trip.costs.fuel, 18150);
  assert.equal(result.trip.costs.wear, 13750);
  assert.equal(result.trip.costs.driver, 20000);
  assert.equal(result.trip.revenue, 101000);
  assert.equal(result.trip.totalCost, 51900);
  assert.equal(result.trip.remainder, 49100);
  input.includesReturn = false;
  assert.equal(calculate(input).trip.totalCost, result.trip.totalCost);
  assert.deepEqual(calculate(input).warnings, ['returnDistance']);
});
test('precise fuel and per-kilometre rates round each extended cost to cents', () => {
  const input = complete(); input.routeKm = 10.125; input.extraKm = 0;
  input.rates.fuelPrice = 16599; input.rates.wearPerKm = 1234;
  const result = calculate(input);
  assert.equal(result.trip.costs.fuel, 168);
  assert.equal(result.trip.costs.wear, 125);
  assert(Number.isSafeInteger(result.trip.totalCost));
  assert.equal(additionalCost(10.125, 12.5, 12, 2500, 0, null).cost, Math.round(10.125 * 12) + Math.round(12.5 / 60 * 2500));
});
test('missing important inputs remain unknown while deliberate zero and excluded costs are valid', () => {
  const input = complete(); input.routeKm = null; input.rates.fuelPrice = null;
  let result = calculate(input);
  assert.equal(result.trip.km, null); assert.equal(result.trip.totalCost, null);
  assert(result.missing.includes('fuel')); assert(result.missing.includes('routeKm'));
  input.routeKm = 0; input.extraKm = 0; input.includeDriver = false;
  result = calculate(input);
  assert.equal(result.trip.totalCost, 0); assert.equal(result.trip.costPerKm, null);
  input.includeFuel = false; input.includeWear = false; input.routeKm = 10;
  assert.equal(calculate(input).trip.totalCost, 0);
});
test('waiting and optional amounts are counted only when explicitly included', () => {
  const input = complete(); input.waitingMinutes = 90;
  assert.equal(calculate(input).trip.costs.waiting, 0);
  input.includeWaiting = true;
  assert.equal(calculate(input).trip.costs.waiting, 3000);
  input.extras.ferries = { included: true, amount: null };
  assert.equal(calculate(input).trip.totalCost, null);
  input.extras.ferries.amount = 0;
  assert.equal(calculate(input).trip.totalCost, 54900);
});
test('detailed, total and booking quote modes never add the same revenue twice', () => {
  const input = complete(); input.totalRevenue = 12345;
  assert.equal(calculate(input).trip.revenue, 101000);
  input.revenueMode = 'total'; assert.equal(calculate(input).trip.revenue, 12345);
  input.revenueMode = 'bookings'; input.bookings = [{ id: 'one', name: 'Booking', type: 'passenger', quantity: 2, price: 20000, pickup: 0, delivery: 1 }];
  assert.equal(calculate(input).trip.revenue, 20000);
  input.bookings[0].price = null;
  assert.equal(calculate(input).trip.revenue, null);
});
test('capacity uses exact passenger seats without subtracting a driver or inventing cargo seats', () => {
  const input = complete(); let result = calculate(input);
  assert.equal(result.trip.occupancy.outbound, .75); assert.equal(result.trip.occupancy.returnLeg, .5);
  input.seats = 0; result = calculate(input);
  assert.equal(result.trip.occupancy.outbound, null); assert(result.warnings.includes('capacity'));
  assert.equal(result.trip.breakEvenOccupancy, null);
});
test('booking peaks count overlapping segments and handle a turnaround within a continuing booking', () => {
  const rows = [
    { id: 'one', name: 'One', type: 'passenger' as const, quantity: 8, price: 100, pickup: 0, delivery: 2 },
    { id: 'two', name: 'Two', type: 'passenger' as const, quantity: 8, price: 100, pickup: 2, delivery: 4 },
  ];
  assert.equal(bookingPeak(rows), 8);
  assert.equal(bookingPeak(rows, 3), 8);
  rows[1].pickup = 1; assert.equal(bookingPeak(rows), 16);
});
test('unknown imported quantities never become zero or imply a safe passenger load', () => {
  const input = complete(); input.revenueMode = 'bookings';
  input.bookings = [{ id: 'one', name: 'Unknown count', type: 'passenger', quantity: null, price: 10000, pickup: 0, delivery: 1 }];
  const result = calculate(input);
  assert.equal(result.trip.revenue, 10000);
  assert.equal(result.trip.occupancy.peak, null);
  assert.equal(result.trip.occupancy.outbound, null);
  assert(result.missing.includes('bookingQuantity'));
});
test('monthly fixed expenses are deducted once and allocated trip fixed shares are excluded', () => {
  const input = complete(); input.monthlyTrips = 5;
  input.extras.fixedShare = { included: true, amount: 10000 };
  input.monthlyFixed = { included: true, amount: 50000 };
  const result = calculate(input);
  assert.equal(result.trip.totalCost, 61900);
  assert.equal(result.month.tripCosts, 51900 * 5);
  assert.equal(result.month.totalCost, 51900 * 5 + 50000);
  assert.equal(result.month.revenue, 101000 * 5);
  input.monthlyTrips = 0;
  assert.equal(calculate(input).month.totalCost, 50000);
});
test('break-even occupancy uses unchanged tickets and non-passenger income at equal directional occupancy', () => {
  const input = complete(); let result = calculate(input);
  assert.equal(result.trip.breakEvenOccupancy, (51900 - 5000) / (8 * (10000 + 9000)));
  input.rates.driverPay = 100000;
  assert(calculate(input).trip.breakEvenOccupancy! > 1);
  input.revenueMode = 'total'; assert.equal(calculate(input).trip.breakEvenOccupancy, null);
});
test('vehicle overrides inherit company rates, reuse existing consumption and remain detached copies', () => {
  const db = createSeed('2026-10-24'), state = emptyCalculator();
  state.defaults.fuelPrice = 15000; state.defaults.wearPerKm = 1000;
  state.vehicles.v1 = { fuelPrice: 16000, driverPay: 0 };
  const input = useVehicle(emptyCalculationInput(), db, 'v1', state);
  assert.equal(input.rates.fuelPrice, 16000); assert.equal(input.rates.wearPerKm, 1000);
  assert.equal(input.rates.driverPay, 0); assert.equal(input.rates.consumption, db.vehicles[0].consumption);
  state.defaults.wearPerKm = 5000; db.vehicles[0].consumption = 25;
  assert.equal(input.rates.wearPerKm, 1000); assert.notEqual(input.rates.consumption, 25);
});
test('trip imports retain quoted totals and stop links without copying collected payments or mutating the source', () => {
  const db = createSeed('2026-10-24'), before = structuredClone(db);
  const trip = db.trips.find(row => row.id === 't1')!;
  const input = useTrip(emptyCalculationInput(), db, trip);
  const orders = db.orders.filter(row => row.tripId === trip.id && row.status !== 'cancelled');
  assert.equal(calculate(input).trip.revenue, orders.reduce((total, row) => total + row.price, 0));
  assert(input.bookings.every(row => row.delivery > row.pickup));
  input.bookings[0].price = 42; input.route.stops[0].name = 'Changed';
  assert.deepEqual(db, before);
});
test('road requests append an explicit return traversal only to an open copied route', () => {
  const db = createSeed('2026-10-24'), route = db.routes[0];
  const input = useRoute(emptyCalculationInput(), route.id, route.name, route.stops, 'route');
  const count = input.route.stops.length;
  assert.equal(calculationStops(input).length, count);
  input.includesReturn = true;
  assert.equal(calculationStops(input).length, count * 2 - 1);
  input.route.stops.push(structuredClone(input.route.stops[0]));
  assert.equal(calculationStops(input).length, count + 1);
});
test('saved inputs, units, version and results survive JSON restoration without depending on current defaults', () => {
  const state = emptyCalculator(), input = complete();
  state.scenarios.push({ id: 'one', revision: 1, name: 'Plan', tripId: '', primary: false,
    createdAt: input.assumptionsAt, calculatedAt: input.assumptionsAt, modelVersion: 1,
    units: calculationUnits, input, result: calculate(input) });
  const restored = JSON.parse(JSON.stringify(state)); state.defaults.fuelPrice = 90000;
  validateCalculatorState(restored); assert.deepEqual(restored.scenarios[0].result, calculate(input));
  restored.scenarios[0].result.trip.revenue = 1;
  assert.throws(() => validateCalculatorState(restored), /rezultatas/);
});
test('calculator validation rejects negative, non-finite and oversized inputs without converting them to zero', () => {
  const input = complete(); validateCalculatorInput(input);
  for (const bad of [-1, NaN, Infinity]) {
    input.routeKm = bad; assert.throws(() => validateCalculatorInput(input));
  }
  input.routeKm = 1000; input.monthlyTrips = 1.5;
  assert.throws(() => validateCalculatorInput(input));
});
