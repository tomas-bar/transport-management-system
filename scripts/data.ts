import { DatabaseSync } from "node:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  createSeed,
  createEmptyDatabase,
  demoDatasetVersion,
} from "../src/data/seed.ts";
import { validateDatabase } from "../src/domain/logic.ts";

const usage = `Local test data tools (Node.js 24)
  npm run data:seed -- --confirm [--date YYYY-MM-DD] [--db path]
  npm run data:clear -- --confirm [--db path]
  npm run data:export -- [--date YYYY-MM-DD] [--out tmp/demo-data.json] [--confirm]

Stop the local server before changing SQLite records. Existing records are backed
up beside the database in backups/ before replacement. Clearing retains settings.
Export creates a fresh fixture for Settings > Restore from backup; it does not
read or change an existing database. --confirm permits replacing an output file.`;

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help" || args.includes("--help")) {
    console.log(usage);
    return;
  }
  if (!["seed", "clear", "export"].includes(command))
    throw new Error("Unknown data command.");
  const options: Record<string, string> = {};
  let confirmed = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--confirm") confirmed = true;
    else if (
      ["--db", "--out", "--date"].includes(args[i]) &&
      args[i + 1] &&
      !args[i + 1].startsWith("--")
    )
      options[args[i].slice(2)] = args[++i];
    else throw new Error(`Unknown or incomplete option: ${args[i]}`);
  }
  if (
    (command !== "export" && options.out) ||
    (command === "export" && options.db) ||
    (command === "clear" && options.date)
  )
    throw new Error("This option does not apply to the selected command.");
  const seed = validateDatabase(createSeed(options.date));
  if (command === "export") {
    const output = resolve(options.out ?? "tmp/demo-data.json");
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(seed, null, 2) + "\n", {
      encoding: "utf8",
      flag: confirmed ? "w" : "wx",
    });
    console.log(
      `Fixture v${demoDatasetVersion}: ${output}\nTrips: ${seed.trips.length}; orders: ${seed.orders.length}`,
    );
    return;
  }
  if (!confirmed)
    throw new Error(
      "No data changed. Pass --confirm to replace local records.\n" + usage,
    );
  const dbPath = resolve(
    options.db ?? process.env.KRYPTA_DB_PATH ?? "data/krypta.sqlite",
  );
  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new DatabaseSync(dbPath);
  let transaction = false;
  try {
    sqlite.exec(
      "PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; BEGIN IMMEDIATE;",
    );
    transaction = true;
    sqlite.exec(
      "CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK (id=1), revision INTEGER NOT NULL, data TEXT NOT NULL) STRICT;",
    );
    const existing = sqlite
      .prepare("SELECT revision,data FROM app_state WHERE id=1")
      .get() as { revision: number; data: string } | undefined;
    const current = existing
      ? validateDatabase(JSON.parse(existing.data))
      : undefined;
    const next =
      command === "seed"
        ? seed
        : createEmptyDatabase(current?.settings ?? seed.settings);
    validateDatabase(next);
    if (existing) {
      const backups = join(dirname(dbPath), "backups");
      mkdirSync(backups, { recursive: true });
      const backup = join(
        backups,
        `before-${command}-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}.json`,
      );
      writeFileSync(backup, JSON.stringify(current, null, 2) + "\n", {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      console.log(`Backup: ${backup}`);
    }
    sqlite
      .prepare(
        "INSERT INTO app_state (id,revision,data) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,data=excluded.data",
      )
      .run((existing?.revision ?? 0) + 1, JSON.stringify(next));
    sqlite.exec("COMMIT");
    transaction = false;
    console.log(
      `Database: ${dbPath}\nTrips: ${next.trips.length}; orders: ${next.orders.length}`,
    );
  } finally {
    if (transaction) sqlite.exec("ROLLBACK");
    sqlite.close();
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
