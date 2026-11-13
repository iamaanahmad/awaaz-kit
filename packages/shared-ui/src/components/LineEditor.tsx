import { useId, useState } from 'react';

export interface LineEditorValue {
  productName: string;
  quantity: number | null;
  unit: string;
  /** Unit price in integer Paise, or null when unknown. */
  unitPricePaise: number | null;
}

export interface LineEditorProps {
  value: LineEditorValue;
  /** 1-based position, used in accessible names. */
  index: number;
  units: readonly string[];
  onChange: (next: LineEditorValue) => void;
  /** Removes the line from the draft (Req 10.11). */
  onRemove: () => void;
  disabled?: boolean;
}

/** Parses a rupee string into integer Paise; null for blank or invalid input. */
export function rupeesToPaise(text: string): number | null {
  const t = text.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [whole = '0', frac = ''] = t.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

function paiseToRupees(paise: number | null): string {
  if (paise === null) return '';
  const whole = Math.floor(paise / 100);
  const frac = paise % 100;
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0')}`;
}

const inputClass =
  'touch-target w-full rounded-[var(--radius)] border border-border bg-white p-2 text-base';

/** One editable draft line with labelled fields (Req 10.11, 13.6, 17.4). */
export function LineEditor({ value, index, units, onChange, onRemove, disabled }: LineEditorProps) {
  const base = useId();
  const [priceText, setPriceText] = useState(paiseToRupees(value.unitPricePaise));
  const priceInvalid = priceText.trim() !== '' && rupeesToPaise(priceText) === null;
  const unitOptions =
    units.includes(value.unit) || value.unit === '' ? units : [...units, value.unit];

  return (
    <fieldset
      disabled={disabled}
      className="flex flex-col gap-2 rounded-[var(--radius)] border border-border p-3"
    >
      <legend className="px-1 font-semibold">Line {index}</legend>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${base}-product`}>Product</label>
        <input
          id={`${base}-product`}
          type="text"
          value={value.productName}
          onChange={(e) => onChange({ ...value, productName: e.target.value })}
          className={inputClass}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="flex min-w-24 flex-1 flex-col gap-1">
          <label htmlFor={`${base}-qty`}>Quantity</label>
          <input
            id={`${base}-qty`}
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={value.quantity ?? ''}
            onChange={(e) => {
              const raw = e.target.value;
              const n = raw === '' ? null : Number(raw);
              onChange({
                ...value,
                quantity: n !== null && Number.isFinite(n) && n >= 0 ? n : null,
              });
            }}
            className={inputClass}
          />
        </div>
        <div className="flex min-w-24 flex-1 flex-col gap-1">
          <label htmlFor={`${base}-unit`}>Unit</label>
          <select
            id={`${base}-unit`}
            value={value.unit}
            onChange={(e) => onChange({ ...value, unit: e.target.value })}
            className={inputClass}
          >
            {value.unit === '' ? <option value="">Select unit</option> : null}
            {unitOptions.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-28 flex-1 flex-col gap-1">
          <label htmlFor={`${base}-price`}>Price (₹)</label>
          <input
            id={`${base}-price`}
            type="text"
            inputMode="decimal"
            value={priceText}
            aria-invalid={priceInvalid}
            aria-describedby={priceInvalid ? `${base}-price-err` : undefined}
            onChange={(e) => {
              setPriceText(e.target.value);
              onChange({ ...value, unitPricePaise: rupeesToPaise(e.target.value) });
            }}
            className={inputClass}
          />
          {priceInvalid ? (
            <p id={`${base}-price-err`} role="alert" className="text-sm">
              Enter a price like 45 or 45.50
            </p>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove line ${index}`}
        className="touch-target self-start rounded-[var(--radius)] border border-border px-3 font-semibold"
      >
        Remove line
      </button>
    </fieldset>
  );
}
