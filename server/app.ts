import { upgradeSampleLabels } from "../src/data/migrations.ts";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { dirname, resolve, extname, sep } from "node:path";
import { createSeed } from "../src/data/seed.ts";
import { validateDatabase } from "../src/domain/logic.ts";

export function createApp({
  dbPath,
  distPath,
}: {
  dbPath: string;
  distPath: string;
}) {
  if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec(
    "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK (id=1), revision INTEGER NOT NULL, data TEXT NOT NULL) STRICT;",
  );
  if (!sqlite.prepare("SELECT id FROM app_state WHERE id=1").get())
    sqlite
      .prepare("INSERT INTO app_state (id,revision,data) VALUES (1,1,?)")
      .run(JSON.stringify(validateDatabase(createSeed())));
  const existing = sqlite
    .prepare("SELECT revision,data FROM app_state WHERE id=1")
    .get() as { revision: number; data: string };
  const current = validateDatabase(JSON.parse(existing.data));
  if (upgradeSampleLabels(current))
    sqlite
      .prepare(
        "UPDATE app_state SET data=?, revision=revision+1 WHERE id=1 AND revision=?",
      )
      .run(JSON.stringify(current), existing.revision);
  const read = sqlite.prepare("SELECT revision,data FROM app_state WHERE id=1");
  const update = sqlite.prepare(
    "UPDATE app_state SET data=?, revision=revision+1 WHERE id=1 AND revision=?",
  );
  const json = (
    res: ServerResponse,
    status: number,
    body: unknown,
    headers: Record<string, string> = {},
  ) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    });
    res.end(JSON.stringify(body));
  };
  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const host = req.headers.host ?? "";
        if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) {
          json(res, 403, {
            error: "Vietinis serveris pasiekiamas tik šiame kompiuteryje.",
          });
          return;
        }
        const url = new URL(req.url ?? "/", `http://${host}`);
        if (url.pathname === "/api/state") {
          if (req.method === "GET") {
            const row = read.get() as { revision: number; data: string };
            json(res, 200, JSON.parse(row.data), { ETag: `"${row.revision}"` });
            return;
          }
          if (req.method === "PUT") {
            const origin = req.headers.origin;
            if (
              origin &&
              origin !== url.origin &&
              !["http://localhost:5173", "http://127.0.0.1:5173"].includes(
                origin,
              )
            ) {
              json(res, 403, {
                error: "Užklausa iš kitos svetainės neleidžiama.",
              });
              return;
            }
            if (!req.headers["content-type"]?.startsWith("application/json")) {
              json(res, 415, { error: "Reikalingas JSON formatas." });
              return;
            }
            const tag = req.headers["if-match"];
            if (typeof tag !== "string" || !/^"\d+"$/.test(tag)) {
              json(res, 428, {
                error: "Trūksta duomenų versijos. Atnaujinkite puslapį.",
              });
              return;
            }
            const buffers: Buffer[] = [];
            let size = 0;
            for await (const chunk of req) {
              size += Buffer.byteLength(chunk);
              if (size > 15 * 1024 * 1024) {
                json(res, 413, { error: "Duomenų rinkinys per didelis." });
                req.resume();
                return;
              }
              buffers.push(Buffer.from(chunk));
            }
            let data;
            try {
              data = validateDatabase(
                JSON.parse(Buffer.concat(buffers).toString("utf8")),
              );
            } catch (e) {
              json(res, 400, {
                error: e instanceof Error ? e.message : "Netinkami duomenys.",
              });
              return;
            }
            const result = update.run(
              JSON.stringify(data),
              Number(tag.slice(1, -1)),
            );
            if (result.changes !== 1) {
              json(res, 409, {
                error:
                  "Duomenys pakeisti kitame lange. Atnaujinkite puslapį ir pakartokite veiksmą.",
              });
              return;
            }
            json(
              res,
              200,
              { ok: true },
              { ETag: `"${Number(tag.slice(1, -1)) + 1}"` },
            );
            return;
          }
          json(
            res,
            405,
            { error: "Veiksmas nepalaikomas." },
            { Allow: "GET, PUT" },
          );
          return;
        }
        if (url.pathname.startsWith("/api/")) {
          json(res, 404, { error: "Užklausa nerasta." });
          return;
        }
        if (!["GET", "HEAD"].includes(req.method ?? "")) {
          res.writeHead(405);
          res.end();
          return;
        }
        let pathname;
        try {
          pathname = decodeURIComponent(url.pathname);
        } catch {
          res.writeHead(400);
          res.end();
          return;
        }
        const root = resolve(distPath);
        const target = resolve(
          root,
          "." + (pathname === "/" ? "/index.html" : pathname),
        );
        if (target !== root && !target.startsWith(root + sep)) {
          res.writeHead(403);
          res.end();
          return;
        }
        if (!existsSync(target) || !statSync(target).isFile()) {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(
            "Puslapis nerastas. Pirmiausia paleiskite „npm run build:local“.",
          );
          return;
        }
        const mime: Record<string, string> = {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".json": "application/json; charset=utf-8",
          ".svg": "image/svg+xml",
          ".png": "image/png",
          ".woff2": "font/woff2",
        };
        res.writeHead(200, {
          "Content-Type": mime[extname(target)] ?? "application/octet-stream",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "strict-origin-when-cross-origin",
          "Cache-Control":
            extname(target) === ".html" ? "no-store" : "public, max-age=3600",
        });
        res.end(req.method === "HEAD" ? undefined : readFileSync(target));
      } catch {
        if (!res.headersSent)
          json(res, 500, {
            error:
              "Nepavyko apdoroti užklausos. Patikrinkite serverio veikimą.",
          });
        else res.end();
      }
    },
  );
  return { server, close: () => sqlite.close() };
}
