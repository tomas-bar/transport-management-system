import type { Database } from "../domain/models.ts";

/** Only exact legacy sample labels are changed. User-edited registrations are preserved. */
export function upgradeSampleLabels(db: Database): boolean {
  let changed = false;
  for (const [id, oldPlate, newPlate, make, model] of [
    ["v1", "DEMO 01", "KRY 101", "Mercedes-Benz", "Sprinter"],
    ["v2", "DEMO 02", "KRY 202", "Volkswagen", "Caddy"],
  ]) {
    const vehicle = db.vehicles.find(
      (v) =>
        v.id === id &&
        v.plate === oldPlate &&
        v.make === make &&
        v.model === model,
    );
    if (vehicle) {
      vehicle.plate = newPlate;
      changed = true;
    }
  }
  return changed;
}
