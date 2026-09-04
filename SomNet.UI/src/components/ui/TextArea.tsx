interface TextAreaProps {
  label: string;
  id?: string;
  hint?: string;
  value: string;
  rows?: number;
  placeholder?: string;
  onChange: (value: string) => void;
}

export function TextArea({
  label,
  id,
  hint,
  value,
  rows = 4,
  placeholder,
  onChange,
}: TextAreaProps) {
  const textAreaId = id ?? label.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="space-y-1.5">
      <label htmlFor={textAreaId} className="block text-sm font-medium text-slate-300">
        {label}
      </label>
      <textarea
        id={textAreaId}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
      />
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
