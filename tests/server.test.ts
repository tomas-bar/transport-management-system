import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApp } from "../server/app.ts";

test("SQLite API persists across restarts and rejects stale or cross-origin writes", async () => {
  const temp = mkdtempSync(join(tmpdir(), "krypta-test-"));
  const dbPath = join(temp, "test.sqlite");
  const publicPath = join(temp, "public");
  mkdirSync(publicPath);
  writeFileSync(
    join(publicPath, "index.html"),
    "<!doctype html><title>Krypta</title>",
  );
  const app = createApp({ dbPath, distPath: publicPath });
  await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
  const address = app.server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const res = await fetch(base + "/api/state");
    assert.equal(res.status, 200);
    const tag = res.headers.get("etag")!;
    const db = await res.json();
    db.settings.company = "Bandomoji įmonė";
    const saved = await fetch(base + "/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "If-Match": tag },
      body: JSON.stringify(db),
    });
    assert.equal(saved.status, 200);
    const stale = await fetch(base + "/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "If-Match": tag },
      body: JSON.stringify(db),
    });
    assert.equal(stale.status, 409);
    const invalid = await fetch(base + "/api/state", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Match": saved.headers.get("etag")!,
      },
      body: JSON.stringify({ ...db, orders: [{}] }),
    });
    assert.equal(invalid.status, 400);
    const foreign = await fetch(base + "/api/state", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Match": tag,
        Origin: "https://unknown.example",
      },
      body: JSON.stringify(db),
    });
    assert.equal(foreign.status, 403);
    const page = await fetch(base + "/");
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Krypta/);
  } finally {
    await new Promise<void>((r) => app.server.close(() => r()));
    app.close();
  }
  const restarted = createApp({ dbPath, distPath: publicPath });
  await new Promise<void>((r) => restarted.server.listen(0, "127.0.0.1", r));
  try {
    const addr = restarted.server.address();
    assert(addr && typeof addr !== "string");
    const state = await (
      await fetch(`http://127.0.0.1:${addr.port}/api/state`)
    ).json();
    assert.equal(state.settings.company, "Bandomoji įmonė");
  } finally {
    await new Promise<void>((r) => restarted.server.close(() => r()));
    restarted.close();
    rmSync(temp, { recursive: true, force: true });
  }
});
