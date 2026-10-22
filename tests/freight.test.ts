import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeed } from '../src/data/seed.ts';
import { additionalCost, contactDraft, emptyFreightDetails, freightDetails, freightRoute, freightSearchUrl, opportunityWarnings, parseEuro, validateOpportunity } from '../src/domain/freight.ts';

const db = createSeed('2026-10-22');
test('legacy freight notes retain unknown prices, dates and weights', () => {
  assert.equal(freightDetails().price, null);
  const row = validateOpportunity({ title: 'Saved link', url: 'https://example.test/offer', notes: 'Contact first' }, db);
  assert.equal(row.details.weight, null);
  assert.equal(row.details.date, null);
  assert.equal(row.details.price, null);
  assert.equal(validateOpportunity({ title: 'Phone inquiry', details: { contact: '+370 600 00000' } }, db).url, '');
});
test('freight validation rejects unsafe links, invalid money, false dates and foreign trip references', () => {
  for (const url of ['javascript:alert(1)', 'http://example.test', 'https://user:password@example.test/']) assert.throws(() => validateOpportunity({ title: 'Offer', url }, db), /HTTPS/);
  for (const price of [-1, 10.5, '100', NaN]) assert.throws(() => validateOpportunity({ title: 'Offer', details: { price } }, db));
  assert.throws(() => validateOpportunity({ title: 'Offer', details: { date: '2026-02-30' } }, db), /datą/);
  assert.throws(() => validateOpportunity({ title: 'Offer', details: { tripId: 'foreign' } }, db), /nerastas/);
  assert.throws(() => validateOpportunity({ title: 'Offer', details: { pickup: { name: 'A', address: '', lat: 91, lng: 0 } } }, db), /koordinates/);
  assert.equal(validateOpportunity({ title: 'Offer', details: { price: 0 } }, db).details.price, 0);
});
test('route comparison preserves endpoints, existing order and confirmed prefix with pickup before delivery', () => {
  const trip = db.trips.find(trip => trip.id === 't1')!;
  const pickup = { name: 'Extra pickup', address: '', lat: 52.2, lng: 21.1 };
  const delivery = { name: 'Extra delivery', address: '', lat: 52.3, lng: 13.4 };
  const proposed = freightRoute(trip, pickup, delivery);
  assert.equal(proposed[0].id, trip.stops[0].id);
  assert.equal(proposed.at(-1)!.id, trip.stops.at(-1)!.id);
  assert.deepEqual(proposed.filter(stop => !stop.id.startsWith('freight-')), trip.stops);
  const added = proposed.findIndex(stop => stop.id === 'freight-pickup');
  assert(added > trip.stops.findLastIndex(stop => stop.completed));
  assert(proposed.findIndex(stop => stop.id === 'freight-delivery') > added);
});
test('unknown loads and absent quotes prevent an unsupported suitability claim', () => {
  const trip = db.trips.find(trip => trip.id === 't1')!;
  const warnings = opportunityWarnings(db, trip, emptyFreightDetails());
  assert(warnings.some(warning => warning.includes('trūksta duomenų')));
  assert(warnings.some(warning => warning.includes('kaina nenurodyta')));
  const details = { ...emptyFreightDetails(), date: '2026-12-01', weight: 100000, price: 1000, dimensions: '1 × 1 × 1 m' };
  assert(opportunityWarnings(db, trip, details).some(warning => warning.includes('nepatenka')));
});
test('cost estimates use cents and preserve missing values instead of inventing a margin', () => {
  assert.equal(parseEuro(''), null);
  assert.equal(parseEuro('0'), 0);
  assert.equal(parseEuro('12,34'), 1234);
  assert.throws(() => parseEuro('12.345'));
  assert.deepEqual(additionalCost(80, 90, 30, 1200, 500, 10000), { cost: 4700, remainder: 5300 });
  assert.deepEqual(additionalCost(80, 90, null, 1200, 0, 10000), { cost: null, remainder: null });
  assert.deepEqual(additionalCost(80, 90, 30, 1200, 0, null), { cost: 4200, remainder: null });
});
test('external search encodes the selected query and contact drafts do not invent a price', () => {
  const url = new URL(freightSearchUrl({ source: 'cargo', pickup: 'Kaunas & Alytus', delivery: 'Hamburg', date: '2026-10-23', query: 'Beiladung' }));
  assert.equal(url.origin, 'https://www.google.com');
  assert.match(url.searchParams.get('q')!, /site:cargo.lt Kaunas & Alytus Hamburg 2026-10-23 Beiladung/);
  const draft = contactDraft(emptyFreightDetails(), 'de');
  assert(draft.includes('Preis'));
  assert(!/\d/.test(draft));
});
