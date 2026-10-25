import { useConfirm } from '../components/Feedback';
import { demoRuntime } from '../services/server-api';
import {ServerBackups} from '../components/ServerBackups';
import { useRef, useState } from "react";
import {
  Download,
  Upload,
  RotateCcw,
  Database,
  Trash2,
  Save,
} from "lucide-react";
import { useApp } from "../context";
import { PageHeading, Button, Panel, Field } from "../components/ui";
import { validateWorkspace, type ReviewSnapshot } from "../domain/workspace";

import { createSeed } from "../data/seed";
import { readOnlySession } from '../domain/access';
import { ActAsButton } from '../components/UserPreview';
import { download } from "../services/export";
import { today, validateDatabase } from "../domain/logic";
import { nextCompanyReference, referenceSeries, validateNumbering } from '../domain/references';
import type { NumberSeries } from '../domain/models';

export function Settings() {
  const confirm = useConfirm();
  const { db, workspace, user, setPrintMode, replaceData, resetCompanyData, commit, busy, notify, serverMode, session, modules } = useApp();
  const resetBlocked = readOnlySession(session) || user?.role !== 'admin';
  const [form, setForm] = useState({ ...db.settings });
  const [seedDate, setSeedDate] = useState(today());
  const input = useRef<HTMLInputElement>(null);
  function setNumbering(collection: 'trips' | 'orders', change: Partial<NumberSeries>) {
    setForm(previous => ({ ...previous, numbering: {
      trips: { ...referenceSeries(previous, 'trips') },
      orders: { ...referenceSeries(previous, 'orders') },
      [collection]: { ...referenceSeries(previous, collection), ...change },
    } }));
  }
  function referencePreview(collection: 'trips' | 'orders') {
    try { validateNumbering(form); return nextCompanyReference({ ...db, settings: form }, collection); }
    catch { return 'Patikrinkite numeravimą'; }
  }
  async function importFile(file: File) {
    if (file.size > 15 * 1024 * 1024) {
      notify("Didžiausias kopijos dydis - 15 MB.", true);
      return;
    }
    try {
      const raw = JSON.parse(await file.text());
      const parsed = validateDatabase(raw.db ?? raw);
      const restoredWorkspace = raw.workspace ? validateWorkspace(raw.workspace, parsed) : undefined;
      if (
        await confirm(
          `Pakeisti dabartinius įrašus kopija? Reisų: ${parsed.trips.length}, užsakymų: ${parsed.orders.length}.${modules.includes('finance') ? ` Skaičiuoklės scenarijų: ${parsed.planning?.scenarios.length ?? 0}. Skaičiuoklės įkainiai taip pat bus pakeisti.` : ''}`,
        )
      ) {
        if (await replaceData(parsed, restoredWorkspace))
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
            <fieldset className="numbering-settings">
              <legend>Numeravimas</legend>
              <p>Taikoma naujiems įrašams. Esami numeriai nesikeis.</p>
              {(['trips', 'orders'] as const).map(collection => <div key={collection}>
                <h3>{collection === 'trips' ? 'Reisai' : 'Užsakymai'}</h3>
                <div className="form-grid">
                  <Field label={collection === 'trips' ? 'Reiso prefiksas' : 'Užsakymo prefiksas'}>
                    <input maxLength={16} value={referenceSeries(form, collection).prefix} onChange={event => setNumbering(collection, { prefix: event.target.value })} />
                  </Field>
                  <Field label={collection === 'trips' ? 'Reisų numeravimo pradžia' : 'Užsakymų numeravimo pradžia'}>
                    <input type="number" required min={1} max={999999999} step={1} value={referenceSeries(form, collection).start} onChange={event => setNumbering(collection, { start: Number(event.target.value) })} />
                  </Field>
                </div>
                <output>Kitas numeris: <b>{referencePreview(collection)}</b></output>
              </div>)}
            </fieldset>
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
        <div className="settings-side"><ServerBackups/>
          <Panel title="Spausdinimas"><div className="settings-form"><Field label="Numatytasis PDF stilius"><select disabled={busy} value={workspace.printMode??'monochrome'} onChange={e=>setPrintMode(e.target.value as 'monochrome'|'color')}><option value="monochrome">Nespalvotas</option><option value="color">Spalvotas</option></select></Field></div></Panel>
          <Panel title="Duomenys">
            <div className="storage-info">
              <Database size={23} />
              <div>
                <b>{serverMode&&!demoRuntime?"Įmonės duomenys serveryje":"Šios naršyklės saugykla"}</b>
                <p>
                  Reisų: {db.trips.length} · Užsakymų: {db.orders.length}
                </p>
              </div>
            </div>
            <p className="muted">
              {serverMode && !demoRuntime
                ? "JSON kopijoje nėra nuotraukų ir slaptažodžių. Prieš keičiant duomenis ankstesnė kopija išsaugoma serveryje."
                : "JSON kopijoje nėra nuotraukų ir slaptažodžių. Duomenys saugomi šioje naršyklėje ir tarp įrenginių nesinchronizuoja."}
            </p>
            <div className="stack-actions">
              <Button
                variant="secondary"
                onClick={() =>
                  download(
                    JSON.stringify({ db, workspace } satisfies ReviewSnapshot, null, 2),
                    `krypta-perziuros-kopija-${today()}.json`,
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
          <Panel title="Bandomieji duomenys">
            {resetBlocked && <div className="settings-form"><p className="muted">Duomenis išvalyti ir atkurti gali įmonės vadovas. Peržiūros režimu pirmiausia įjunkite redagavimą.</p>{user?.role === 'admin' && readOnlySession(session) && <ActAsButton id={user.id} name={user.name} companyId={workspace.companyId} />}</div>}
            <div className="settings-form">
              <Field label="Pradžios data">
                <input
                  type="date"
                  required
                  value={seedDate}
                  onChange={(e) => setSeedDate(e.target.value)}
                />
              </Field>
              <p className="muted">
                5 reisai · 9 užsakymai · 3 automobiliai · 2 vairuotojai
              </p>
            </div>
            <div className="stack-actions">
              <Button
                variant="secondary"
                disabled={busy || !seedDate || resetBlocked}
                onClick={async () => {
                  if (
                    await confirm(
                      "Atkurti bandomuosius duomenis? Dabartiniai įrašai bei patvirtinimai bus pakeisti, nuotraukos, priminimai, krovinių galimybės, skaičiuoklės scenarijai ir įkainiai pašalinti. Įmonės nustatymai ir paskyros išliks.",
                    )
                  ) {
                    if (await resetCompanyData('samples', seedDate)) setForm({ ...db.settings });
                  }
                }}
              >
                <RotateCcw size={16} />
                Atkurti demonstracinius duomenis
              </Button>
              <Button
                variant="secondary"
                disabled={busy || !seedDate}
                onClick={() => {
                  try {
                    const seed = createSeed(seedDate);
                    download(
                      JSON.stringify(seed, null, 2),
                      `krypta-bandomieji-${seedDate}.json`,
                      "application/json;charset=utf-8",
                    );
                  } catch {
                    notify("Pasirinkite tinkamą pradžios datą.", true);
                  }
                }}
              >
                <Download size={16} /> Atsisiųsti bandomąjį rinkinį
              </Button>
              <Button
                variant="danger"
                disabled={busy || resetBlocked}
                onClick={async () => {
                  if (
                    await confirm(
                      "Visam laikui išvalyti šios įmonės reisus, užsakymus, registrus, mokėjimus, patvirtinimus, nuotraukas, priminimus, krovinių galimybes, skaičiuoklės scenarijus, jos įkainius ir ankstesnes duomenų kopijas? Įmonės nustatymai ir paskyros išliks. Šio veiksmo atšaukti negalima.",
                    )
                  )
                    if (await resetCompanyData('clear')) setForm({ ...db.settings });
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
