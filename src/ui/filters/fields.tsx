interface NumberFieldProps {
  label: string;
  value: number | undefined;
  min?: number;
  max?: number;
  onChange: (value: number | undefined) => void;
}

const FIELD_ROW = 'flex items-center justify-between gap-2 text-sm text-ink-dim';
const INPUT =
  'w-24 rounded-card border border-line bg-surface-raised px-2 py-1 text-ink focus:outline-none focus:ring-2 focus:ring-accent';

export function NumberField({ label, value, min, max, onChange }: NumberFieldProps) {
  return (
    <label className={FIELD_ROW}>
      <span>{label}</span>
      <input
        type="number"
        value={value ?? ''}
        min={min}
        max={max}
        onChange={(event) => {
          const raw = event.target.value;
          // An empty box means "no bound". Number('') is 0, which would apply a
          // filter nobody asked for.
          onChange(raw === '' ? undefined : Number(raw));
        }}
        className={INPUT}
      />
    </label>
  );
}

interface CheckFieldProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function CheckField({ label, checked, onChange }: CheckFieldProps) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink-dim">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-accent"
      />
      <span>{label}</span>
    </label>
  );
}

/** `<input type="date">` speaks ISO calendar dates in the reader's own zone. */
function toInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

interface DateFieldProps {
  label: string;
  value: Date | undefined;
  onChange: (value: Date | undefined) => void;
}

export function DateField({ label, value, onChange }: DateFieldProps) {
  return (
    <label className={FIELD_ROW}>
      <span>{label}</span>
      <input
        type="date"
        value={value ? toInputValue(value) : ''}
        onChange={(event) => {
          const raw = event.target.value;
          // Parsed as local midnight, matching how it was rendered. `new
          // Date('2024-01-31')` alone is UTC midnight, which is the previous
          // day for most of the world.
          onChange(raw === '' ? undefined : new Date(`${raw}T00:00:00`));
        }}
        className={INPUT}
      />
    </label>
  );
}
