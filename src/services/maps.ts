import { routeVisits } from "../domain/route-plan.ts";
import type { Place, Stop } from "../domain/models";
export interface RoadRoute {
  distance: number;
  duration: number;
  coordinates: [number, number][];
}
const cache = new Map<string, RoadRoute>();
export async function roadRoute(
  stops: Stop[],
  base: string,
  signal?: AbortSignal,
): Promise<RoadRoute> {
  const unique = routeVisits(stops).map((v) => v.place);
  if (unique.length < 2)
    throw new Error("Maršrutui reikia bent dviejų skirtingų vietų.");
  const key = base + unique.map((s) => `${s.lng},${s.lat}`).join(";");
  if (cache.has(key)) return cache.get(key)!;
  const response = await fetch(
    `${base.replace(/\/$/, "")}/route/v1/driving/${unique.map((s) => `${s.lng},${s.lat}`).join(";")}?overview=full&geometries=geojson`,
    { signal: signal ?? AbortSignal.timeout(18000) },
  );
  if (!response.ok)
    throw new Error("Maršrutų paslauga šiuo metu nepasiekiama.");
  const data = await response.json();
  if (data.code !== "Ok" || !data.routes?.[0])
    throw new Error("Kelių maršrutas nerastas.");
  const r = data.routes[0];
  const result = {
    distance: r.distance,
    duration: r.duration,
    coordinates: r.geometry.coordinates.map(
      (p: number[]) => [p[1], p[0]] as [number, number],
    ),
  };
  cache.set(key, result);
  return result;
}
const searchCache = new Map<string, Place[]>();
let lastSearch = 0;
export async function searchPlaces(
  query: string,
  base: string,
): Promise<Place[]> {
  const key = base + query.trim().toLowerCase();
  if (searchCache.has(key)) return searchCache.get(key)!;
  if (Date.now() - lastSearch < 1100)
    throw new Error("Palaukite sekundę ir bandykite dar kartą.");
  lastSearch = Date.now();
  const res = await fetch(
    `${base.replace(/\/$/, "")}/api/?q=${encodeURIComponent(query)}&limit=6`,
    { signal: AbortSignal.timeout(12000) },
  );
  if (!res.ok)
    throw new Error(
      "Adresų paieška nepasiekiama. Pasirinkite demonstracinį miestą arba bandykite vėliau.",
    );
  const data = await res.json();
  const result: Place[] = data.features.map(
    (f: {
      properties: Record<string, string>;
      geometry: { coordinates: number[] };
    }) => {
      const p = f.properties;
      return {
        name: p.name || p.street || p.city || query,
        address: [
          p.name,
          [p.street, p.housenumber].filter(Boolean).join(" "),
          p.city,
          p.country,
        ]
          .filter(Boolean)
          .filter((s, i, a) => a.indexOf(s) === i)
          .join(", "),
        lng: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
      };
    },
  );
  searchCache.set(key, result);
  return result;
}
export function googleMapsParts(stops: Stop[]) {
  const points = routeVisits(stops).map((v) => v.place);
  const parts: { label: string; detail: string; url: string }[] = [];
  for (let start = 0; start < points.length - 1; start += 3) {
    const group = points.slice(start, start + 4);
    const coordinate = (s: Stop) => `${s.lat.toFixed(6)},${s.lng.toFixed(6)}`;
    const params = new URLSearchParams({
      api: "1",
      travelmode: "driving",
      origin: coordinate(group[0]),
      destination: coordinate(group.at(-1)!),
    });
    if (group.length > 2)
      params.set("waypoints", group.slice(1, -1).map(coordinate).join("|"));
    parts.push({
      label: `${group[0].name} → ${group.at(-1)!.name}`,
      detail: group.map((p) => p.name).join(" → "),
      url: `https://www.google.com/maps/dir/?${params}`,
    });
  }
  return parts;
}
