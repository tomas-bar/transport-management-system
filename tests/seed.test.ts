import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  readdirSync,
  existsSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { createSeed, createEmptyDatabase, cities } from "../src/data/seed.ts";
import { validateDatabase } from "../src/domain/logic.ts";

test("fixed-date fixtures are deterministic and independent of edited stores", () => {
  const baseline = createSeed("2026-10-22");
  const edited = createSeed("2026-10-22");
  assert.deepEqual(edited, baseline);
  edited.orders[0].pickup.name = "Changed pickup";
  edited.trips[0].stops[0].address = "Changed stop";
  edited.customers[0].name = "Changed customer";
  assert.deepEqual(createSeed("2026-10-22"), baseline);
  assert.equal(cities[1].name, "Kaunas");
  assert.equal(validateDatabase(baseline).orders.length, 9);
  assert(baseline.trips.some((t) => t.status === "completed"));
  assert(baseline.orders.some((o) => !o.tripId && o.priceSet === false));
});

test("fixture dates handle month boundaries and reject invalid calendar input", () => {
  const db = validateDatabase(createSeed("2026-12-31"));
  assert.equal(db.trips[0].arrival.slice(0, 10), "2027-01-01");
  assert.equal(
    db.trips.find((t) => t.id === "t5")!.departure.slice(0, 10),
    "2026-12-29",
  );
  for (const date of ["2026-02-30", "2026-13-01", "not-a-date", "2026-1-1"])
    assert.throws(() => createSeed(date));
});

test("empty stores retain independent settings and remove every operational collection", () => {
  const db = createSeed("2026-10-22");
  const empty = validateDatabase(createEmptyDatabase(db.settings));
  assert.deepEqual(empty.settings, db.settings);
  for (const [key, value] of Object.entries(empty))
    if (key !== "settings" && key !== "version") assert.deepEqual(value, []);
  empty.settings.company = "Changed company";
  assert.notEqual(empty.settings.company, db.settings.company);
});

test("local data commands require confirmation, back up existing records and export importable fixtures", () => {
  const temp = mkdtempSync(join(tmpdir(), "krypta-fixture-"));
  const dbPath = join(temp, "test.sqlite");
  const output = join(temp, "fixture.json");
  const run = (...args: string[]) =>
    spawnSync(
      process.execPath,
      ["--experimental-strip-types", resolve("scripts/data.ts"), ...args],
      { encoding: "utf8" },
    );
  const read = () => {
    const sqlite = new DatabaseSync(dbPath);
    try {
      const row = sqlite
        .prepare("SELECT revision,data FROM app_state WHERE id=1")
        .get() as { revision: number; data: string };
      return {
        revision: row.revision,
        data: validateDatabase(JSON.parse(row.data)),
      };
    } finally {
      sqlite.close();
    }
  };
  try {
    assert.equal(run("seed", "--db", dbPath).status, 1);
    assert.equal(existsSync(dbPath), false);
    let result = run(
      "seed",
      "--db",
      dbPath,
      "--date",
      "2026-10-22",
      "--confirm",
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(read().data, createSeed("2026-10-22"));
    const revision = read().revision;
    result = run("clear", "--db", dbPath, "--confirm");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(read().data.trips.length, 0);
    assert.equal(read().data.settings.company, createSeed().settings.company);
    assert.equal(read().revision, revision + 1);
    result = run("seed", "--db", dbPath, "--date", "2026-10-22", "--confirm");
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(read().data, createSeed("2026-10-22"));
    const backups = readdirSync(join(temp, "backups"));
    assert.equal(backups.length, 2);
    for (const name of backups)
      validateDatabase(
        JSON.parse(readFileSync(join(temp, "backups", name), "utf8")),
      );
    result = run("export", "--date", "2026-10-22", "--out", output);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(
      validateDatabase(JSON.parse(readFileSync(output, "utf8"))),
      read().data,
    );
    assert.equal(run("export", "--out", output).status, 1);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
