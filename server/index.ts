import { resolve } from "node:path";
import { createApp } from "./app.ts";
const port = Number(process.env.KRYPTA_PORT ?? 4174);
const app = createApp({
  dbPath: process.env.KRYPTA_DB_PATH ?? resolve("data/krypta.sqlite"),
  distPath: resolve("dist"),
});
app.server.listen(port, "127.0.0.1", () =>
  console.log(
    `Krypta running: http://localhost:${port}\nDatabase: ${process.env.KRYPTA_DB_PATH ?? resolve("data/krypta.sqlite")}\nStop: Ctrl+C`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    app.server.close(() => {
      app.close();
      process.exit(0);
    });
  });
