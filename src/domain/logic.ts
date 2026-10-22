import { insertOrderStops } from "./route-plan.ts";
import type { Database, Order, Trip, Vehicle, Collection } from "./models.ts";
export const uid = () => crypto.randomUUID();
export const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vilnius" }).format(
    new Date(),
  );
export const money = (cents: number) =>
  new Intl.NumberFormat("lt-LT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(cents / 100);
export const dateLabel = (value: string, withTime = false) =>
  value
    ? new Intl.DateTimeFormat("lt-LT", {
        month: "short",
        day: "numeric",
        ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
      }).format(new Date(value.length === 10 ? value + "T12:00:00" : value))
    : "Nenurodyta";
/** Missing legacy zero prices are unknown; explicit zero prices can represent free bookings. */
export const hasAgreedPrice = (order: Order) =>
  order.priceSet ?? order.price > 0;
export const tripOrders = (db: Database, id: string) =>
  db.orders.filter((o) => o.tripId === id && o.status !== "cancelled");
export function totals(orders: Order[], expenses: { amount: number }[] = []) {
  const revenue = orders
    .filter((o) => o.status !== "cancelled")
    .reduce((s, o) => s + o.price, 0);
  const paid = orders
    .filter((o) => o.status !== "cancelled")
    .reduce((s, o) => s + o.paid, 0);
  const spent = expenses.reduce((s, e) => s + e.amount, 0);
  return {
    revenue,
    paid,
    spent,
    balance: revenue - paid,
    result: revenue - spent,
  };
}
export function loadInfo(
  db: Database,
  trip: Trip,
  candidate?: Order,
  vehicle?: Vehicle,
) {
  const orders = tripOrders(db, trip.id).filter((o) => o.id !== candidate?.id);
  if (candidate && candidate.status !== "cancelled") orders.push(candidate);
  const v = vehicle ?? db.vehicles.find((v) => v.id === trip.vehicleId);
  return {
    passengers: orders
      .filter((o) => o.type === "passenger")
      .reduce((s, o) => s + o.quantity, 0),
    parcels: orders
      .filter((o) => o.type === "parcel")
      .reduce((s, o) => s + o.quantity, 0),
    weight: orders
      .filter((o) => o.type === "parcel")
      .reduce((s, o) => s + (o.weight ?? 0) * o.quantity, 0),
    unknown: orders.some((o) => o.type === "parcel" && o.weight === null),
    capacity: v?.seats ?? 0,
    payload: v?.payload ?? null,
  };
}
export function validateAssignment(db: Database, order: Order, trip: Trip) {
  if (["completed", "cancelled"].includes(trip.status))
    throw new Error("Pasirinktas reisas jau užbaigtas arba atšauktas.");
  if (order.date !== trip.departure.slice(0, 10))
    throw new Error("Užsakymo data turi sutapti su reiso išvykimo data.");
  const l = loadInfo(db, trip, order);
  if (l.passengers > l.capacity)
    throw new Error(
      `Nepakanka keleivių vietų: ${l.passengers} keleiviai, ${l.capacity} vietos. Pasirinkite kitą reisą arba transporto priemonę.`,
    );
  if (l.payload !== null && l.weight > l.payload)
    throw new Error(
      `Siuntų svoris (${l.weight} kg) viršija žinomą naudingąją apkrovą (${l.payload} kg).`,
    );
}
export function syncOrderStops(db: Database, order: Order) {
  for (const trip of db.trips) {
    if (trip.id !== order.tripId || order.status === "cancelled") {
      trip.stops = trip.stops.filter((s) => s.orderId !== order.id);
      continue;
    }
    const pickupExists = trip.stops.some(
      (s) => s.orderId === order.id && s.kind === "pickup",
    );
    const deliveryExists = trip.stops.some(
      (s) => s.orderId === order.id && s.kind === "delivery",
    );
    if (!pickupExists && !deliveryExists) {
      trip.stops = insertOrderStops(
        trip.stops,
        {
          ...order.pickup,
          id: `${order.id}-pickup`,
          orderId: order.id,
          kind: "pickup",
        },
        {
          ...order.delivery,
          id: `${order.id}-delivery`,
          orderId: order.id,
          kind: "delivery",
        },
      );
      continue;
    }
    for (const kind of ["pickup", "delivery"] as const) {
      const place = kind === "pickup" ? order.pickup : order.delivery;
      const existing = trip.stops.findIndex(
        (s) => s.orderId === order.id && s.kind === kind,
      );
      if (existing >= 0) {
        trip.stops[existing] = { ...trip.stops[existing], ...place };
        continue;
      }
      const match = trip.stops.findLastIndex(
        (s) =>
          Math.abs(s.lat - place.lat) < 0.0001 &&
          Math.abs(s.lng - place.lng) < 0.0001,
      );
      trip.stops.splice(
        match >= 0 ? match + 1 : Math.max(0, trip.stops.length - 1),
        0,
        { ...place, id: `${order.id}-${kind}`, orderId: order.id, kind },
      );
    }
  }
}
export function saveOrder(db: Database, order: Order) {
  if (!order.name.trim() || !order.pickup.name || !order.delivery.name)
    throw new Error(
      "Įrašykite vardą arba siuntos pavadinimą ir pasirinkite abu adresus.",
    );
  if (order.price < 0 || order.paid < 0 || order.paid > order.price)
    throw new Error("Sumokėta suma turi būti nuo 0 iki užsakymo kainos.");
  if (!Number.isInteger(order.quantity) || order.quantity < 1)
    throw new Error("Kiekis turi būti teigiamas sveikasis skaičius.");
  const original = db.orders.find((o) => o.id === order.id);
  if (original?.status === "completed" && original.tripId) {
    if (
      order.tripId !== original.tripId ||
      order.status !== "completed" ||
      order.type !== original.type ||
      order.quantity !== original.quantity ||
      order.date !== original.date ||
      JSON.stringify(order.pickup) !== JSON.stringify(original.pickup) ||
      JSON.stringify(order.delivery) !== JSON.stringify(original.delivery) ||
      order.weight !== original.weight
    )
      throw new Error(
        "Įvykdyto užsakymo reiso, datos, adresų ir apkrovos keisti negalima. Galite patikslinti kontaktus, pastabas ir mokėjimą.",
      );
  } else if (order.tripId && order.status !== "cancelled") {
    const trip = db.trips.find((t) => t.id === order.tripId);
    if (!trip) throw new Error("Reisas nerastas.");
    validateAssignment(db, order, trip);
    order.status = trip.status === "active" ? "active" : "assigned";
  } else {
    if (order.status === "cancelled") order.tripId = "";
    if (order.status === "assigned" || order.status === "active")
      order.status = "confirmed";
  }
  db.orders = db.orders.filter((o) => o.id !== order.id).concat(order);
  syncOrderStops(db, order);
  return db;
}
export function saveTrip(db: Database, trip: Trip) {
  if (
    !trip.name.trim() ||
    !trip.departure ||
    !trip.arrival ||
    trip.arrival <= trip.departure
  )
    throw new Error(
      "Patikrinkite kryptį ir laikus. Atvykimas turi būti vėliau už išvykimą.",
    );
  const v = db.vehicles.find((v) => v.id === trip.vehicleId);
  const d = db.drivers.find((d) => d.id === trip.driverId);
  if (!v || !d)
    throw new Error("Pasirinkite transporto priemonę ir vairuotoją.");
  if (!["completed", "cancelled"].includes(trip.status)) {
    if (v.status !== "active" || d.status !== "active")
      throw new Error("Transporto priemonė ir vairuotojas turi būti aktyvūs.");
    const conflict = db.trips.find(
      (t) =>
        t.id !== trip.id &&
        !["completed", "cancelled"].includes(t.status) &&
        t.departure < trip.arrival &&
        t.arrival > trip.departure &&
        (t.vehicleId === trip.vehicleId || t.driverId === trip.driverId),
    );
    if (conflict)
      throw new Error(
        `Pasirinktu laiku vairuotojas arba automobilis jau priskirtas reisui ${conflict.number}.`,
      );
    const l = loadInfo(db, trip, undefined, v);
    if (l.passengers > v.seats)
      throw new Error(
        "Pasirinktoje transporto priemonėje nepakanka vietų esamiems užsakymams.",
      );
    if (v.payload !== null && l.weight > v.payload)
      throw new Error("Pasirinkto automobilio apkrova per maža.");
  }
  for (const o of tripOrders(db, trip.id)) {
    if (trip.status === "cancelled") {
      o.tripId = "";
      o.status = "confirmed";
    } else if (trip.status === "completed") o.status = "completed";
    else {
      if (o.date !== trip.departure.slice(0, 10))
        throw new Error(
          "Reisui priskirtų užsakymų data nesutampa. Pirmiausia pakeiskite užsakymus arba juos atskirkite.",
        );
      o.status = trip.status === "active" ? "active" : "assigned";
    }
  }
  if (trip.status === "cancelled")
    trip.stops = trip.stops.filter((s) => !s.orderId);
  if (trip.status === "completed")
    trip.stops = trip.stops.map((s) => ({ ...s, completed: true }));
  db.trips = db.trips.filter((t) => t.id !== trip.id).concat(trip);
  return db;
}
export function archiveRecord(
  db: Database,
  collection: Collection,
  id: string,
) {
  if (["vehicles", "drivers", "customers"].includes(collection)) {
    const records = db[collection] as unknown as {
      id: string;
      status: string;
    }[];
    const record = records.find((r) => r.id === id);
    if (record) record.status = "archived";
    return db;
  }
  throw new Error("Šio įrašo archyvavimas nepalaikomas.");
}
/** Validate persisted state and imported backups before committing a transaction. */
export function validateDatabase(input: unknown): Database {
  if (!input || typeof input !== "object" || (input as Database).version !== 1)
    throw new Error("Nepalaikomas atsarginės kopijos formatas.");
  const db = input as Database;
  const fail = (field: string): never => {
    throw new Error(`Netinkami duomenys: ${field}.`);
  };
  const text = (value: unknown, field: string, required = false) => {
    if (
      typeof value !== "string" ||
      value.length > 10000 ||
      (required && !value.trim())
    )
      fail(field);
  };
  const number = (value: unknown, field: string, min = 0, integer = false) => {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < min ||
      value > Number.MAX_SAFE_INTEGER ||
      (integer && !Number.isSafeInteger(value))
    )
      fail(field);
  };
  const oneOf = (value: unknown, options: string[], field: string) => {
    if (typeof value !== "string" || !options.includes(value)) fail(field);
  };
  const day = (value: unknown, field: string, time = false) => {
    text(value, field, true);
    if (
      !(time ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/).test(
        value as string,
      ) ||
      Number.isNaN(Date.parse(value as string))
    )
      fail(field);
    const datePart = (value as string).slice(0, 10);
    if (
      new Date(datePart + "T12:00:00Z").toISOString().slice(0, 10) !== datePart
    )
      fail(field);
  };
  const place = (p: unknown) => {
    if (!p || typeof p !== "object") fail("adresas");
    const v = p as Order["pickup"];
    text(v.name, "vietos pavadinimas", true);
    text(v.address, "adresas");
    number(v.lat, "platuma", -90);
    number(v.lng, "ilguma", -180);
    if (v.lat > 90 || v.lng > 180) fail("koordinatės");
  };
  const ids = {} as Record<Collection, Set<string>>;
  for (const key of [
    "trips",
    "routes",
    "orders",
    "vehicles",
    "drivers",
    "customers",
    "expenses",
  ] as const) {
    if (!Array.isArray(db[key]) || db[key].length > 20000) fail(key);
    ids[key] = new Set<string>();
    for (const item of db[key]) {
      if (!item || typeof item !== "object") fail(key);
      text(item.id, `${key} identifikatorius`, true);
      if (ids[key].has(item.id)) fail("pasikartojantis identifikatorius");
      ids[key].add(item.id);
    }
  }
  const optionalRef = (id: string, key: Collection) => {
    text(id, "ryšio identifikatorius");
    if (id && !ids[key].has(id)) fail(`ryšys su ${key}`);
  };
  const entity = (e: { status: string; notes: string }) => {
    oneOf(e.status, ["active", "unavailable", "archived"], "įrašo būsena");
    text(e.notes, "pastabos");
  };
  for (const v of db.vehicles) {
    entity(v);
    for (const k of ["make", "model", "plate", "type", "fuel"] as const)
      text(v[k], k, true);
    number(v.year, "pagaminimo metai", 1900, true);
    number(v.seats, "vietų skaičius", 0, true);
    number(v.maxMass, "didžiausioji masė", 1);
    if (v.payload !== null) number(v.payload, "naudingoji apkrova", 0.01);
    number(v.consumption, "sąnaudos");
    number(v.mileage, "rida");
  }
  if (
    new Set(db.vehicles.map((v) => v.plate.trim().toUpperCase())).size !==
    db.vehicles.length
  )
    fail("pasikartojantis automobilio numeris");
  for (const d of db.drivers) {
    entity(d);
    text(d.firstName, "vairuotojo vardas", true);
    text(d.lastName, "vairuotojo pavardė", true);
    for (const k of ["phone", "email", "categories"] as const) text(d[k], k);
  }
  for (const c of db.customers) {
    entity(c);
    text(c.name, "kliento pavadinimas", true);
    oneOf(c.type, ["person", "company"], "kliento tipas");
    for (const k of ["phone", "email", "address"] as const) text(c[k], k);
  }
  const stops = (list: unknown, tripId?: string) => {
    if (!Array.isArray(list) || list.length > 500) fail("sustojimų sąrašas");
    const used = new Set<string>();
    for (const s of list as Trip["stops"]) {
      place(s);
      text(s.id, "sustojimo identifikatorius", true);
      if (used.has(s.id)) fail("pasikartojantis sustojimas");
      used.add(s.id);
      if (s.arrival) day(s.arrival, "sustojimo atvykimas", true);
      if (s.note !== undefined) text(s.note, "sustojimo pastaba");
      if (s.completed !== undefined && typeof s.completed !== "boolean")
        fail("sustojimo būsena");
      if (s.orderId) {
        if (!tripId) fail("šablono užsakymo ryšys");
        if (
          !db.orders.some(
            (o) =>
              o.id === s.orderId &&
              o.tripId === tripId &&
              o.status !== "cancelled",
          )
        )
          fail("sustojimo ir užsakymo ryšys");
        oneOf(s.kind, ["pickup", "delivery"], "sustojimo tipas");
      }
    }
  };
  for (const r of db.routes) {
    text(r.name, "maršruto pavadinimas", true);
    text(r.notes, "maršruto pastabos");
    oneOf(r.type, ["local", "international"], "maršruto tipas");
    stops(r.stops);
  }
  for (const t of db.trips) {
    text(t.name, "reiso kryptis", true);
    text(t.number, "reiso numeris", true);
    text(t.notes, "reiso pastabos");
    oneOf(t.type, ["local", "international"], "reiso tipas");
    oneOf(
      t.status,
      ["planned", "confirmed", "active", "completed", "cancelled"],
      "reiso būsena",
    );
    day(t.departure, "išvykimas", true);
    day(t.arrival, "atvykimas", true);
    if (t.arrival <= t.departure) fail("reiso laikai");
    if (!ids.vehicles.has(t.vehicleId) || !ids.drivers.has(t.driverId))
      fail("reiso vairuotojas arba automobilis");
    optionalRef(t.routeId, "routes");
    stops(t.stops, t.id);
  }
  for (const o of db.orders) {
    for (const key of ["number", "name"] as const) text(o[key], key, true);
    for (const key of [
      "phone",
      "recipient",
      "recipientPhone",
      "luggage",
      "description",
      "dimensions",
      "notes",
    ] as const)
      text(o[key], key);
    oneOf(o.type, ["passenger", "parcel"], "užsakymo tipas");
    oneOf(
      o.status,
      ["new", "confirmed", "assigned", "active", "completed", "cancelled"],
      "užsakymo būsena",
    );
    day(o.date, "užsakymo data");
    number(o.quantity, "kiekis", 1, true);
    number(o.price, "kaina", 0, true);
    number(o.paid, "sumokėta suma", 0, true);
    if (o.paid > o.price) fail("sumokėta suma viršija kainą");
    if (o.priceSet !== undefined && typeof o.priceSet !== "boolean")
      fail("kainos požymis");
    if (o.priceSet === false && (o.price !== 0 || o.paid !== 0))
      fail("nenurodytos kainos sumos");
    if (o.weight !== null) number(o.weight, "svoris", 0.01);
    place(o.pickup);
    place(o.delivery);
    if (!ids.customers.has(o.customerId)) fail("užsakymo klientas");
    optionalRef(o.tripId, "trips");
    if (o.tripId && o.status !== "cancelled") {
      const t = db.trips.find((t) => t.id === o.tripId)!;
      if (o.date !== t.departure.slice(0, 10)) fail("užsakymo ir reiso datos");
      for (const kind of ["pickup", "delivery"])
        if (!t.stops.some((s) => s.orderId === o.id && s.kind === kind))
          fail("trūksta užsakymo sustojimo");
    }
  }
  for (const t of db.trips.filter(
    (t) => !["completed", "cancelled"].includes(t.status),
  )) {
    const v = db.vehicles.find((v) => v.id === t.vehicleId)!;
    const d = db.drivers.find((d) => d.id === t.driverId)!;
    if (v.status !== "active" || d.status !== "active")
      fail("neaktyvus reiso automobilis arba vairuotojas");
    const load = loadInfo(db, t);
    if (load.passengers > v.seats) fail("viršytos keleivių vietos");
    if (v.payload !== null && load.weight > v.payload)
      fail("viršyta naudingoji apkrova");
    if (
      db.trips.some(
        (other) =>
          other.id !== t.id &&
          !["completed", "cancelled"].includes(other.status) &&
          other.departure < t.arrival &&
          other.arrival > t.departure &&
          (other.vehicleId === t.vehicleId || other.driverId === t.driverId),
      )
    )
      fail("persidengiantys reisai");
  }
  for (const e of db.expenses) {
    day(e.date, "išlaidų data");
    text(e.description, "išlaidų aprašymas");
    oneOf(
      e.category,
      [
        "Degalai",
        "Kelių mokesčiai",
        "Automobilio priežiūra",
        "Parkavimas",
        "Nakvynė",
        "Kitos išlaidos",
      ],
      "išlaidų kategorija",
    );
    number(e.amount, "išlaidų suma", 1, true);
    optionalRef(e.tripId, "trips");
    optionalRef(e.vehicleId, "vehicles");
  }
  if (!db.settings || typeof db.settings !== "object") fail("nustatymai");
  text(db.settings.company, "įmonės pavadinimas", true);
  text(db.settings.email, "įmonės el. paštas");
  text(db.settings.phone, "įmonės telefonas");
  for (const key of ["routingUrl", "geocodingUrl"] as const) {
    text(db.settings[key], key, true);
    try {
      const url = new URL(db.settings[key]);
      if (url.protocol !== "https:" || url.username || url.password)
        fail("paslaugos HTTPS adresas");
    } catch {
      fail("paslaugos adresas");
    }
  }
  return {
    version: 1,
    trips: db.trips,
    routes: db.routes,
    orders: db.orders,
    vehicles: db.vehicles,
    drivers: db.drivers,
    customers: db.customers,
    expenses: db.expenses,
    settings: db.settings,
  };
}
