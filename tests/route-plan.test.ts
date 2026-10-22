import { test } from "node:test";
import assert from "node:assert/strict";
import { createSeed } from "../src/data/seed.ts";
import { upgradeSampleLabels } from "../src/data/migrations.ts";
import {
  routeVisits,
  moveVisit,
  setVisitCompleted,
  insertOrderStops,
  visitTasks,
} from "../src/domain/route-plan.ts";
import { googleMapsParts } from "../src/services/maps.ts";
import { validateDatabase } from "../src/domain/logic.ts";

test("physical visits group adjacent order stops without losing order references", () => {
  const db = createSeed();
  const stops = db.trips[0].stops;
  const visits = routeVisits(stops);
  assert.equal(stops.length, 12);
  assert.equal(visits.length, 6);
  assert.deepEqual(
    visits.map((v) => v.number),
    [1, 2, 3, 4, 5, 6],
  );
  assert.equal(visits[0].stops.length, 3);
  const moved = moveVisit(stops, 0, 1);
  assert.equal(routeVisits(moved)[0].place.name, "Kaunas");
  assert.equal(moved.filter((s) => s.orderId).length, 6);
});
test("completed visits mark every underlying stop and keep their numeric identity", () => {
  const stops = createSeed().trips[0].stops;
  const updated = setVisitCompleted(stops, 0, true);
  assert.equal(routeVisits(updated)[0].completed, true);
  assert.equal(routeVisits(updated)[0].number, 1);
  assert(routeVisits(updated)[0].stops.every((s) => s.completed));
  assert.equal(routeVisits(stops)[0].completed, true);
  const reverted = setVisitCompleted(updated, 0, false);
  assert.equal(routeVisits(reverted)[0].completed, false);
  assert.equal(routeVisits(stops)[0].completed, true);
});
test("a return to the same location remains a separate visit", () => {
  const stops = createSeed().routes[1].stops;
  const visits = routeVisits([...stops, { ...stops[0], id: "return" }]);
  assert.equal(visits.length, 4);
  assert.equal(visits[3].number, 4);
});
test("Google Maps segments preserve latitude-longitude order and their shared boundary", () => {
  const stops = createSeed().trips[0].stops;
  const parts = googleMapsParts(stops);
  assert.equal(parts.length, 2);
  const first = new URL(parts[0].url);
  const second = new URL(parts[1].url);
  assert.equal(first.searchParams.get("origin"), "54.556500,23.354400");
  assert.equal(first.searchParams.get("destination"), "52.507500,13.279400");
  assert.equal(
    second.searchParams.get("origin"),
    first.searchParams.get("destination"),
  );
  assert.equal(second.searchParams.get("destination"), "53.552400,10.009900");
  assert.deepEqual(first.searchParams.get("waypoints")?.split("|"), [
    "54.890200,23.919400",
    "52.219300,20.965500",
  ]);
  assert.match(parts[0].label, /Marijampolė → Berlynas/);
  assert.equal(first.searchParams.get("api"), "1");
});
test("sample registration migration is idempotent and preserves custom vehicle data", () => {
  const db = createSeed();
  db.vehicles[0].plate = "DEMO 01";
  db.vehicles[1].plate = "XYZ 567";
  assert.equal(upgradeSampleLabels(db), true);
  assert.equal(db.vehicles[0].plate, "KRY 101");
  assert.equal(db.vehicles[1].plate, "XYZ 567");
  assert.equal(upgradeSampleLabels(db), false);
  validateDatabase(db);
});

test("legacy arrival marks remain visible after grouping duplicate stop records", () => {
  const stops = createSeed().trips[0].stops;
  stops[0].completed = true;
  assert.equal(routeVisits(stops)[0].completed, true);
});

test("new bookings are inserted near the geographic route while preserving the existing sequence", () => {
  const base = [
    { id: "a", name: "A", address: "A", lat: 0, lng: 0 },
    { id: "b", name: "B", address: "B", lat: 0, lng: 5 },
    { id: "c", name: "C", address: "C", lat: 0, lng: 10 },
  ];
  const result = insertOrderStops(
    base,
    { ...base[0], id: "pickup", lng: 2, kind: "pickup", orderId: "order" },
    { ...base[0], id: "delivery", lng: 8, kind: "delivery", orderId: "order" },
  );
  assert.deepEqual(
    result.map((s) => s.id),
    ["a", "pickup", "b", "delivery", "c"],
  );
});
test("route insertion keeps pickup before delivery and never inserts into an arrived prefix", () => {
  const base = [
    { id: "a", name: "A", address: "A", lat: 0, lng: 0, completed: true },
    { id: "b", name: "B", address: "B", lat: 0, lng: 5, completed: true },
    { id: "c", name: "C", address: "C", lat: 0, lng: 10, completed: false },
  ];
  const result = insertOrderStops(
    base,
    { ...base[0], id: "pickup", lng: 8, completed: false },
    { ...base[0], id: "delivery", lng: 2, completed: false },
  );
  assert.deepEqual(
    result.slice(0, 2).map((s) => s.id),
    ["a", "b"],
  );
  assert(
    result.findIndex((s) => s.id === "pickup") <
      result.findIndex((s) => s.id === "delivery"),
  );
});
test("map task projection exposes optional pickup/delivery details and no financial fields", () => {
  const db = createSeed();
  const visits = routeVisits(db.trips[0].stops);
  const tasks = visits.flatMap((v) => visitTasks(v, db.orders));
  assert.equal(tasks.length, 6);
  assert(tasks.some((t) => t.type === "passenger" && t.kind === "delivery"));
  assert(tasks.some((t) => t.type === "parcel" && t.kind === "pickup"));
  const parcel = db.orders.find(
    (o) => o.type === "parcel" && o.tripId === db.trips[0].id,
  )!;
  const delivery = tasks.find(
    (t) => t.orderId === parcel.id && t.kind === "delivery",
  )!;
  assert.equal(delivery.name, parcel.recipient || parcel.name);
  assert.equal(delivery.phone, parcel.recipientPhone);
  assert(tasks.every((t) => !("paid" in t) && !("price" in t)));
  assert.deepEqual(
    visitTasks(
      { ...visits[0], stops: visits[0].stops.filter((s) => !s.orderId) },
      db.orders,
    ),
    [],
  );
});
