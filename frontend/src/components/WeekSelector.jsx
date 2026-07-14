export default function WeekSelector({
  weeks,
  value,
  onChange,
  disabled = false,
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <span className="font-medium">Week</span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={disabled || !weeks?.length}
        className="min-h-[44px] rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      >
        {!weeks?.length && <option value="">No weeks available</option>}
        {weeks?.map((week) => (
          <option key={week.id} value={week.id}>
            {week.label}
          </option>
        ))}
      </select>
    </label>
  );
}
