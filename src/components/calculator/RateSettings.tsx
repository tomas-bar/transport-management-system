import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useApp } from '../../context';
import { emptyCalculator, type CalculatorRates, type VehicleRates } from '../../domain/calculator';
import { useConfirm } from '../Feedback';
import { Button, Field, Modal } from '../ui';
import { NumberField, Toggle } from './NumberField';
import { readOnlySession } from '../../domain/access';

export function RateSettings({ onClose, onDirty }: { onClose: () => void; onDirty: (value: boolean) => void }) {
  const { db, calculatorCommand, busy, session } = useApp();
  const confirm = useConfirm();
  const [original] = useState(() => structuredClone(db.planning ?? emptyCalculator()));
  const [defaults, setDefaults] = useState(original.defaults);
  const [vehicles, setVehicles] = useState<Record<string, VehicleRates>>(() => Object.fromEntries(
    Object.entries(original.vehicles).filter(([id]) => db.vehicles.some(vehicle => vehicle.id === id))));
  const [target, setTarget] = useState('');
  const dirty = JSON.stringify({ defaults, vehicles }) !== JSON.stringify({ defaults: original.defaults, vehicles: original.vehicles });
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty]);
  const vehicle = db.vehicles.find(row => row.id === target);
  const overrides = Object.hasOwn(vehicles, target) ? vehicles[target] : {};
  const changeDefault = <K extends keyof CalculatorRates>(key: K, value: CalculatorRates[K]) => setDefaults(before => ({ ...before, [key]: value }));
  const changeOverride = (change: VehicleRates) => setVehicles(before => ({ ...before, [target]: { ...overrides, ...change } }));
  const toggleOverride = (keys: (keyof VehicleRates)[], enabled: boolean) => {
    const next = { ...overrides };
    for (const key of keys) {
      if (enabled) Object.assign(next, { [key]: defaults[key] }); else delete next[key];
    }
    setVehicles(before => ({ ...before, [target]: next }));
  };
  const close = async () => {
    if (busy) return;
    if (!dirty || await confirm('Uždaryti neišsaugojus įkainių pakeitimų?', { confirmLabel: 'Neišsaugoti' })) onClose();
  };
  return <Modal title="Skaičiuoklės nustatymai" subtitle="Įmonės ir automobilio įkainiai" onClose={() => void close()}>
    <form id="calculator-rates" className="calc-rates-form" onSubmit={async event => {
      event.preventDefault();
      if (await calculatorCommand({ type: 'defaults', defaults, vehicles })) { onDirty(false); onClose(); }
    }}>
      <div className="modal-body">
        <Field label="Kam taikomi įkainiai"><select value={target} onChange={event => setTarget(event.target.value)}>
          <option value="">Visai įmonei</option>
          {db.vehicles.map(row => <option key={row.id} value={row.id}>{row.plate} · {row.make} {row.model}</option>)}
        </select></Field>
        <p className="calc-note">Įkainiai taikomi naujoms prielaidoms. Išsaugoti scenarijai nepasikeis.</p>
        {vehicle ? <p className="calc-note">Kuro sąnaudos: {vehicle.consumption.toLocaleString('lt-LT')} l/100 km. Šis parametras keičiamas transporto registre.</p>
          : <NumberField label="Bendros kuro sąnaudos, l/100 km" value={defaults.consumption} max={1000} decimals={3} onChange={value => changeDefault('consumption', value)} />}
        <div className="calc-rate-list" key={target}>
          {([
            { key: 'fuelPrice', label: 'Kuro kaina, €/l', scale: 10000, decimals: 4, placeholder: 'Pvz. 1,80' },
            { key: 'wearPerKm', label: 'Eksploatacija be kuro, €/km', scale: 10000, decimals: 4, placeholder: 'Pvz. 0,12' },
            { key: 'waitingPerHour', label: 'Papildomas laukimas, €/val.', scale: 100, decimals: 2, placeholder: 'Neįrašyta' },
          ] as const).map(field => <div key={field.key}>
            {vehicle && <Toggle label={`Individualus įkainis: ${field.label}`} checked={Object.hasOwn(overrides, field.key)}
              onChange={enabled => toggleOverride([field.key], enabled)} />}
            {!vehicle || Object.hasOwn(overrides, field.key) ? <NumberField label={field.label} value={vehicle ? overrides[field.key] ?? null : defaults[field.key]}
              scale={field.scale} decimals={field.decimals} placeholder={field.placeholder} onChange={value => vehicle ? changeOverride({ [field.key]: value }) : changeDefault(field.key, value)} />
              : <small className="calc-inherited">Pagal įmonę: {defaults[field.key] === null ? 'neįrašyta' : (defaults[field.key]! / field.scale).toLocaleString('lt-LT', { maximumFractionDigits: field.decimals })}</small>}
          </div>)}
          <div>
            {vehicle && <Toggle label="Individualus vairuotojo atlygis" checked={Object.hasOwn(overrides, 'driverPay') || Object.hasOwn(overrides, 'driverModel')}
              onChange={enabled => toggleOverride(['driverPay', 'driverModel'], enabled)} />}
            {!vehicle || Object.hasOwn(overrides, 'driverPay') || Object.hasOwn(overrides, 'driverModel') ? <div className="calc-grid">
              <Field label="Atlygio modelis"><select value={vehicle ? overrides.driverModel ?? defaults.driverModel : defaults.driverModel}
                onChange={event => vehicle ? changeOverride({ driverModel: event.target.value as 'trip' | 'day' }) : changeDefault('driverModel', event.target.value as 'trip' | 'day')}>
                <option value="trip">Už reisą</option><option value="day">Už dieną</option>
              </select></Field>
              <NumberField label="Vairuotojo atlygis, €" value={vehicle ? overrides.driverPay ?? null : defaults.driverPay} scale={100}
                onChange={value => vehicle ? changeOverride({ driverPay: value }) : changeDefault('driverPay', value)} />
            </div> : <small className="calc-inherited">Taikomas įmonės atlygio modelis ir įkainis.</small>}
          </div>
        </div>
      </div>
      <footer><Button variant="secondary" disabled={busy} onClick={() => void close()}>Atšaukti</Button>
        <Button type="submit" disabled={busy || !dirty || readOnlySession(session)}><Save size={16} />{busy ? 'Saugoma...' : 'Išsaugoti įkainius'}</Button></footer>
    </form>
  </Modal>;
}
