import type { Database, Place, Stop, Trip } from './models.ts';
import { loadInfo } from './logic.ts';
import { extendedCost } from './cost-math.ts';

export const opportunityStatuses = {
  new: 'Nauja', contacted: 'Susisiekta', agreed: 'Sutarta', dismissed: 'Neaktuali',
} as const;
export interface FreightDetails {
  status: keyof typeof opportunityStatuses;
  pickup: Place | null;
  delivery: Place | null;
  date: string | null;
  weight: number | null;
  price: number | null;
  dimensions: string;
  contact: string;
  tripId: string;
}
export interface FreightOpportunity {
  id: string;
  revision?: number;
  title: string;
  url: string;
  notes: string;
  created_at: string;
  details: FreightDetails;
}
export const emptyFreightDetails = (): FreightDetails => ({
  status: 'new', pickup: null, delivery: null, date: null, weight: null, price: null,
  dimensions: '', contact: '', tripId: '',
});
function fail(message = 'Patikrinkite krovinio duomenis.'): never { throw new Error(message); }
function text(input: unknown, maximum: number, required = false): string {
  if (typeof input !== 'string' || input.length > maximum || required && !input.trim()) fail();
  return input.trim();
}
function place(input: unknown): Place | null {
  if (input === null) return null;
  if (!input || typeof input !== 'object') fail('Pasirinkite adresą.');
  const value = input as Place;
  if (typeof value.lat !== 'number' || !Number.isFinite(value.lat) || Math.abs(value.lat) > 90 || typeof value.lng !== 'number' || !Number.isFinite(value.lng) || Math.abs(value.lng) > 180) fail('Patikrinkite adreso koordinates.');
  return { name: text(value.name, 300, true), address: text(value.address, 500), lat: value.lat, lng: value.lng };
}

/** Legacy link-only rows receive unknown operational values, never invented zeros. */
export function freightDetails(value?: Partial<FreightDetails>): FreightDetails {
  return { ...emptyFreightDetails(), ...value };
}
export function validateOpportunity(input: unknown, db: Database) {
  if (!input || typeof input !== 'object') fail();
  const value = input as { title: string; url: string; notes: string; details?: Partial<FreightDetails> };
  const title = text(value.title, 160, true), notes = text(value.notes ?? '', 2000);
  let url = text(value.url ?? '', 2000);
  if (url) {
    let link: URL;
    try { link = new URL(url); } catch { fail('Naudokite HTTPS nuorodą.'); }
    if (link.protocol !== 'https:' || link.username || link.password) fail('Naudokite HTTPS nuorodą.');
    url = link.href;
  }
  if (value.details !== undefined && (!value.details || typeof value.details !== 'object' || Array.isArray(value.details))) fail();
  const details = freightDetails(value.details);
  if (!Object.hasOwn(opportunityStatuses, details.status)) fail('Pasirinkite būseną.');
  if (details.date !== null && (typeof details.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(details.date) || !Number.isFinite(Date.parse(details.date)) || new Date(details.date + 'T12:00:00Z').toISOString().slice(0, 10) !== details.date)) fail('Patikrinkite datą.');
  if (details.weight !== null && (typeof details.weight !== 'number' || !Number.isFinite(details.weight) || details.weight <= 0 || details.weight > 100000)) fail('Įrašykite teigiamą svorį arba palikite nenurodytą.');
  if (details.price !== null && (!Number.isSafeInteger(details.price) || details.price < 0)) fail('Patikrinkite kainą.');
  const tripId = text(details.tripId, 100);
  if (tripId && !db.trips.some(trip => trip.id === tripId)) fail('Pasirinktas reisas nerastas.');
  return { title, url, notes, details: {
    ...details, tripId, pickup: place(details.pickup), delivery: place(details.delivery),
    contact: text(details.contact, 300), dimensions: text(details.dimensions, 160),
  } };
}

export function opportunityWarnings(db: Database, trip: Trip, details: FreightDetails): string[] {
  const load = loadInfo(db, trip);
  const warnings: string[] = [];
  if (['completed', 'cancelled'].includes(trip.status)) warnings.push('Reisas uždarytas.');
  if (!details.date) warnings.push('Paėmimo data nenurodyta.');
  else if (details.date < trip.departure.slice(0, 10) || details.date > trip.arrival.slice(0, 10)) warnings.push('Paėmimo data nepatenka į reiso laiką.');
  if (details.weight === null || load.unknown || load.payload === null) warnings.push('Siuntų svorio ir automobilio apkrovos patikrai trūksta duomenų.');
  else if (load.weight + details.weight > load.payload) warnings.push('Bendras žinomas siuntų svoris viršytų automobilio naudingąją apkrovą.');
  if (!details.dimensions) warnings.push('Krovinio matmenys nenurodyti.');
  if (details.price === null) warnings.push('Siūloma kaina nenurodyta.');
  return warnings;
}
function distance(a: Place, b: Place) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
const length = (stops: Stop[]) => stops.reduce((sum, stop, index) => sum + (index ? distance(stops[index - 1], stop) : 0), 0);

