interface SegmentedProps<T extends string | number> {
  value: T;
  options: { value: T; label: string; disabled?: boolean; title?: string }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
}

/** A row of mutually exclusive buttons. */
export function Segmented<T extends string | number>({ value, options, onChange, size = "md" }: SegmentedProps<T>) {
  return (
    <div className={`segmented ${size}`} role="radiogroup">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? "active" : ""}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
