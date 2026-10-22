// Shared Lithuanian terminology. A future locale adapter can replace this catalog
// without changing persisted identifiers, event activity codes or command types.
export const paymentMethodLabels = { cash: 'Grynaisiais', bank: 'Pavedimu', card: 'Kortele' } as const;
export const photoStageLabels = { pickup: 'Paėmimas', delivery: 'Pristatymas', other: 'Kita' } as const;
export const tripOutcomeLabels = {
  planned: 'Reisas suplanuotas', confirmed: 'Reisas patvirtintas', active: 'Reisas pradėtas', completed: 'Reisas užbaigtas', cancelled: 'Reisas atšauktas',
} as const;
