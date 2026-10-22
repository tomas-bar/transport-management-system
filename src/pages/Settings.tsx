import { useRef, useState } from "react";
import {
  Download,
  Upload,
  RotateCcw,
  Database,
  Trash2,
  Save,
} from "lucide-react";
import type { Database as Data } from "../domain/models";
import { useApp } from "../context";
import { PageHeading, Button, Panel, Field } from "../components/ui";
import { storageDescription, serverMode } from "../services/repository";
import { createSeed } from "../data/seed";
import { download } from "../services/export";
import { today, validateDatabase } from "../domain/logic";

export function Settings() {
  const { db, commit, busy, notify } = useApp();
  const [form, setForm] = useState({ ...db.settings });
  const input = useRef<HTMLInputElement>(null);
  async function importFile(file: File) {
    if (file.size > 15 * 1024 * 1024) {
      notify("Didžiausias kopijos dydis - 15 MB.", true);
      return;
    }
    try {
      const parsed = validateDatabase(JSON.parse(await file.text()) as Data);
      if (
        confirm(
          `Pakeisti dabartinius įrašus kopija? Reisų: ${parsed.trips.length}, užsakymų: ${parsed.orders.length}.`,
        )
      ) {
        if (await commit((d) => Object.assign(d, parsed), "Kopija atkurta"))
          setForm({ ...parsed.settings });
      }
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Nepavyko perskaityti kopijos.",
        true,
      );
    }
  }
  return (
    <>
      <PageHeading title="Nustatymai" />
      <div className="settings-layout">
        <Panel title="Įmonė">
          <form
            className="settings-form"
            onSubmit={async (e) => {
              e.preventDefault();
              await commit((d) => {
                d.settings = { ...form };
              }, "Nustatymai išsaugoti");
            }}
          >
            <div className="form-grid">
              <Field label="Pavadinimas *" full>
                <input
                  required
                  maxLength={160}
                  value={form.company}
                  onChange={(e) =>
                    setForm({ ...form, company: e.target.value })
                  }
                />
              </Field>
              <Field label="El. paštas">
                <input
                  type="email"
                  maxLength={200}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
              <Field label="Telefonas">
                <input
                  type="tel"
                  maxLength={40}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </Field>
            </div>
            <details className="advanced-settings">
              <summary>Išplėstiniai nustatymai</summary>
              <p className="muted">
                Maršrutų ir adresų paieškos paslaugų adresai.
              </p>
              <div className="form-grid">
                <Field label="OSRM adresas" full>
                  <input
                    type="url"
                    required
                    pattern="https://.*"
                    value={form.routingUrl}
                    onChange={(e) =>
                      setForm({ ...form, routingUrl: e.target.value })
                    }
                  />
                </Field>
                <Field label="„Photon“ adresas" full>
                  <input
                    type="url"
                    required
                    pattern="https://.*"
                    value={form.geocodingUrl}
                    onChange={(e) =>
                      setForm({ ...form, geocodingUrl: e.target.value })
                    }
                  />
                </Field>
              </div>
            </details>
            <Button type="submit" disabled={busy}>
              <Save size={16} />
              Išsaugoti
            </Button>
          </form>
        </Panel>
        <div className="settings-side">
          <Panel title="Duomenys">
            <div className="storage-info">
              <Database size={23} />
              <div>
                <b>{storageDescription}</b>
                <p>
                  Reisų: {db.trips.length} · Užsakymų: {db.orders.length}
                </p>
              </div>
            </div>
            <p className="muted">
              {serverMode
                ? "Atsarginė kopija apima visus sistemos įrašus."
                : "Duomenys saugomi šioje naršyklėje ir tarp įrenginių nesinchronizuoja."}
            </p>
            <div className="stack-actions">
              <Button
                variant="secondary"
                onClick={() =>
                  download(
                    JSON.stringify(db, null, 2),
                    `krypta-kopija-${today()}.json`,
                  )
                }
              >
                <Download size={16} />
                Atsisiųsti kopiją
              </Button>
              <Button
                variant="secondary"
                onClick={() => input.current?.click()}
              >
                <Upload size={16} />
                Atkurti iš kopijos
              </Button>
              <input
                ref={input}
                type="file"
                accept=".json,application/json"
                className="sr-only"
                aria-label="Atsarginės kopijos failas"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importFile(file);
                  e.target.value = "";
                }}
              />
            </div>
          </Panel>
          <Panel title="Duomenų atkūrimas">
            <div className="stack-actions">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  if (
                    confirm(
                      "Pakeisti visus dabartinius įrašus demonstraciniais duomenimis?",
                    )
                  ) {
                    const seed = createSeed();
                    if (
                      await commit(
                        (d) => Object.assign(d, seed),
                        "Demonstraciniai duomenys atkurti",
                      )
                    )
                      setForm({ ...seed.settings });
                  }
                }}
              >
                <RotateCcw size={16} />
                Atkurti demonstracinius duomenis
              </Button>
              <Button
                variant="danger"
                disabled={busy}
                onClick={async () => {
                  if (
                    confirm(
                      "Išvalyti visus įrašus? Nustatymai išliks. Prieš tęsiant atsisiųskite kopiją.",
                    )
                  )
                    await commit((d) => {
                      d.trips = [];
                      d.routes = [];
                      d.orders = [];
                      d.vehicles = [];
                      d.drivers = [];
                      d.customers = [];
                      d.expenses = [];
                    }, "Įrašai išvalyti");
                }}
              >
                <Trash2 size={16} />
                Išvalyti visus įrašus
              </Button>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
