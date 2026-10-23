import type { Database, NumberSeries, Settings } from './models.ts';

type ReferenceCollection = 'trips' | 'orders';
const defaults: Record<ReferenceCollection, NumberSeries> = {
  trips: { prefix: 'KR-', start: 1001 }, orders: { prefix: 'UZ-', start: 2001 },
};
const key = (value: string) => value.trim().normalize('NFC').toLocaleUpperCase('lt');

export function referenceSeries(settings: Settings, collection: ReferenceCollection): NumberSeries {
  return settings.numbering?.[collection] ?? defaults[collection];
}

export function validateNumbering(settings: Settings) {
  if (settings.numbering === undefined) return;
  if (!settings.numbering || typeof settings.numbering !== 'object') throw new Error('Patikrinkite numeravimą.');
  for (const collection of ['trips', 'orders'] as const) {
    const series = settings.numbering[collection];
    if (!series || typeof series.prefix !== 'string' || !/^[\p{L}\p{N}._/\-]{0,16}$/u.test(series.prefix)
      || !Number.isSafeInteger(series.start) || series.start < 1 || series.start > 999999999) {
      throw new Error('Prefiksui naudokite iki 16 raidžių, skaitmenų ar ženklus - _ . /. Numeravimo pradžia turi būti nuo 1 iki 999999999.');
    }
  }
}

/** Parse only the numeric suffix, so digits in prefixes never inflate the sequence. */
export function nextReference(records: { number: string }[], prefix: string, minimum: number) {
  const used = new Set(records.map(record => key(record.number)));
  let serial = minimum + 1;
  for (const record of records) {
    if (!key(record.number).startsWith(key(prefix))) continue;
    const suffix = record.number.slice(prefix.length);
    if (!/^\d+$/.test(suffix)) continue;
    const value = Number(suffix);
    if (Number.isSafeInteger(value)) serial = Math.max(serial, value + 1);
  }
  while (Number.isSafeInteger(serial) && used.has(key(prefix + serial))) serial++;
  if (!Number.isSafeInteger(serial)) throw new Error('Numeravimo seka išnaudota. Pakeiskite prefiksą.');
  return prefix + serial;
}

export function nextCompanyReference(db: Database, collection: ReferenceCollection) {
  const series = referenceSeries(db.settings, collection);
  return nextReference(db[collection], series.prefix, series.start - 1);
}

export function assertReferenceAvailable(db: Database, collection: ReferenceCollection, record: { id: string; number: string }) {
  const old = db[collection].find(item => item.id === record.id);
  if (old?.number === record.number) return;
  if (typeof record.number !== 'string' || !/^[\p{L}\p{N}._/\-]{1,40}$/u.test(record.number)) {
    throw new Error('Numeriui naudokite iki 40 raidžių, skaitmenų ar ženklus - _ . /.');
  }
  if (db[collection].some(item => item.id !== record.id && key(item.number) === key(record.number))) {
    throw new Error(collection === 'trips' ? 'Toks reiso numeris jau naudojamas.' : 'Toks užsakymo numeris jau naudojamas.');
  }
}

/** Preserve legacy references; validate only new or deliberately edited references. */
export function validateReferenceChanges(before: Database, after: Database, canEdit: boolean) {
  for (const collection of ['trips', 'orders'] as const) {
    const generated: { number: string }[] = [...before[collection]];
    for (const record of after[collection]) {
      const old = before[collection].find(item => item.id === record.id);
      if (old?.number === record.number) continue;
      const withoutCandidate = { ...after, [collection]: after[collection].filter(item => item.id !== record.id) };
      assertReferenceAvailable(withoutCandidate, collection, record);
      const series = referenceSeries(before.settings, collection);
      if (!canEdit && (old || record.number !== nextReference(generated, series.prefix, series.start - 1))) {
        throw new Error('Numerius keisti gali tik įmonės vadovas.');
      }
      if (!old) generated.push(record);
    }
  }
}
