import type { Database } from './models.ts';
import {
  calculate, calculationUnits, calculationVersion, emptyCalculator,
  validateCalculatorInput, validateCalculatorRates, validateCalculatorState,
  type CalculatorInput, type CalculatorRates, type VehicleRates,
} from './calculator.ts';

export type CalculatorCommand =
  | { type: 'save'; id: string; revision: number | null; name: string; tripId: string; primary: boolean; input: CalculatorInput }
  | { type: 'delete'; id: string; revision: number }
  | { type: 'primary'; tripId: string; id: string }
  | { type: 'defaults'; defaults: CalculatorRates; vehicles: Record<string, VehicleRates> };

/** Backward-compatible, lazy snapshot migration. Reading an old store never writes or reseeds it. */
export function applyCalculatorCommand(db: Database, command: CalculatorCommand, administrator: boolean, now = new Date().toISOString()) {
  const state = structuredClone(db.planning ?? emptyCalculator());
  const fail = (message: string): never => { throw new Error(message); };
  const key = (value: unknown) => {
    if (typeof value !== 'string' || !value.trim() || value.length > 100) fail('Netinkamas scenarijaus identifikatorius.');
  };
  if (!command || typeof command !== 'object') fail('Netinkamas skaičiuoklės veiksmas.');
  switch (command.type) {
    case 'defaults': {
      if (!administrator) fail('Bendrus įkainius gali keisti įmonės vadovas.');
      validateCalculatorRates(command.defaults);
      if (!command.vehicles || typeof command.vehicles !== 'object' || Array.isArray(command.vehicles)) fail('Patikrinkite automobilio įkainius.');
      for (const [id, rates] of Object.entries(command.vehicles)) {
        if (!db.vehicles.some(vehicle => vehicle.id === id)) fail('Automobilis nerastas.');
        validateCalculatorRates(rates, true);
      }
      state.defaults = structuredClone(command.defaults);
      state.vehicles = structuredClone(command.vehicles);
      break;
    }
    case 'save': {
      key(command.id);
      if (typeof command.name !== 'string' || !command.name.trim() || command.name.length > 160) fail('Įrašykite scenarijaus pavadinimą.');
      if (typeof command.tripId !== 'string' || command.tripId.length > 100 || typeof command.primary !== 'boolean') fail('Patikrinkite reiso ryšį.');
      const previous = state.scenarios.find(row => row.id === command.id);
      if (previous ? previous.revision !== command.revision : command.revision !== null) fail('Scenarijus pakeistas arba pašalintas. Atidarykite jį iš naujo.');
      if (command.tripId && !db.trips.some(trip => trip.id === command.tripId)) fail('Susiejamas reisas nerastas.');
      if (command.primary && !command.tripId) fail('Pagrindiniam scenarijui pasirinkite reisą.');
      validateCalculatorInput(command.input);
      if (command.primary) for (const row of state.scenarios) if (row.id !== command.id && row.tripId === command.tripId && row.primary) {
        row.primary = false; row.revision++;
      }
      const scenario = {
        id: command.id, name: command.name.trim(), revision: (previous?.revision ?? 0) + 1,
        tripId: command.tripId, primary: command.primary,
        createdAt: previous?.createdAt ?? now, calculatedAt: now,
        modelVersion: calculationVersion, units: calculationUnits,
        input: structuredClone(command.input), result: calculate(command.input),
      };
      const index = state.scenarios.findIndex(row => row.id === scenario.id);
      if (index < 0) state.scenarios.push(scenario); else state.scenarios[index] = scenario;
      break;
    }
    case 'delete': {
      key(command.id);
      const row = state.scenarios.find(row => row.id === command.id);
      if (!row || row.revision !== command.revision) fail('Scenarijus pakeistas arba pašalintas. Atidarykite jį iš naujo.');
      state.scenarios = state.scenarios.filter(row => row.id !== command.id);
      break;
    }
    case 'primary': {
      key(command.id); key(command.tripId);
      if (!state.scenarios.some(row => row.id === command.id && row.tripId === command.tripId)) fail('Pasirinkite su šiuo reisu susietą scenarijų.');
      for (const row of state.scenarios.filter(row => row.tripId === command.tripId)) {
        const selected = row.id === command.id;
        if (row.primary !== selected) { row.primary = selected; row.revision++; }
      }
      break;
    }
    default: fail('Nežinomas skaičiuoklės veiksmas.');
  }
  validateCalculatorState(state);
  db.planning = state;
}
