import { test } from "node:test";
import assert from "node:assert/strict";
import { createSeed } from "../src/data/seed.ts";
import {
  saveOrder,
  saveTrip,
  totals,
  tripOrders,
  loadInfo,
  validateDatabase,
  hasAgreedPrice,
} from "../src/domain/logic.ts";

test("seed data has valid references and linked stops", () => {
  const db = createSeed();
  assert.equal(validateDatabase(db).version, 1);
  for (const order of db.orders.filter((o) => o.tripId)) {
    const trip = db.trips.find((t) => t.id === order.tripId)!;
    assert.equal(trip.stops.filter((s) => s.orderId === order.id).length, 2);
  }
});
test("revenue, received payments and expenses are distinct", () => {
  const db = createSeed();
  const f = totals(
    tripOrders(db, "t1"),
    db.expenses.filter((e) => e.tripId === "t1"),
  );
  assert.deepEqual(f, {
    revenue: 43500,
    paid: 27500,
    spent: 15400,
    balance: 16000,
    result: 28100,
  });
});
test("passenger capacity prevents overbooking", () => {
  const db = createSeed();
  const candidate = { ...db.orders[0], id: "too-many", quantity: 6 };
  assert.throws(() => saveOrder(db, candidate), /Nepakanka keleivių vietų/);
});
test("order date must match trip departure date", () => {
  const db = createSeed();
  assert.throws(
    () =>
      saveOrder(db, { ...db.orders.find((o) => o.id === "o5")!, tripId: "t1" }),
    /data turi sutapti/,
  );
});
test("assignment connects the order, stops and load", () => {
  const db = createSeed();
  const order = { ...db.orders.find((o) => o.id === "o5")!, tripId: "t3" };
  saveOrder(db, order);
  assert.equal(db.orders.find((o) => o.id === order.id)!.status, "assigned");
  assert.equal(
    db.trips
      .find((t) => t.id === "t3")!
      .stops.filter((s) => s.orderId === order.id).length,
    2,
  );
  assert.equal(
    loadInfo(db, db.trips.find((t) => t.id === "t3")!).passengers,
    2,
  );
  validateDatabase(db);
});
test("address updates preserve stop sequence and progress", () => {
  const db = createSeed();
  const t = db.trips[0];
  const index = t.stops.findIndex(
    (s) => s.orderId === "o1" && s.kind === "pickup",
  );
  t.stops[index].completed = true;
  t.stops[index].note = "Atvyko";
  saveOrder(db, {
    ...db.orders[0],
    pickup: { ...db.orders[0].pickup, address: "Patikslintas adresas" },
  });
  assert.equal(t.stops[index].address, "Patikslintas adresas");
  assert.equal(t.stops[index].completed, true);
  assert.equal(t.stops[index].note, "Atvyko");
  validateDatabase(db);
});
test("overlapping resource assignments are rejected", () => {
  const db = createSeed();
  const t = db.trips[0];
  assert.throws(
    () => saveTrip(db, { ...t, id: "conflict", number: "KR-9999", stops: [] }),
    /jau priskirtas/,
  );
});
test("trip cancellation unassigns orders and preserves payments", () => {
  const db = createSeed();
  saveTrip(db, { ...db.trips[0], status: "cancelled" });
  assert.equal(db.orders[0].tripId, "");
  assert.equal(db.orders[0].status, "confirmed");
  assert.equal(db.orders[0].paid, 24000);
  assert.equal(
    db.trips.find((t) => t.id === "t1")!.stops.some((s) => s.orderId),
    false,
  );
  validateDatabase(db);
});
test("completion locks journey fields and allows payment corrections", () => {
  const db = createSeed();
  saveTrip(db, { ...db.trips[0], status: "completed" });
  const o = db.orders.find((o) => o.id === "o3")!;
  assert.equal(o.status, "completed");
  saveOrder(db, { ...o, paid: o.price });
  assert.equal(db.orders.find((x) => x.id === o.id)!.paid, o.price);
  assert.throws(
    () => saveOrder(db, { ...o, quantity: 99 }),
    /Įvykdyto užsakymo/,
  );
  validateDatabase(db);
});
test("unknown cargo weight remains unknown", () => {
  const db = createSeed();
  saveOrder(db, { ...db.orders.find((o) => o.id === "o6")!, tripId: "t4" });
  assert.equal(
    loadInfo(db, db.trips.find((t) => t.id === "t4")!).unknown,
    true,
  );
  validateDatabase(db);
});
test("invalid backups and monetary values are rejected", () => {
  const db = createSeed();
  db.orders[0].paid = db.orders[0].price + 1;
  assert.throws(() => validateDatabase(db), /sumokėta suma/);
  assert.throws(
    () => validateDatabase({ version: 1, trips: [] }),
    /Netinkami duomenys/,
  );
  const bad = createSeed();
  bad.trips[0].stops[0].lat = 120;
  assert.throws(() => validateDatabase(bad), /koordinatės/);
});

test("optional pricing distinguishes unknown prices from an explicit free booking", () => {
  const db = createSeed();
  const order = { ...db.orders[0], price: 0, paid: 0, priceSet: false };
  assert.equal(hasAgreedPrice(order), false);
  assert.equal(hasAgreedPrice({ ...order, priceSet: true }), true);
  saveOrder(db, order);
  validateDatabase(db);
  const invalid = structuredClone(db);
  invalid.orders.find((o) => o.id === order.id)!.price = 100;
  assert.throws(() => validateDatabase(invalid), /nenurodytos kainos/);
});
test("completing a trip confirms arrival at all linked stops", () => {
  const db = createSeed();
  saveTrip(db, { ...db.trips[0], status: "completed" });
  assert(db.trips.find((t) => t.id === "t1")!.stops.every((s) => s.completed));
  validateDatabase(db);
});
