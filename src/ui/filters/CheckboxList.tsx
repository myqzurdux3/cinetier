interface CheckboxListProps<T extends string | number> {
  options: { value: T; label: string }[];
  selected: T[];
  onChange: (next: T[]) => void;
}

/** A set of values chosen from a list. The list only ever holds what the library holds. */
export function CheckboxList<T extends string | number>({
  options,
  selected,
  onChange,
}: CheckboxListProps<T>) {
  return (
    <ul className="max-h-56 space-y-1 overflow-y-auto">
      {options.map((option) => (
        <li key={String(option.value)}>
          <label className="flex items-center gap-2 text-sm text-ink-dim">
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, option.value]
                    : selected.filter((value) => value !== option.value),
                )
              }
              className="accent-accent"
            />
            <span>{option.label}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
