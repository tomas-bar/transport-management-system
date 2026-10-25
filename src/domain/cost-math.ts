/** Round each extended cost once, to integer EUR cents. Rates may use finer units. */
export function extendedCost(quantity: number, rate: number, unitsPerEuro = 100): number {
  if (!Number.isFinite(quantity) || quantity < 0 || !Number.isSafeInteger(rate) || rate < 0) {
    throw new Error('Patikrinkite kiekį ir įkainį.');
  }
  const cents = Math.round(quantity * rate * (100 / unitsPerEuro));
  if (!Number.isSafeInteger(cents)) throw new Error('Suma per didelė.');
  return cents;
}

export function sumCents(values: number[]): number {
  const sum = values.reduce((total, value) => total + value, 0);
  if (!Number.isSafeInteger(sum)) throw new Error('Suma per didelė.');
  return sum;
}
