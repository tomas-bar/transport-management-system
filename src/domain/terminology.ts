// Shared Lithuanian terminology. A future locale adapter can replace this catalog
// without changing persisted identifiers, event activity codes or command types.
export const paymentMethodLabels = { cash: 'Grynaisiais', bank: 'Pavedimu', card: 'Kortele' } as const;
export const photoStageLabels = { pickup: 'Paėmimas', delivery: 'Pristatymas', other: 'Kita' } as const;
export const tripOutcomeLabels = {
  planned: 'Reisas suplanuotas', confirmed: 'Reisas patvirtintas', active: 'Reisas pradėtas', completed: 'Reisas užbaigtas', cancelled: 'Reisas atšauktas',
} as const;

export const handoverLabels = {
  pickup: { title: 'Paėmimas', action: 'Paėmiau', done: 'Paimta' },
  delivery: { title: 'Pristatymas', action: 'Pristačiau', done: 'Pristatyta' },
} as const;

export const visitStateLabels = {
  done: 'Atlikta', arrived: 'Liko užduočių', next: 'Kitas sustojimas', pending: 'Laukia',
} as const;

export function driverCommandMessage(command: import('./workspace.ts').DriverCommand) {
  switch (command.type) {
    case 'start': return tripOutcomeLabels.active;
    case 'finish': return tripOutcomeLabels.completed;
    case 'arrive': return 'Atvykimas patvirtintas';
    case 'task': return command.kind === 'pickup' ? 'Paėmimas patvirtintas' : 'Pristatymas patvirtintas';
    case 'undoTask': return 'Užduoties patvirtinimas atšauktas';
    case 'undoArrival': return 'Atvykimo patvirtinimas atšauktas';
  }
}