/** Geographic insertion suggestion with fixed trip endpoints and confirmed prefix; road distance is fetched separately. */
export function freightRoute(trip: Trip, pickup: Place, delivery: Place): Stop[] {
  if (trip.stops.length < 2 || trip.stops.length > 60) fail('Palyginimui reikia nuo 2 iki 60 reiso sustojimų.');
  const first = Math.max(1, trip.stops.findLastIndex(stop => stop.completed) + 1);
  let result: Stop[] | null = null, best = Infinity;
  for (let index = first; index < trip.stops.length; index++) {
    const stops = [...trip.stops.slice(0, index), { ...pickup, id: 'freight-pickup' }, ...trip.stops.slice(index)];
    for (let next = index + 1; next < stops.length; next++) {
      const candidate = [...stops.slice(0, next), { ...delivery, id: 'freight-delivery' }, ...stops.slice(next)];
      const cost = length(candidate);
      if (cost < best) { best = cost; result = candidate; }
    }
  }
  if (!result) fail('Visi sustojimai jau patvirtinti.');
  return result;
}

export const freightSources = [
  { id: 'all', label: 'Visas internetas', domain: '' },
  { id: 'skelbiu', label: 'Skelbiu.lt', domain: 'skelbiu.lt' },
  { id: 'clicktrans', label: 'Clicktrans', domain: 'clicktrans.com' },
  { id: 'cargopedia', label: 'Cargopedia', domain: 'cargopedia.net' },
  { id: 'cargo', label: 'Cargo.lt', domain: 'cargo.lt' },
] as const;
export function freightSearchUrl(input: { source: string; pickup: string; delivery: string; date: string; query: string }) {
  const source = freightSources.find(item => item.id === input.source) ?? freightSources[0];
  const terms = [source.domain ? 'site:' + source.domain : '', input.pickup, input.delivery, input.date, input.query || 'siunta krovinys transport'];
  return 'https://www.google.com/search?' + new URLSearchParams({ q: terms.filter(Boolean).join(' ') });
}
export function contactDraft(details: FreightDetails, language: 'lt' | 'de' | 'en') {
  const route = [details.pickup?.name, details.delivery?.name].filter(Boolean).join(' → ');
  const reference = [route, details.date].filter(Boolean).join(', ');
  if (language === 'de') return `Guten Tag, ist der Transport${reference ? ' (' + reference + ')' : ''} noch aktuell? Wir haben einen Transporter. Bitte bestätigen Sie Gewicht, Maße, Abhol- und Lieferzeiten sowie den angebotenen Preis.`;
  if (language === 'en') return `Hello, is this shipment${reference ? ' (' + reference + ')' : ''} still available? We have a van. Please confirm the weight, dimensions, pickup and delivery times, and your offered price.`;
  return `Sveiki, ar krovinys${reference ? ' (' + reference + ')' : ''} dar aktualus? Turime mikroautobusą. Patikslinkite svorį, matmenis, paėmimo bei pristatymo laikus ir siūlomą kainą.`;
}
export function parseEuro(value: string): number | null {
  if (!value.trim()) return null;
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim())) fail('Sumą įrašykite ne daugiau kaip dviejų skaitmenų po kablelio tikslumu.');
  const amount = Math.round(Number(value.replace(',', '.')) * 100);
  if (!Number.isSafeInteger(amount)) fail('Suma per didelė.');
  return amount;
}
export function additionalCost(km: number, minutes: number, perKm: number | null, perHour: number | null, other: number | null, price: number | null) {
  if (![km, minutes].every(value => Number.isFinite(value) && value >= 0)) fail('Netinkami maršruto atstumai.');
  if ([perKm, perHour, other, price].some(value => value !== null && (!Number.isSafeInteger(value) || value < 0))) fail('Patikrinkite sąnaudas.');
  if (perKm === null || perHour === null || other === null) return { cost: null, remainder: null };
  const cost = extendedCost(km, perKm) + extendedCost(minutes / 60, perHour) + other;
  if (!Number.isSafeInteger(cost)) fail('Suma per didelė.');
  return { cost, remainder: price === null ? null : price - cost };
}
