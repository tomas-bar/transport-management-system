import { upgradeSampleLabels } from "../data/migrations";
import { openDB } from "idb";
import type { Database } from "../domain/models";
import { createSeed } from "../data/seed";
import { validateDatabase } from "../domain/logic";
export interface Repository {
  load(): Promise<Database>;
  save(data: Database): Promise<void>;
}
export const serverMode = import.meta.env.VITE_STORAGE_MODE === "server";
export const storageDescription = serverMode
  ? "Vietinė SQLite duomenų bazė"
  : "Vietinė naršyklės saugykla";
let revision = "";
const serverRepository: Repository = {
  async load() {
    const res = await fetch("/api/state", { cache: "no-store" });
    if (!res.ok)
      throw new Error(
        "Nepavyko pasiekti vietinio serverio. Paleiskite „npm run server“.",
      );
    revision = res.headers.get("etag") ?? "";
    return validateDatabase(await res.json());
  },
  async save(data) {
    validateDatabase(data);
    const res = await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "If-Match": revision },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      let message = "Nepavyko išsaugoti serveryje.";
      try {
        message = (await res.json()).error ?? message;
      } catch {}
      throw new Error(message);
    }
    revision = res.headers.get("etag") ?? revision;
  },
};
let loadedRevision = 0;
const browserRepository: Repository = {
  async load() {
    const connection = await openDB("krypta-tms", 1, {
      upgrade(db) {
        db.createObjectStore("state");
      },
    });
    try {
      const tx = connection.transaction("state", "readwrite");
      const stored = await tx.store.get("main");
      loadedRevision = (await tx.store.get("revision")) ?? 0;
      if (stored) {
        const data = validateDatabase(stored);
        if (upgradeSampleLabels(data)) {
          loadedRevision++;
          await tx.store.put(data, "main");
          await tx.store.put(loadedRevision, "revision");
        }
        await tx.done;
        return data;
      }
      const seed = validateDatabase(createSeed());
      await tx.store.put(seed, "main");
      await tx.store.put(1, "revision");
      await tx.done;
      loadedRevision = 1;
      return seed;
    } finally {
      connection.close();
    }
  },
  async save(data) {
    validateDatabase(data);
    const connection = await openDB("krypta-tms", 1);
    try {
      const tx = connection.transaction("state", "readwrite");
      const current = (await tx.store.get("revision")) ?? 0;
      if (current !== loadedRevision) {
        tx.abort();
        await tx.done.catch(() => {});
        throw new Error(
          "Duomenys pakeisti kitame lange. Atnaujinkite puslapį ir pakartokite veiksmą.",
        );
      }
      await tx.store.put(data, "main");
      await tx.store.put(current + 1, "revision");
      await tx.done;
      loadedRevision = current + 1;
    } finally {
      connection.close();
    }
  },
};
export const repository: Repository = serverMode
  ? serverRepository
  : browserRepository;
