import { useState } from "react";
import { Search, MapPin, X } from "lucide-react";
import type { Place } from "../domain/models";
import { cities } from "../data/seed";
import { searchPlaces } from "../services/maps";
import { useApp } from "../context";
export function PlacePicker({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: Place | null;
  onChange: (p: Place) => void;
  label: string;
  disabled?: boolean;
}) {
  const { db } = useApp();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  async function search() {
    if (query.trim().length < 3) {
      setError("Įrašykite bent 3 simbolius.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const items = await searchPlaces(query, db.settings.geocodingUrl);
      setResults(items);
      if (!items.length) setError("Adresų nerasta. Patikslinkite paiešką.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="place-picker">
      <span className="field-label">{label}</span>
      {value && !open ? (
        <button
          type="button"
          className="place-value"
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          <MapPin size={17} />
          <span>
            <b>{value.name}</b>
            <small>{value.address}</small>
          </span>
          {!disabled && <span className="text-link">Keisti</span>}
        </button>
      ) : (
        <div className="place-search">
          <div className="search-input">
            <Search size={16} />
            <input
              aria-label={label}
              placeholder="Miestas arba tikslus adresas"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  search();
                }
              }}
            />
            <button type="button" disabled={busy} onClick={search}>
              {busy ? "Ieškoma..." : "Ieškoti"}
            </button>
            {value && (
              <button
                type="button"
                aria-label="Uždaryti adresų paiešką"
                onClick={() => setOpen(false)}
              >
                <X size={15} />
              </button>
            )}
          </div>
          {error && <p className="field-error">{error}</p>}
          <div className="place-results">
            {(results.length
              ? results
              : cities.filter(
                  (c) =>
                    !query ||
                    c.name
                      .toLocaleLowerCase("lt")
                      .includes(query.toLocaleLowerCase("lt")),
                )
            ).map((p, i) => (
              <button
                type="button"
                key={i}
                onClick={() => {
                  onChange(p);
                  setOpen(false);
                  setResults([]);
                  setQuery("");
                }}
              >
                <MapPin size={14} />
                <span>
                  <b>{p.name}</b>
                  <small>{p.address}</small>
                </span>
              </button>
            ))}
          </div>
          <small className="muted">
            Adresų duomenys © OpenStreetMap, paieška „Photon“.
          </small>
        </div>
      )}
    </div>
  );
}
