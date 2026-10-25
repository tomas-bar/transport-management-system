import { createContext } from 'react';
import type { Calculation, CalculatorInput } from '../../domain/calculator';

export const MissingCalculationFields = createContext<ReadonlySet<string>>(new Set());

/** Presentation guidance follows the frozen model's missing groups without changing its calculations. */
export function missingFields(input: CalculatorInput, result: Calculation | null) {
  const groups = new Map<string, string[]>();
  const add = (group: string, field: string, missing: boolean) => {
    if (missing) groups.set(group, [...(groups.get(group) ?? []), field]);
  };
  for (const group of result?.missing ?? []) {
    switch (group) {
      case 'fuel':
        add(group, 'consumption', input.rates.consumption === null);
        add(group, 'fuelPrice', input.rates.fuelPrice === null);
        break;
      case 'wear': add(group, 'wearPerKm', input.rates.wearPerKm === null); break;
      case 'driver':
        add(group, 'driverPay', input.rates.driverPay === null);
        add(group, 'driverDays', input.rates.driverModel === 'day' && input.driverDays === null);
        break;
      case 'waiting':
        add(group, 'waitingMinutes', input.waitingMinutes === null);
        add(group, 'waitingPerHour', input.rates.waitingPerHour === null);
        break;
      case 'outboundPassengers': case 'returnPassengers': case 'outboundParcels': case 'returnParcels': {
        const direction = group.startsWith('outbound') ? 'outbound' : 'returnLeg';
        const passengers = group.endsWith('Passengers');
        const count = passengers ? 'passengers' : 'parcels';
        const price = passengers ? 'ticket' : 'parcelPrice';
        add(group, `${direction}-${count}`, input[direction][count] === null);
        add(group, `${direction}-${price}`, input[direction][count] !== 0 && input[direction][price] === null);
        break;
      }
      case 'bookingPrices': case 'bookingQuantity':
        for (const row of input.bookings) {
          const key = group === 'bookingPrices' ? 'price' : 'quantity';
          add(group, `booking-${row.id}-${key}`, row[key] === null);
        }
        break;
      default: add(group, group, true);
    }
  }
  return { groups, fields: new Set([...groups.values()].flat()) };
}

export function visibleMissingGroups(input: CalculatorInput, result: Calculation, view: 'trip' | 'month') {
  const { groups } = missingFields(input, result);
  return result.missing.filter(key => groups.has(key)).filter(key => view === 'month'
    ? input.monthlyTrips === 0 ? ['monthlyTrips', 'monthlyFixed'].includes(key) : key !== 'fixedShare'
    : !['monthlyTrips', 'monthlyFixed'].includes(key));
}
