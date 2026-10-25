import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Field } from '../ui';
export const NumberFieldReset = createContext(0);

/** Keeps a user's decimal separator and intermediate text while calculations receive scaled values. */
export function NumberField({ label, value, onChange, scale = 1, decimals = 2, max = 1000000, hint, disabled = false }: {
  label: string; value: number | null; onChange: (value: number | null) => void;
  scale?: number; decimals?: number; max?: number; hint?: string; disabled?: boolean;
}) {
  const format = (number: number | null) => number === null ? '' : String(number / scale);
  const [text, setText] = useState(() => format(value));
  const [invalid, setInvalid] = useState(false);
  const reported = useRef(value);
  const reset = useContext(NumberFieldReset), previousReset = useRef(reset);
  const control = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (value === reported.current && reset === previousReset.current) return;
    previousReset.current = reset;
    reported.current = value; setText(format(value)); setInvalid(false);
    control.current?.setCustomValidity('');
  }, [value, reset]);
  return <Field label={label} hint={invalid ? `Įrašykite skaičių nuo 0 iki ${max}.` : hint}>
    <input ref={control} type="text" inputMode={decimals ? 'decimal' : 'numeric'} value={text}
      disabled={disabled} placeholder="Neįrašyta" aria-invalid={invalid || undefined}
      onChange={event => {
        const raw = event.target.value; setText(raw);
        const pattern = decimals ? new RegExp(`^\\d+(?:[.,]\\d{0,${decimals}})?$`) : /^\d+$/;
        const parsed = Number(raw.replace(',', '.'));
        const valid = raw.trim() === '' || pattern.test(raw) && Number.isFinite(parsed) && parsed >= 0 && parsed <= max;
        const next = raw.trim() === '' || !valid ? null : scale === 1 ? parsed : Math.round(parsed * scale);
        setInvalid(!valid); event.target.setCustomValidity(valid ? '' : 'Patikrinkite įrašytą skaičių.');
        reported.current = next; onChange(next);
      }} />
  </Field>;
}

export function Toggle({ label, checked, onChange, disabled = false }: {
  label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean;
}) {
  return <label className="calc-toggle"><input type="checkbox" checked={checked} disabled={disabled}
    onChange={event => onChange(event.target.checked)} /><span>{label}</span></label>;
}
